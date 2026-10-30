package br.com.agendz.planos;

import br.com.agendz.escala.Fuso;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Regras puras dos planos de serviço, espelho de src/domain/planos.js (mesmos casos em equivalencia/planos.json, rodados em tests/planos-equivalencia.test.mjs
 * e em PlanosEquivalenciaTest). Não conhece banco nem requisição. O saldo é sempre DERIVADO: quem chama traz os meses pagos e os horários que gastaram corte.
 * Meses são 'AAAA-MM' (como no simulador); os horários são lidos no fuso da loja.
 */
public final class PlanoRegras {

    public static final int ATRASO_ZERA_MESES = 2;
    public static final int MESES_A_FRENTE = 3;
    public static final int MAX_PEDIDOS_ABERTOS = 30;
    public static final int LIMITE_PLANOS = 20;
    public static final int LIMITE_ASSINATURAS = 1000;
    public static final String GENERICO_SALDO = "Não encontramos um plano ativo para esse telefone.";
    private static final String[] MESES = {"janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"};

    private PlanoRegras() {
    }

    /** Cópia do plano como era na contratação (é o que a assinatura guarda). */
    public record Foto(String nome, BigDecimal preco, int cortes, List<UUID> servicoIds, int adianta, int acumuloMeses, int intervaloDias) {
    }

    public record Linha(String mes, boolean pago, int concedidos, int usados, int saldoFim, int limite, boolean estourou, boolean zerou) {
    }

    public record Extrato(List<Linha> linhas, int saldo, String mesAtual) {
    }

    public record Saldo(String planoNome, String situacao, int cortesPorMes, String mes, boolean pagoMes, int restantes, int usadosNoMes, int maisPermitidos, String pagoAte, boolean atrasado) {
    }

    public record Pode(boolean ok, String erro, boolean adiantado, String aviso) {
    }

    // ---------------------------------------------------------------- meses

    public static String mesDe(Instant ts) {
        ZonedDateTime z = ts.atZone(Fuso.BRASIL);
        return String.format("%04d-%02d", z.getYear(), z.getMonthValue());
    }

    static int mi(String m) {
        return Integer.parseInt(m.substring(0, 4)) * 12 + Integer.parseInt(m.substring(5, 7)) - 1;
    }

    static String doIdx(int i) {
        return String.format("%04d-%02d", Math.floorDiv(i, 12), Math.floorMod(i, 12) + 1);
    }

    public static boolean mesValido(String m) {
        return m != null && m.matches("^\\d{4}-(0[1-9]|1[0-2])$");
    }

    public static String somaMeses(String m, int n) {
        return doIdx(mi(m) + n);
    }

    public static String rotuloMes(String m) {
        return mesValido(m) ? MESES[Integer.parseInt(m.substring(5, 7)) - 1] + "/" + m.substring(0, 4) : "";
    }

    // ---------------------------------------------------------------- uso e cota

    /** Corte gasto: qualquer agendamento do plano não cancelado; o cancelado devolve o corte, menos a falta de confirmação de horário que não nasceu do link. */
    public static boolean consomeCorte(String status, String motivoCancelamento, String origem) {
        return !"cancelado".equals(status) || ("falta_confirmacao".equals(motivoCancelamento) && !"link".equals(origem));
    }

    /** Mês a mês desde o primeiro mês. `extras`: horários hipotéticos ("dá para agendar mais um?"). */
    public static Extrato extrato(Foto p, String inicioMes, Collection<String> pagos, List<Instant> usos, String mesAtual, List<Instant> extras) {
        if (pagos.isEmpty() || inicioMes == null) return new Extrato(List.of(), 0, mesAtual);
        int ini = mi(inicioMes);
        Set<String> pagosSet = Set.copyOf(pagos);
        Map<Integer, Integer> porMes = new TreeMap<>();
        for (Instant t : usos) porMes.merge(Math.max(mi(mesDe(t)), ini), 1, Integer::sum);
        for (Instant t : extras) porMes.merge(Math.max(mi(mesDe(t)), ini), 1, Integer::sum);
        int fim = mi(mesAtual);
        for (String m : pagosSet) fim = Math.max(fim, mi(m));
        for (int k : porMes.keySet()) fim = Math.max(fim, k);
        fim = Math.min(fim, ini + 48);
        int teto = p.cortes() * p.acumuloMeses();
        List<Linha> linhas = new ArrayList<>();
        int bal = 0;
        int semPagar = 0;
        for (int i = ini; i <= fim; i++) {
            String mes = doIdx(i);
            boolean pago = pagosSet.contains(mes);
            if (pago) semPagar = 0;
            else if (i <= mi(mesAtual)) semPagar++;
            int concedidos = pago ? p.cortes() : 0;
            bal = Math.min(bal + concedidos, Math.max(teto, bal));
            boolean zerou = false;
            if (!pago && semPagar >= ATRASO_ZERA_MESES && bal > 0) {
                bal = 0;
                zerou = true; // atraso: o acumulado expira
            }
            int usados = porMes.getOrDefault(i, 0);
            bal -= usados;
            int limite = pago ? p.adianta() : 0;
            linhas.add(new Linha(mes, pago, concedidos, usados, bal, limite, bal < -limite, zerou));
        }
        return new Extrato(linhas, linhas.isEmpty() ? 0 : linhas.get(linhas.size() - 1).saldoFim(), mesAtual);
    }

