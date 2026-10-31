package br.com.agendz.avaliacoes;

import br.com.agendz.cifra.Cifra;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.Fuso;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Mensagens em lote (WhatsApp). Sem a API da Meta não existe envio automático: a fila é uma lista e cada contato abre o wa.me com a mensagem pronta (um clique por
 * pessoa). Espelho de `mensagens.*` na API simulada (docs/MAPA-API-SPRING.md, seção 10p). Só a seção `avaliacoes`. O telefone inteiro nunca vai na lista (mascarado):
 * só {@link #abrir} o devolve, no clique de quem vai enviar; o token de avaliação nasce nesse clique e aparece uma vez.
 */
@Service
public class FilaMensagemService {

    public record Contagem(int atendimentos, int semCadastro, int semTelefone, int semMensagens, int duplicados, int jaAvaliou, int excedente) {
    }

    public record Item(int id, UUID agendamentoId, String nome, String telefoneMascarado, List<String> servicos, Instant inicio, String status, Instant em) {
    }

    public record Previa(String tipo, List<Item> itens, Contagem contagem, int limite) {
    }

    public record Fila(UUID id, String tipo, Instant criadaEm, Filtros filtros, String modelo, boolean encerrada, Contagem contagem, List<Item> itens) {
    }

    public record Filtros(String de, String ate, UUID profissionalId, UUID servicoId) {
    }

    public record FilaAtual(Fila fila) {
    }

    public record Aberto(String tipo, String modelo, String token, String numero, String nome, String loja) {
    }

    private record Montada(String tipo, List<Item> itens, Contagem contagem, LocalDate de, LocalDate ate) {
    }

    private record Abrindo(Aberto aberto, String pulado) {
    }

    private final LojaJdbc banco;
    private final Cifra cifra;
    private final AvaliacaoService avaliacoes;
    private final ObjectMapper json;
    private final Clock relogio;

    public FilaMensagemService(LojaJdbc banco, Cifra cifra, AvaliacaoService avaliacoes, ObjectMapper json, Clock relogio) {
        this.banco = banco;
        this.cifra = cifra;
        this.avaliacoes = avaliacoes;
        this.json = json;
        this.relogio = relogio;
    }

    // ---------------------------------------------------------------- prévia e criação

    /** Prévia de quem entraria (não grava nada). Período obrigatório (máx. 366 dias). */
    public Previa previa(String tipo, String de, String ate, UUID profissionalId, UUID servicoId) {
        LojaContext.exigir();
        String t = tipo == null || tipo.isEmpty() ? "avaliacao" : tipo;
        Montada m = banco.naLoja(jdbc -> montar(jdbc, t, de, ate, profissionalId, servicoId));
        return new Previa(m.tipo(), m.itens(), m.contagem(), AvaliacaoRegras.FILA_MAX);
    }

    public Fila iniciar(UUID quem, String tipo, String modeloBruto, String de, String ate, UUID profissionalId, UUID servicoId) {
        Loja loja = LojaContext.exigir();
        String t = tipo == null || tipo.isEmpty() ? "avaliacao" : tipo;
        if (!AvaliacaoRegras.TIPOS_FILA.contains(t)) throw ruim("Tipo de mensagem inválido.");
        String erroModelo = AvaliacaoRegras.validarModelo(modeloBruto, t);
        if (erroModelo != null) throw ruim(erroModelo);
        String modelo = AvaliacaoRegras.modeloLimpo(modeloBruto);
        try {
            return banco.naLoja(jdbc -> {
                if (!jdbc.queryForList("select id from fila_mensagem where criada_por = ? and not encerrada for update", UUID.class, quem).isEmpty()) {
                    throw new ErroDeNegocio(HttpStatus.CONFLICT, "Termine ou encerre a fila aberta antes de criar outra.");
                }
                Montada m = montar(jdbc, t, de, ate, profissionalId, servicoId);
                if (m.itens().isEmpty()) throw ruim("Ninguém para receber a mensagem com esses filtros.");
                UUID id = jdbc.queryForObject("insert into fila_mensagem (loja_id, tipo, criada_em, criada_por, de, ate, profissional_id, servico_id, modelo, contagem) "
                                + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb) returning id", UUID.class, loja.id().toString(), t, AvaliacaoService.utc(relogio.instant()), quem,
                        m.de(), m.ate(), profissionalId, servicoId, modelo, escrever(m.contagem()));
                int ordem = 1;
                for (Item i : m.itens()) {
                    jdbc.update("insert into fila_mensagem_item (loja_id, fila_id, ordem, agendamento_id, nome, telefone_mascarado, servicos, inicio) values (?::uuid, ?, ?, ?, ?, ?, ?::jsonb, ?)",
                            loja.id().toString(), id, ordem++, i.agendamentoId(), i.nome(), i.telefoneMascarado(), escrever(i.servicos()), AvaliacaoService.utc(i.inicio()));
                }
                return ler(jdbc, id);
            });
        } catch (DuplicateKeyException e) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Termine ou encerre a fila aberta antes de criar outra."); // duas filas ao mesmo tempo: o índice único segura
        }
    }

    public FilaAtual atual(UUID quem) {
        LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            List<UUID> ids = jdbc.queryForList("select id from fila_mensagem where criada_por = ? and not encerrada order by criada_em desc limit 1", UUID.class, quem);
            return new FilaAtual(ids.isEmpty() ? null : ler(jdbc, ids.get(0)));
        });
    }

    // ---------------------------------------------------------------- um clique por pessoa

    /**
     * Devolve o número e (avaliação) o token pessoal, UMA vez; o item vira "aberto". Se o contato ficou impossível (sem telefone agora, já avaliou, pediu para não
     * receber) o item é PULADO e fica registrado (a transação grava e só depois a recusa 409 sai).
     */
    public Aberto abrir(UUID quem, UUID filaId, int ordem) {
        Loja loja = LojaContext.exigir();
        Abrindo r = banco.naLoja(jdbc -> {
            String[] fila = travarFila(jdbc, quem, filaId);
            List<Object[]> it = jdbc.query("select agendamento_id, status from fila_mensagem_item where fila_id = ? and ordem = ? for update",
                    (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2)}, filaId, ordem);
            if (it.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Item não encontrado.");
            String status = (String) it.get(0)[1];
            if (!status.equals("pendente") && !status.equals("aberto")) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este contato já foi tratado.");
            UUID ag = (UUID) it.get(0)[0];
            PedidoDeAvaliacao.Situacao s = PedidoDeAvaliacao.ler(jdbc, cifra, ag, true);
            boolean avaliacao = fila[0].equals("avaliacao");
            Instant agora = relogio.instant();
            if (s == null || !s.ok() || (avaliacao && s.jaAvaliou())) {
                String motivo = s == null ? "nao_concluido" : s.ok() ? "ja_avaliou" : s.motivo();
                jdbc.update("update fila_mensagem_item set status = 'pulou', em = ?, motivo = ? where fila_id = ? and ordem = ?", AvaliacaoService.utc(agora), motivo, filaId, ordem);
                return new Abrindo(null, motivo);
            }
            String token = null;
            if (avaliacao) {
                token = avaliacoes.emitirAcesso(jdbc, loja.id(), ag);
                jdbc.update("update agendamento set avaliacao_pedida_em = ?, avaliacao_pedida_por = ? where id = ?", AvaliacaoService.utc(agora), quem, ag);
            }
            jdbc.update("update fila_mensagem_item set status = 'aberto', em = ? where fila_id = ? and ordem = ?", AvaliacaoService.utc(agora), filaId, ordem);
            return new Abrindo(new Aberto(fila[0], fila[1], token, s.numero(), s.nome(), loja.nome()), null);
        });
        if (r.pulado() != null) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este contato não pode mais receber a mensagem e foi pulado.");
        return r.aberto();
    }

    /** `enviado` só depois de aberto; `pulou` a qualquer momento antes de tratar. Item já tratado não muda. */
    public Fila marcar(UUID quem, UUID filaId, int ordem, String status) {
        LojaContext.exigir();
        if (!"enviado".equals(status) && !"pulou".equals(status)) throw ruim("Item inválido.");
        return banco.naLoja(jdbc -> {
            travarFila(jdbc, quem, filaId);
            List<String> atual = jdbc.query("select status from fila_mensagem_item where fila_id = ? and ordem = ? for update", (rs, i) -> rs.getString(1), filaId, ordem);
            if (atual.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Item não encontrado.");
            if ("enviado".equals(status) && !atual.get(0).equals("aberto")) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Abra a conversa no WhatsApp antes de marcar como enviado.");
            if (!atual.get(0).equals("pendente") && !atual.get(0).equals("aberto")) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este contato já foi tratado.");
            jdbc.update("update fila_mensagem_item set status = ?, em = ? where fila_id = ? and ordem = ?", status, AvaliacaoService.utc(relogio.instant()), filaId, ordem);
            return ler(jdbc, filaId);
        });
    }

    public void encerrar(UUID quem, UUID filaId) {
        LojaContext.exigir();
        banco.naLoja(jdbc -> {
            travarFila(jdbc, quem, filaId);
            jdbc.update("update fila_mensagem set encerrada = true where id = ?", filaId);
            return null;
        });
    }

    // ---------------------------------------------------------------- internos

    /** Trava a fila DE QUEM PEDIU (a de outra pessoa é 404) e devolve [tipo, modelo]. Fila encerrada = 409. */
    private String[] travarFila(JdbcTemplate jdbc, UUID quem, UUID filaId) {
        List<Object[]> f = jdbc.query("select tipo, modelo, encerrada from fila_mensagem where id = ? and criada_por = ? for update",
                (rs, i) -> new Object[]{rs.getString(1), rs.getString(2), rs.getBoolean(3)}, filaId, quem);
        if (f.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Fila não encontrada.");
        if ((boolean) f.get(0)[2]) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esta fila foi encerrada.");
        return new String[]{(String) f.get(0)[0], (String) f.get(0)[1]};
    }

    private Fila ler(JdbcTemplate jdbc, UUID id) {
        Fila base = jdbc.queryForObject("select tipo, criada_em, de, ate, profissional_id, servico_id, modelo, encerrada, contagem::text from fila_mensagem where id = ?", (rs, i) -> {
            try {
                return new Fila(id, rs.getString(1), rs.getObject(2, OffsetDateTime.class).toInstant(),
                        new Filtros(rs.getString(3), rs.getString(4), rs.getObject(5, UUID.class), rs.getObject(6, UUID.class)), rs.getString(7), rs.getBoolean(8),
                        json.readValue(rs.getString(9), Contagem.class), null);
            } catch (JsonProcessingException e) {
                throw new IllegalStateException(e);
            }
        }, id);
        List<Item> itens = jdbc.query("select ordem, agendamento_id, nome, telefone_mascarado, servicos::text, inicio, status, em from fila_mensagem_item where fila_id = ? order by ordem", (rs, i) -> {
            try {
                OffsetDateTime em = rs.getObject(8, OffsetDateTime.class);
                return new Item(rs.getInt(1), rs.getObject(2, UUID.class), rs.getString(3), rs.getString(4),
                        json.readValue(rs.getString(5), new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {
                        }), rs.getObject(6, OffsetDateTime.class).toInstant(), rs.getString(7), em == null ? null : em.toInstant());
            } catch (JsonProcessingException e) {
                throw new IllegalStateException(e);
            }
        }, id);
        return new Fila(base.id(), base.tipo(), base.criadaEm(), base.filtros(), base.modelo(), base.encerrada(), base.contagem(), itens);
    }

    private String escrever(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Quem entra: atendimentos concluídos (com serviço) no período, por profissional e serviço. Uma linha por pessoa (a mais recente), só com WhatsApp válido,
     * sem quem pediu para não receber; na avaliação, sem quem já avaliou. Até 200 (o resto vira `excedente`). Espelho de `montarFila` (domain/avaliacoes.js).
     */
    private Montada montar(JdbcTemplate jdbc, String tipo, String de, String ate, UUID profissionalId, UUID servicoId) {
        if (!AvaliacaoRegras.TIPOS_FILA.contains(tipo)) throw ruim("Tipo de mensagem inválido.");
        AvaliacaoRegras.Periodo p = AvaliacaoRegras.periodo(de, ate);
        if (p.erro() != null) throw ruim(p.erro());
        if (p.semLimite()) throw ruim("Informe o período dos atendimentos (data inicial e final).");
        List<Object> args = new ArrayList<>();
        args.add(AvaliacaoService.utc(p.de().atStartOfDay(Fuso.BRASIL).toInstant()));
        args.add(AvaliacaoService.utc(p.ate().plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant()));
        String filtro = "";
        if (profissionalId != null) {
            filtro += " and a.profissional_id = ?";
            args.add(profissionalId);
        }
        if (servicoId != null) {
            filtro += " and exists (select 1 from agendamento_servico s2 where s2.agendamento_id = a.id and s2.servico_id = ?)";
            args.add(servicoId);
        }
        record Cand(UUID ag, UUID cli, String nome, String apelido, String telCif, boolean semMsg, boolean jaAvaliou, Instant inicio) {
        }
        List<Cand> cands = jdbc.query("select a.id, a.cliente_id, a.inicio, c.nome, c.apelido, c.telefone_cif, c.sem_mensagens, "
                        + "exists(select 1 from avaliacao v where v.agendamento_id = a.id) as ja "
                        + "from agendamento a left join cliente c on c.id = a.cliente_id where a.status = 'concluido' "
                        + "and exists (select 1 from agendamento_servico s where s.agendamento_id = a.id) and a.inicio >= ? and a.inicio < ?" + filtro
                        + " order by a.inicio desc, a.id",
                (rs, i) -> new Cand(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(4), rs.getString(5), rs.getString(6), rs.getBoolean(7), rs.getBoolean("ja"),
                        rs.getObject(3, OffsetDateTime.class).toInstant()), args.toArray());
        int semCadastro = 0, semTelefone = 0, semMensagens = 0, duplicados = 0, jaAvaliou = 0;
        Set<String> vistos = new HashSet<>();
        Set<UUID> semFone = new HashSet<>(), optOut = new HashSet<>();
        List<Item> itens = new ArrayList<>();
        for (Cand c : cands) {
            if (c.cli() == null || c.nome() == null) {
                semCadastro++;
                continue;
            }
            String numero = c.telCif() == null ? "" : AvaliacaoRegras.numeroWhatsapp(cifra.decifrar(c.telCif()));
            if (numero.isEmpty()) {
                if (semFone.add(c.cli())) semTelefone++;
                continue;
            }
            if (c.semMsg()) {
                if (optOut.add(c.cli())) semMensagens++;
                continue;
            }
            if (!vistos.add(numero)) {
                duplicados++;
                continue;
            }
            if ("avaliacao".equals(tipo) && c.jaAvaliou()) {
                jaAvaliou++;
                continue;
            }
            itens.add(new Item(0, c.ag(), c.apelido() != null && !c.apelido().isBlank() ? c.apelido() : c.nome(), AvaliacaoRegras.telefoneMascarado(cifra.decifrar(c.telCif())), null, c.inicio(), "pendente", null));
        }
        int excedente = 0;
        if (itens.size() > AvaliacaoRegras.FILA_MAX) {
            excedente = itens.size() - AvaliacaoRegras.FILA_MAX;
            itens = new ArrayList<>(itens.subList(0, AvaliacaoRegras.FILA_MAX));
        }
        List<Item> completos = new ArrayList<>();
        int n = 1;
        for (Item i : itens) {
            List<String> servicos = jdbc.queryForList("select nome from agendamento_servico where agendamento_id = ? order by ordem", String.class, i.agendamentoId());
            completos.add(new Item(n++, i.agendamentoId(), i.nome(), i.telefoneMascarado(), servicos, i.inicio(), "pendente", null));
        }
        return new Montada(tipo, completos, new Contagem(cands.size(), semCadastro, semTelefone, semMensagens, duplicados, jaAvaliou, excedente), p.de(), p.ate());
    }

    private static ErroDeNegocio ruim(String msg) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, msg);
    }
}
