package br.com.agendz.cupom;

import br.com.agendz.cupom.CupomRegras.Item;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.Fuso;
import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Cupons e vales (docs/MAPA-API-SPRING.md, seção 10i; espelho de src/domain/resgate.js). Cadastro: quem tem a seção Estabelecimento. A chave nasce aqui e só aqui.
 * Uso derivado dos agendamentos não cancelados (sem contador). Aplicar a um agendamento: só a confirmar ou confirmado, um cupom por horário, limite total e por cliente,
 * 5 chaves erradas seguidas bloqueiam por 15 minutos (a tentativa errada fica gravada mesmo com a operação recusada: transação independente).
 */
@Component
public class CupomService {

    public static final int LIMITE_CUPONS = 200;
    public static final int TENTATIVAS_MAX = 5;
    public static final int BLOQUEIO_MIN = 15;
    /** A mesma resposta para chave que não existe, venceu ou esgotou: ninguém descobre chaves por tentativa. */
    public static final String GENERICO = "Cupom inválido ou indisponível.";

    public record Cupom(UUID id, String nome, String tipo, List<UUID> servicoIds, BigDecimal percentual, BigDecimal valor, LocalDate inicio, LocalDate fim,
                        int usosMax, int usosPorCliente, String chave, boolean ativo, String situacao, int usos, Instant criadoEm) {
    }

    public record Dados(@NotNull @Size(max = 60) String nome, @NotNull @Size(max = 20) String tipo, @Size(max = 10) List<UUID> servicoIds, BigDecimal percentual, BigDecimal valor,
                        @NotNull LocalDate inicio, @NotNull LocalDate fim, Integer usosMax, Integer usosPorCliente) {
    }

    public record Aplicado(String nome, BigDecimal desconto) {
    }

    /** Cópia do cupom no agendamento (sem a chave): é o que a ficha mostra e o que vale para os descontos. */
    public record Foto(UUID cupomId, String nome, String tipo, List<UUID> servicoIds, BigDecimal percentual, BigDecimal valor) {
    }

    private final LojaJdbc banco;
    private final ObjectMapper json;

    public CupomService(LojaJdbc banco, ObjectMapper json) {
        this.banco = banco;
        this.json = json;
    }

    // ---------------------------------------------------------------- situação

    /** 'inativo' | 'futuro' | 'expirado' | 'esgotado' | 'vigente' (a vigência vai do começo do primeiro dia ao fim do último, no fuso da loja). */
    static String situacao(boolean ativo, LocalDate inicio, LocalDate fim, int usos, int usosMax, Instant agora) {
        if (!ativo) return "inativo";
        if (agora.isBefore(inicio.atStartOfDay(Fuso.BRASIL).toInstant())) return "futuro";
        if (!agora.isBefore(fim.plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant())) return "expirado";
        if (usos >= usosMax) return "esgotado";
        return "vigente";
    }

    static boolean historico(String situacao) {
        return "expirado".equals(situacao) || "inativo".equals(situacao);
    }

    // ---------------------------------------------------------------- cadastro

