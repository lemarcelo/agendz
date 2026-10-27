package br.apex;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.IntegrationTestBase;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Espelha tests/ordem.test.mjs: a ordem de menus, abas, colunas e marcadores é preferência do próprio usuário e nunca é confiada. */
class PreferenciasIT extends IntegrationTestBase {

    @Test @DisplayName("cada usuário grava e lê só a própria ordem; a rota nunca recebe o id de outro usuário")
    void cadaUmNaSuaOrdem() throws Exception {
        String davi = token("davi"), pablo = token("pablo");
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("ordem", Map.of("nav", List.of("clientes", "agenda")))).andExpect(status().isNoContent());
        chamar(HttpMethod.GET, "/usuarios/me/preferencias", davi, null).andExpect(jsonPath("$.ordem.nav[0]").value("clientes"));
        chamar(HttpMethod.GET, "/usuarios/me/preferencias", pablo, null).andExpect(jsonPath("$.ordem.nav").doesNotExist());
        chamar(HttpMethod.GET, "/usuarios/u-davi/preferencias", pablo, null).andExpect(status().isNotFound());
    }

    @Test @DisplayName("lista com repetição, com tipo errado, grande demais ou com texto longo é recusada; chave desconhecida também")
    void ordemMalFormadaERecusada() throws Exception {
        String davi = token("davi");
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("ordem", Map.of("nav", List.of("a", "a")))).andExpect(status().isBadRequest());
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("ordem", Map.of("nav", List.of(1, 2)))).andExpect(status().isBadRequest());
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("ordem", Map.of("nav", IntStream.range(0, 41).mapToObj(i -> "i" + i).toList()))).andExpect(status().isBadRequest());
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("ordem", Map.of("nav", List.of("x".repeat(61))))).andExpect(status().isBadRequest());
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("ordem", Map.of("nav", List.of("<script>")))).andExpect(status().isBadRequest());
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("papel", "dono")).andExpect(status().isBadRequest());
    }

    @Test @DisplayName("restaurar apaga só as ordens do próprio usuário")
    void restaurarApagaSoAsMinhas() throws Exception {
        String davi = token("davi"), pablo = token("pablo");
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", davi, Map.of("ordem", Map.of("nav", List.of("clientes")))).andExpect(status().isNoContent());
        chamar(HttpMethod.PUT, "/usuarios/me/preferencias", pablo, Map.of("ordem", Map.of("nav", List.of("escala")))).andExpect(status().isNoContent());
        chamar(HttpMethod.DELETE, "/usuarios/me/preferencias/ordem", davi, null).andExpect(status().isNoContent());
        chamar(HttpMethod.GET, "/usuarios/me/preferencias", davi, null).andExpect(jsonPath("$.ordem.nav").doesNotExist());
        chamar(HttpMethod.GET, "/usuarios/me/preferencias", pablo, null).andExpect(jsonPath("$.ordem.nav[0]").value("escala"));
    }
}
