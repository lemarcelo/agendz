package br.com.agendz.servicos;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** Serviços: permissão (só o dono escreve), validação, código único por loja e isolamento entre lojas (Gate 3). */
class ServicosTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void limpar() {
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
    }

    private String criar(String hostDaLoja, String token, String corpo) throws Exception {
        String json = mvc.perform(post("/api/servicos").with(host(hostDaLoja)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private static String corpo(String nome, String preco) {
        return "{\"nome\":\"" + nome + "\",\"preco\":" + preco + ",\"duracaoMin\":45}";
    }

    @Test
    void donoCriaECodigoAutomaticoAvancaDeUmEmUm() throws Exception {
        String t = token(APEX, "davi");
        String a = criar(APEX, t, corpo("Lavagem", "80"));
        criar(APEX, t, corpo("Polimento", "250.50"));
        mvc.perform(get("/api/servicos/" + a).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.codigo").value("1")).andExpect(jsonPath("$.ativo").value(true));
        mvc.perform(get("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$[1].codigo").value("2")).andExpect(jsonPath("$[1].preco").value(250.50));
    }

    @Test
    void profissionalLeMasNaoEscreve() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        String id = criar(APEX, dono, corpo("Lavagem", "80"));
        mvc.perform(get("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))
                .contentType(MediaType.APPLICATION_JSON).content(corpo("Intruso", "1"))).andExpect(status().isForbidden());
        mvc.perform(put("/api/servicos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))
                .contentType(MediaType.APPLICATION_JSON).content(corpo("Mudou", "1"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/servicos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isForbidden());
    }

    @Test
    void servicoNuncaUsadoEApagadoDeVezEOProfissionalNaoVe() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        String id = criar(APEX, dono, corpo("Lavagem", "80"));
        mvc.perform(delete("/api/servicos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isNoContent());
        mvc.perform(get("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/servicos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isNotFound());
    }

    @Test
    void servicoDentroDeComboSoDesativaEFicaInvisivelParaOProfissional() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        String a = criar(APEX, dono, corpo("Lavagem", "80")), b = criar(APEX, dono, corpo("Cera", "60"));
        String combo = criar(APEX, dono, "{\"nome\":\"Lavagem + cera\",\"preco\":120,\"duracaoMin\":90,\"combo\":true,\"componentes\":[\"" + a + "\",\"" + b + "\"]}");
        mvc.perform(get("/api/servicos/" + combo).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andExpect(jsonPath("$.combo").value(true)).andExpect(jsonPath("$.componentes", hasSize(2))).andExpect(jsonPath("$.componentes[0]").value(a));
        mvc.perform(delete("/api/servicos/" + a).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.desativado").value(true));
        mvc.perform(get("/api/servicos/" + a).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(jsonPath("$.ativo").value(false));
        mvc.perform(get("/api/servicos/" + a).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isNotFound());
        // apagar o combo (nunca usado) leva os componentes junto e libera os serviços comuns para serem apagados
        mvc.perform(delete("/api/servicos/" + combo).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isNoContent());
        mvc.perform(delete("/api/servicos/" + b).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isNoContent());
    }

    @Test
    void comboNaoAceitaComboNemServicoDeOutraLoja() throws Exception {
        String tA = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        String a = criar(APEX, tA, corpo("A", "10")), b = criar(APEX, tA, corpo("B", "10"));
        String combo = criar(APEX, tA, "{\"nome\":\"AB\",\"preco\":15,\"duracaoMin\":60,\"combo\":true,\"componentes\":[\"" + a + "\",\"" + b + "\"]}");
        String dentro = "{\"nome\":\"Combo de combo\",\"preco\":15,\"duracaoMin\":60,\"combo\":true,\"componentes\":[\"" + a + "\",\"" + combo + "\"]}";
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA)).contentType(MediaType.APPLICATION_JSON).content(dentro))
                .andExpect(status().isBadRequest());
        String c = criar(DALFORNO, tB, corpo("C", "10")), d = criar(DALFORNO, tB, corpo("D", "10"));
        String cruzado = "{\"nome\":\"Cruzado\",\"preco\":15,\"duracaoMin\":60,\"combo\":true,\"componentes\":[\"" + a + "\",\"" + c + "\"]}";
        mvc.perform(post("/api/servicos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB)).contentType(MediaType.APPLICATION_JSON).content(cruzado))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/servicos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB))).andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void antecedenciaEIntervaloSaoGuardadosEMantidosQuandoNaoVem() throws Exception {
        String t = token(APEX, "davi");
        String id = criar(APEX, t, "{\"nome\":\"Corte\",\"preco\":40,\"duracaoMin\":30,\"intervaloMin\":10,\"antecedenciaH\":48}");
        mvc.perform(put("/api/servicos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content(corpo("Corte novo", "45")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.intervaloMin").value(10)).andExpect(jsonPath("$.antecedenciaH").value(48));
    }

    @Test
    void naBarbeariaOPrecoEUnicoETabelaPorPorteNaoEGuardada() throws Exception {
        String t = token(DALFORNO, "alan");
        String id = criar(DALFORNO, t, "{\"nome\":\"Corte\",\"preco\":40,\"duracaoMin\":30,\"precos\":{\"pequeno\":1}}");
        mvc.perform(get("/api/servicos/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(jsonPath("$.preco").value(40)).andExpect(jsonPath("$.precos").doesNotExist());
    }

    @Test
    void codigoEUnicoSemDiferenciarMaiusculas() throws Exception {
        String t = token(APEX, "davi");
        criar(APEX, t, "{\"nome\":\"A\",\"codigo\":\"EQ-1\",\"preco\":10,\"duracaoMin\":30}");
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"B\",\"codigo\":\"eq-1\",\"preco\":10,\"duracaoMin\":30}")).andExpect(status().isConflict());
    }

    @Test
    void servicoDeOutraLojaDa404EmTudo() throws Exception {
        String tA = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        String idDaApex = criar(APEX, tA, corpo("So da Apex", "80"));
        mvc.perform(get("/api/servicos/" + idDaApex).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB))).andExpect(status().isNotFound());
        mvc.perform(put("/api/servicos/" + idDaApex).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB))
                .contentType(MediaType.APPLICATION_JSON).content(corpo("Roubado", "1"))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/servicos/" + idDaApex).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB))).andExpect(status().isNotFound());
        mvc.perform(get("/api/servicos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB))).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/servicos/" + idDaApex).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA)))
                .andExpect(jsonPath("$.nome").value("So da Apex")).andExpect(jsonPath("$.ativo").value(true));
    }

    @Test
    void tokenDeUmaLojaNoHostDeOutraDa403() throws Exception {
        String tA = token(APEX, "davi");
        mvc.perform(get("/api/servicos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tA))).andExpect(status().isForbidden());
    }

    @Test
    void codigoRepetidoNaMesmaLojaDa409MasEmOutraLojaPode() throws Exception {
        String tA = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        String c = "{\"nome\":\"Corte\",\"codigo\":\"C-1\",\"preco\":40,\"duracaoMin\":30}";
        criar(APEX, tA, c);
        criar(DALFORNO, tB, c);
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA))
                .contentType(MediaType.APPLICATION_JSON).content(c)).andExpect(status().isConflict());
    }

    @Test
    void validacaoDoCorpoDa400() throws Exception {
        String t = token(APEX, "davi");
        String[] ruins = {
                corpo("", "10"),                                                             // nome vazio
                corpo("X", "-1"),                                                            // preço negativo
                corpo("X", "100001"),                                                        // preço acima do teto
                "{\"nome\":\"X\",\"preco\":10,\"duracaoMin\":0}",                            // duração zero
                "{\"nome\":\"X\",\"preco\":10,\"duracaoMin\":1441}",                         // acima de 1 dia sem multiDia
                "{\"nome\":\"X\",\"preco\":10,\"duracaoMin\":30,\"comissaoPct\":101}",       // comissão > 100
                "{\"nome\":\"X\",\"preco\":10,\"duracaoMin\":30,\"codigo\":\"com espaço\"}", // código inválido
                "{\"nome\":\"X\",\"preco\":10,\"duracaoMin\":30,\"lojaId\":\"outra\"}",      // campo desconhecido
                "{\"nome\":\"X\",\"preco\":10,\"duracaoMin\":30,\"precos\":{\"gigante\":5}}",// porte desconhecido
        };
        for (String ruim : ruins) {
            mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t))
                    .contentType(MediaType.APPLICATION_JSON).content(ruim)).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void precoEDuracaoPorPorteSaoGuardadosEATabelaIncompletaEhRecusada() throws Exception {
        String t = token(APEX, "davi");
        String id = criar(APEX, t, "{\"nome\":\"Vitrificacao\",\"preco\":900,\"duracaoMin\":2880,\"multiDia\":true,"
                + "\"precos\":{\"pequeno\":900,\"medio\":1000,\"grande\":1200,\"suv\":1400.5,\"pickup\":1500},"
                + "\"duracoes\":{\"pequeno\":2880,\"medio\":2880,\"grande\":3600,\"suv\":4320,\"pickup\":4320}}");
        mvc.perform(get("/api/servicos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(jsonPath("$.multiDia").value(true)).andExpect(jsonPath("$.precos.suv").value(1400.5))
                .andExpect(jsonPath("$.duracoes.suv").value(4320)).andExpect(jsonPath("$.preco").value(1000)).andExpect(jsonPath("$.duracaoMin").value(2880));
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Parcial\",\"preco\":900,\"duracaoMin\":60,\"precos\":{\"pequeno\":900}}")).andExpect(status().isBadRequest());
    }

    @Test
    void alterarMantemCodigoEOutrosCamposQuandoNaoVem() throws Exception {
        String t = token(APEX, "davi");
        String id = criar(APEX, t, "{\"nome\":\"Corte\",\"codigo\":\"C-9\",\"categoria\":\"Cabelo\",\"preco\":40,\"duracaoMin\":30}");
        mvc.perform(put("/api/servicos/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(t))
                        .contentType(MediaType.APPLICATION_JSON).content(corpo("Corte novo", "45")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nome").value("Corte novo")).andExpect(jsonPath("$.preco").value(45))
                .andExpect(jsonPath("$.codigo").value("C-9")).andExpect(jsonPath("$.categoria").value("Cabelo"));
    }
}
