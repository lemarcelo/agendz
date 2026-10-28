package br.com.agendz.cupom;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Regras puras do cupom, espelho de src/domain/cupons.js (mesmos casos em equivalencia/cupons.json): chave, normalização, comparação em tempo constante
 * e quanto cada serviço desconta. Não conhece banco nem requisição.
 */
public final class CupomRegras {

    /** Sem 0, O, 1, I: a chave é lida e digitada por gente. 32 símbolos × 12 posições = 60 bits. */
    public static final String ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom ALEATORIO = new SecureRandom();
    private static final BigDecimal CEM = BigDecimal.valueOf(100);

    private CupomRegras() {
    }

    public record Item(String id, BigDecimal valor) {
    }

    public static String gerarChave() {
        StringBuilder s = new StringBuilder(14);
        for (int i = 0; i < 12; i++) {
            if (i > 0 && i % 4 == 0) s.append('-');
            s.append(ALFABETO.charAt(ALEATORIO.nextInt(32))); // 32 divide o intervalo: sem viés
        }
        return s.toString();
    }

    /** Aceita minúsculas, espaços e hífens a mais; devolve XXXX-XXXX-XXXX ou null se não puder ser uma chave. */
    public static String normalizar(String entrada) {
        String s = entrada == null ? "" : entrada.toUpperCase(java.util.Locale.ROOT).replaceAll("[\\s-]", "");
        if (s.length() != 12) return null;
        for (int i = 0; i < s.length(); i++) if (ALFABETO.indexOf(s.charAt(i)) < 0) return null;
        return s.substring(0, 4) + "-" + s.substring(4, 8) + "-" + s.substring(8, 12);
    }

    /** Comparação sem parar no primeiro caractere diferente (o tempo de resposta não denuncia a chave). */
    public static boolean igualConstante(String a, String b) {
        int d = a.length() ^ b.length();
        for (int i = 0; i < Math.max(a.length(), b.length()); i++) {
            int x = i < a.length() ? a.charAt(i) : 0;
            int y = i < b.length() ? b.charAt(i) : 0;
            d |= x ^ y;
        }
        return d == 0;
    }

    static BigDecimal r2(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Quanto cada item desconta. Nunca passa do valor do serviço. Vale serviço: um por vale, o mais caro que ele cobre, de graça.
     * Percentual: cada serviço elegível. Valor fixo: do mais caro para o mais barato até acabar o valor.
     * {@code servicoIds} vazio = todos os serviços (tipos percentual e valor).
     */
    public static Map<String, BigDecimal> descontos(String tipo, List<String> servicoIds, BigDecimal percentual, BigDecimal valor, List<Item> itens) {
        Map<String, BigDecimal> out = new LinkedHashMap<>();
        if (itens == null) return out;
        List<String> cobre = servicoIds == null ? List.of() : servicoIds;
        List<Item> elegiveis = new ArrayList<>();
        for (Item i : itens) if ((cobre.isEmpty() || cobre.contains(i.id())) && i.valor().signum() > 0) elegiveis.add(i);
        if ("servico".equals(tipo)) {
            Item alvo = null;
            for (Item i : elegiveis) if (cobre.contains(i.id()) && (alvo == null || i.valor().compareTo(alvo.valor()) > 0)) alvo = i;
            if (alvo != null) out.put(alvo.id(), r2(alvo.valor()));
        } else if ("percentual".equals(tipo)) {
            BigDecimal p = (percentual == null ? BigDecimal.ZERO : percentual).max(BigDecimal.ZERO).min(CEM);
            for (Item i : elegiveis) {
                BigDecimal d = r2(i.valor().multiply(p).divide(CEM, 6, RoundingMode.HALF_UP).min(i.valor()));
                if (d.signum() > 0) out.put(i.id(), d);
            }
        } else if ("valor".equals(tipo)) {
            BigDecimal resta = (valor == null ? BigDecimal.ZERO : valor).max(BigDecimal.ZERO);
            List<Item> porValor = new ArrayList<>(elegiveis);
            porValor.sort(Comparator.comparing(Item::valor).reversed()); // estável: empate mantém a ordem do agendamento
            for (Item i : porValor) {
                BigDecimal d = r2(resta.min(i.valor()));
                if (d.signum() > 0) {
                    out.put(i.id(), d);
                    resta = r2(resta.subtract(d));
                }
            }
        }
        return out;
    }
}
