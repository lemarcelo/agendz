package br.com.agendz.auth.passkey;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/** Login por digital (passkey) ponta a ponta: o aparelho é o {@link AutenticadorFalso}; senha continua valendo; recusa é 403; só a própria pessoa mexe nas suas. */
class PasskeyTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;

    String davi;
    AutenticadorFalso aparelho;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        aparelho = new AutenticadorFalso("credencial-do-davi-0001".getBytes(StandardCharsets.UTF_8));
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from passkey");
    }

    private ResultActions enviar(String rota, String host, String token, String corpo) throws Exception {
        var r = post(rota).with(host(host)).contentType(MediaType.APPLICATION_JSON).content(corpo);
        if (token != null) r = r.header(HttpHeaders.AUTHORIZATION, bearer(token));
        return mvc.perform(r);
    }

    private JsonNode corpoDe(ResultActions a) throws Exception {
        return json.readTree(a.andReturn().getResponse().getContentAsString());
    }

    private static String origem(String host) {
        return "https://" + host;
    }

    /** Cadastra o aparelho do Davi e devolve o corpo do 201. */
    private JsonNode cadastrar(String host, String token) throws Exception {
        JsonNode pedido = corpoDe(enviar("/api/usuarios/me/passkeys/desafio", host, token, "{\"senha\":\"1234\"}").andExpect(status().isOk()));
        String cd = Webauthn.b64(AutenticadorFalso.clientData("webauthn.create", pedido.get("desafio").asText(), origem(host)));
        String atestado = Webauthn.b64(aparelho.atestado(host, 0x45));
        String corpo = "{\"desafioId\":\"" + pedido.get("desafioId").asText() + "\",\"nome\":\"Celular do Davi\",\"clientDataJSON\":\"" + cd + "\",\"atestado\":\"" + atestado + "\"}";
        return corpoDe(enviar("/api/usuarios/me/passkeys", host, token, corpo).andExpect(status().isCreated()));
    }

    private String corpoEntrada(String host, String desafioId, String desafio) {
        AutenticadorFalso.Assinada a = aparelho.entrada(host, desafio, origem(host), 0x05);
        return "{\"desafioId\":\"" + desafioId + "\",\"credencialId\":\"" + Webauthn.b64(aparelho.credencialId) + "\",\"clientDataJSON\":\"" + Webauthn.b64(a.clientData())
                + "\",\"authenticatorData\":\"" + Webauthn.b64(a.authData()) + "\",\"assinatura\":\"" + Webauthn.b64(a.assinatura()) + "\"}";
    }

    @Test
    void cadastrarPedeASenha_erradaE403_nunca401() throws Exception {
        enviar("/api/usuarios/me/passkeys/desafio", APEX, davi, "{\"senha\":\"errada-errada\"}").andExpect(status().isForbidden());
        enviar("/api/usuarios/me/passkeys/desafio", APEX, null, "{\"senha\":\"1234\"}").andExpect(status().isUnauthorized()); // sem sessão
    }

    @Test
    void cadastrarEEntrarPelaDigital_gerandoAMesmaSessaoDoLoginPorSenha() throws Exception {
        JsonNode item = cadastrar(APEX, davi);
        // o servidor não devolve a chave: só nome e datas
        org.junit.jupiter.api.Assertions.assertFalse(item.has("chavePublica"));
        mvc.perform(get("/api/usuarios/me/passkeys").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Celular do Davi"));

        JsonNode pedido = corpoDe(enviar("/api/auth/passkey/desafio", APEX, null, "{}").andExpect(status().isOk()));
        String corpo = corpoEntrada(APEX, pedido.get("desafioId").asText(), pedido.get("desafio").asText());
        enviar("/api/auth/passkey/entrar", APEX, null, corpo).andExpect(status().isOk())
                .andExpect(jsonPath("$.papel").value("dono")).andExpect(jsonPath("$.token").isNotEmpty()).andExpect(jsonPath("$.deveTrocarSenha").value(false));
        // o desafio é de uso único: repetir a mesma resposta é recusado
        enviar("/api/auth/passkey/entrar", APEX, null, corpo).andExpect(status().isForbidden());
        // a senha continua funcionando
        token(APEX, "davi");
    }

    @Test
    void entradaRecusada_comAssinaturaTrocadaOutraLojaOuDesafioDeOutroTipo() throws Exception {
        cadastrar(APEX, davi);
        JsonNode pedido = corpoDe(enviar("/api/auth/passkey/desafio", APEX, null, "{}").andExpect(status().isOk()));
        String bom = corpoEntrada(APEX, pedido.get("desafioId").asText(), pedido.get("desafio").asText());
        // outra loja não reconhece a credencial nem o desafio: mesma frase da recusa de sempre
        enviar("/api/auth/passkey/entrar", DALFORNO, null, bom).andExpect(status().isForbidden()).andExpect(jsonPath("$.mensagem").value(PasskeyService.RECUSA));
        // o desafio já foi gasto pela tentativa acima: peça outro e adultere a assinatura
        JsonNode p2 = corpoDe(enviar("/api/auth/passkey/desafio", APEX, null, "{}").andExpect(status().isOk()));
        String corpo2 = corpoEntrada(APEX, p2.get("desafioId").asText(), p2.get("desafio").asText());
        JsonNode n = json.readTree(corpo2);
        byte[] sig = Webauthn.deB64(n.get("assinatura").asText());
        sig[sig.length - 1] ^= 1;
        String adulterado = corpo2.replace(n.get("assinatura").asText(), Webauthn.b64(sig));
        enviar("/api/auth/passkey/entrar", APEX, null, adulterado).andExpect(status().isForbidden());
        // um desafio de CADASTRO não serve para entrar
        JsonNode pc = corpoDe(enviar("/api/usuarios/me/passkeys/desafio", APEX, davi, "{\"senha\":\"1234\"}").andExpect(status().isOk()));
        enviar("/api/auth/passkey/entrar", APEX, null, corpoEntrada(APEX, pc.get("desafioId").asText(), pc.get("desafio").asText())).andExpect(status().isForbidden());
        // sem credencial cadastrada de verdade, nada entra
        enviar("/api/auth/passkey/entrar", APEX, null, "{\"desafioId\":\"x\",\"credencialId\":\"AAAA\",\"clientDataJSON\":\"AAAA\",\"authenticatorData\":\"AAAA\",\"assinatura\":\"AAAA\"}")
                .andExpect(status().isForbidden());
    }

    @Test
    void cadastroRecusado_comOrigemOuLojaErrada_eDesafioNaoServeParaOutraPessoa() throws Exception {
        JsonNode pedido = corpoDe(enviar("/api/usuarios/me/passkeys/desafio", APEX, davi, "{\"senha\":\"1234\"}").andExpect(status().isOk()));
        String cd = Webauthn.b64(AutenticadorFalso.clientData("webauthn.create", pedido.get("desafio").asText(), "https://falso.example"));
        String corpo = "{\"desafioId\":\"" + pedido.get("desafioId").asText() + "\",\"nome\":\"x\",\"clientDataJSON\":\"" + cd + "\",\"atestado\":\"" + Webauthn.b64(aparelho.atestado(APEX, 0x45)) + "\"}";
        enviar("/api/usuarios/me/passkeys", APEX, davi, corpo).andExpect(status().isForbidden());
        // o desafio do Davi na mão do Pablo
        String pablo = token(APEX, "pablo");
        JsonNode p2 = corpoDe(enviar("/api/usuarios/me/passkeys/desafio", APEX, davi, "{\"senha\":\"1234\"}").andExpect(status().isOk()));
        String cd2 = Webauthn.b64(AutenticadorFalso.clientData("webauthn.create", p2.get("desafio").asText(), origem(APEX)));
        String corpo2 = "{\"desafioId\":\"" + p2.get("desafioId").asText() + "\",\"nome\":\"x\",\"clientDataJSON\":\"" + cd2 + "\",\"atestado\":\"" + Webauthn.b64(aparelho.atestado(APEX, 0x45)) + "\"}";
        enviar("/api/usuarios/me/passkeys", APEX, pablo, corpo2).andExpect(status().isForbidden());
    }

    @Test
    void cadaPessoaVeEApagaSoAsSuas_eUmaPessoaTemNoMaximoCinco() throws Exception {
        JsonNode item = cadastrar(APEX, davi);
        String pablo = token(APEX, "pablo");
        mvc.perform(get("/api/usuarios/me/passkeys").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(delete("/api/usuarios/me/passkeys/" + item.get("id").asText()).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/usuarios/me/passkeys/" + item.get("id").asText()).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isNoContent());
        mvc.perform(get("/api/usuarios/me/passkeys").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        // teto de 5 aparelhos
        for (int i = 0; i < PasskeyService.MAX_POR_PESSOA; i++) {
            jdbc.update("insert into passkey (loja_id, usuario_id, credencial_id, chave_publica, alg, nome) select loja_id, id, ?, ?, -7, 'x' from usuario where identificador = 'davi' and loja_id = (select id from loja where slug = 'apex')",
                    ("credencial-extra-00000" + i).getBytes(StandardCharsets.UTF_8), new byte[40]);
        }
        enviar("/api/usuarios/me/passkeys/desafio", APEX, davi, "{\"senha\":\"1234\"}").andExpect(status().isConflict());
    }
}
