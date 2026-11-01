package br.com.agendz.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** reCAPTCHA do login: depois de 5 senhas erradas seguidas a senha sozinha não basta (428); só com a prova válida a tentativa segue. */
class CaptchaLoginTest extends BaseApi {

    @Autowired
    private Recaptcha recaptcha;

    @BeforeEach
    void ligar() {
        recaptcha.ligarParaTeste("chave-publica-de-teste", "prova-boa"::equals);
    }

    @AfterEach
    void desligar() {
        recaptcha.desligarTeste("");
    }

    private ResultActions entrar(String login, String senha, String captcha) throws Exception {
        String corpo = captcha == null ? corpoLogin(login, senha)
                : "{\"identificador\":\"" + login + "\",\"senha\":\"" + senha + "\",\"captcha\":\"" + captcha + "\"}";
        return mvc.perform(post("/api/auth/login").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    @Test
    void ateCincoErrosSoComSenhaEDepoisPedeCaptcha() throws Exception {
        // só este teste usa apex/captcha-fulano (o limite é em memória e compartilhado entre testes)
        for (int i = 0; i < 5; i++) entrar("captcha-fulano", "errada" + i, null).andExpect(status().isUnauthorized());
        entrar("captcha-fulano", "errada", null).andExpect(status().isPreconditionRequired())
                .andExpect(jsonPath("$.mensagem").value("Confirme que você não é um robô para continuar."));
        entrar("captcha-fulano", "errada", "prova-ruim").andExpect(status().isPreconditionRequired());
        entrar("captcha-fulano", "errada", "prova-boa").andExpect(status().isUnauthorized()); // prova válida: a senha é conferida e erra
    }

    @Test
    void comProvaValidaASenhaCertaEntraEZeraOContador() throws Exception {
        for (int i = 0; i < 5; i++) entrar("marcelo", "errada" + i, null).andExpect(status().isUnauthorized());
        entrar("marcelo", "1234", null).andExpect(status().isPreconditionRequired());   // senha certa sem prova não entra
        entrar("marcelo", "1234", "prova-ruim").andExpect(status().isPreconditionRequired());
        entrar("marcelo", "1234", "prova-boa").andExpect(status().isOk());
        entrar("marcelo", "1234", null).andExpect(status().isOk());                      // o contador voltou a zero
    }

    @Test
    void recusaDoCaptchaNaoContaComoErroDeSenha() throws Exception {
        for (int i = 0; i < 5; i++) entrar("captcha-sicrano", "errada" + i, null).andExpect(status().isUnauthorized());
        for (int i = 0; i < 20; i++) entrar("captcha-sicrano", "errada", null).andExpect(status().isPreconditionRequired()); // nunca vira 429 sozinho
    }

    @Test
    void comCaptchaOBloqueioDuroSoVemNoDecimoSegundoErro() throws Exception {
        for (int i = 0; i < 5; i++) entrar("captcha-beltrano", "errada" + i, null).andExpect(status().isUnauthorized());
        for (int i = 5; i < 12; i++) entrar("captcha-beltrano", "errada" + i, "prova-boa").andExpect(status().isUnauthorized());
        entrar("captcha-beltrano", "errada", "prova-boa").andExpect(status().isTooManyRequests());
    }

    @Test
    void lojaPublicaMostraAChaveDoSiteSoQuandoLigado() throws Exception {
        mvc.perform(get("/api/publico/loja").with(host(APEX))).andExpect(status().isOk()).andExpect(jsonPath("$.captchaChave").value("chave-publica-de-teste"));
        recaptcha.desligarTeste("");
        mvc.perform(get("/api/publico/loja").with(host(APEX))).andExpect(status().isOk()).andExpect(jsonPath("$.captchaChave").doesNotExist());
    }

    @Test
    void semAsChavesNadaMudaECampoCaptchaDoCorpoEhIgnorado() throws Exception {
        recaptcha.desligarTeste("");
        entrar("captcha-ciclano", "errada", "qualquer").andExpect(status().isUnauthorized());
    }
}
