package br.com.agendz.tenant;

import java.util.function.Function;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * ÚNICA porta de acesso às tabelas de negócio (cliente, usuario, ...). Abre uma transação, vira o papel `agendz_app` (sem superusuário e sem BYPASSRLS,
 * então o Row Level Security vale) e grava `app.loja_id` com a loja do Host. Fora daqui, nada consulta tabela de negócio.
 * Tabelas da plataforma (loja, loja_dominio) são lidas direto por {@link LojaRepository}.
 */
@Component
public class LojaJdbc {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public LojaJdbc(JdbcTemplate jdbc, PlatformTransactionManager tm) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(tm);
    }

    public <T> T naLoja(Function<JdbcTemplate, T> trabalho) {
        Loja loja = LojaContext.exigir();
        return tx.execute(status -> {
            jdbc.execute("SET LOCAL ROLE agendz_app");
            jdbc.queryForObject("select set_config('app.loja_id', ?, true)", String.class, loja.id().toString());
            return trabalho.apply(jdbc);
        });
    }
}
