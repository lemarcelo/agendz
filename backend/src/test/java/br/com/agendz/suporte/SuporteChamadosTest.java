package br.com.agendz.suporte;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Suporte (chamados) dentro da loja: a loja vem do Host, o usuário e o papel vêm do token, nunca do corpo; só o dono pede "todos"; a chave interna vai no cabeçalho;
 * o erro do Admin (404/429) volta com a mensagem; Admin fora do ar = 503 genérico; loja suspensa ainda abre o Suporte. Fala com um "Admin" de mentira.
 */
class SuporteChamadosTest extends BaseApi {

    private static final String CHAVE = "chave-interna-so-para-teste-0123456789";
    private static final HttpServer FALSO = subir();
    private static final AtomicReference<String> caminho = new AtomicReference<>();
    private static final AtomicReference<String> consulta = new AtomicReference<>();
    private static final AtomicReference<String> chaveRecebida = new AtomicReference<>();
    private static final AtomicReference<String> corpo = new AtomicReference<>();
    private static volatile int respostaStatus = 200;
    private static volatile String respostaCorpo = "[]";

    private static HttpServer subir() {
        try {
            HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            s.createContext("/", ex -> {
                caminho.set(ex.getRequestURI().getPath());
                consulta.set(ex.getRequestURI().getRawQuery());
                chaveRecebida.set(ex.getRequestHeaders().getFirst("X-Interno-Chave"));
                corpo.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                byte[] b = respostaCorpo.getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders(respostaStatus, b.length);
                ex.getResponseBody().write(b);
                ex.close();
            });
            s.start();
            return s;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void ligar(DynamicPropertyRegistry r) {
        r.add("agendz.admin.url", () -> "http://127.0.0.1:" + FALSO.getAddress().getPort());
    }

    @AfterAll
    static void parar() {
        FALSO.stop(0);
    }

    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void zerar() {
        respostaStatus = 200;
        respostaCorpo = "[]";
        caminho.set(null);
        consulta.set(null);
        corpo.set(null);
        jdbc.update("update loja set status = 'ativo' where slug = 'offbox'");
    }

    private UUID idDe(String identificador) {
        return jdbc.queryForObject("select id from usuario where identificador = ? and loja_id = (select id from loja where slug = 'offbox')", UUID.class, identificador);
    }

    @Test
    void semLoginNaoEntra() throws Exception {
        mvc.perform(get("/api/suporte/chamados").with(host(OFFBOX))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/suporte/chamados").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        assertNull(caminho.get());
    }

    @Test
    void listaUsaLojaDoHostEUsuarioDoTokenESoDonoPedeTodos() throws Exception {
        String dono = token(OFFBOX, "proprietario");
        String colega = token(OFFBOX, "colaborador1");
        mvc.perform(get("/api/suporte/chamados").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk());
        assertEquals("/interno/chamados", caminho.get());
        assertEquals(CHAVE, chaveRecebida.get());
        assertEquals("loja=offbox&usuario=" + idDe("proprietario") + "&todos=true", consulta.get());
        mvc.perform(get("/api/suporte/chamados").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega))).andExpect(status().isOk());
        assertEquals("loja=offbox&usuario=" + idDe("colaborador1") + "&todos=false", consulta.get());
        // a loja não vem de parâmetro: ?loja=apex e ?usuario=... são ignorados
        mvc.perform(get("/api/suporte/chamados?loja=apex&usuario=" + UUID.randomUUID() + "&todos=true").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega))).andExpect(status().isOk());
        assertEquals("loja=offbox&usuario=" + idDe("colaborador1") + "&todos=false", consulta.get());
        mvc.perform(get("/api/suporte/chamados/nao-lidas").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega))).andExpect(status().isOk());
        assertEquals("/interno/chamados/nao-lidas", caminho.get());
    }

    @Test
    void abrirIgnoraVinculoDoCorpoERecusaCampoDesconhecido() throws Exception {
        String colega = token(OFFBOX, "colaborador1");
        respostaStatus = 201;
        respostaCorpo = "{\"id\":\"" + UUID.randomUUID() + "\",\"status\":\"aberto\"}";
        String ok = "{\"assunto\":\"Não abre\",\"categoria\":\"problema\",\"texto\":\"A agenda trava\"}";
        mvc.perform(post("/api/suporte/chamados").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega)).contentType(MediaType.APPLICATION_JSON).content(ok)).andExpect(status().isCreated());
        assertEquals("/interno/chamados", caminho.get());
        assertTrue(corpo.get().contains("\"loja\":\"offbox\""));
        assertTrue(corpo.get().contains("\"usuario\":\"" + idDe("colaborador1") + "\""));
        assertTrue(corpo.get().contains("\"todos\":false"));
        // tentar mandar loja/usuário no corpo = 400 e nada vai ao Admin
        caminho.set(null);
        mvc.perform(post("/api/suporte/chamados").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assunto\":\"x\",\"categoria\":\"problema\",\"texto\":\"y\",\"loja\":\"apex\",\"usuario\":\"" + UUID.randomUUID() + "\",\"todos\":true}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/suporte/chamados").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assunto\":\"\",\"categoria\":\"problema\",\"texto\":\"y\"}")).andExpect(status().isBadRequest());
        assertNull(caminho.get());
    }

    @Test
    void erroDoAdminVoltaComMensagemEForaDoArVira503() throws Exception {
        String colega = token(OFFBOX, "colaborador1");
        String id = UUID.randomUUID().toString();
        respostaStatus = 404;
        respostaCorpo = "{\"mensagem\":\"Chamado não encontrado.\"}";
        mvc.perform(get("/api/suporte/chamados/" + id).with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega))).andExpect(status().isNotFound()).andExpect(jsonPath("$.mensagem").value("Chamado não encontrado."));
        respostaStatus = 429;
        respostaCorpo = "{\"mensagem\":\"Muitas mensagens em pouco tempo. Aguarde um pouco.\"}";
        mvc.perform(post("/api/suporte/chamados/" + id + "/mensagens").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega)).contentType(MediaType.APPLICATION_JSON).content("{\"texto\":\"oi\"}"))
                .andExpect(status().isTooManyRequests());
        respostaStatus = 500;
        respostaCorpo = "{\"mensagem\":\"detalhe interno que não pode vazar\"}";
        String r = mvc.perform(get("/api/suporte/chamados").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega))).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.mensagem", containsString("não está disponível"))).andReturn().getResponse().getContentAsString();
        assertFalse(r.contains("vazar"));
        // id que não é UUID = 404 sem chamar o Admin
        caminho.set(null);
        mvc.perform(get("/api/suporte/chamados/abc").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colega))).andExpect(status().isNotFound());
        assertNull(caminho.get());
    }

    @Test
    void lojaSuspensaAindaAbreOSuporte() throws Exception {
        String dono = token(OFFBOX, "proprietario");
        jdbc.update("update loja set status = 'suspenso' where slug = 'offbox'");
        mvc.perform(get("/api/suporte/chamados").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk());
        mvc.perform(get("/api/clientes").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isPaymentRequired());
    }
}
