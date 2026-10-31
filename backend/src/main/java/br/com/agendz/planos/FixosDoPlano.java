package br.com.agendz.planos;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Horários fixos do assinante (v128): leitura para o DTO da assinatura e a limpeza ao encerrar o plano ou retirar um fixo. Só SQL, sem estado nem dependência
 * (o PlanoService e o HorariosFixos usam). Espelho de `apagarFixosFuturos` em src/domain/assinaturas.js.
 */
public final class FixosDoPlano {

    /** Um horário fixo: dia da semana (0 = domingo), hora "HH:MM", quem atende, serviços do plano e (tipo com veículo) o veículo do assinante. */
    public record Fixo(UUID id, int dia, String hm, UUID profissionalId, List<UUID> servicoIds, UUID veiculoId) {
    }

    private FixosDoPlano() {
    }

    public static String junta(List<UUID> ids) {
        StringBuilder sb = new StringBuilder();
        for (UUID id : ids) sb.append(sb.length() == 0 ? "" : ",").append(id);
        return sb.toString();
    }

    public static List<UUID> separa(String csv) {
        List<UUID> saida = new ArrayList<>();
        for (String x : csv.split(",")) if (!x.isBlank()) saida.add(UUID.fromString(x.trim()));
        return saida;
    }

    private static Fixo ler(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Fixo(rs.getObject("id", UUID.class), rs.getInt("dia"), rs.getString("hm"), rs.getObject("profissional_id", UUID.class), separa(rs.getString("servicos")), rs.getObject("veiculo_id", UUID.class));
    }

    /** Fixos de uma assinatura, em ordem de dia e hora. */
    public static List<Fixo> da(JdbcTemplate jdbc, UUID assinaturaId) {
        return jdbc.query("select id, dia, hm, profissional_id, servicos, veiculo_id from assinatura_fixo where assinatura_id = ? order by dia, hm", (rs, i) -> ler(rs), assinaturaId);
    }

    /** Fixos de todas as assinaturas (ou só de uma), agrupados por assinatura. */
    public static Map<UUID, List<Fixo>> todos(JdbcTemplate jdbc, UUID filtro) {
        Map<UUID, List<Fixo>> mapa = new HashMap<>();
        jdbc.query("select assinatura_id, id, dia, hm, profissional_id, servicos, veiculo_id from assinatura_fixo" + (filtro == null ? "" : " where assinatura_id = ?") + " order by dia, hm",
                rs -> {
                    mapa.computeIfAbsent(rs.getObject("assinatura_id", UUID.class), k -> new ArrayList<>()).add(ler(rs));
                }, filtro == null ? new Object[0] : new Object[]{filtro});
        return mapa;
    }

    /**
     * Tira da agenda os agendamentos de fixo que ainda não aconteceram (a confirmar ou confirmados, no futuro): de um fixo só (`fixoId`) ou de todos (null).
     * Atendimento feito ou cancelado nunca é tocado. Com produto já lançado, em vez de apagar fica cancelado (o atendimento do plano volta do mesmo jeito).
     * Devolve quantos saíram. Roda na transação da loja de quem chama.
     */
    public static int apagarFuturos(JdbcTemplate jdbc, UUID assinaturaId, UUID fixoId, Instant agora) {
        String base = "select id, exists (select 1 from agendamento_produto p where p.agendamento_id = agendamento.id) as cobrado from agendamento "
                + "where plano_assinatura_id = ? and fixo_id is not null and inicio > ? and status in ('a_confirmar', 'confirmado')";
        OffsetDateTime depois = OffsetDateTime.ofInstant(agora, ZoneOffset.UTC);
        List<Object[]> lista = fixoId == null
                ? jdbc.query(base, (rs, i) -> new Object[]{rs.getObject("id", UUID.class), rs.getBoolean("cobrado")}, assinaturaId, depois)
                : jdbc.query(base + " and fixo_id = ?", (rs, i) -> new Object[]{rs.getObject("id", UUID.class), rs.getBoolean("cobrado")}, assinaturaId, depois, fixoId);
        for (Object[] l : lista) {
            UUID id = (UUID) l[0];
            if ((Boolean) l[1]) {
                jdbc.update("update agendamento set status = 'cancelado', motivo_cancelamento = 'plano_fixo', atualizado_em = now() where id = ?", id);
                jdbc.update("insert into agendamento_evento (loja_id, agendamento_id, em, autor_id, autor_nome, campo, de, para) "
                        + "values (current_setting('app.loja_id')::uuid, ?, ?, null, 'Sistema', 'status', 'Confirmado', 'Cancelado (horário fixo do plano removido)')", id, depois);
            } else {
                jdbc.update("delete from agendamento where id = ?", id); // os blocos, serviços e histórico saem junto (ON DELETE CASCADE)
            }
        }
        return lista.size();
    }
}
