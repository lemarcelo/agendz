package br.com.agendz.interno;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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

/** A3: rotas internas do Admin da plataforma (chave, criar loja, equipe, regras aplicadas pela loja, suspensão = 402). Usa uma loja própria, apagada no fim. */
class PlataformaTest extends BaseApi {

    private static final String CHAVE = "chave-interna-so-para-teste-0123456789";
    private static final String SLUG = "lojateste";
    private static final String HOST = SLUG + ".agendz.io";
    private static final String BASE = "/interno/plataforma/lojas";

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void limpar() {
        jdbc.update("delete from loja_regra_plataforma where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from cliente where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from box where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from onboarding where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from usuario where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from loja where slug = ?", SLUG);
    }

    private static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem " + nome + ": " + json);
        return m.group(1);
    }

    private String criarLoja(String tipo) throws Exception {
        return mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"" + SLUG + "\",\"nome\":\"Loja de Teste\",\"tipo\":\"" + tipo + "\",\"donoUsuario\":\"dona\",\"donoNome\":\"Dona Teste\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    private static final String SENHA_DEFINITIVA = "SenhaDefinitiva2026";

    /** Entra com a senha temporária, troca por uma definitiva (a temporária só serve para isso) e devolve o token já liberado. */
    private String tokenDaDona(String senha) throws Exception {
        String json = mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senha)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String troca = mvc.perform(put("/api/usuarios/me/senha").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(campo(json, "token")))
                .contentType(MediaType.APPLICATION_JSON).content("{\"senhaAtual\":\"" + senha + "\",\"nova\":\"" + SENHA_DEFINITIVA + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return campo(troca, "token");
    }

    @Test
    void semChaveOuComChaveErradaNadaFunciona() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isForbidden());
        mvc.perform(get(BASE).header("X-Interno-Chave", "errada-errada-errada")).andExpect(status().isForbidden());
        mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/offbox/usuarios")).andExpect(status().isForbidden());
        mvc.perform(put(BASE + "/offbox/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"suspenso\"}")).andExpect(status().isForbidden());
        assertEquals(0, jdbc.queryForObject("select count(*) from loja where slug = ?", Integer.class, SLUG));
    }

    @Test
    void listaAsLojasSoComContagens() throws Exception {
        mvc.perform(get(BASE).header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='offbox')].status").value(hasItem("ativo")))
                .andExpect(jsonPath("$[?(@.slug=='offbox')].usuarios").value(hasItem(greaterThan(0))))
                .andExpect(jsonPath("$[0].nome").exists()).andExpect(jsonPath("$[0].cpf").doesNotExist()).andExpect(jsonPath("$[0].clientes").doesNotExist());
    }

    @Test
    void criaLojaComDonoESuporteESenhaTemporariaEntraETroca() throws Exception {
        String json = criarLoja("barbearia");
        String senha = campo(json, "senhaTemporaria");
        assertNotNull(campo(json, "suporteSenhaTemporaria"));
        // dono entra com a temporária e é obrigado a trocar
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senha)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true)).andExpect(jsonPath("$.papel").value("dono"));
        // a lista não mostra o suporte; mostra o dono
        mvc.perform(get(BASE + "/" + SLUG + "/usuarios").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].usuario").value(hasItem("dona"))).andExpect(jsonPath("$[*].usuario").value(not(hasItem("suporte"))))
                .andExpect(jsonPath("$[0].senha").doesNotExist()).andExpect(jsonPath("$[0].senhaHash").doesNotExist());
        // o endereço já existe, nome reservado, slug ruim e tipo desconhecido são recusados
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"" + SLUG + "\",\"nome\":\"Outra\",\"tipo\":\"barbearia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isConflict());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"admin\",\"nome\":\"A\",\"tipo\":\"barbearia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"Ruim_Slug\",\"nome\":\"A\",\"tipo\":\"barbearia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"outra-loja\",\"nome\":\"A\",\"tipo\":\"academia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"outra-loja\",\"nome\":\"A\",\"tipo\":\"barbearia\",\"donoUsuario\":\"suporte\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from loja where slug = 'outra-loja'", Integer.class));
    }

    @Test
    void redefinirSenhaEAtivarDesativarComProtecaoDoUltimoDono() throws Exception {
        String senha = campo(criarLoja("barbearia"), "senhaTemporaria");
        String dono = tokenDaDona(senha);
        String lista = mvc.perform(get(BASE + "/" + SLUG + "/usuarios").header("X-Interno-Chave", CHAVE)).andReturn().getResponse().getContentAsString();
        String idDona = campo(lista, "id");
        // a loja não consegue ficar sem proprietário ativo
        mvc.perform(put(BASE + "/" + SLUG + "/usuarios/" + idDona + "/ativo").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"ativo\":false}"))
                .andExpect(status().isConflict());
        // nova senha: aparece uma vez, a antiga deixa de valer e a troca volta a ser obrigatória
        String nova = mvc.perform(post(BASE + "/" + SLUG + "/usuarios/" + idDona + "/senha").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario").value("dona")).andReturn().getResponse().getContentAsString();
        String senhaNova = campo(nova, "senhaTemporaria");
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senha))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senhaNova)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true));
        // usuário de outra loja ou id que não existe = 404; suporte nunca é mexido aqui
        mvc.perform(post(BASE + "/offbox/usuarios/" + idDona + "/senha").header("X-Interno-Chave", CHAVE)).andExpect(status().isNotFound());
        String idSuporte = jdbc.queryForObject("select id::text from usuario where identificador = 'suporte' and loja_id = (select id from loja where slug = ?)", String.class, SLUG);
        mvc.perform(post(BASE + "/" + SLUG + "/usuarios/" + idSuporte + "/senha").header("X-Interno-Chave", CHAVE)).andExpect(status().isNotFound());
        mvc.perform(put(BASE + "/" + SLUG + "/usuarios/" + idSuporte + "/ativo").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"ativo\":false}")).andExpect(status().isNotFound());
        assertNotNull(dono);
    }

    @Test
    void limiteDeUsuariosECamposObrigatoriosSaoAplicadosPelaLoja() throws Exception {
        String senha = campo(criarLoja("barbearia"), "senhaTemporaria");
        String dono = tokenDaDona(senha);
        mvc.perform(get(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk()).andExpect(jsonPath("$.mensagensAtivas").value(true))
                .andExpect(jsonPath("$.limiteUsuarios").doesNotExist());
        // entrada ruim
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":0}")).andExpect(status().isBadRequest());
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"cadastroObrigatorios\":[\"senha\"]}")).andExpect(status().isBadRequest());
        // 1 usuário: o dono já ocupa a vaga (o suporte não conta)
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":1,\"cadastroObrigatorios\":[\"cpf\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.limiteUsuarios").value(1)).andExpect(jsonPath("$.cadastroObrigatorios[0]").value("cpf"));
        mvc.perform(post("/api/usuarios").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Fulano Dois\",\"apelido\":\"Fulano\",\"papel\":\"profissional\"}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("limite")));
        // CPF obrigatório no cadastro de cliente; com CPF válido passa
        mvc.perform(post("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Maria Silva\",\"telefone\":\"(53) 99900-0001\"}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("CPF")));
        mvc.perform(post("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Maria Silva\",\"telefone\":\"(53) 99900-0001\",\"cpf\":\"529.982.247-25\"}")).andExpect(status().isCreated());
        // ampliar o limite libera
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":5}")).andExpect(status().isOk());
        mvc.perform(post("/api/usuarios").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Fulano Dois\",\"apelido\":\"Fulano\",\"papel\":\"profissional\"}")).andExpect(status().isCreated());
    }

    @Test
    void lojaSuspensaDa402MasDeixaEntrarEAbrirAPaginaDaLoja() throws Exception {
        String senha = campo(criarLoja("barbearia"), "senhaTemporaria");
        String dono = tokenDaDona(senha);
        mvc.perform(get("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk());
        mvc.perform(put(BASE + "/" + SLUG + "/status").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"inventado\"}")).andExpect(status().isBadRequest());
        mvc.perform(put(BASE + "/" + SLUG + "/status").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"suspenso\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("suspenso"));
        mvc.perform(get("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("suspenso")));
        mvc.perform(get("/api/publico/agendar").with(host(HOST))).andExpect(status().isPaymentRequired());
        // entrar e a identidade da loja continuam (a tela de pagamento e o suporte precisam)
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", SENHA_DEFINITIVA))).andExpect(status().isOk());
        mvc.perform(get("/api/publico/loja").with(host(HOST))).andExpect(status().isOk());
        // a lista do Admin mostra a situação; reativar devolve a loja
        mvc.perform(get(BASE).header("X-Interno-Chave", CHAVE)).andExpect(jsonPath("$[?(@.slug=='" + SLUG + "')].status").value(hasItem("suspenso")));
        mvc.perform(put(BASE + "/" + SLUG + "/status").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ativo\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk());
    }
}