    private List<Cupom> carregar(JdbcTemplate jdbc, UUID filtroId, Instant agora) {
        Map<UUID, List<UUID>> servicos = new HashMap<>();
        jdbc.query("select cupom_id, servico_id from cupom_servico order by servico_id",
                rs -> { servicos.computeIfAbsent(rs.getObject(1, UUID.class), k -> new ArrayList<>()).add(rs.getObject(2, UUID.class)); });
        return jdbc.query("select c.id, c.nome, c.tipo, c.percentual, c.valor, c.inicio, c.fim, c.usos_max, c.usos_por_cliente, c.chave, c.ativo, c.criado_em, "
                        + "(select count(*) from agendamento a where a.cupom_id = c.id and a.status <> 'cancelado') as usos from cupom c"
                        + (filtroId == null ? "" : " where c.id = ?") + " order by c.criado_em desc, c.id",
                (rs, i) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    LocalDate ini = rs.getObject("inicio", LocalDate.class), fim = rs.getObject("fim", LocalDate.class);
                    int usos = rs.getInt("usos"), max = rs.getInt("usos_max");
                    boolean ativo = rs.getBoolean("ativo");
                    return new Cupom(id, rs.getString("nome"), rs.getString("tipo"), servicos.getOrDefault(id, List.of()), rs.getBigDecimal("percentual"), rs.getBigDecimal("valor"),
                            ini, fim, max, rs.getInt("usos_por_cliente"), rs.getString("chave"), ativo, situacao(ativo, ini, fim, usos, max, agora), usos,
                            rs.getObject("criado_em", OffsetDateTime.class).toInstant());
                }, filtroId == null ? new Object[0] : new Object[]{filtroId});
    }

    public List<Cupom> listar(Instant agora) {
        return banco.naLoja(jdbc -> carregar(jdbc, null, agora));
    }

    private static ErroDeNegocio recusa(String mensagem) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, mensagem);
    }

    private String chaveNova(JdbcTemplate jdbc) {
        for (int tentativas = 0; tentativas < 20; tentativas++) {
            String chave = CupomRegras.gerarChave();
            Integer ja = jdbc.queryForObject("select count(*) from cupom where chave = ?", Integer.class, chave);
            if (ja != null && ja == 0) return chave;
        }
        throw new IllegalStateException("Não foi possível gerar uma chave única de cupom");
    }

    /** Cria (id nulo) ou altera. Cupom do histórico (venceu ou encerrado) não se altera. */
    public Cupom salvar(UUID id, Dados d, UUID autor, Instant agora) {
        return banco.naLoja(jdbc -> {
            UUID lojaId = br.com.agendz.tenant.LojaContext.exigir().id();
            if (id != null) {
                List<Cupom> atual = carregar(jdbc, id, agora);
                if (atual.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Cupom não encontrado.");
                if (historico(atual.get(0).situacao())) throw recusa("Cupom do histórico não se altera. Use-o como modelo para criar outro.");
            } else {
                Integer total = jdbc.queryForObject("select count(*) from cupom", Integer.class);
                if (total != null && total >= LIMITE_CUPONS) throw recusa("Limite de " + LIMITE_CUPONS + " cupons atingido: remova ou desative os antigos.");
            }
            String tipo = d.tipo();
            if (!List.of("servico", "percentual", "valor").contains(tipo)) throw recusa("Escolha o tipo: vale serviço, desconto em % ou em R$.");
            String nome = br.com.agendz.validacao.Texto.limpar(d.nome());
            if (nome.isEmpty()) throw recusa("Dê um nome ao cupom.");
            List<UUID> servicoIds = d.servicoIds() == null ? List.of() : d.servicoIds().stream().distinct().toList();
            for (UUID s : servicoIds) {
                Integer existe = jdbc.queryForObject("select count(*) from servico where id = ?", Integer.class, s);
                if (existe == null || existe == 0) throw recusa("Serviço não encontrado.");
            }
            if ("servico".equals(tipo) && servicoIds.isEmpty()) throw recusa("O vale precisa dizer qual serviço ele cobre.");
            BigDecimal pct = d.percentual(), valor = d.valor();
            if ("percentual".equals(tipo) && !(pct != null && pct.compareTo(BigDecimal.ONE) >= 0 && pct.compareTo(BigDecimal.valueOf(100)) <= 0)) throw recusa("O desconto em % vai de 1 a 100.");
            if ("valor".equals(tipo) && !(valor != null && valor.signum() > 0 && valor.compareTo(BigDecimal.valueOf(10000)) <= 0)) throw recusa("Informe o valor do desconto em reais (maior que zero).");
            if (d.fim().isBefore(d.inicio())) throw recusa("A vigência termina antes de começar.");
            int max = d.usosMax() == null ? 1 : d.usosMax();
            int porCliente = d.usosPorCliente() == null ? 1 : d.usosPorCliente();
            if (max < 1 || max > 10000) throw recusa("Quantas vezes o cupom pode ser usado no total: de 1 a 10000.");
            if (porCliente < 1 || porCliente > 100) throw recusa("Quantas vezes cada cliente pode usar: de 1 a 100.");
            BigDecimal pctGravar = "percentual".equals(tipo) ? pct.setScale(2, RoundingMode.HALF_UP) : null;
            BigDecimal valorGravar = "valor".equals(tipo) ? valor.setScale(2, RoundingMode.HALF_UP) : null;
            UUID cupomId = id;
            if (id == null) {
                cupomId = jdbc.queryForObject("insert into cupom (loja_id, nome, tipo, percentual, valor, inicio, fim, usos_max, usos_por_cliente, chave, criado_por) "
                                + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id", UUID.class,
                        lojaId.toString(), nome, tipo, pctGravar, valorGravar, d.inicio(), d.fim(), max, porCliente, chaveNova(jdbc), autor);
            } else {
                jdbc.update("update cupom set nome = ?, tipo = ?, percentual = ?, valor = ?, inicio = ?, fim = ?, usos_max = ?, usos_por_cliente = ? where id = ?",
                        nome, tipo, pctGravar, valorGravar, d.inicio(), d.fim(), max, porCliente, id);
                jdbc.update("delete from cupom_servico where cupom_id = ?", id);
            }
            for (UUID s : servicoIds) jdbc.update("insert into cupom_servico (loja_id, cupom_id, servico_id) values (?::uuid, ?, ?)", lojaId.toString(), cupomId, s);
            return carregar(jdbc, cupomId, agora).get(0);
        });
    }

    /** A chave vazou ou foi compartilhada demais: a antiga deixa de valer na hora. Agendamentos que já usaram continuam com o desconto. */
    public Cupom novaChave(UUID id, Instant agora) {
        return banco.naLoja(jdbc -> {
            List<Cupom> atual = carregar(jdbc, id, agora);
            if (atual.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Cupom não encontrado.");
            if (historico(atual.get(0).situacao())) throw recusa("Cupom do histórico não tem chave nova.");
            jdbc.update("update cupom set chave = ? where id = ?", chaveNova(jdbc), id);
            return carregar(jdbc, id, agora).get(0);
        });
    }

    /** Já usado: não apaga, só encerra e vai para o histórico (devolve true). Nunca usado: apaga (false). */
    public boolean remover(UUID id) {
        return banco.naLoja(jdbc -> {
            Integer existe = jdbc.queryForObject("select count(*) from cupom where id = ?", Integer.class, id);
            if (existe == null || existe == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Cupom não encontrado.");
            Integer usado = jdbc.queryForObject("select count(*) from agendamento where cupom_id = ?", Integer.class, id);
            if (usado != null && usado > 0) {
                jdbc.update("update cupom set ativo = false where id = ?", id);
                return true;
            }
            jdbc.update("delete from cupom_servico where cupom_id = ?", id);
            jdbc.update("delete from cupom where id = ?", id);
            return false;
        });
    }

    // ---------------------------------------------------------------- uso no agendamento

    private void bloqueioOuErro(JdbcTemplate jdbc, String quem, Instant agora) {
        List<Instant> ate = jdbc.query("select ate from cupom_tentativa where quem = ? and ate is not null",
                (rs, i) -> rs.getObject(1, OffsetDateTime.class).toInstant(), quem);
        if (!ate.isEmpty() && ate.get(0).isAfter(agora)) {
            long min = Math.max(1, (long) Math.ceil((ate.get(0).toEpochMilli() - agora.toEpochMilli()) / 60000.0));
            throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas com chave errada. Tente de novo em " + min + " min.");
        }
    }

    /** Grava a tentativa errada FORA da transação do pedido (que volta atrás): 5 seguidas bloqueiam por 15 min. */
    private void registrarErro(UUID lojaId, String quem, Instant agora) {
        banco.naLojaIndependente(lojaId, jdbc -> {
            jdbc.update("delete from cupom_tentativa where (ate is null or ate < ?) and ultima < ?", Timestamp.from(agora), Timestamp.from(agora.minusSeconds(3600)));
            List<Object[]> atual = jdbc.query("select n, ate from cupom_tentativa where quem = ? for update",
                    (rs, i) -> new Object[]{rs.getInt(1), rs.getObject(2, OffsetDateTime.class)}, quem);
            int n = 1;
            Instant ate = null;
            if (!atual.isEmpty()) {
                OffsetDateTime antigo = (OffsetDateTime) atual.get(0)[1];
                boolean passou = antigo != null && !antigo.toInstant().isAfter(agora);
                n = passou ? 1 : (int) atual.get(0)[0] + 1;
            }
            if (n >= TENTATIVAS_MAX) {
                ate = agora.plusSeconds(BLOQUEIO_MIN * 60L);
                n = 0;
            }
            jdbc.update("insert into cupom_tentativa (loja_id, quem, n, ate, ultima) values (?::uuid, ?, ?, ?, ?) "
                            + "on conflict (loja_id, quem) do update set n = excluded.n, ate = excluded.ate, ultima = excluded.ultima",
                    lojaId.toString(), quem, n, ate == null ? null : Timestamp.from(ate), Timestamp.from(agora));
            return null;
        });
    }

    /**
     * Aplica o cupom de chave {@code chave} ao agendamento (dentro da transação do chamador). {@code so} limita ao profissional dono do horário.
     * Chave errada: grava a tentativa e responde sempre {@link #GENERICO}. Os motivos detalhados (vencido, esgotado...) são para o painel.
     */
    public Aplicado aplicar(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId, UUID so, String quem, String chave, Instant agora) {
        List<Object[]> ag = jdbc.query("select status, cliente_id, cupom_id, origem from agendamento where id = ?" + (so == null ? "" : " and profissional_id = ?") + " for update",
                (rs, i) -> new Object[]{rs.getString(1), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class), rs.getString(4)},
                so == null ? new Object[]{agendamentoId} : new Object[]{agendamentoId, so});
        if (ag.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        String status = (String) ag.get(0)[0];
        UUID clienteId = (UUID) ag.get(0)[1];
        if ("atendimento".equals(ag.get(0)[3])) throw recusa("Atendimento local não usa cupom.");
        if (!"a_confirmar".equals(status) && !"confirmado".equals(status)) throw recusa("Só dá para usar cupom em horário a confirmar ou confirmado.");
        bloqueioOuErro(jdbc, quem, agora);
        if (ag.get(0)[2] != null) throw recusa("Esse horário já tem um cupom. Retire o atual para usar outro.");
        String normal = CupomRegras.normalizar(chave);
        UUID achado = null;
        if (normal != null) {
            for (Object[] c : jdbc.query("select id, chave from cupom", (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2)})) {
                if (CupomRegras.igualConstante((String) c[1], normal)) achado = (UUID) c[0]; // percorre todos de propósito
            }
        }
        if (achado == null) {
            registrarErro(lojaId, quem, agora);
            throw recusa(GENERICO);
        }
        jdbc.query("select id from cupom where id = ? for update", (rs, i) -> rs.getObject(1, UUID.class), achado); // dois usos ao mesmo tempo não passam do limite
        Cupom c = carregar(jdbc, achado, agora).get(0);
        if (!"vigente".equals(c.situacao())) throw recusa(switch (c.situacao()) {
            case "inativo" -> "Esse cupom foi encerrado.";
            case "futuro" -> "Esse cupom ainda não começou a valer.";
            case "expirado" -> "Esse cupom venceu.";
            default -> "Esse cupom já foi usado até o limite.";
        });
        Integer doCliente = clienteId == null ? 0 : jdbc.queryForObject("select count(*) from agendamento where cupom_id = ? and cliente_id = ? and status <> 'cancelado'", Integer.class, achado, clienteId);
        if (doCliente != null && doCliente >= c.usosPorCliente()) throw recusa("Esse cliente já usou esse cupom o máximo de vezes.");
        List<Object[]> linhas = jdbc.query("select servico_id, preco from agendamento_servico where agendamento_id = ? and not plano order by ordem",
                (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getBigDecimal(2)}, agendamentoId);
        List<Item> itens = new ArrayList<>();
        for (Object[] l : linhas) itens.add(new Item(l[0].toString(), (BigDecimal) l[1]));
        Map<String, BigDecimal> descontos = CupomRegras.descontos(c.tipo(), c.servicoIds().stream().map(UUID::toString).toList(), c.percentual(), c.valor(), itens);
        BigDecimal total = descontos.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        if (total.signum() <= 0) throw recusa("Esse cupom não vale para os serviços deste horário.");
        jdbc.update("delete from cupom_tentativa where quem = ?", quem);
        for (Map.Entry<String, BigDecimal> e : descontos.entrySet()) {
            jdbc.update("update agendamento_servico set desconto = ? where agendamento_id = ? and servico_id = ?", e.getValue(), agendamentoId, UUID.fromString(e.getKey()));
        }
        String foto;
        try {
            foto = json.writeValueAsString(new Foto(c.id(), c.nome(), c.tipo(), c.servicoIds(), c.percentual(), c.valor()));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
        jdbc.update("update agendamento set cupom_id = ?, cupom_foto = ?::jsonb, cupom_aplicado_em = ?, cupom_por = ?, atualizado_em = now() where id = ?",
                achado, foto, Timestamp.from(agora), quem, agendamentoId);
        return new Aplicado(c.nome(), total);
    }

    /** Retira o cupom (só em horário a confirmar ou confirmado). Devolve o nome do cupom retirado. */
    public String retirar(JdbcTemplate jdbc, UUID agendamentoId, UUID so) {
        List<Object[]> ag = jdbc.query("select status, cupom_foto ->> 'nome' from agendamento where id = ?" + (so == null ? "" : " and profissional_id = ?") + " for update",
                (rs, i) -> new Object[]{rs.getString(1), rs.getString(2)}, so == null ? new Object[]{agendamentoId} : new Object[]{agendamentoId, so});
        if (ag.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        String status = (String) ag.get(0)[0];
        if (!"a_confirmar".equals(status) && !"confirmado".equals(status)) throw recusa("Só dá para retirar o cupom de horário a confirmar ou confirmado.");
        if (ag.get(0)[1] == null) throw recusa("Esse horário não tem cupom.");
        jdbc.update("update agendamento set cupom_id = null, cupom_foto = null, cupom_aplicado_em = null, cupom_por = null, atualizado_em = now() where id = ?", agendamentoId);
        jdbc.update("update agendamento_servico set desconto = 0 where agendamento_id = ? and not plano", agendamentoId); // o desconto do plano fica
        return (String) ag.get(0)[1];
    }

    /** Formata em reais para o histórico ("R$ 1.234,50"). */
    public static String reais(BigDecimal v) {
        return "R$ " + String.format(Locale.of("pt", "BR"), "%,.2f", v);
    }
}
