package br.com.agendz.configuracao;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Ordem da tela Atender (espelho de src/domain/ordem-atender.js; mesmos casos em equivalencia/ordem-atender.json).
 * Forma: {futuro:{etapas,veiculo,cliente}, local:{...}}. Lista salva nunca é usada direto: só ids conhecidos, sem repetir, e o que faltar entra no fim na ordem de fábrica.
 */
public final class OrdemDoAtender {

    public static final List<String> TIPOS = List.of("futuro", "local");
    public static final List<String> ETAPAS = List.of("cliente", "veiculo", "servicos", "quando", "produtos");
    public static final List<String> CAMPOS_DO_VEICULO = List.of("placa", "modelo", "marca", "cor", "porte");
    public static final List<String> CAMPOS_DO_CLIENTE = List.of("nome", "telefone");
    private static final List<String> GRUPOS = List.of("etapas", "veiculo", "cliente");
    private static final ObjectMapper JSON = new ObjectMapper();

    private OrdemDoAtender() {
    }

    /** Ordem de fábrica do site real: Cliente → Veículo → Serviços → Quando → Produtos. */
    public static Map<String, Map<String, List<String>>> padrao() {
        Map<String, Map<String, List<String>>> r = new LinkedHashMap<>();
        for (String t : TIPOS) {
            Map<String, List<String>> o = new LinkedHashMap<>();
            o.put("etapas", ETAPAS);
            o.put("veiculo", CAMPOS_DO_VEICULO);
            o.put("cliente", CAMPOS_DO_CLIENTE);
            r.put(t, o);
        }
        return r;
    }

    static List<String> lista(Object valor, List<String> conhecidos) {
        Set<String> vistos = new LinkedHashSet<>();
        if (valor instanceof List<?> l) {
            int n = 0;
            for (Object x : l) {
                if (n++ >= 20) break;
                if (x instanceof String s && conhecidos.contains(s)) vistos.add(s);
            }
        }
        vistos.addAll(conhecidos);
        return List.copyOf(vistos);
    }

    /** Completo e válido a partir de qualquer valor (lixo, parcial ou ausente). */
    public static Map<String, Map<String, List<String>>> sanear(Object valor) {
        Map<?, ?> v = valor instanceof Map<?, ?> m ? m : Map.of();
        Map<String, Map<String, List<String>>> r = new LinkedHashMap<>();
        for (String t : TIPOS) {
            Map<?, ?> o = v.get(t) instanceof Map<?, ?> m ? m : Map.of();
            Map<String, List<String>> g = new LinkedHashMap<>();
            g.put("etapas", lista(o.get("etapas"), ETAPAS));
            g.put("veiculo", lista(o.get("veiculo"), CAMPOS_DO_VEICULO));
            g.put("cliente", lista(o.get("cliente"), CAMPOS_DO_CLIENTE));
            r.put(t, g);
        }
        return r;
    }

    /** A entrada tem a forma certa? Forma errada é recusada; lista parcial é completada. */
    public static boolean valida(Object valor) {
        if (!(valor instanceof Map<?, ?> v)) return false;
        for (Object k : v.keySet()) if (!TIPOS.contains(k)) return false;
        for (String t : TIPOS) {
            Object o = v.get(t);
            if (o == null) {
                if (v.containsKey(t)) return false;
                continue;
            }
            if (!(o instanceof Map<?, ?> m)) return false;
            for (Object k : m.keySet()) if (!GRUPOS.contains(k)) return false;
            for (String g : GRUPOS) {
                Object l = m.get(g);
                if (l == null) {
                    if (m.containsKey(g)) return false;
                    continue;
                }
                if (!(l instanceof List<?> lst) || lst.size() > 20) return false;
                for (Object x : lst) if (!(x instanceof String s) || s.length() > 20) return false;
            }
        }
        return true;
    }

    public static String paraJson(Map<String, Map<String, List<String>>> ordem) {
        try {
            return JSON.writeValueAsString(ordem);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Texto gravado → ordem saneada (nulo ou ilegível = fábrica). */
    public static Map<String, Map<String, List<String>>> deJson(String texto) {
        if (texto == null || texto.isBlank()) return padrao();
        try {
            return sanear(JSON.readValue(texto, Object.class));
        } catch (Exception e) {
            return padrao();
        }
    }
}
