package br.com.agendz.escala;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Ausência do box (bloco G2, tabela `ausencia_box`, V61): quem escolhe box, cria, remarca ou oferece horário consulta aqui, dentro de `LojaJdbc.naLoja` (RLS). */
public final class AusenciasBox {

    private AusenciasBox() {
    }

    /** O box está ausente em algum ponto de [ini, fim)? */
    public static boolean ocupado(JdbcTemplate jdbc, UUID boxId, Instant ini, Instant fim) {
        Integer n = jdbc.queryForObject("select count(*) from ausencia_box where box_id = ? and ini < ? and fim > ?", Integer.class,
                boxId, OffsetDateTime.ofInstant(fim, ZoneOffset.UTC), OffsetDateTime.ofInstant(ini, ZoneOffset.UTC));
        return n != null && n > 0;
    }
}
