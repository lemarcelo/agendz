package br.com.agendz.seguranca;

import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Permissão por seção (espelho de `pode()` em src/domain/rules.js). O proprietário pode tudo; os outros perfis começam com o padrão do perfil e a escolha
 * explícita do proprietário (true/false, em `usuario.permissoes`) vale por cima. Relatórios não é liberável. Usada nas rotas com
 * `@PreAuthorize("... and @perm.pode(authentication, 'clientes')")`. Lê o banco a cada chamada, então liberar ou bloquear vale na hora, e quem foi
 * desativado perde o acesso mesmo com o token ainda válido.
 */
@Component("perm")
public class Permissoes {

    /** Seções que o proprietário libera ou bloqueia para qualquer usuário. `planos` (v111) não faz parte do padrão de nenhum perfil: só o dono libera por pessoa. */
    public static final List<String> LIBERAVEIS = List.of("clientes", "servicos", "estabelecimento", "agenda", "estoque", "financeiro", "planos");
    private static final Map<String, Set<String>> PADRAO = Map.of(
            "profissional", Set.of("agenda", "clientes"),
            "atendente", Set.of("agenda", "clientes", "servicos"),
            "admin", Set.of());
    private static final TypeReference<Map<String, Boolean>> MAPA = new TypeReference<>() {
    };

    private final LojaJdbc banco;
    private final ObjectMapper json;

    public Permissoes(LojaJdbc banco, ObjectMapper json) {
        this.banco = banco;
        this.json = json;
    }

    /** Regra pura: dono sempre; os demais pela escolha explícita ou, na falta dela, pelo padrão do perfil. */
    public static boolean pode(String papel, Map<String, Boolean> escolhas, String secao) {
        if ("dono".equals(papel)) return true;
        if (!LIBERAVEIS.contains(secao)) return false;
        Boolean escolha = escolhas == null ? null : escolhas.get(secao);
        if (escolha != null) return escolha;
        return PADRAO.getOrDefault(papel, Set.of()).contains(secao);
    }

    /** Só guarda a escolha explícita (true/false) das seções liberáveis; o resto é descartado. */
    public static Map<String, Boolean> limpar(Map<String, Boolean> bruto) {
        Map<String, Boolean> saida = new HashMap<>();
        if (bruto != null) for (String k : LIBERAVEIS) if (bruto.get(k) != null) saida.put(k, bruto.get(k));
        return saida;
    }

    public static boolean ehGestor(String papel) {
        return "admin".equals(papel) || "atendente".equals(papel);
    }

    /** Quem vê a agenda de todos: o proprietário e a recepção (o profissional vê só a própria). */
    public static boolean veTudo(String papel) {
        return "dono".equals(papel) || ehGestor(papel);
    }

    public boolean pode(Authentication auth, String secao) {
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt)) return false;
        String papel = jwt.getClaimAsString("papel");
        if (papel == null) return false;
        UUID id;
        try {
            id = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException e) {
            return false;
        }
        List<String> linha = banco.naLoja(jdbc -> jdbc.query("select permissoes::text from usuario where id = ? and ativo", (rs, i) -> rs.getString(1), id));
        if (linha.isEmpty()) return false; // sumiu ou foi desativado
        try {
            return pode(papel, json.readValue(linha.get(0), MAPA), secao);
        } catch (JsonProcessingException e) {
            return false;
        }
    }
}
