package br.com.agendz;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Ajudantes: o Host que decide a loja e o login que devolve o token. */
public abstract class BaseApi extends BaseIntegracao {

    protected static final String APEX = "apex.agendz.io";
    protected static final String DALFORNO = "dalforno.agendz.io";
    protected static final String OFFBOX = "offbox.agendz.io";

    @Autowired
    protected MockMvc mvc;

    protected static RequestPostProcessor host(String h) {
        return r -> {
            r.setServerName(h);
            return r;
        };
    }

    protected String corpoLogin(String identificador, String senha) {
        return "{\"identificador\":\"" + identificador + "\",\"senha\":\"" + senha + "\"}";
    }

    /** Faz login (senha 1234 das lojas de desenvolvimento) e devolve o token. */
    protected String token(String hostDaLoja, String identificador) throws Exception {
        String json = mvc.perform(post("/api/auth/login").with(host(hostDaLoja))
                        .contentType(MediaType.APPLICATION_JSON).content(corpoLogin(identificador, "1234")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("login sem token: " + json);
        return m.group(1);
    }

    protected static String bearer(String token) {
        return "Bearer " + token;
    }
}
