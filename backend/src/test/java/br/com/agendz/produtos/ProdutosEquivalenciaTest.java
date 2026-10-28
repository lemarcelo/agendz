package br.com.agendz.produtos;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import br.com.agendz.BaseApi;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Equivalência simulada × real: os MESMOS casos de tests/produtos-equivalencia.test.mjs (arquivo equivalencia/produtos.json) rodam no servidor,
 * na loja da estética (Apex). Cada caso começa sem produtos; só o último passo é conferido. "@n" = id do produto criado no passo n.
 */
class ProdutosEquivalenciaTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    private final ObjectMapper om = new ObjectMapper();

    private static String id(String resposta, ObjectMapper om) throws Exception {
        JsonNode n = om.readTree(resposta);
        return n.hasNonNull("id") ? n.get("id").asText() : null;
    }

    @Test
    void osMesmosCasosDaApiSimuladaDaoOMesmoResultadoNoServidor() throws Exception {
        JsonNode raiz;
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/produtos.json")) {
            raiz = om.readTree(in);
        }
        String davi = token(APEX, "davi");
        JsonNode casos = raiz.get("casos");
        assertTrue(casos.size() >= 20, "fixture carregada");
        StringBuilder falhas = new StringBuilder();
        for (JsonNode caso : casos) {
            String nome = caso.get("nome").asText();
            jdbc.update("delete from material");
            List<String> ids = new ArrayList<>();
            JsonNode passos = caso.get("passos");
            MvcResult ultimo = null;
            for (int i = 0; i < passos.size(); i++) {
                JsonNode passo = passos.get(i);
                var req = passo.has("editar")
                        ? put("/api/produtos/" + ids.get(Integer.parseInt(passo.get("editar").asText().substring(1)) - 1))
                        : post("/api/produtos");
                ultimo = mvc.perform(req.with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                        .contentType(MediaType.APPLICATION_JSON).content(passo.get("corpo").toString())).andReturn();
                String resp = ultimo.getResponse().getContentAsString(StandardCharsets.UTF_8);
                int st = ultimo.getResponse().getStatus();
                ids.add(st < 300 ? id(resp, om) : null);
                if (i < passos.size() - 1 && st >= 300) {
                    falhas.append("\n- ").append(nome).append(": passo anterior falhou: ").append(resp);
                }
            }
            JsonNode esperado = caso.get("esperado");
            int status = ultimo.getResponse().getStatus();
            String corpo = ultimo.getResponse().getContentAsString(StandardCharsets.UTF_8);
            if (esperado.get("ok").asBoolean()) {
                if (status >= 300) falhas.append("\n- ").append(nome).append(": esperava salvar e veio ").append(status).append(" ").append(corpo);
                if (esperado.path("codigosSeguidos").asBoolean()) {
                    String a = jdbc.queryForObject("select codigo from material where id = ?::uuid", String.class, ids.get(0));
                    String b = jdbc.queryForObject("select codigo from material where id = ?::uuid", String.class, ids.get(1));
                    if (Integer.parseInt(b) != Integer.parseInt(a) + 1) falhas.append("\n- ").append(nome).append(": códigos ").append(a).append(" e ").append(b);
                }
            } else {
                String msg = esperado.get("erro").asText();
                if (status < 400 || status >= 500 || !corpo.contains("\"mensagem\":" + om.writeValueAsString(msg))) {
                    falhas.append("\n- ").append(nome).append(": esperava recusar com \"").append(msg).append("\" e veio ").append(status).append(" ").append(corpo);
                }
            }
        }
        jdbc.update("delete from material");
        assertEquals("", falhas.toString(), "casos que divergem da API simulada");
    }
}
