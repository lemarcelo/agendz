package br.com.agendz.auth;

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
import org.springframework.security.crypto.password.PasswordEncoder;

/** Primeiro acesso: senha temporária (token só troca a senha), troca com regras, limite de tentativas e aviso do assistente de início. */
class PrimeiroAcessoTest extends BaseApi {

    private static final String LOJA_OFFBOX = "00000000-0000-0000-0000-0000000000b2";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String TEMPORARIA = "Temp0rariaFORTE9";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PasswordEncoder encoder;

    @BeforeEach
    void usuarioNovo() {
        limpar();
        jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, deve_trocar_senha) values (?::uuid, 'teste-kiko', 'Kiko', 'dono', ?, true)",
                LOJA_OFFBOX, encoder.encode(TEMPORARIA));
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from usuario where identificador like 'teste-%'");
        jdbc.update("delete from onboarding");
    }

    private String login(String host, String login, String senha) throws Exception {
        return mvc.perform(post("/api/auth/login").with(host(host)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(login, senha)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private String token(String json) {
        Matcher m = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException(json);
        return m.group(1);
    }

    private org.springframework.test.web.servlet.ResultActions trocar(String host, String token, String atual, String nova) throws Exception {
        return mvc.perform(put("/api/usuarios/me/senha").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"senhaAtual\":\"" + atual + "\",\"nova\":\"" + nova + "\"}"));
    }

    private org.springframework.test.web.servlet.ResultActions trocarComUsuario(String host, String token, String atual, String nova, String usuario) throws Exception {
        return mvc.perform(put("/api/usuarios/me/senha").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"senhaAtual\":\"" + atual + "\",\"nova\":\"" + nova + "\",\"usuario\":\"" + usuario + "\"}"));
    }

    @Test
    void donoEscolheOProprioUsuarioNaTrocaEEntraComOsDadosNovos() throws Exception {
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        trocarComUsuario(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026", "  Teste-Novo.Kiko ").andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(false));
        // o usuário antigo e a senha temporária deixam de valer; o novo (em minúsculas) entra
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-kiko", "NovaSenhaForte#2026")))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-novo.kiko", TEMPORARIA)))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-novo.kiko", "NovaSenhaForte#2026")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(false));
    }

    @Test
    void usuarioEscolhidoPrecisaSerValidoEUnicoNaLojaMasPodeRepetirEmOutra() throws Exception {
        jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash) values (?::uuid, 'teste-outro', 'Outro', 'profissional', ?)", LOJA_OFFBOX, encoder.encode("QualquerSenha123"));
        jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash) values (?::uuid, 'teste-dup', 'Dup', 'profissional', ?)", LOJA_DALFORNO, encoder.encode("QualquerSenha123"));
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        trocarComUsuario(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026", "teste-outro").andExpect(status().isConflict());   // já existe nesta loja
        trocarComUsuario(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026", "a").andExpect(status().isBadRequest());           // curto
        trocarComUsuario(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026", "com espaco").andExpect(status().isBadRequest());  // caracteres inválidos
        trocarComUsuario(OFFBOX, t, "errada-errada", "NovaSenhaForte#2026", "teste-livre").andExpect(status().isBadRequest()); // senha atual errada
        login(OFFBOX, "teste-kiko", TEMPORARIA); // nada mudou
        // o mesmo login em outra loja é permitido (único só dentro da loja)
        trocarComUsuario(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026", "teste-dup").andExpect(status().isOk());
        login(OFFBOX, "teste-dup", "NovaSenhaForte#2026");
    }

    @Test
    void semUsuarioOLoginNaoMuda() throws Exception {
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        trocar(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026").andExpect(status().isOk());
        login(OFFBOX, "teste-kiko", "NovaSenhaForte#2026");
    }

    @Test
    void loginComSenhaTemporariaAvisaETokenSoServeParaTrocarASenha() throws Exception {
        String json = login(OFFBOX, "teste-kiko", TEMPORARIA);
        String t = token(json);
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-kiko", TEMPORARIA)))
                .andExpect(jsonPath("$.deveTrocarSenha").value(true)).andExpect(jsonPath("$.papel").value("dono"));
        for (String rota : new String[]{"/api/clientes", "/api/servicos", "/api/profissionais"}) {
            mvc.perform(get(rota).with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.codigo").value("trocar_senha"));
        }
        mvc.perform(post("/api/clientes").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"X\",\"telefone\":\"5553999000020\"}")).andExpect(status().isForbidden());
    }

    @Test
    void trocarComSucessoLiberaOTokenNovoEFechaAAntiga() throws Exception {
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        String resposta = trocar(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026")
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(false)).andReturn().getResponse().getContentAsString();
        String novo = token(resposta);
        mvc.perform(get("/api/clientes").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(novo))).andExpect(status().isOk());
        // a temporária não entra mais; a nova entra e já sem a marca
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-kiko", TEMPORARIA)))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-kiko", "NovaSenhaForte#2026")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(false));
    }

    @Test
    void regrasDaNovaSenha() throws Exception {
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        trocar(OFFBOX, t, "errada-errada", "NovaSenhaForte#2026").andExpect(status().isBadRequest());
        trocar(OFFBOX, t, TEMPORARIA, TEMPORARIA).andExpect(status().isBadRequest());   // igual à atual
        trocar(OFFBOX, t, TEMPORARIA, "curta").andExpect(status().isBadRequest());       // menos de 8
        // nada mudou: a temporária continua valendo
        login(OFFBOX, "teste-kiko", TEMPORARIA);
    }

    @Test
    void cincoErrosDaSenhaAtualBloqueiam() throws Exception {
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        for (int i = 0; i < 5; i++) trocar(OFFBOX, t, "errada-" + i, "NovaSenhaForte#2026").andExpect(status().isBadRequest());
        trocar(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026").andExpect(status().isTooManyRequests());
    }

    @Test
    void tokenTemporarioDeOutraLojaDa403() throws Exception {
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        trocar(DALFORNO, t, TEMPORARIA, "NovaSenhaForte#2026").andExpect(status().isForbidden());
        login(OFFBOX, "teste-kiko", TEMPORARIA); // continua valendo
    }

    @Test
    void trocarSemTokenDa401() throws Exception {
        mvc.perform(put("/api/usuarios/me/senha").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"senhaAtual\":\"x\",\"nova\":\"NovaSenhaForte#2026\"}")).andExpect(status().isUnauthorized());
    }

    @Test
    void primeiroAcessoDoDonoTrocaASenhaEJaEntraNoAssistenteComOUsuarioNovo() throws Exception {
        jdbc.update("insert into onboarding (loja_id) values (?::uuid)", LOJA_OFFBOX);
        String t = token(login(OFFBOX, "teste-kiko", TEMPORARIA));
        // a própria resposta da troca já abre o assistente (sem passar pelo login de novo), no passo de serviços
        String resposta = trocarComUsuario(OFFBOX, t, TEMPORARIA, "NovaSenhaForte#2026", "Teste-Novo.Kiko").andExpect(status().isOk())
                .andExpect(jsonPath("$.deveTrocarSenha").value(false)).andExpect(jsonPath("$.onboardingPendente").value(true)).andReturn().getResponse().getContentAsString();
        mvc.perform(get("/api/onboarding").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(token(resposta)))).andExpect(status().isOk())
                .andExpect(jsonPath("$.passo").value("servicos")).andExpect(jsonPath("$.concluido").value(false));
        // entrando depois com o usuário escolhido, o assistente continua pendente
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-novo.kiko", "NovaSenhaForte#2026")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.onboardingPendente").value(true));
    }

    @Test
    void onboardingPendenteSoAparecePraDonoEQuandoHaLinhaAberta() throws Exception {
        // sem linha de onboarding: não se aplica
        String json = login(DALFORNO, "alan", "1234");
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("alan", "1234")))
                .andExpect(jsonPath("$.onboardingPendente").value(false));
        jdbc.update("insert into onboarding (loja_id) values (?::uuid)", LOJA_DALFORNO);
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("alan", "1234")))
                .andExpect(jsonPath("$.onboardingPendente").value(true));
        // a outra loja não é afetada
        mvc.perform(post("/api/auth/login").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("davi", "1234")))
                .andExpect(jsonPath("$.onboardingPendente").value(false));
        // profissional nunca vê o aviso
        mvc.perform(post("/api/auth/login").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("pablo", "1234")))
                .andExpect(jsonPath("$.onboardingPendente").value(false));
        jdbc.update("update onboarding set concluido_em = now()");
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("alan", "1234")))
                .andExpect(jsonPath("$.onboardingPendente").value(false));
    }

    /** O script deploy/provisionar-loja.sh grava o hash com pgcrypto (`crypt` + `gen_salt('bf')`): o login do Spring precisa aceitá-lo. */
    @Test
    void hashGeradoPeloPgcryptoDoProvisionamentoEhAceitoNoLogin() throws Exception {
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto");
        jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, deve_trocar_senha) "
                + "values (?::uuid, 'teste-pg', 'Pg', 'dono', crypt(?, gen_salt('bf', 10)), true)", LOJA_OFFBOX, "SenhaDoScriptXyz7");
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-pg", "SenhaDoScriptXyz7")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true));
        mvc.perform(post("/api/auth/login").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("teste-pg", "outra-senha-qualquer")))
                .andExpect(status().isUnauthorized());
    }
}
