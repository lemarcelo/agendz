package br.com.agendz.produtos;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** Produtos e comissão geral: permissão (só o dono escreve e define comissão), DTO do vendedor sem comissão/custo, e isolamento entre lojas. */
class ProdutosTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void limpar() {
        jdbc.update("delete from material");
        jdbc.update("delete from configuracao_loja");
    }

    private String criar(String hostDaLoja, String token, String corpo) throws Exception {
        String json = mvc.perform(post("/api/produtos").with(host(hostDaLoja)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private static final String POMADA = "{\"nome\":\"Pomada\",\"preco\":45,\"comissaoPct\":10,\"custo\":22,\"minimo\":3,\"estoque\":12}";

    @Test
    void donoCriaComComissaoECustoEVeTudo() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, POMADA);
        mvc.perform(get("/api/produtos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.codigo").value("1")).andExpect(jsonPath("$.comissaoPct").value(10.0))
                .andExpect(jsonPath("$.custo").value(22.0)).andExpect(jsonPath("$.estoque").value(12.0)).andExpect(jsonPath("$.ativo").value(true));
    }

    @Test
    void profissionalVeOProdutoSemComissaoNemCustoMasNaoEscreve() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        String id = criar(APEX, dono, POMADA);
        mvc.perform(get("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Pomada"))
                .andExpect(jsonPath("$[0].comissaoPct").doesNotExist()).andExpect(jsonPath("$[0].custo").doesNotExist()).andExpect(jsonPath("$[0].minimo").doesNotExist());
        mvc.perform(post("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))
                .contentType(MediaType.APPLICATION_JSON).content(POMADA)).andExpect(status().isForbidden());
        mvc.perform(put("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))
                .contentType(MediaType.APPLICATION_JSON).content(POMADA)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isForbidden());
    }

    @Test
    void produtoDesativadoSomeParaQuemSoVende() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        String id = criar(APEX, dono, POMADA);
        mvc.perform(put("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Pomada\",\"preco\":45,\"ativo\":false}")).andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(false));
        mvc.perform(get("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isNotFound());
        mvc.perform(get("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void editarNaoMudaOEstoqueEApagarSemUsoRemoveDeVez() throws Exception {
        String t = token(APEX, "davi");
        String id = criar(APEX, t, POMADA);
        mvc.perform(put("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t))
                .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Pomada\",\"preco\":50,\"estoque\":999}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.preco").value(50.0)).andExpect(jsonPath("$.estoque").value(12.0));
        mvc.perform(delete("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(status().isNoContent());
        mvc.perform(get("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(status().isNotFound());
    }

    @Test
    void comissaoDoProdutoSoOProprietarioDefine() throws Exception {
        String dono = token(APEX, "davi");
        String id = criar(APEX, dono, POMADA);
        jdbc.update("update usuario set permissoes = '{\"estoque\": true}'::jsonb where identificador = 'pablo'");   // o dono liberou o estoque para o profissional
        try {
            String pablo = token(APEX, "pablo");
            // ele passa a poder editar o produto, mas a comissão continua a que o dono definiu (10)
            mvc.perform(put("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Pomada\",\"preco\":46,\"comissaoPct\":90}")).andExpect(status().isOk());
            assertEquals("10.00", jdbc.queryForObject("select comissao_pct::text from material where id = ?::uuid", String.class, id), "quem não é dono não muda a comissão");
            assertEquals("46.00", jdbc.queryForObject("select preco::text from material where id = ?::uuid", String.class, id));
            // e ao criar, o produto de quem não é dono nasce sem comissão
            String novo = criar(APEX, pablo, "{\"nome\":\"Cera\",\"preco\":30,\"comissaoPct\":50}");
            assertNull(jdbc.queryForObject("select comissao_pct::text from material where id = ?::uuid", String.class, novo));
        } finally {
            jdbc.update("update usuario set permissoes = '{}'::jsonb where identificador = 'pablo'");
        }
    }

    @Test
    void produtoDeUmaLojaNaoApareceNaOutra() throws Exception {
        String alan = token(DALFORNO, "alan"), davi = token(APEX, "davi");
        String id = criar(DALFORNO, alan, POMADA);
        mvc.perform(get("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/produtos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isNotFound());
        // o mesmo nome e o mesmo código podem existir nas duas lojas
        criar(APEX, davi, POMADA);
    }

    @Test
    void semTokenDa401() throws Exception {
        mvc.perform(get("/api/produtos").with(host(APEX))).andExpect(status().isUnauthorized());
    }

    @Test
    void comissaoGeralComecaEm50SoODonoMudaEValida() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        mvc.perform(get("/api/estabelecimento/comissao").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.comissaoPadrao").value(50.0));
        mvc.perform(put("/api/estabelecimento/comissao").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .contentType(MediaType.APPLICATION_JSON).content("{\"comissaoPadrao\":35.5}")).andExpect(status().isOk()).andExpect(jsonPath("$.comissaoPadrao").value(35.5));
        mvc.perform(get("/api/estabelecimento/comissao").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(jsonPath("$.comissaoPadrao").value(35.5));
        // cada loja tem a sua
        mvc.perform(get("/api/estabelecimento/comissao").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(token(DALFORNO, "alan")))).andExpect(jsonPath("$.comissaoPadrao").value(50.0));
        for (String ruim : new String[]{"{\"comissaoPadrao\":101}", "{\"comissaoPadrao\":-1}", "{}"}) {
            mvc.perform(put("/api/estabelecimento/comissao").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                    .contentType(MediaType.APPLICATION_JSON).content(ruim)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.mensagem").value("A comissão padrão vai de 0 a 100%."));
        }
        mvc.perform(get("/api/estabelecimento/comissao").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isForbidden());
        mvc.perform(put("/api/estabelecimento/comissao").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))
                .contentType(MediaType.APPLICATION_JSON).content("{\"comissaoPadrao\":99}")).andExpect(status().isForbidden());
    }
}
