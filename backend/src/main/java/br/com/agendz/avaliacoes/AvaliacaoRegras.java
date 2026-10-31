package br.com.agendz.avaliacoes;

import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Regras PURAS das avaliações (espelho de `src/domain/avaliacoes.js`; os mesmos casos rodam nos dois lados: `equivalencia/avaliacoes.json`, `AvaliacoesEquivalenciaTest`
 * e `tests/avaliacoes-equivalencia.test.mjs`). Não conhece banco nem requisição. Spec: docs/F5-avaliacoes.md.
 */
public final class AvaliacaoRegras {

    private AvaliacaoRegras() {
    }

    public static final int NOTA_MIN = 1;
    public static final int NOTA_MAX = 5;
    public static final int TEXTO_MAX = 500;
    public static final int TOKEN_DIAS = 90;
    public static final int FILA_MAX = 200;
    public static final int PERIODO_MAX_DIAS = 366;
    public static final int MOTIVO_MIN = 5;
    public static final int MOTIVO_MAX = 200;
    public static final int MODELO_MIN = 5;
    public static final int MODELO_MAX = 300;
    public static final String ANONIMO_ROTULO = "Anônimo";
    /** Uma só mensagem para qualquer erro de token (errado, vencido, já usado, agendamento que deixou de ser avaliável): não diz qual. */
    public static final String ERRO_AVALIACAO = "Este link de avaliação não é válido ou já foi usado.";
    public static final List<String> TIPOS_FILA = List.of("avaliacao", "aviso");
    private static final List<String> VARIAVEIS = List.of("nome", "link", "loja");
    private static final Pattern NOTA_TEXTO = Pattern.compile("^\\s*\\d{1,2}\\s*$");
    private static final Pattern VARIAVEL = Pattern.compile("\\{([^{}]*)\\}");
    private static final Pattern DIA = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    /** Resultado de uma validação: `erro` preenchido = recusou; senão os dados limpos. */
    public record Validada(String erro, int nota, String texto, boolean anonimo) {
        public boolean ok() {
            return erro == null;
        }
    }

    /** Nota inteira 1 a 5 (obrigatória), texto opcional até 500 (só texto), anonimato booleano. `corpo` é o JSON cru: nada é convertido às escondidas. */
    public static Validada validar(JsonNode corpo) {
        JsonNode d = corpo != null && corpo.isObject() ? corpo : null;
        JsonNode n = d == null ? null : d.get("nota");
        Integer nota = null;
        if (n != null && n.isIntegralNumber() && n.canConvertToInt()) nota = n.intValue();
        else if (n != null && n.isTextual() && NOTA_TEXTO.matcher(n.asText()).matches()) nota = Integer.parseInt(n.asText().trim());
        if (nota == null || nota < NOTA_MIN || nota > NOTA_MAX) return erro("Escolha uma nota de " + NOTA_MIN + " a " + NOTA_MAX + " estrelas.");
        String texto = "";
        JsonNode t = d.get("texto");
        if (t != null && !t.isNull()) {
            if (!t.isTextual()) return erro("Comentário inválido.");
            if (t.asText().length() > TEXTO_MAX) return erro("O comentário pode ter até " + TEXTO_MAX + " caracteres.");
            texto = Texto.limpar(t.asText());
        }
        JsonNode a = d.get("anonimo");
        if (a != null && !a.isNull() && !a.isBoolean()) return erro("Opção de anonimato inválida.");
        return new Validada(null, nota, texto, a != null && a.isBoolean() && a.booleanValue());
    }

    private static Validada erro(String msg) {
        return new Validada(msg, 0, "", false);
    }

    /** Motivo de ocultar/reexibir: 5 a 200 letras (devolve o texto limpo ou null). */
    public static String motivo(String m) {
        if (m == null || m.length() > MOTIVO_MAX) return null;
        String t = Texto.limpar(m);
        return t.length() >= MOTIVO_MIN && t.length() <= MOTIVO_MAX ? t : null;
    }

    public static final String ERRO_MOTIVO = "Explique o motivo (" + MOTIVO_MIN + " a " + MOTIVO_MAX + " letras).";

