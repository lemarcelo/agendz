package br.com.agendz.equipe;

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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Equivalência simulada × real: os MESMOS casos de tests/equipe-equivalencia.test.mjs (arquivo equivalencia/equipe.json) rodam no servidor, na loja da
 * estética (Apex). Cada caso começa sem as pessoas de teste (apelido "Eq..."); só o último passo é conferido. "@n" = id da pessoa criada no passo n.
 */
class EquipeEquivalenciaTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    private final ObjectMapper om = new ObjectMapper();

    private void limpar() {
        jdbc.update("delete from usuario where lower(apelido) like 'eq%'");
    }

    @AfterEach
    void limparSempre() {
        limpar(); // mesmo se o teste quebrar no meio, não deixa CPF/apelido para os outros testes
    }

    @Test
    void osMesmosCasosDaApiSimuladaDaoOMesmoResultadoNoServidor() throws Exception {
        JsonNode raiz;
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/equipe.json")) {
            raiz = om.readTree(in);
        }
        String davi = token(APEX, "davi");
        JsonNode casos = raiz.get("casos");
        assertTrue(casos.size() >= 20, "fixture carregada");
        StringBuilder falhas = new StringBuilder();
        limpar();
        for (JsonNode caso : casos) {
            String nome = caso.get("nome").asText();
            limpar();
            List<String> ids = new ArrayList<>();
            JsonNode passos = caso.get("passos");
            MvcResult ultimo = null;
            for (int i = 0; i < passos.size(); i++) {
                JsonNode passo = passos.get(i);
                var req = passo.has("editar")
                        ? put("/api/usuarios/" + ids.get(Integer.parseInt(passo.get("editar").asText().substring(1)) - 1))
                        : post("/api/usuarios");
                ultimo = mvc.perform(req.with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                        .contentType(MediaType.APPLICATION_JSON).content(passo.get("corpo").toString())).andReturn();
                String resp = ultimo.getResponse().getContentAsString(StandardCharsets.UTF_8);
                int st = ultimo.getResponse().getStatus();
                String id = null;
                if (st < 300) {
                    JsonNode n = om.readTree(resp);
                    id = n.path("usuario").isObject() ? n.get("usuario").get("id").asText() : n.get("id").asText(); // criar devolve {usuario:{...}, senhaTemporaria}; alterar devolve a pessoa (cujo "usuario" é o login)
                }
                ids.add(id);
                if (i < passos.size() - 1 && st >= 300) falhas.append("\n- ").append(nome).append(": passo anterior falhou: ").append(resp);
            }
            JsonNode esperado = caso.get("esperado");
            int status = ultimo.getResponse().getStatus();
            String corpo = ultimo.getResponse().getContentAsString(StandardCharsets.UTF_8);
            if (esperado.get("ok").asBoolean()) {
                if (status >= 300) falhas.append("\n- ").append(nome).append(": esperava salvar e veio ").append(status).append(" ").append(corpo);
            } else {
                String msg = esperado.get("erro").asText();
                if (status < 400 || status >= 500 || !corpo.contains("\"mensagem\":" + om.writeValueAsString(msg))) {
                    falhas.append("\n- ").append(nome).append(": esperava recusar com \"").append(msg).append("\" e veio ").append(status).append(" ").append(corpo);
                }
            }
        }
        limpar();
        assertEquals("", falhas.toString(), "casos que divergem da API simulada");
    }
}
