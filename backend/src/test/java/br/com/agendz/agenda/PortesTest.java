package br.com.agendz.agenda;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.containsString;
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
import org.springframework.test.web.servlet.ResultActions;

/** Portes de veículo cadastráveis (v122): lista da loja, o Médio fica, porte usado só desativa, serviço sem valor num porte novo usa o do Médio. */
class PortesTest extends BaseApi {

    private static final String FABRICA = "{\"id\":\"pequeno\",\"nome\":\"Pequeno\"},{\"id\":\"medio\",\"nome\":\"Médio\"},{\"id\":\"grande\",\"nome\":\"Grande\"},{\"id\":\"suv\",\"nome\":\"SUV\"},{\"id\":\"pickup\",\"nome\":\"Pickup\"}";
    private static final String PRECOS = "\"precos\":{\"pequeno\":50,\"medio\":70,\"grande\":90,\"suv\":100,\"pickup\":110},\"duracoes\":{\"pequeno\":40,\"medio\":60,\"grande\":80,\"suv\":90,\"pickup\":100}";

    @Autowired
    JdbcTemplate jdbc;

    String davi;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
        jdbc.update("update configuracao_loja set portes = null");
    }

    private ResultActions listar() throws Exception {
        return mvc.perform(get("/api/estabelecimento/portes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)));
    }

    private ResultActions gravar(String lista) throws Exception {
        return mvc.perform(put("/api/estabelecimento/portes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"portes\":[" + lista + "]}"));
    }

    private static String idDe(String json, String nome) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\",\"nome\":\"" + nome + "\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem porte " + nome + ": " + json);
        return m.group(1);
    }

    @Test
    void semCadastroValemOsCincoDeFabrica() throws Exception {
        listar().andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(5))).andExpect(jsonPath("$[1].id").value("medio")).andExpect(jsonPath("$[1].ativo").value(true));
    }

    @Test
    void oDonoCadastraUmPorteNovoComIdGeradoEMudaOrdemENome() throws Exception {
        String r = gravar("{\"id\":\"medio\",\"nome\":\"Compacto\"},{\"nome\":\"Van\",\"exemplo\":\"Ex.: Sprinter\"},{\"id\":\"suv\",\"nome\":\"SUV\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[0].nome").value("Compacto")).andExpect(jsonPath("$[1].exemplo").value("Ex.: Sprinter"))
                .andReturn().getResponse().getContentAsString();
        String van = idDe(r, "Van");
        org.junit.jupiter.api.Assertions.assertTrue(van.matches("^[a-z0-9-]{2,24}$"));
        listar().andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[1].id").value(van));
    }

    @Test
    void medioNaoSaiNaoDesativaENomeNaoRepete() throws Exception {
        gravar("{\"id\":\"pequeno\",\"nome\":\"Pequeno\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem", containsString("padrão")));
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\",\"ativo\":false}").andExpect(status().isBadRequest());
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\"},{\"nome\":\"médio\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem", containsString("duas vezes")));
        gravar("{\"id\":\"medio\",\"nome\":\"M\"}").andExpect(status().isBadRequest());
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\"},{\"id\":\"MAIUSCULO!\",\"nome\":\"X1\"}").andExpect(status().isBadRequest());
        mvc.perform(put("/api/estabelecimento/portes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"portes\":[]}")).andExpect(status().isBadRequest());
    }

    @Test
    void servicoSemValorNoPorteNovoUsaOFatorEPorteDesconhecidoNaTabelaEhRecusado() throws Exception {
        String r = gravar(FABRICA + ",{\"nome\":\"Van\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String van = idDe(r, "Van");
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\"," + PRECOS + ",\"intervaloMin\":0}")).andExpect(status().isCreated());
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem Van\",\"precos\":{\"pequeno\":50,\"medio\":70,\"grande\":90,\"suv\":100,\"pickup\":110,\"" + van + "\":150},\"duracoes\":{\"pequeno\":40,\"medio\":60,\"grande\":80,\"suv\":90,\"pickup\":100,\"" + van + "\":120},\"intervaloMin\":0}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.precos." + van).value(150));
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Outra\",\"precos\":{\"pequeno\":50,\"medio\":70,\"grande\":90,\"suv\":100,\"pickup\":110,\"fantasma\":1},\"duracoes\":{\"pequeno\":40,\"medio\":60,\"grande\":80,\"suv\":90,\"pickup\":100},\"intervaloMin\":0}"))
                .andExpect(status().isBadRequest());
        // v124: só o Médio é obrigatório; os outros portes saem do fator, e o preço específico vale no lugar dele
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Sem pickup\",\"precos\":{\"pequeno\":50,\"medio\":70,\"grande\":90,\"suv\":100},\"duracoes\":{\"medio\":60},\"intervaloMin\":0}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Sem medio\",\"precos\":{\"pequeno\":50},\"duracoes\":{\"medio\":60},\"intervaloMin\":0}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem", containsString("Médio")));
    }

    @Test
    void porteUsadoPorVeiculoDeClienteSoDesativa() throws Exception {
        String r = gravar(FABRICA + ",{\"nome\":\"Van\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String van = idDe(r, "Van");
        mvc.perform(post("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Rita\",\"telefone\":\"(53) 99900-7001\",\"veiculos\":[{\"placa\":\"VAN1A23\",\"modelo\":\"Sprinter\",\"porte\":\"" + van + "\"}]}")).andExpect(status().isCreated());
        gravar(FABRICA).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem", containsString("desative")));
        gravar(FABRICA + ",{\"id\":\"" + van + "\",\"nome\":\"Van\",\"ativo\":false}").andExpect(status().isOk());
        listar().andExpect(jsonPath("$[5].ativo").value(false));
    }

    @Test
    void fatorDeFabricaMedioFixoEmUmEFaixaDeUmDecimoADez() throws Exception {
        listar().andExpect(jsonPath("$[0].fator").value(0.9)).andExpect(jsonPath("$[1].fator").value(1.0)).andExpect(jsonPath("$[2].fator").value(1.2))
                .andExpect(jsonPath("$[3].fator").value(1.3)).andExpect(jsonPath("$[4].fator").value(1.4));
        // Médio sempre 1, mesmo se vier outro valor; porte novo sem fator vale 1; duas casas
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\",\"fator\":3},{\"nome\":\"Van\"},{\"id\":\"suv\",\"nome\":\"SUV\",\"fator\":1.255}")
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].fator").value(1.0)).andExpect(jsonPath("$[1].fator").value(1.0)).andExpect(jsonPath("$[2].fator").value(1.26));
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\"},{\"nome\":\"Van\",\"fator\":0.09}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem", containsString("0,10 a 10")));
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\"},{\"nome\":\"Van\",\"fator\":10.01}").andExpect(status().isBadRequest());
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\"},{\"nome\":\"Van\",\"fator\":0.1}").andExpect(status().isOk());
        gravar("{\"id\":\"medio\",\"nome\":\"Médio\"},{\"nome\":\"Van\",\"fator\":10}").andExpect(status().isOk());
    }

    @Test
    void gravacaoAntigaSemFatorCaiNoDeFabricaDoId() throws Exception {
        jdbc.update("update configuracao_loja set portes = cast(? as jsonb)",
                "[{\"id\":\"pequeno\",\"nome\":\"Pequeno\",\"exemplo\":\"\",\"ativo\":true},{\"id\":\"medio\",\"nome\":\"Médio\",\"exemplo\":\"\",\"ativo\":true},{\"id\":\"pt9\",\"nome\":\"Van\",\"exemplo\":\"\",\"ativo\":true}]");
        listar().andExpect(jsonPath("$[0].fator").value(0.9)).andExpect(jsonPath("$[1].fator").value(1.0)).andExpect(jsonPath("$[2].fator").value(1.0));
    }

    @Test
    void precoDoPorteSaiDoFatorEOEspecificoVale() throws Exception {
        gravar(FABRICA).andExpect(status().isOk());
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Cera\",\"preco\":100,\"duracaoMin\":60,\"intervaloMin\":0}")).andExpect(status().isCreated()).andExpect(jsonPath("$.precos.medio").value(100));
        mvc.perform(get("/api/servicos?para=atender").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk());
        org.junit.jupiter.api.Assertions.assertEquals(new java.math.BigDecimal("120.00"),
                br.com.agendz.configuracao.PorteController.precoNoPorte(new java.math.BigDecimal("100"), null,
                        java.util.List.of(new br.com.agendz.configuracao.PorteController.Porte("grande", "Grande", "", true, new java.math.BigDecimal("1.20"))), "grande"));
        org.junit.jupiter.api.Assertions.assertEquals(new java.math.BigDecimal("77.00"),
                br.com.agendz.configuracao.PorteController.precoNoPorte(new java.math.BigDecimal("100"), new java.math.BigDecimal("77"),
                        java.util.List.of(new br.com.agendz.configuracao.PorteController.Porte("grande", "Grande", "", true, new java.math.BigDecimal("1.20"))), "grande"));
    }

    @Test
    void quemNaoEhDonoNaoGrava() throws Exception {
        String pablo = token(APEX, "pablo");
        mvc.perform(put("/api/estabelecimento/portes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)).contentType(MediaType.APPLICATION_JSON).content("{\"portes\":[" + FABRICA + "]}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/estabelecimento/portes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isOk());
    }
}
