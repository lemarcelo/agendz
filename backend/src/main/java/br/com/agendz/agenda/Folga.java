package br.com.agendz.agenda;

import br.com.agendz.escala.Fuso;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Escolha automática do profissional (B9c; espelho de `ordemPorFolga` em src/domain/profissional-auto.js, mesmos casos em equivalencia/folga.json).
 * Ordem do MAIS livre para o menos livre: menos agendamentos (não cancelados) no dia; empate → menos nos 7 dias a partir do dia; empate → ordem da equipe.
 * Quem cabe no horário (expediente, conflito, box) é decidido por quem chama, na ordem devolvida.
 */
public final class Folga {

    public static final int JANELA_DIAS = 7;

    private Folga() {
    }

    /** Um agendamento para a contagem: de quem é, quando começa (ms desde 1970) e se foi cancelado. */
    public record Ag(String profissionalId, long inicioMs, boolean cancelado) {
    }

    /** `ids` na ordem da equipe → os mesmos ids do mais livre para o menos livre. Os limites são em ms: [ini, fim) é o dia; [ini, janelaFim) é a janela. */
    public static List<String> ordenar(List<String> ids, List<Ag> agendamentos, long ini, long fim, long janelaFim) {
        Map<String, int[]> conta = new HashMap<>();
        for (String id : ids) conta.put(id, new int[]{0, 0});
        if (agendamentos != null) {
            for (Ag a : agendamentos) {
                if (a == null || a.cancelado()) continue;
                int[] c = conta.get(a.profissionalId());
                if (c == null || a.inicioMs() < ini) continue;
                if (a.inicioMs() < janelaFim) c[1]++;
                if (a.inicioMs() < fim) c[0]++;
            }
        }
        List<Integer> posicoes = new ArrayList<>();
        for (int i = 0; i < ids.size(); i++) posicoes.add(i);
        posicoes.sort((x, y) -> {
            int[] a = conta.get(ids.get(x));
            int[] b = conta.get(ids.get(y));
            if (a[0] != b[0]) return Integer.compare(a[0], b[0]);
            if (a[1] != b[1]) return Integer.compare(a[1], b[1]);
            return Integer.compare(x, y);
        });
        List<String> saida = new ArrayList<>();
        for (int p : posicoes) saida.add(ids.get(p));
        return saida;
    }

    /** Mesma ordem, lendo os agendamentos do banco (dentro de uma transação da loja). `dia` é o dia local da loja. */
    public static List<UUID> ordem(JdbcTemplate jdbc, List<UUID> ids, LocalDate dia) {
        if (ids.size() < 2) return ids;
        Instant ini = dia.atStartOfDay(Fuso.BRASIL).toInstant();
        Instant fim = dia.plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant();
        Instant janelaFim = dia.plusDays(JANELA_DIAS).atStartOfDay(Fuso.BRASIL).toInstant();
        List<Ag> ags = jdbc.query("select profissional_id, inicio from agendamento where status <> 'cancelado' and inicio >= ? and inicio < ?",
                (rs, i) -> new Ag(rs.getString(1), rs.getObject(2, java.time.OffsetDateTime.class).toInstant().toEpochMilli(), false),
                java.time.OffsetDateTime.ofInstant(ini, java.time.ZoneOffset.UTC), java.time.OffsetDateTime.ofInstant(janelaFim, java.time.ZoneOffset.UTC));
        List<String> ordem = ordenar(ids.stream().map(UUID::toString).toList(), ags, ini.toEpochMilli(), fim.toEpochMilli(), janelaFim.toEpochMilli());
        return ordem.stream().map(UUID::fromString).toList();
    }
}
