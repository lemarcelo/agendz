package br.com.agendz.agenda;

import org.springframework.jdbc.core.JdbcTemplate;

/** Ajuda dos testes da estética: volta os boxes da Apex ao que o seed de desenvolvimento (V102) deixa. */
final class EsteticaDeTeste {

    static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";

    private EsteticaDeTeste() {
    }

    /** Apaga os agendamentos (os boxes usados não saem com histórico) e refaz Box 1, Box 2 e Box 3. */
    static void restaurarBoxes(JdbcTemplate jdbc) {
        jdbc.update("delete from agendamento");
        jdbc.update("delete from box where loja_id = ?::uuid", LOJA_APEX);
        for (int i = 1; i <= 3; i++) jdbc.update("insert into box (loja_id, nome, ordem) values (?::uuid, ?, ?)", LOJA_APEX, "Box " + i, i - 1);
    }

    /** G4: na estética só o box bloqueia; os testes de "o mesmo recurso não atende dois" ficam com UM box ativo (o papel que o profissional tinha). */
    static void umBoxSo(JdbcTemplate jdbc) {
        jdbc.update("update box set ativo = false where loja_id = ?::uuid and id <> (select id from box where loja_id = ?::uuid order by ordem, criado_em, id limit 1)", LOJA_APEX, LOJA_APEX);
    }

    static void todosOsBoxesAtivos(JdbcTemplate jdbc) {
        jdbc.update("update box set ativo = true where loja_id = ?::uuid", LOJA_APEX);
    }
}
