package br.com.agendz.equipe;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.interno.SuporteInternoController;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** Usuário `suporte`: nome reservado para o cliente; criado pelo Admin (rota interna com chave); escondido da equipe da loja; não troca de nome. */
class SuporteTest extends BaseApi {

    private static final String CHAVE = "chave-interna-so-para-teste-0123456789";
    private static final String ROTA = "/interno/plataforma/lojas/offbox/suporte";

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void limpar() {
        jdbc.update("delete from usuario where identificador = 'suporte' or lower(apelido) like 'sp%'");
    }

    private String criarSuporte() throws Exception {
        return mvc.perform(post(ROTA).header("X-Interno-Chave", CHAVE)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.usuario").value("suporte")).andExpect(jsonPath("$.senhaTemporaria", notNullValue()))
                .andReturn().getResponse().getContentAsString();
    }

    private static String senhaDe(String json) {
        Matcher m = Pattern.compile("\"senhaTemporaria\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem senha: " + json);
        return m.group(1);
    }

    private String entrar(String senha) throws Exception {
        String json = mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("suporte", senha)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("login sem token: " + json);
        return m.group(1);
    }

    @Test
    void clienteNaoCriaUsuarioComNomeReservado() throws Exception {
        String dono = token(OFFBOX, "proprietario");
        for (String corpo : new String[]{
                "{\"nome\":\"Fulano\",\"apelido\":\"sp1\",\"usuario\":\"suporte\",\"papel\":\"profissional\"}",
                "{\"nome\":\"Fulano\",\"apelido\":\"sp2\",\"usuario\":\"  SUPORTE \",\"papel\":\"profissional\"}",
                "{\"nome\":\"Suporte\",\"apelido\":\"sp3\",\"papel\":\"profissional\"}",
                "{\"nome\":\"Fulano\",\"apelido\":\"Suporte\",\"papel\":\"profissional\"}"}) {
            mvc.perform(post("/api/usuarios").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON).content(corpo))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Nome reservado."));
        }
        mvc.perform(post("/api/profissionais").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identificador\":\"Suporte\",\"nome\":\"Fulano\",\"senha\":\"1234abcd\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Nome reservado."));
    }

    @Test
    void clienteNaoRenomeiaAlguemParaSuporte() throws Exception {
        String dono = token(OFFBOX, "proprietario");
        String lista = mvc.perform(get("/api/usuarios").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"[^}]*?\"usuario\":\"colaborador1\"").matcher(lista);
        if (!m.find()) throw new IllegalStateException("sem colaborador1: " + lista);
        mvc.perform(put("/api/usuarios/" + m.group(1)).with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"usuario\":\"suporte\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Nome reservado."));
    }

    @Test
    void rotaInternaExigeAChaveEEhIdempotente() throws Exception {
        mvc.perform(post(ROTA)).andExpect(status().isForbidden());
        mvc.perform(post(ROTA).header("X-Interno-Chave", "errada-errada-errada")).andExpect(status().isForbidden());
        mvc.perform(post("/interno/plataforma/lojas/naoexiste/suporte").header("X-Interno-Chave", CHAVE)).andExpect(status().isNotFound());
        String primeira = criarSuporte();
        entrar(senhaDe(primeira));
        mvc.perform(post(ROTA).header("X-Interno-Chave", CHAVE)).andExpect(status().isOk()).andExpect(jsonPath("$.criado").value(false))
                .andExpect(jsonPath("$.senhaTemporaria").doesNotExist());
        assertEquals(1, jdbc.queryForObject("select count(*) from usuario where identificador = 'suporte'", Integer.class));
    }

    @Test
    void suporteFicaEscondidoDaEquipeENaoTrocaDeNome() throws Exception {
        String senha = senhaDe(criarSuporte());
        String dono = token(OFFBOX, "proprietario");
        mvc.perform(get("/api/usuarios").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].usuario", not(hasItem("suporte"))));
        mvc.perform(get("/api/profissionais").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].nome", not(hasItem("Suporte"))));
        String token = entrar(senha);
        mvc.perform(put("/api/usuarios/me/senha").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"senhaAtual\":\"" + senha + "\",\"nova\":\"NovaSenha2026\",\"usuario\":\"outronome\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem", containsString("não troca de nome")));
        mvc.perform(put("/api/usuarios/me/senha").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"senhaAtual\":\"" + senha + "\",\"nova\":\"NovaSenha2026\",\"usuario\":\"suporte\"}"))
                .andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject("select count(*) from usuario where identificador = 'suporte'", Integer.class));
    }

    @Test
    void refazerASenhaDoSuporteGeraOutraEExigeTroca() throws Exception {
        String antiga = senhaDe(criarSuporte());
        String nova = senhaDe(mvc.perform(post(ROTA + "/senha").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("suporte", antiga))).andExpect(status().isUnauthorized());
        entrar(nova);
        assertEquals(Boolean.TRUE, jdbc.queryForObject("select deve_trocar_senha from usuario where identificador = 'suporte'", Boolean.class));
    }

    @Test
    void semChaveConfiguradaARotaFicaDesligada() {
        // contrato do construtor: chave curta = 503 (coberto aqui sem subir outro contexto)
        SuporteInternoController c = new SuporteInternoController(null, null, "curta");
        org.junit.jupiter.api.Assertions.assertThrows(br.com.agendz.erro.ErroDeNegocio.class, () -> c.garantir("offbox", "curta"));
    }
}
