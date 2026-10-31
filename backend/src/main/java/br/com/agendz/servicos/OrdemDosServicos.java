package br.com.agendz.servicos;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Ordem dos serviços (v123; espelha src/domain/ordem-servicos.js). Modo 'uso' (padrão): os mais usados em cima, contagem DERIVADA dos
 * agendamentos dos últimos 90 dias que não foram cancelados (combo conta o combo), nunca guardada nem devolvida ao cliente; empate cai na ordem manual.
 * Modo 'manual': só a ordem do dono (`servico.ordem`; sem ordem vai depois, por nome). Chamar dentro de uma transação da loja (RLS).
 */
public final class OrdemDosServicos {

    public static final List<String> MODOS = List.of("uso", "manual");

    private OrdemDosServicos() {
    }

    /** Modo gravado na loja; sem linha de configuração vale o padrão 'uso'. */
    public static String modo(JdbcTemplate jdbc) {
        List<String> m = jdbc.queryForList("select ordem_servicos from configuracao_loja", String.class);
        return m.isEmpty() || !MODOS.contains(m.get(0)) ? "uso" : m.get(0);
    }

    /** Pedaço de ORDER BY manual (a tabela `servico` sem apelido). */
    public static final String MANUAL = "ordem nulls last, lower(nome), id";

    /** Pedaço de ORDER BY pelo modo da loja (a tabela `servico` sem apelido). */
    public static String sql(JdbcTemplate jdbc) {
        if (!"uso".equals(modo(jdbc))) return MANUAL;
        return "(select count(*) from agendamento_servico x join agendamento a on a.id = x.agendamento_id where x.servico_id = servico.id and a.status <> 'cancelado' and a.inicio >= now() - interval '90 days') desc, " + MANUAL;
    }
}
