package br.com.agendz.escala;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Ausência do profissional (bloco A3, tabela `ausencia`, V55): intervalos em que ele NÃO recebe agendamento. Quem cria um agendamento, remarca ou oferece horário
 * ao cliente consulta aqui, dentro de `LojaJdbc.naLoja` (RLS). Ausência só vale daqui para frente: atendimento já feito não é refeito por ela.
 */
public final class Ausencias {

    private Ausencias() {
    }

    public record Janela(Instant ini, Instant fim) {
    }

    /** Ausências do profissional que tocam o período [de, ate). */
    public static List<Janela> doProfissional(JdbcTemplate jdbc, UUID profissionalId, Instant de, Instant ate) {
        return jdbc.query("select ini, fim from ausencia where usuario_id = ? and ini < ? and fim > ? order by ini",
                (rs, i) -> new Janela(rs.getObject("ini", OffsetDateTime.class).toInstant(), rs.getObject("fim", OffsetDateTime.class).toInstant()),
                profissionalId, OffsetDateTime.ofInstant(ate, ZoneOffset.UTC), OffsetDateTime.ofInstant(de, ZoneOffset.UTC));
    }

    /** O profissional está ausente em algum ponto de [ini, fim)? */
    public static boolean ocupado(JdbcTemplate jdbc, UUID profissionalId, Instant ini, Instant fim) {
        Integer n = jdbc.queryForObject("select count(*) from ausencia where usuario_id = ? and ini < ? and fim > ?", Integer.class,
                profissionalId, OffsetDateTime.ofInstant(fim, ZoneOffset.UTC), OffsetDateTime.ofInstant(ini, ZoneOffset.UTC));
        return n != null && n > 0;
    }
}
