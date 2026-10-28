package br.com.agendz.clientes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.agendz.BaseApi;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Equivalência simulada × real: os MESMOS casos de src/../tests/clientes-equivalencia.test.mjs (arquivo equivalencia/clientes.json) rodam no servidor.
 * Cada caso começa sem clientes na loja da estética (Apex); só o último passo é conferido.
 */
class ClientesEquivalenciaTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void osMesmosCasosDaApiSimuladaDaoOMesmoResultadoNoServidor() throws Exception {
        JsonNode raiz;
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/clientes.json")) {
            raiz = new ObjectMapper().readTree(in);
        }
        String davi = token(APEX, "davi");
        JsonNode casos = raiz.get("casos");
        assertTrue(casos.size() >= 25, "fixture carregada");
        StringBuilder falhas = new StringBuilder();
        for (JsonNode caso : casos) {
            jdbc.update("delete from cliente");
            JsonNode passos = caso.get("passos");
            MvcResult ultimo = null;
            for (int i = 0; i < passos.size(); i++) {
                ultimo = mvc.perform(post("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                        .contentType(MediaType.APPLICATION_JSON).content(passos.get(i).toString())).andReturn();
                if (i < passos.size() - 1 && ultimo.getResponse().getStatus() != 201) {
                    falhas.append("\n- ").append(caso.get("nome").asText()).append(": passo anterior falhou: ").append(ultimo.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
                }
            }
            JsonNode esperado = caso.get("esperado");
            int status = ultimo.getResponse().getStatus();
            String corpo = ultimo.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
            if (esperado.get("ok").asBoolean()) {
                if (status != 201) falhas.append("\n- ").append(caso.get("nome").asText()).append(": esperava criar e veio ").append(status).append(" ").append(corpo);
            } else {
                String msg = esperado.get("erro").asText();
                if (status < 400 || status >= 500 || !corpo.contains("\"mensagem\":" + new ObjectMapper().writeValueAsString(msg))) {
                    falhas.append("\n- ").append(caso.get("nome").asText()).append(": esperava recusar com \"").append(msg).append("\" e veio ").append(status).append(" ").append(corpo);
                }
            }
        }
        jdbc.update("delete from cliente");
        assertEquals("", falhas.toString(), "casos que divergem da API simulada");
    }
}