    /** Modelo da mensagem em lote: 5 a 300, só {nome}, {loja}, {link}; avaliação exige {link}, aviso o proíbe. Devolve o erro ou null (o texto limpo vem de {@link #modeloLimpo}). */
    public static String validarModelo(String modelo, String tipo) {
        if (modelo == null) return "Escreva o texto da mensagem.";
        String t = Texto.limpar(modelo);
        if (t.length() < MODELO_MIN || modelo.length() > MODELO_MAX) return "A mensagem deve ter de " + MODELO_MIN + " a " + MODELO_MAX + " caracteres.";
        boolean temLink = false;
        Matcher m = VARIAVEL.matcher(t);
        while (m.find()) {
            String v = m.group(1);
            if (!VARIAVEIS.contains(v)) return "Variável {" + (v.length() > 20 ? v.substring(0, 20) : v) + "} não existe. Use {nome}, {loja} e {link}.";
            if (v.equals("link")) temLink = true;
        }
        if ("avaliacao".equals(tipo) && !temLink) return "O pedido de avaliação precisa de {link} no texto.";
        if (!"avaliacao".equals(tipo) && temLink) return "O {link} só vale no pedido de avaliação.";
        return null;
    }

    public static String modeloLimpo(String modelo) {
        return Texto.limpar(modelo);
    }

    private static String primeiroNome(String n) {
        String t = (n == null ? "" : n).replaceAll("\\s+", " ").trim();
        String p = t.isEmpty() ? "" : t.split(" ")[0];
        return p.length() > 40 ? p.substring(0, 40) : p;
    }

    public static String aplicarModelo(String modelo, String nome, String loja, String link) {
        String pn = primeiroNome(nome);
        String lj = (loja == null ? "" : loja).replaceAll("\\s+", " ").trim();
        if (lj.length() > 60) lj = lj.substring(0, 60);
        return modelo.replace("{nome}", pn.isEmpty() ? "tudo bem" : pn).replace("{loja}", lj).replace("{link}", link == null ? "" : link);
    }

    public record Resumo(int total, Double media, int[] distribuicao) {
    }

    /** Média com 1 casa (null sem avaliações), total e distribuição 1 a 5 (índice 0 = 1 estrela). */
    public static Resumo resumir(List<Integer> notas) {
        int[] dist = new int[5];
        int soma = 0;
        for (int n : notas) {
            dist[n - 1]++;
            soma += n;
        }
        Double media = notas.isEmpty() ? null : Math.round(((double) soma / notas.size()) * 10) / 10.0;
        return new Resumo(notas.size(), media, dist);
    }

    /** Período 'AAAA-MM-DD' (dias inclusive). Erro como texto; sem datas = sem limite (ini e fim null). */
    public record Periodo(String erro, LocalDate de, LocalDate ate) {
        public boolean semLimite() {
            return erro == null && de == null;
        }
    }

    public static Periodo periodo(String de, String ate) {
        boolean temDe = de != null && !de.isEmpty();
        boolean temAte = ate != null && !ate.isEmpty();
        if (!temDe && !temAte) return new Periodo(null, null, null);
        LocalDate i = dia(de), f = dia(ate);
        if (i == null || f == null) return new Periodo("Informe o período com data inicial e final válidas.", null, null);
        if (f.isBefore(i)) return new Periodo("A data final não pode ser antes da inicial.", null, null);
        if (ChronoUnit.DAYS.between(i, f.plusDays(1)) > PERIODO_MAX_DIAS) return new Periodo("O período pode ter no máximo " + PERIODO_MAX_DIAS + " dias.", null, null);
        return new Periodo(null, i, f);
    }

    private static LocalDate dia(String v) {
        if (v == null || !DIA.matcher(v).matches()) return null;
        try {
            return LocalDate.parse(v);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Número no formato do wa.me (55 + DDD + número) ou "" quando não é telefone brasileiro de WhatsApp (mesma regra de `numeroWhatsapp`). */
    public static String numeroWhatsapp(String telefone) {
        String d = telefone == null ? "" : telefone.replaceAll("\\D", "");
        String nac = d.length() >= 12 && d.startsWith("55") ? d.substring(2) : d;
        return nac.matches("^[1-9][0-9][2-9][0-9]{7,8}$") && (nac.length() == 10 || nac.charAt(2) == '9') ? "55" + nac : "";
    }

    public static String telefoneMascarado(String tel) {
        String d = tel == null ? "" : tel.replaceAll("\\D", "");
        String nac = d.length() >= 12 && d.startsWith("55") ? d.substring(2) : d;
        return nac.length() >= 10 ? "(" + nac.substring(0, 2) + ") •••••-" + nac.substring(nac.length() - 4) : "";
    }
}
