package br.com.agendz.agenda;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Estoque dos produtos vendidos no atendimento (espelho de `sincronizarEstoque` em src/domain/engine.js, só a parte de produtos).
 * O estoque só sai quando o atendimento está CONCLUÍDO; se deixar de estar (reaberto, cancelado), o que saiu volta; se a quantidade muda depois de
 * concluído, só a diferença entra ou sai. Cada movimento grava uma linha em `movimento_estoque` (saldo depois do movimento, quem fez).
 * Idempotente: compara o que já saiu (`baixado`) com o que deveria ter saído, então rodar de novo não baixa duas vezes.
 * Todas as funções rodam dentro de `LojaJdbc.naLoja` (RLS) e na mesma transação da mudança de status.
 */
@Component
public class EstoqueDaVenda {

    private record Linha(UUID materialId, int qtd, int baixado, String status) {
    }

    /** Ajusta o estoque dos produtos de um agendamento ao status dele agora. `autorId` nulo = o sistema. */
    public void sincronizar(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId, UUID autorId, Instant quando) {
        List<Linha> linhas = jdbc.query(
                "select p.material_id, p.qtd, p.baixado, a.status from agendamento_produto p join agendamento a on a.id = p.agendamento_id "
                        + "where p.agendamento_id = ? order by p.material_id for update of p",
                (rs, i) -> new Linha(rs.getObject("material_id", UUID.class), rs.getInt("qtd"), rs.getInt("baixado"), rs.getString("status")), agendamentoId);
        for (Linha l : linhas) {
            int alvo = "concluido".equals(l.status()) ? l.qtd() : 0;
            int delta = alvo - l.baixado();
            if (delta == 0) continue;
            BigDecimal saldo = jdbc.queryForObject("update material set estoque = estoque - ? where id = ? returning estoque", BigDecimal.class, delta, l.materialId());
            String obs = alvo == 0 ? "Estorno: o atendimento deixou de estar concluído"
                    : l.baixado() == 0 ? "Atendimento concluído"
                    : delta > 0 ? "Serviço ou produto adicionado ao atendimento" : "Serviço ou produto retirado do atendimento";
            jdbc.update("insert into movimento_estoque (loja_id, material_id, em, tipo, delta, saldo, agendamento_id, obs, autor_id) values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?)",
                    lojaId.toString(), l.materialId(), OffsetDateTime.ofInstant(quando, ZoneOffset.UTC), delta > 0 ? "saida" : "entrada", BigDecimal.valueOf(-delta), saldo, agendamentoId, obs, autorId);
            jdbc.update("update agendamento_produto set baixado = ? where agendamento_id = ? and material_id = ?", alvo, agendamentoId, l.materialId());
        }
    }

    /** Para a rotina automática: acerta todo agendamento da loja cujo estoque não confere com o status (concluído sem baixa, ou baixa de quem não está concluído). */
    public int sincronizarPendentes(JdbcTemplate jdbc, UUID lojaId, Instant quando) {
        List<UUID> ids = jdbc.queryForList(
                "select distinct p.agendamento_id from agendamento_produto p join agendamento a on a.id = p.agendamento_id "
                        + "where (a.status = 'concluido' and p.baixado <> p.qtd) or (a.status <> 'concluido' and p.baixado <> 0)", UUID.class);
        for (UUID id : ids) sincronizar(jdbc, lojaId, id, null, quando);
        return ids.size();
    }
}
