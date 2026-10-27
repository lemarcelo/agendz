package br.com.agendz.seguranca;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Login, token e trava de força bruta. */
class AutenticacaoTest extends BaseApi {

    @Test
    void loginCertoDevolveTokenENomeSemSenha() throws Exception {
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON)
                        .content(corpoLogin("alan", "1234")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.nome").value("Alan"))
                .andExpect(jsonPath("$.papel").value("dono"))
                .andExpect(content().string(not(containsString("senha"))));
    }

    @Test
    void identificadorNaoDistingueMaiusculas() throws Exception {
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON)
                        .content(corpoLogin("  ALAN ", "1234")))
                .andExpect(status().isOk());
    }

    @Test
    void senhaErradaEUsuarioInexistenteDaoARespostaIgual() throws Exception {
        String a = mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON)
                        .content(corpoLogin("alan", "errada")))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String b = mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON)
                        .content(corpoLogin("naoexiste", "1234")))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        org.junit.jupiter.api.Assertions.assertEquals(a, b);
    }

    @Test
    void usuarioDeUmaLojaNaoLogaEmOutra() throws Exception {
        // "davi" existe só na Apex: no host da Dalforno é usuário inexistente
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON)
                        .content(corpoLogin("davi", "1234")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginEmHostSemLojaDa404() throws Exception {
        mvc.perform(post("/api/auth/login").with(host("naoexiste.agendz.io")).contentType(MediaType.APPLICATION_JSON)
                        .content(corpoLogin("alan", "1234")))
                .andExpect(status().isNotFound());
    }

    @Test
    void corpoInvalidoDa400() throws Exception {
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identificador\":\"\",\"senha\":\"x\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON)
                        .content("não é json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cincoErrosBloqueiamMesmoComASenhaCerta() throws Exception {
        // só este teste usa offbox/colaborador1 (o limite é em memória e compartilhado entre testes)
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON)
                            .content(corpoLogin("colaborador1", "errada" + i)))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON)
                        .content(corpoLogin("colaborador1", "1234")))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void rotaProtegidaSemTokenDa401() throws Exception {
        mvc.perform(get("/api/clientes").with(host(DALFORNO))).andExpect(status().isUnauthorized());
    }
}
