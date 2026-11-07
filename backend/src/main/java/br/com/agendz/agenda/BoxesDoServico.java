package br.com.agendz.agenda;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * G3 (V63): boxes permitidos por serviço. Sem linhas = qualquer box. Com vários serviços vale a INTERSEÇÃO das listas dos serviços que têm restrição
 * (o carro fica num box só). `null` = sem restrição; conjunto vazio = nenhum box serve a todos os serviços do pedido.
 */
public final class BoxesDoServico {

    private BoxesDoServico() {
    }

    public static Set<UUID> permitidos(JdbcTemplate jdbc, Collection<UUID> servicoIds) {
        if (servicoIds == null || servicoIds.isEmpty()) return null;
        List<Object[]> linhas = jdbc.query("select servico_id, box_id from servico_box where servico_id = any (?::uuid[])",
                (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}, (Object) servicoIds.stream().map(UUID::toString).toArray(String[]::new));
        if (linhas.isEmpty()) return null;
        Set<UUID> restritos = new HashSet<>();
        for (Object[] l : linhas) restritos.add((UUID) l[0]);
        Set<UUID> resultado = null;
        for (UUID s : restritos) {
            Set<UUID> deste = new HashSet<>();
            for (Object[] l : linhas) if (l[0].equals(s)) deste.add((UUID) l[1]);
            if (resultado == null) resultado = deste;
            else resultado.retainAll(deste);
        }
        return resultado;
    }

    /** Serviços do agendamento já gravado (para remarcar/reativar). */
    public static List<UUID> servicosDe(JdbcTemplate jdbc, UUID agendamentoId) {
        return new ArrayList<>(jdbc.queryForList("select servico_id from agendamento_servico where agendamento_id = ?", UUID.class, agendamentoId));
    }
}