    /** O que o cliente (ou o dono) vê agora: cortes que restam, quantos pode ainda pedir a mais e até quando está pago. */
    public static Saldo saldoAtual(Foto p, String status, String inicioMes, Collection<String> pagos, List<Instant> usos, Instant agora) {
        String mes = mesDe(agora);
        if (!"ativa".equals(status)) return new Saldo(p.nome(), status, p.cortes(), mes, false, 0, 0, 0, null, false);
        Extrato ex = extrato(p, inicioMes, pagos, usos, mes, List.of());
        Linha linha = null;
        for (Linha l : ex.linhas()) if (mi(l.mes()) <= mi(ex.mesAtual())) linha = l;
        if (linha == null && !ex.linhas().isEmpty()) linha = ex.linhas().get(0);
        String pagoAte = pagos.stream().sorted().reduce((a, b) -> b).orElse(null);
        if (linha == null) return new Saldo(p.nome(), status, p.cortes(), mes, false, 0, 0, 0, pagoAte, false);
        boolean corrente = linha.mes().equals(ex.mesAtual());
        int restantes = mi(linha.mes()) > mi(ex.mesAtual()) ? 0 : Math.max(0, linha.saldoFim());
        boolean pagoMes = corrente && linha.pago();
        boolean atrasado = !pagoMes && pagoAte != null && mi(pagoAte) < mi(ex.mesAtual());
        return new Saldo(p.nome(), status, p.cortes(), mes, pagoMes, restantes, corrente ? linha.usados() : 0,
                Math.max(0, linha.saldoFim() + linha.limite()) - restantes, pagoAte, atrasado);
    }

    /**
     * Dá para agendar mais um corte nesse plano em `inicio`? `usos` são os horários que já gastam corte (SEM o agendamento que está sendo remarcado/reativado).
     */
    public static Pode podeUsar(Foto p, String status, String inicioMes, Collection<String> pagos, List<Instant> usos, Instant inicio, Instant agora) {
        if (!"ativa".equals(status)) return new Pode(false, "Esse plano não está ativo.", false, "");
        if (pagos.isEmpty()) return new Pode(false, "A mensalidade do plano ainda não foi registrada.", false, "");
        String mes = mesDe(inicio);
        if (mi(mes) < mi(inicioMes)) return new Pode(false, "O plano começa em " + rotuloMes(inicioMes) + ".", false, "");
        int dias = p.intervaloDias();
        if (dias > 0) {
            LocalDate dia = inicio.atZone(Fuso.BRASIL).toLocalDate();
            for (Instant u : usos) {
                long d = Math.abs(ChronoUnit.DAYS.between(u.atZone(Fuso.BRASIL).toLocalDate(), dia));
                if (d < dias) return new Pode(false, "Esse plano pede " + dias + " dia" + (dias > 1 ? "s" : "") + " entre um corte e outro.", false, "");
            }
        }
        Extrato ex = extrato(p, inicioMes, pagos, usos, mesDe(agora), List.of(inicio));
        for (Linha l : ex.linhas()) {
            if (!l.estourou()) continue;
            if (!l.pago()) return new Pode(false, "Os cortes do plano acabaram. A mensalidade de " + rotuloMes(l.mes()) + " ainda não foi registrada.", false, "");
            if (!l.mes().equals(mes)) return new Pode(false, "Esse horário deixaria o plano sem cortes em " + rotuloMes(l.mes()) + ".", false, "");
            return new Pode(false, "Os cortes do plano em " + rotuloMes(mes) + " acabaram.", false, "");
        }
        Linha linha = null;
        Linha proximo = null;
        String seguinte = somaMeses(mes, 1);
        for (Linha l : ex.linhas()) {
            if (l.mes().equals(mes)) linha = l;
            if (l.mes().equals(seguinte)) proximo = l;
        }
        boolean adiantado = linha != null && linha.saldoFim() < 0;
        String aviso = adiantado ? "Esse corte foi adiantado do mês seguinte" + (proximo == null ? "" : " (em " + rotuloMes(proximo.mes()) + " restam " + Math.max(0, proximo.saldoFim()) + ")") + "." : "";
        return new Pode(true, null, adiantado, aviso);
    }

    /** Dívida de quem encerra o plano devendo corte adiantado: os usos que passaram do que foi pago. */
    public static int dividaAoEncerrar(Extrato ex) {
        return Math.max(0, -ex.saldo());
    }

    // ---------------------------------------------------------------- ligação com o agendamento

    public record Item(UUID id, BigDecimal valor) {
    }

    private static BigDecimal r2(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    /** Serviços do agendamento que o plano cobre (saem de graça: desconto = preço). Serviço de valor zero fica de fora. */
    public static Map<UUID, BigDecimal> descontos(List<UUID> incluidos, List<Item> itens) {
        Map<UUID, BigDecimal> saida = new LinkedHashMap<>();
        if (incluidos == null || itens == null) return saida;
        for (Item i : itens) if (incluidos.contains(i.id()) && i.valor().signum() > 0) saida.put(i.id(), r2(i.valor()));
        return saida;
    }

    public static boolean cobreAlgum(Foto p, List<UUID> servicoIds) {
        for (UUID s : servicoIds) if (p.servicoIds().contains(s)) return true;
        return false;
    }
}
