package br.com.agendz.tenant;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Qual loja é esta requisição? A resposta vem SÓ do endereço (Host, caminho), nunca de campo escrito pelo cliente.
 * Espelho de src/domain/tenant.js (protótipo). Ordem: domínio próprio > subdomínio de um rótulo > /agendar/{slug} > ?loja= (só dev/demo).
 */
public final class TenantResolver {

    public static final Pattern SLUG = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$");
    public static final Set<String> RESERVADOS = Set.of(
            "www", "app", "api", "admin", "painel", "static", "assets", "mail", "agendar", "login", "suporte", "status");
    private static final Pattern CAMINHO = Pattern.compile("^/agendar/([^/?#]+)/?$");

    public record Resolucao(String slug, String via) {
        public static final Resolucao NENHUMA = new Resolucao(null, null);

        public boolean achou() {
            return slug != null;
        }
    }

    private final List<String> dominiosBase;
    private final boolean permitirQuery;

    public TenantResolver(List<String> dominiosBase, boolean permitirQuery) {
        this.dominiosBase = dominiosBase.stream().map(TenantResolver::limparHost).toList();
        this.permitirQuery = permitirQuery;
    }

    public static boolean slugValido(String s) {
        return s != null && SLUG.matcher(s).matches() && !RESERVADOS.contains(s);
    }

    /** Minúsculas, sem espaços, sem ponto final, sem porta. */
    public static String limparHost(String h) {
        String s = h == null ? "" : h.trim().toLowerCase(Locale.ROOT);
        s = s.replaceFirst(":\\d+$", "");
        return s.endsWith(".") ? s.substring(0, s.length() - 1) : s;
    }

    /**
     * @param host            nome do servidor (Host repassado pelo proxy)
     * @param caminho         caminho da requisição
     * @param lojaQuery       valor de ?loja= (ignorado a menos que permitirQuery)
     * @param slugDoDominio   consulta ao banco: domínio próprio VERIFICADO -> slug da loja
     */
    public Resolucao resolver(String host, String caminho, String lojaQuery, Function<String, Optional<String>> slugDoDominio) {
        String h = limparHost(host);
        if (!h.isEmpty()) {
            Optional<String> proprio = slugDoDominio.apply(h);
            if (proprio.isPresent()) return new Resolucao(proprio.get(), "dominio");
        }
        for (String base : dominiosBase) {
            if (h.endsWith("." + base)) {
                String sub = h.substring(0, h.length() - base.length() - 1); // exatamente um rótulo
                return slugValido(sub) ? new Resolucao(sub, "subdominio") : Resolucao.NENHUMA;
            }
        }
        Matcher m = CAMINHO.matcher(caminho == null ? "" : caminho);
        if (m.matches()) {
            String s = m.group(1).toLowerCase(Locale.ROOT);
            if (slugValido(s)) return new Resolucao(s, "caminho");
        }
        if (permitirQuery && lojaQuery != null) {
            String q = lojaQuery.toLowerCase(Locale.ROOT);
            if (slugValido(q)) return new Resolucao(q, "query");
        }
        return Resolucao.NENHUMA;
    }
}
