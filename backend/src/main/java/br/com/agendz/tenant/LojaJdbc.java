package br.com.agendz.tenant;

import java.util.function.Function;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
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
    private final TransactionTemplate txIndependente;

    public LojaJdbc(JdbcTemplate jdbc, PlatformTransactionManager tm) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(tm);
        this.txIndependente = new TransactionTemplate(tm);
        this.txIndependente.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public <T> T naLoja(Function<JdbcTemplate, T> trabalho) {
        return naLoja(LojaContext.exigir().id(), trabalho);
    }

    /** Para rotinas sem requisição (automação): a loja é dada explicitamente, e a trava do banco (RLS) vale do mesmo jeito. */
    public <T> T naLoja(java.util.UUID lojaId, Function<JdbcTemplate, T> trabalho) {
        return tx.execute(status -> {
            jdbc.execute("SET LOCAL ROLE agendz_app");
            jdbc.queryForObject("select set_config('app.loja_id', ?, true)", String.class, lojaId.toString());
            return trabalho.apply(jdbc);
        });
    }

    /**
     * Para o que precisa FICAR gravado mesmo quando a operação que o chamou é recusada (a tentativa de cupom com chave errada): abre uma transação
     * própria, que termina antes de a de fora voltar atrás. A trava do banco (RLS) vale do mesmo jeito.
     */
    public <T> T naLojaIndependente(java.util.UUID lojaId, Function<JdbcTemplate, T> trabalho) {
        return txIndependente.execute(status -> {
            jdbc.execute("SET LOCAL ROLE agendz_app");
            jdbc.queryForObject("select set_config('app.loja_id', ?, true)", String.class, lojaId.toString());
            return trabalho.apply(jdbc);
        });
    }
}
