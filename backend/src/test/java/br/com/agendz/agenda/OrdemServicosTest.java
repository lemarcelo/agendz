package br.com.agendz.agenda;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/** Ordem dos serviços (v123): ordem manual do dono (setas), modo da loja (uso/manual) e rota de ordem só para quem tem a seção Serviços. */
class OrdemServicosTest extends BaseApi {

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
        jdbc.update("update configuracao_loja set ordem_servicos = 'uso'");
    }

    private String criar(String nome) throws Exception {
        String r = mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"" + nome + "\"," + PRECOS + ",\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(r, "$.id");
    }

    private ResultActions listar(String query) throws Exception {
        return mvc.perform(get("/api/servicos" + query).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)));
    }

    private ResultActions ordem(String token, String ids) throws Exception {
        return mvc.perform(put("/api/servicos/ordem").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[" + ids + "]}"));
    }

    @Test
    void servicoNovoVaiParaOFimEOsSetasTrocamDeLugar() throws Exception {
        String a = criar("Zebra"), b = criar("Abelha"), c = criar("Mosca");
        listar("").andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[0].id").value(a)).andExpect(jsonPath("$[2].id").value(c));
        ordem(davi, "\"" + c + "\",\"" + a + "\",\"" + b + "\"").andExpect(status().isNoContent());
        listar("").andExpect(jsonPath("$[0].id").value(c)).andExpect(jsonPath("$[1].id").value(a)).andExpect(jsonPath("$[2].id").value(b));
    }

    @Test
    void idsDesconhecidosERepetidosSaoIgnoradosEOsQueFaltamVaoDepois() throws Exception {
        String a = criar("Um"), b = criar("Dois"), c = criar("Tres");
        ordem(davi, "\"" + c + "\",\"" + c + "\",\"00000000-0000-0000-0000-000000000000\"").andExpect(status().isNoContent());
        listar("").andExpect(jsonPath("$[0].id").value(c)).andExpect(jsonPath("$[1].id").value(a)).andExpect(jsonPath("$[2].id").value(b));
        ordem(davi, "\"lixo\"").andExpect(status().is4xxClientError());
    }

    @Test
    void oModoDaLojaValeSoNaListaDoAtenderEOPadraoEUso() throws Exception {
        String a = criar("Primeiro"), b = criar("Segundo");
        mvc.perform(get("/api/estabelecimento/regras-atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(jsonPath("$.ordemServicos").value("uso"));
        // sem nenhum uso, os dois modos caem na ordem manual
        ordem(davi, "\"" + b + "\",\"" + a + "\"").andExpect(status().isNoContent());
        listar("?para=atender").andExpect(jsonPath("$[0].id").value(b));
        // a contagem de uso é derivada dos agendamentos (coberta no teste do domínio); aqui o modo "manual" é gravado e a regra inválida recusada
        mvc.perform(put("/api/estabelecimento/regras-atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"ordemServicos\":\"manual\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ordemServicos").value("manual"));
        listar("?para=atender").andExpect(jsonPath("$[0].id").value(b));
        mvc.perform(put("/api/estabelecimento/regras-atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"ordemServicos\":\"aleatorio\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void quemNaoTemASecaoServicosNaoMudaAOrdem() throws Exception {
        String a = criar("Um");
        ordem(token(APEX, "pablo"), "\"" + a + "\"").andExpect(status().isForbidden());
    }
}
