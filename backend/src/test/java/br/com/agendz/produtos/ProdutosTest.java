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
        jdbc.update("delete from movimento_estoque");
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

    private String movimentar(String host, String token, String id, String corpo, String chave) throws Exception {
        var req = post("/api/produtos/" + id + "/movimentos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo);
        if (chave != null) req = req.header("Idempotency-Key", chave);
        return mvc.perform(req).andReturn().getResponse().getContentAsString();
    }

    @Test
    void entradaSaidaEContagemMudamOSaldoEGravamOHistorico() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, POMADA); // estoque 12
        mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"tipo\":\"entrada\",\"qtd\":8}")).andExpect(status().isCreated()).andExpect(jsonPath("$.saldo").value(20.0)).andExpect(jsonPath("$.delta").value(8.0));
        mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"tipo\":\"saida\",\"qtd\":5,\"obs\":\"Quebrou na caixa\"}")).andExpect(status().isCreated()).andExpect(jsonPath("$.saldo").value(15.0)).andExpect(jsonPath("$.delta").value(-5.0));
        mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"tipo\":\"ajuste\",\"qtd\":10,\"obs\":\"Contagem do mês\"}")).andExpect(status().isCreated()).andExpect(jsonPath("$.saldo").value(10.0)).andExpect(jsonPath("$.delta").value(-5.0));
        mvc.perform(get("/api/produtos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$.estoque").value(10.0));
        mvc.perform(get("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[0].tipo").value("ajuste")).andExpect(jsonPath("$[0].autor").value("Alan"));
    }

    @Test
    void movimentoInvalidoNaoMudaOEstoque() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, POMADA);
        String[][] casos = {
            {"{\"tipo\":\"saida\",\"qtd\":13,\"obs\":\"Venda por fora\"}", "Estoque insuficiente: há 12 em estoque."},
            {"{\"tipo\":\"saida\",\"qtd\":1}", "Informe o motivo (pelo menos 3 letras)."},
            {"{\"tipo\":\"entrada\",\"qtd\":0}", "Informe uma quantidade válida."},
            {"{\"tipo\":\"entrada\",\"qtd\":-3}", "Informe uma quantidade válida."},
            {"{\"tipo\":\"roubo\",\"qtd\":1}", "Escolha entrada, saída ou contagem."},
            {"{\"tipo\":\"ajuste\",\"qtd\":12,\"obs\":\"Contei igual\"}", "O estoque já está com essa quantidade."},
        };
        for (String[] c : casos) {
            mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content(c[0]))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value(c[1]));
        }
        mvc.perform(get("/api/produtos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$.estoque").value(12.0));
        mvc.perform(get("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void chaveDeRepeticaoNaoSomaDuasVezes() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, POMADA);
        String corpo = "{\"tipo\":\"entrada\",\"qtd\":4}";
        String a = movimentar(DALFORNO, t, id, corpo, "chave-estoque-0000001");
        String b = movimentar(DALFORNO, t, id, corpo, "chave-estoque-0000001");
        assertEquals(a, b);
        mvc.perform(get("/api/produtos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$.estoque").value(16.0));
        mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).header("Idempotency-Key", "chave-estoque-0000001")
                .contentType(MediaType.APPLICATION_JSON).content("{\"tipo\":\"entrada\",\"qtd\":9}")).andExpect(status().isConflict());
    }

    @Test
    void permissaoEIsolamentoDosMovimentos() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        String id = criar(APEX, dono, POMADA);
        String corpo = "{\"tipo\":\"entrada\",\"qtd\":1}";
        mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof)).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isForbidden());
        mvc.perform(get("/api/produtos/" + id + "/movimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isForbidden());
        // produto de outra loja = 404, nunca dado
        String outro = token(DALFORNO, "alan");
        mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(outro)).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isNotFound());
        mvc.perform(get("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(outro))).andExpect(status().isNotFound());
    }

    private String movimento(String host, String token, String id, String corpo, int esperado) throws Exception {
        return mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().is(esperado)).andReturn().getResponse().getContentAsString();
    }

    @Test
    void entradaSaidaEContagemMudamOSaldoEFicamNoHistorico() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, POMADA); // estoque 12
        movimento(DALFORNO, t, id, "{\"tipo\":\"entrada\",\"qtd\":5}", 201);
        movimento(DALFORNO, t, id, "{\"tipo\":\"saida\",\"qtd\":2,\"obs\":\"Uso no salão\"}", 201);
        movimento(DALFORNO, t, id, "{\"tipo\":\"ajuste\",\"qtd\":10,\"obs\":\"Contagem\"}", 201);
        mvc.perform(get("/api/produtos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$.estoque").value(10.0));
        mvc.perform(get("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[0].tipo").value("ajuste")).andExpect(jsonPath("$[0].delta").value(-5.0))
                .andExpect(jsonPath("$[0].saldo").value(10.0)).andExpect(jsonPath("$[0].autor").value("Alan")).andExpect(jsonPath("$[2].tipo").value("entrada"));
    }

    @Test
    void movimentoInvalidoERecusadoEOSaldoNaoMuda() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, POMADA); // 12
        for (String ruim : new String[]{"{\"tipo\":\"roubo\",\"qtd\":1}", "{\"tipo\":\"entrada\",\"qtd\":0}", "{\"tipo\":\"entrada\",\"qtd\":-3}", "{\"tipo\":\"entrada\"}",
                "{\"tipo\":\"saida\",\"qtd\":1}", "{\"tipo\":\"ajuste\",\"qtd\":12,\"obs\":\"Contagem\"}"}) {
            movimento(DALFORNO, t, id, ruim, 400);
        }
        String r = movimento(DALFORNO, t, id, "{\"tipo\":\"saida\",\"qtd\":13,\"obs\":\"Perda\"}", 400);
        org.junit.jupiter.api.Assertions.assertTrue(r.contains("Estoque insuficiente"), r);
        mvc.perform(get("/api/produtos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$.estoque").value(12.0));
        mvc.perform(get("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void movimentoSoComPermissaoDeEstoqueEDeOutraLojaDa404() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        String id = criar(APEX, dono, POMADA);
        movimento(APEX, prof, id, "{\"tipo\":\"entrada\",\"qtd\":1}", 403);
        mvc.perform(get("/api/produtos/" + id + "/movimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isForbidden());
        movimento(DALFORNO, token(DALFORNO, "alan"), id, "{\"tipo\":\"entrada\",\"qtd\":1}", 404);
    }

    @Test
    void mesmaChaveDeRepeticaoNaoSomaDuasVezes() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, POMADA);
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/produtos/" + id + "/movimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).header("Idempotency-Key", "estoque-chave-0001-abcdef")
                    .contentType(MediaType.APPLICATION_JSON).content("{\"tipo\":\"entrada\",\"qtd\":4}")).andExpect(status().isCreated());
        }
        mvc.perform(get("/api/produtos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$.estoque").value(16.0));
    }
}
