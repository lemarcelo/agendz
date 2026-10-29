package br.com.agendz.agenda;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.tenant.Capacidades;
import br.com.agendz.tenant.Loja;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * O que um atendimento ocupa (espelho de `ocupacao`/`acharConflitos`/`escolherBox` em src/domain/rules.js):
 * - o profissional, nos BLOCOS em que está trabalhando (serviço comum = 1 bloco; serviço de vários dias = 1 por dia de expediente), mais o intervalo depois do último;
 * - o box, da entrada até o fim do último bloco + intervalo (o carro fica no box entre um dia e outro).
 * Tudo roda dentro de `LojaJdbc.naLoja` (RLS) e na mesma transação de quem grava; o profissional e os boxes são travados antes de conferir (sem corrida).
 */
@Component
public class Ocupacao {

    /** `blocos` = onde há trabalho (o último termina quando o serviço termina); `fimOcupado` = fim do serviço + intervalo. */
    public record Plano(List<Instant[]> blocos, Instant fimServico, Instant fimOcupado) {
        public Instant entrada() {
            return blocos.get(0)[0];
        }

        /** Janelas em que o profissional fica ocupado: os blocos, com o intervalo somado ao último. */
        public List<Instant[]> doProfissional() {
            List<Instant[]> saida = new ArrayList<>(blocos.subList(0, blocos.size() - 1));
            saida.add(new Instant[]{blocos.get(blocos.size() - 1)[0], fimOcupado});
            return saida;
        }

        public int dias() {
            return (int) blocos.stream().map(b -> b[0].atZone(br.com.agendz.escala.Fuso.BRASIL).toLocalDate()).distinct().count();
        }
    }

    public record Conflito(UUID id, String status) {
    }

    private final EscalaService escalas;

    public Ocupacao(EscalaService escalas) {
        this.escalas = escalas;
    }

    /** Monta a ocupação e confere o expediente (loja e profissional). Erro 409 com a mensagem do simulador se não couber. */
    public Plano planejar(JdbcTemplate jdbc, UUID profissionalId, Instant inicio, int minutos, int intervalo, boolean multiDia) {
        List<Instant[]> blocos;
        if (multiDia) {
            blocos = escalas.blocos(jdbc, profissionalId, inicio, minutos);
            if (blocos == null) {
                boolean entra = escalas.atende(jdbc, profissionalId, inicio, inicio.plusSeconds(60), true);
                throw new ErroDeNegocio(HttpStatus.CONFLICT, entra ? "Não há expediente suficiente nos próximos dias para concluir esse serviço." : nome(jdbc, profissionalId) + " não atende nesse horário.");
            }
        } else {
            Instant fim = inicio.plus(Duration.ofMinutes(minutos));
            if (!escalas.atende(jdbc, profissionalId, inicio, fim, false)) throw new ErroDeNegocio(HttpStatus.CONFLICT, nome(jdbc, profissionalId) + " não atende nesse horário.");
            blocos = List.of(new Instant[]{inicio, fim});
        }
        Instant fimServico = blocos.get(blocos.size() - 1)[1];
        return new Plano(blocos, fimServico, fimServico.plus(Duration.ofMinutes(intervalo)));
    }

    /** Ocupação já gravada (blocos do banco; o último guarda o intervalo, então o fim do serviço vem da linha do agendamento). */
    public Plano lerPlano(JdbcTemplate jdbc, UUID agendamentoId, Instant fimServico, Instant fimOcupado) {
        List<Instant[]> blocos = new ArrayList<>(jdbc.query("select ini, fim from agendamento_bloco where agendamento_id = ? order by ini",
                (rs, i) -> new Instant[]{rs.getObject("ini", OffsetDateTime.class).toInstant(), rs.getObject("fim", OffsetDateTime.class).toInstant()}, agendamentoId));
        if (blocos.isEmpty()) throw new IllegalStateException("agendamento sem blocos: " + agendamentoId);
        Instant[] ultimo = blocos.get(blocos.size() - 1);
        blocos.set(blocos.size() - 1, new Instant[]{ultimo[0], fimServico});
        return new Plano(blocos, fimServico, fimOcupado);
    }

    /** Troca os blocos gravados pelos do plano. */
    public void gravarBlocos(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId, Plano plano) {
        jdbc.update("delete from agendamento_bloco where agendamento_id = ?", agendamentoId);
        for (Instant[] b : plano.doProfissional()) {
            jdbc.update("insert into agendamento_bloco (loja_id, agendamento_id, ini, fim) values (?::uuid, ?, ?, ?)", lojaId.toString(), agendamentoId, utc(b[0]), utc(b[1]));
        }
    }

