package br.com.agendz.onboarding;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.ResultActions;

/** Assistente de primeiro acesso (Gate 3): só o dono, só o catálogo do tipo da loja, idempotente, senha temporária mostrada uma vez, isolamento entre lojas. */
class OnboardingTest extends BaseApi {

    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String LOJA_OFFBOX = "00000000-0000-0000-0000-0000000000b2";
    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";
    private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PasswordEncoder encoder;

    @BeforeEach
    void antes() {
        limpar();
    }

    @AfterEach
    void depois() {
        limpar();
    }

    private void limpar() {
        jdbc.update("delete from onboarding");
        jdbc.update("delete from servico");
        jdbc.update("delete from usuario where identificador like 'teste-%' or identificador like 'zeferino%' or identificador like 'zulmira%'");
    }

    private void abrirAssistente(String lojaId) {
        jdbc.update("insert into onboarding (loja_id) values (?::uuid)", lojaId);
    }

    private ResultActions pegar(String host, String token, String rota) throws Exception {
        return mvc.perform(get(rota).with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions enviar(String host, String token, String rota, String corpo) throws Exception {
        return mvc.perform(post(rota).with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private static String corpoSessao(String json, String campo) {
        Matcher m = Pattern.compile("\"" + campo + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException(json);
        return m.group(1);
    }

    @Test
    void semLinhaDeOnboardingNaoSeAplica() throws Exception {
        String t = token(DALFORNO, "alan");
        pegar(DALFORNO, t, "/api/onboarding").andExpect(status().isNotFound());
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[]}").andExpect(status().isNotFound());
        enviar(DALFORNO, t, "/api/onboarding/concluir", "{}").andExpect(status().isNotFound());
    }

    @Test
    void soODonoEntraSemTokenDa401EProfissionalDa403() throws Exception {
        abrirAssistente(LOJA_APEX);
        mvc.perform(get("/api/onboarding").with(host(APEX))).andExpect(status().isUnauthorized());
        String pablo = token(APEX, "pablo");
        pegar(APEX, pablo, "/api/onboarding").andExpect(status().isForbidden());
        enviar(APEX, pablo, "/api/onboarding/servicos", "{\"itens\":[]}").andExpect(status().isForbidden());
        enviar(APEX, pablo, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Zeferino\"}]}").andExpect(status().isForbidden());
        enviar(APEX, pablo, "/api/onboarding/concluir", "{}").andExpect(status().isForbidden());
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador like 'zeferino%'", Integer.class));
    }

    @Test
    void cadaLojaVeOCatalogoDoSeuTipo() throws Exception {
        abrirAssistente(LOJA_DALFORNO);
        abrirAssistente(LOJA_APEX);
        pegar(DALFORNO, token(DALFORNO, "alan"), "/api/onboarding").andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("barbearia")).andExpect(jsonPath("$.passo").value("senha")).andExpect(jsonPath("$.concluido").value(false))
                .andExpect(jsonPath("$.servicos[*].nome", hasItem("Barba"))).andExpect(jsonPath("$.servicos[*].nome", not(hasItem("Lavagem simples"))));
        pegar(APEX, token(APEX, "davi"), "/api/onboarding").andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("estetica_automotiva"))
                .andExpect(jsonPath("$.servicos[*].nome", hasItem("Lavagem simples"))).andExpect(jsonPath("$.servicos[*].nome", not(hasItem("Barba"))));
    }

    @Test
    void servicosSoDoCatalogoDoTipoDaLojaEIdempotentes() throws Exception {
        abrirAssistente(LOJA_DALFORNO);
        String t = token(DALFORNO, "alan");
        // chave de outro tipo, desconhecida ou fora do formato: recusadas e nada é criado
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-lav-simples\"}]}").andExpect(status().isBadRequest());
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"nao-existe\"}]}").andExpect(status().isBadRequest());
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba'; drop table servico;--\"}]}").andExpect(status().isBadRequest());
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\",\"preco\":-1}]}").andExpect(status().isBadRequest());
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\",\"duracaoMin\":0}]}").andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from servico", Integer.class));

        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\",\"preco\":42.5,\"duracaoMin\":50},{\"chave\":\"s-tesoura\"},{\"chave\":\"s-barba\"}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.criados").value(2)).andExpect(jsonPath("$.jaExistiam").value(0));
        pegar(DALFORNO, t, "/api/servicos").andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.nome=='Barba')].preco").value(42.5)).andExpect(jsonPath("$[?(@.nome=='Barba')].duracaoMin").value(50))
                .andExpect(jsonPath("$[?(@.nome=='Corte somente tesoura')].codigo").exists());
        // repetir não duplica
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"},{\"chave\":\"s-tesoura\"}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.criados").value(0)).andExpect(jsonPath("$.jaExistiam").value(2));
        assertEquals(2, jdbc.queryForObject("select count(*) from servico where loja_id = ?::uuid", Integer.class, LOJA_DALFORNO));
        // o estado marca o que já está na loja e avançou o passo
        pegar(DALFORNO, t, "/api/onboarding").andExpect(jsonPath("$.passo").value("equipe")).andExpect(jsonPath("$.jaCadastrados[*]", hasItem("s-barba")));
        // pular = lista vazia (válido, não cria nada)
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[]}").andExpect(status().isOk()).andExpect(jsonPath("$.criados").value(0));
    }

    @Test
    void servicoComPrecoPorPorteIgnoraPrecoEditadoEGuardaATabela() throws Exception {
        abrirAssistente(LOJA_APEX);
        String t = token(APEX, "davi");
        enviar(APEX, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-lav-simples\",\"preco\":1,\"duracaoMin\":1}]}").andExpect(status().isOk()).andExpect(jsonPath("$.criados").value(1));
        pegar(APEX, t, "/api/servicos").andExpect(jsonPath("$[0].precos.pequeno").value(40)).andExpect(jsonPath("$[0].precos.pickup").value(70))
                .andExpect(jsonPath("$[0].duracoes.medio").value(40)).andExpect(jsonPath("$[0].preco").value(50));
    }

    @Test
    void equipeCriaLoginsUnicosComSenhaTemporariaMostradaUmaVez() throws Exception {
        abrirAssistente(LOJA_OFFBOX);
        String t = token(OFFBOX, "proprietario");
        String r = enviar(OFFBOX, t, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Zeferino Silva\"},{\"nome\":\"Zeferino Souza\",\"atende\":false},{\"nome\":\"Zulmira\"}]}")
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.pessoas[0].login").value("zeferino")).andExpect(jsonPath("$.pessoas[1].login").value("zeferino2")).andExpect(jsonPath("$.pessoas[2].login").value("zulmira"))
                .andExpect(jsonPath("$.pessoas[1].atende").value(false)).andReturn().getResponse().getContentAsString();
        String senha = corpoSessao(r, "senhaTemporaria");
        assertEquals(12, senha.length());
        assertTrue(senha.matches("^[A-HJ-NP-Za-km-z2-9]{12}$"), "alfabeto sem caracteres ambíguos: " + senha);
        // só o hash fica salvo e a flag de troca obrigatória está ligada
        String hash = jdbc.queryForObject("select senha_hash from usuario where identificador = 'zeferino'", String.class);
        assertNotEquals(senha, hash);
        assertTrue(encoder.matches(senha, hash));
        assertTrue(jdbc.queryForObject("select deve_trocar_senha from usuario where identificador = 'zeferino'", Boolean.class));
        assertEquals("profissional", jdbc.queryForObject("select papel from usuario where identificador = 'zeferino'", String.class));
        assertEquals(false, jdbc.queryForObject("select atende from usuario where identificador = 'zeferino2'", Boolean.class));
        // o profissional novo entra com a temporária e é obrigado a trocar
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("zeferino", senha)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true)).andExpect(jsonPath("$.papel").value("profissional"));
        // duas senhas diferentes (aleatórias)
        Matcher m = Pattern.compile("\"senhaTemporaria\":\"([^\"]+)\"").matcher(r);
        assertTrue(m.find());
        String primeira = m.group(1);
        assertTrue(m.find());
        assertNotEquals(primeira, m.group(1));
        pegar(OFFBOX, t, "/api/onboarding").andExpect(jsonPath("$.passo").value("pronto"));
        // a mesma loja não vira outra: a equipe criada só existe na loja do Host
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador = 'zeferino' and loja_id <> ?::uuid", Integer.class, LOJA_OFFBOX));
    }

    @Test
    void equipeValidaTamanhoENome() throws Exception {
        abrirAssistente(LOJA_OFFBOX);
        String t = token(OFFBOX, "proprietario");
        enviar(OFFBOX, t, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"  \"}]}").andExpect(status().isBadRequest());
        StringBuilder muitos = new StringBuilder("{\"pessoas\":[");
        for (int i = 0; i < 11; i++) muitos.append(i == 0 ? "" : ",").append("{\"nome\":\"Zulmira").append(i).append("\"}");
        enviar(OFFBOX, t, "/api/onboarding/equipe", muitos.append("]}").toString()).andExpect(status().isBadRequest());
        enviar(OFFBOX, t, "/api/onboarding/equipe", "{}").andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador like 'zulmira%'", Integer.class));
        enviar(OFFBOX, t, "/api/onboarding/equipe", "{\"pessoas\":[]}").andExpect(status().isOk()); // pular
    }

    @Test
    void concluirFechaOAssistenteEDepoisNadaEscreve() throws Exception {
        abrirAssistente(LOJA_DALFORNO);
        String t = token(DALFORNO, "alan");
        enviar(DALFORNO, t, "/api/onboarding/concluir", "{}").andExpect(status().isOk()).andExpect(jsonPath("$.concluido").value(true));
        enviar(DALFORNO, t, "/api/onboarding/concluir", "{}").andExpect(status().isOk()); // repetir é inofensivo
        pegar(DALFORNO, t, "/api/onboarding").andExpect(jsonPath("$.concluido").value(true)).andExpect(jsonPath("$.passo").value("pronto"));
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"}]}").andExpect(status().isConflict());
        enviar(DALFORNO, t, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Zeferino\"}]}").andExpect(status().isConflict());
        assertEquals(0, jdbc.queryForObject("select count(*) from servico", Integer.class));
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("alan", "1234")))
                .andExpect(jsonPath("$.onboardingPendente").value(false));
    }

    @Test
    void assistenteDeUmaLojaNaoMexeNaOutra() throws Exception {
        abrirAssistente(LOJA_DALFORNO);
        String alan = token(DALFORNO, "alan");
        // Offbox não tem linha: o dono do Dalforno (token) não consegue usar o assistente nela, e o dela segue sem aplicar
        pegar(OFFBOX, alan, "/api/onboarding").andExpect(status().isForbidden());
        enviar(DALFORNO, alan, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"}]}").andExpect(status().isOk());
        assertEquals(0, jdbc.queryForObject("select count(*) from servico where loja_id = ?::uuid", Integer.class, LOJA_OFFBOX));
        pegar(OFFBOX, token(OFFBOX, "proprietario"), "/api/onboarding").andExpect(status().isNotFound());
    }

    @Test
    void donoQueTrocaASenhaTemporariaAvancaOPassoDeSenha() throws Exception {
        jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, deve_trocar_senha) values (?::uuid, 'teste-novo', 'Novo', 'dono', ?, true)",
                LOJA_OFFBOX, encoder.encode("Temp0rariaFORTE9"));
        abrirAssistente(LOJA_OFFBOX);
        String json = mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-novo", "Temp0rariaFORTE9")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String temporario = corpoSessao(json, "token");
        // com o token de senha temporária, o assistente ainda não abre
        pegar(OFFBOX, temporario, "/api/onboarding").andExpect(status().isForbidden());
        assertEquals("senha", jdbc.queryForObject("select passo from onboarding", String.class));
        String depois = mvc.perform(put("/api/usuarios/me/senha").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(temporario))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"senhaAtual\":\"Temp0rariaFORTE9\",\"nova\":\"NovaSenhaForte#2026\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals("servicos", jdbc.queryForObject("select passo from onboarding", String.class));
        pegar(OFFBOX, corpoSessao(depois, "token"), "/api/onboarding").andExpect(status().isOk()).andExpect(jsonPath("$.passo").value("servicos"));
    }

    @Test
    void profissionalQueTrocaASenhaNaoAvancaOAssistenteDoDono() throws Exception {
        jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, deve_trocar_senha) values (?::uuid, 'teste-prof', 'Prof', 'profissional', ?, true)",
                LOJA_OFFBOX, encoder.encode("Temp0rariaFORTE9"));
        abrirAssistente(LOJA_OFFBOX);
        String json = mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-prof", "Temp0rariaFORTE9")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mvc.perform(put("/api/usuarios/me/senha").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(corpoSessao(json, "token")))
                .contentType(MediaType.APPLICATION_JSON).content("{\"senhaAtual\":\"Temp0rariaFORTE9\",\"nova\":\"NovaSenhaForte#2026\"}")).andExpect(status().isOk());
        assertEquals("senha", jdbc.queryForObject("select passo from onboarding", String.class));
    }
}
