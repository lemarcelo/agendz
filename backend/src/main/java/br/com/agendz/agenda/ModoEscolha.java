package br.com.agendz.agenda;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * B2: modos da escolha automática do profissional (espelho de src/domain/modo-escolha.js; mesmos casos em equivalencia/modo-escolha.json).
 * {@code livre} = o "mais livre" do B9c ({@link Folga}); {@code aleatorio} = pela chave sorteada de cada um; {@code menos} = quem atendeu MENOS no mês
 * (agendamentos não cancelados, mais os serviços já atribuídos a ele no MESMO agendamento); {@code fila} = circular, começando depois do último escolhido.
 * Em todos o empate segue a ordem da equipe. A ordem devolvida é só preferência: quem chama pega o primeiro que atende o serviço e cabe no horário.
 */
public final class ModoEscolha {

    public static final String LIVRE = "livre";
    public static final String ALEATORIO = "aleatorio";
    public static final String MENOS = "menos";
    public static final String FILA = "fila";
    public static final List<String> MODOS = List.of(LIVRE, ALEATORIO, MENOS, FILA);

    private ModoEscolha() {
    }

    /** Valor gravado/recebido → modo conhecido; qualquer outra coisa vale o padrão (livre). */
    public static String sanear(String modo) {
        return modo != null && MODOS.contains(modo) ? modo : LIVRE;
    }

    /** Limites em ms: dia [ini, fim), janela [ini, janelaFim) e mês [mesIni, mesFim). */
    public record Limites(long ini, long fim, long janelaFim, long mesIni, long mesFim) {
    }

    public static List<String> ordenar(String modo, List<String> ids, List<Folga.Ag> agendamentos, Limites l, Map<String, Integer> ja, Map<String, Double> sorteio, String ponteiro) {
        if (ids.size() < 2) return new ArrayList<>(ids);
        switch (sanear(modo)) {
            case ALEATORIO:
                return porChave(ids, sorteio);
            case MENOS:
                return menos(ids, agendamentos, l, ja);
            case FILA:
                return fila(ids, ponteiro);
            default:
                return Folga.ordenar(ids, agendamentos, l.ini(), l.fim(), l.janelaFim());
        }
    }

    private static List<String> porChave(List<String> ids, Map<String, Double> sorteio) {
        List<Integer> pos = posicoes(ids.size());
        pos.sort((x, y) -> {
            double a = chave(sorteio, ids.get(x));
            double b = chave(sorteio, ids.get(y));
            if (a != b) return Double.compare(a, b);
            return Integer.compare(x, y);
        });
        return mapear(ids, pos);
    }

    private static double chave(Map<String, Double> sorteio, String id) {
        Double v = sorteio == null ? null : sorteio.get(id);
        return v == null ? Double.POSITIVE_INFINITY : v;
    }

    private static List<String> menos(List<String> ids, List<Folga.Ag> ags, Limites l, Map<String, Integer> ja) {
        Map<String, Integer> conta = new HashMap<>();
        for (String id : ids) conta.put(id, ja == null ? 0 : ja.getOrDefault(id, 0));
        if (ags != null) {
            for (Folga.Ag a : ags) {
                if (a == null || a.cancelado() || !conta.containsKey(a.profissionalId())) continue;
                if (a.inicioMs() >= l.mesIni() && a.inicioMs() < l.mesFim()) conta.merge(a.profissionalId(), 1, Integer::sum);
            }
        }
        List<Integer> pos = posicoes(ids.size());
        pos.sort((x, y) -> {
            int a = conta.get(ids.get(x));
            int b = conta.get(ids.get(y));
            if (a != b) return Integer.compare(a, b);
            return Integer.compare(x, y);
        });
        return mapear(ids, pos);
    }

    private static List<String> fila(List<String> ids, String ponteiro) {
        int i = ponteiro == null ? -1 : ids.indexOf(ponteiro);
        List<String> saida = new ArrayList<>();
        for (int k = 1; k <= ids.size(); k++) saida.add(ids.get((i + k + ids.size()) % ids.size()));
        return saida;
    }

    private static List<Integer> posicoes(int n) {
        List<Integer> p = new ArrayList<>();
        for (int i = 0; i < n; i++) p.add(i);
        return p;
    }

    private static List<String> mapear(List<String> ids, List<Integer> pos) {
        List<String> saida = new ArrayList<>();
        for (int p : pos) saida.add(ids.get(p));
        return saida;
    }
}
