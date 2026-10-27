package br.com.agendz.tenant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseIntegracao;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Gate 3 (c) e (d) + domínio próprio + pergunta do Caddy. O Host decide a loja; nada escrito pelo cliente decide. */
class LojaPorEnderecoTest extends BaseIntegracao {

    @Autowired
    MockMvc mvc;

    private static RequestPostProcessor host(String h) {
        return r -> {
            r.setServerName(h);
            return r;
        };
    }

    @Test
    void subdominioDevolveTipoEDadosDaLoja() throws Exception {
        mvc.perform(get("/api/publico/loja").with(host("dalforno.agendz.io")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("dalforno"))
                .andExpect(jsonPath("$.tipo").value("barbearia"));
        mvc.perform(get("/api/publico/loja").with(host("apex.agendz.io")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tipo").value("estetica_automotiva"));
    }

    @Test
    void hostDesconhecidoOuEngenhosoDa404() throws Exception {
        for (String h : new String[] {"agendz.io", "naoexiste.agendz.io", "a.b.agendz.io",
                "dalforno.agendz.io.evil.com", "www.agendz.io", "outro.com"}) {
            mvc.perform(get("/api/publico/loja").with(host(h)))
                    .andExpect(status().isNotFound());
        }
    }

    @Test
    void xForwardedHostForjadoEIgnorado() throws Exception {
        mvc.perform(get("/api/publico/loja").with(host("dalforno.agendz.io")).header("X-Forwarded-Host", "apex.agendz.io"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("dalforno"));
    }

    @Test
    void queryLojaNaoVale_emProducao() throws Exception {
        mvc.perform(get("/api/publico/loja").param("loja", "dalforno").with(host("agendz.io")))
                .andExpect(status().isNotFound());
    }

    @Test
    void dominioProprioSoValeVerificado() throws Exception {
        mvc.perform(get("/api/publico/loja").with(host("agenda.apexestetica.com.br")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("apex"));
        mvc.perform(get("/api/publico/loja").with(host("agenda.barbeariadalforno.com.br")))
                .andExpect(status().isNotFound());
    }

    @Test
    void caddyPerguntaAntesDeEmitirCertificado() throws Exception {
        String[][] casos = {
                {"dalforno.agendz.io", "200"}, {"agenda.apexestetica.com.br", "200"},
                {"naoexiste.agendz.io", "404"}, {"agenda.barbeariadalforno.com.br", "404"},
                {"a.b.agendz.io", "404"}, {"evil.com", "404"}};
        for (String[] c : casos) {
            mvc.perform(get("/interno/dominio-permitido").param("domain", c[0]))
                    .andExpect(status().is(Integer.parseInt(c[1])));
        }
    }

    @Test
    void saudeNaoDependeDeLoja() throws Exception {
        mvc.perform(get("/actuator/health").with(host("localhost")))
                .andExpect(status().isOk());
    }
}
