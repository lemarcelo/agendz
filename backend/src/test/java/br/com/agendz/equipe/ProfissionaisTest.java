package br.com.agendz.equipe;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** Equipe: só o dono cria e desativa, papel nunca vem do corpo, sem vazar login/senha e sem cruzar lojas (Gate 3). */
class ProfissionaisTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    @AfterEach
    void limpar() {
        jdbc.update("delete from usuario where identificador like 'teste-%'");
    }

    private String criar(String hostDaLoja, String token, String login, String nome) throws Exception {
        String json = mvc.perform(post("/api/profissionais").with(host(hostDaLoja)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identificador\":\"" + login + "\",\"nome\":\"" + nome + "\",\"senha\":\"senha123\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.papel").value("profissional"))
                .andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    @Test
    void donoCriaEOnovoProfissionalFazLogin() throws Exception {
        String dono = token(APEX, "davi");
        criar(APEX, dono, "teste-ana", "Ana");
        mvc.perform(post("/api/auth/login").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-ana", "senha123")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.papel").value("profissional"));
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-ana", "senha123")))
                .andExpect(status().isUnauthorized()); // o login existe só na loja onde foi criado
    }

    @Test
    void listaNaoMostraLoginNemSenhaENemOutraLoja() throws Exception {
        String dono = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        criar(APEX, dono, "teste-bia", "Bia");
        mvc.perform(get("/api/profissionais").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[*].nome").value(hasItem("Bia")))
                .andExpect(content().string(not(org.hamcrest.Matchers.containsString("senha"))))
                .andExpect(content().string(not(org.hamcrest.Matchers.containsString("identificador"))));
        mvc.perform(get("/api/profissionais").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB)))
                .andExpect(jsonPath("$[*].nome").value(not(hasItem("Bia"))));
    }

    @Test
    void profissionalNaoCriaNemMexe() throws Exception {
        String prof = token(APEX, "pablo"), dono = token(APEX, "davi");
        String id = criar(APEX, dono, "teste-caio", "Caio");
        mvc.perform(post("/api/profissionais").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"identificador\":\"teste-x\",\"nome\":\"X\",\"senha\":\"senha123\"}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/profissionais/" + id + "/atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))
                .contentType(MediaType.APPLICATION_JSON).content("{\"atende\":false}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/profissionais/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isForbidden());
    }

    @Test
    void papelNuncaVemDoCorpo() throws Exception {
        String dono = token(APEX, "davi");
        mvc.perform(post("/api/profissionais").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"identificador\":\"teste-y\",\"nome\":\"Y\",\"senha\":\"senha123\",\"papel\":\"dono\"}")).andExpect(status().isBadRequest());
    }

    @Test
    void validacaoDoCorpoDa400ELoginRepetidoDa409() throws Exception {
        String dono = token(APEX, "davi");
        String[] ruins = {
                "{\"identificador\":\"a\",\"nome\":\"X\",\"senha\":\"senha123\"}",            // login curto
                "{\"identificador\":\"com espaço\",\"nome\":\"X\",\"senha\":\"senha123\"}",    // login inválido
                "{\"identificador\":\"teste-z\",\"nome\":\"\",\"senha\":\"senha123\"}",        // nome vazio
                "{\"identificador\":\"teste-z\",\"nome\":\"Z\",\"senha\":\"123\"}",            // senha curta
        };
        for (String ruim : ruins) {
            mvc.perform(post("/api/profissionais").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                    .contentType(MediaType.APPLICATION_JSON).content(ruim)).andExpect(status().isBadRequest());
        }
        criar(APEX, dono, "teste-dup", "Dup");
        mvc.perform(post("/api/profissionais").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"identificador\":\"teste-dup\",\"nome\":\"Outro\",\"senha\":\"senha123\"}")).andExpect(status().isConflict());
    }

    @Test
    void profissionalDeOutraLojaDa404() throws Exception {
        String tA = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        String id = criar(APEX, tA, "teste-eva", "Eva");
        mvc.perform(put("/api/profissionais/" + id + "/atendimento").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB))
                .contentType(MediaType.APPLICATION_JSON).content("{\"atende\":false}")).andExpect(status().isNotFound());
        mvc.perform(delete("/api/profissionais/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB))).andExpect(status().isNotFound());
    }

    @Test
    void removerDesativaOLoginENaoPermiteRemoverODono() throws Exception {
        String dono = token(APEX, "davi");
        String id = criar(APEX, dono, "teste-fim", "Fim");
        mvc.perform(delete("/api/profissionais/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isNoContent());
        mvc.perform(post("/api/auth/login").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-fim", "senha123")))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profissionais").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andExpect(jsonPath("$[*].nome").value(not(hasItem("Fim"))));
        // o dono não se remove (descobre o próprio id pela lista)
        String lista = mvc.perform(get("/api/profissionais").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\",\"nome\":\"Davi\"").matcher(lista);
        if (!m.find()) throw new IllegalStateException("sem Davi: " + lista);
        mvc.perform(delete("/api/profissionais/" + m.group(1)).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andExpect(status().isConflict());
    }

    @Test
    void atendimentoLigaEDesliga() throws Exception {
        String dono = token(APEX, "davi");
        String id = criar(APEX, dono, "teste-gil", "Gil");
        mvc.perform(put("/api/profissionais/" + id + "/atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .contentType(MediaType.APPLICATION_JSON).content("{\"atende\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.atende").value(false));
    }
}
