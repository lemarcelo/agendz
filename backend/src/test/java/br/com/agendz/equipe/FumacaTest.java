package br.com.agendz.equipe;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

/** Usuário de fumaça (teste automático no site real): criado e apagado pela rota interna com chave; entra sem trocar a senha; escondido da equipe. */
class FumacaTest extends BaseApi {

    private static final String CHAVE = "chave-interna-so-para-teste-0123456789";
    private static final String ROTA = "/interno/plataforma/lojas/offbox/fumaca";

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void limpar() {
        jdbc.update("delete from usuario where identificador like 'fumaca-%'");
    }

    private static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem " + nome + ": " + json);
        return m.group(1);
    }

    @Test
    void semChaveOuComChaveErradaNaoCriaNemApaga() throws Exception {
        mvc.perform(post(ROTA)).andExpect(status().isForbidden());
        mvc.perform(post(ROTA).header("X-Interno-Chave", "errada-errada-errada")).andExpect(status().isForbidden());
        mvc.perform(post(ROTA + "/fumaca-0a1b2c3d/apagar")).andExpect(status().isForbidden());
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador like 'fumaca-%'", Integer.class));
    }

    @Test
    void criaEntraSemTrocarSenhaFicaEscondidoEApaga() throws Exception {
        String json = mvc.perform(post(ROTA).header("X-Interno-Chave", CHAVE)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.usuario", startsWith("fumaca-"))).andReturn().getResponse().getContentAsString();
        String usuario = campo(json, "usuario");
        String senha = campo(json, "senha");
        // entra direto (sem troca obrigatória) e com perfil de dono (o teste vê todas as telas)
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(usuario, senha)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(false)).andExpect(jsonPath("$.papel").value("dono"));
        // escondido da equipe e dos profissionais
        String dono = token(OFFBOX, "proprietario");
        mvc.perform(get("/api/usuarios").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(jsonPath("$[*].usuario").value(not(hasItem(usuario))));
        mvc.perform(get("/api/profissionais").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk());
        // o cliente não cria login com esse prefixo
        mvc.perform(post("/api/usuarios").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Fulano\",\"apelido\":\"Fx\",\"usuario\":\"fumaca-12345678\",\"papel\":\"profissional\"}")).andExpect(status().isBadRequest());
        // só apaga login de fumaça; o apagado some e não entra mais
        mvc.perform(post("/interno/plataforma/lojas/offbox/fumaca/proprietario/apagar").header("X-Interno-Chave", CHAVE)).andExpect(status().isBadRequest());
        mvc.perform(post(ROTA + "/" + usuario + "/apagar").header("X-Interno-Chave", CHAVE)).andExpect(status().isNoContent());
        mvc.perform(post(ROTA + "/" + usuario + "/apagar").header("X-Interno-Chave", CHAVE)).andExpect(status().isNotFound());
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador = ?", Integer.class, usuario));
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(usuario, senha))).andExpect(status().is4xxClientError());
    }

    @Test
    void fumacaEsquecidaHaMaisDeUmaHoraSaiNaProximaCriacao() throws Exception {
        String velho = campo(mvc.perform(post(ROTA).header("X-Interno-Chave", CHAVE)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "usuario");
        jdbc.update("update usuario set criado_em = now() - interval '2 hours' where identificador = ?", velho);
        mvc.perform(post(ROTA).header("X-Interno-Chave", CHAVE)).andExpect(status().isCreated());
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador = ?", Integer.class, velho));
        assertEquals(1, jdbc.queryForObject("select count(*) from usuario where identificador like 'fumaca-%'", Integer.class));
    }
}