    /** Agendamentos ativos (não cancelados) do mesmo profissional cujos blocos se sobrepõem aos do plano. */
    public List<Conflito> conflitos(JdbcTemplate jdbc, UUID profissionalId, UUID ignorar, Plano plano) {
        Map<UUID, Conflito> achados = new LinkedHashMap<>();
        for (Instant[] b : plano.doProfissional()) {
            jdbc.query("select distinct a.id, a.status from agendamento a join agendamento_bloco k on k.agendamento_id = a.id "
                            + "where a.profissional_id = ? and a.id <> ? and a.status <> 'cancelado' and k.ini < ? and k.fim > ?",
                    rs -> {
                        UUID id = rs.getObject("id", UUID.class);
                        achados.put(id, new Conflito(id, rs.getString("status")));
                    }, profissionalId, ignorar, utc(b[1]), utc(b[0]));
        }
        return new ArrayList<>(achados.values());
    }

    /** Quem confirma primeiro fica com o horário: os "a confirmar" (não encaixe) que dividem o profissional com `mantido` são cancelados. Devolve os cancelados. */
    public List<UUID> cancelarPendentes(JdbcTemplate jdbc, UUID profissionalId, UUID mantido, Plano plano) {
        List<UUID> perdedores = new ArrayList<>();
        for (Instant[] b : plano.doProfissional()) {
            perdedores.addAll(jdbc.queryForList("update agendamento set status = 'cancelado', motivo_cancelamento = 'conflito', atualizado_em = now() "
                            + "where profissional_id = ? and id <> ? and status = 'a_confirmar' and not encaixe "
                            + "and exists (select 1 from agendamento_bloco k where k.agendamento_id = agendamento.id and k.ini < ? and k.fim > ?) returning id",
                    UUID.class, profissionalId, mantido, utc(b[1]), utc(b[0])));
        }
        return perdedores;
    }

    /**
     * Box do atendimento: o pedido (se estiver livre), senão o preferido (o que já tinha), senão o primeiro livre. Nunca "força": dois carros não ocupam o mesmo box.
     * Tipo sem recurso físico (barbearia) devolve null. Os boxes ativos ficam travados até o fim da transação.
     */
    public UUID escolherBox(JdbcTemplate jdbc, Loja loja, Plano plano, UUID pedido, UUID preferido, UUID ignorar) {
        if (!Capacidades.usaRecursoFisico(loja)) return null;
        List<Object[]> ativos = jdbc.query("select id, nome from box where ativo order by ordem, criado_em, id for update",
                (rs, i) -> new Object[]{rs.getObject("id", UUID.class), rs.getString("nome")});
        if (ativos.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Cadastre ao menos um box em Estabelecimento > Boxes.");
        if (pedido != null) {
            Object[] b = ativos.stream().filter(x -> x[0].equals(pedido)).findFirst().orElseThrow(() -> new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Box não encontrado."));
            if (!livre(jdbc, (UUID) b[0], plano, ignorar)) throw new ErroDeNegocio(HttpStatus.CONFLICT, b[1] + " está ocupado nesse horário.");
            return pedido;
        }
        List<Object[]> ordem = new ArrayList<>();
        if (preferido != null) ativos.stream().filter(x -> x[0].equals(preferido)).findFirst().ifPresent(ordem::add);
        for (Object[] b : ativos) if (!b[0].equals(preferido)) ordem.add(b);
        for (Object[] b : ordem) if (livre(jdbc, (UUID) b[0], plano, ignorar)) return (UUID) b[0];
        throw new ErroDeNegocio(HttpStatus.CONFLICT, ativos.size() == 1 ? "O box está ocupado nesse horário." : "Todos os boxes estão ocupados nesse horário.");
    }

    private boolean livre(JdbcTemplate jdbc, UUID boxId, Plano plano, UUID ignorar) {
        Integer n = jdbc.queryForObject("select count(*) from agendamento where box_id = ? and id <> ? and status <> 'cancelado' and inicio < ? and fim_ocupado > ?",
                Integer.class, boxId, ignorar, utc(plano.fimOcupado()), utc(plano.entrada()));
        return n != null && n == 0;
    }

    private String nome(JdbcTemplate jdbc, UUID usuarioId) {
        return jdbc.queryForObject("select coalesce(nullif(apelido, ''), nome) from usuario where id = ?", String.class, usuarioId);
    }

    static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
