package br.com.agendz.interno;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.erro.ErroDeNegocio;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** A5: domínio próprio com prova por TXT (DNS falso). Só vale depois de verificado; o Caddy só emite certificado para verificado. */
@Import(DominiosTest.DnsFalso.class)
class DominiosTest extends BaseApi {

    private static final String CHAVE = "chave-interna-so-para-teste-0123456789";
    private static final String SLUG = "lojadom";
    private static final String BASE = "/interno/plataforma/lojas";
    private static final String HOST_PROPRIO = "agenda.lojadom.com.br";
    static final Map<String, List<String>> TXT = new ConcurrentHashMap<>();
    static volatile boolean dnsForaDoAr = false;

    @TestConfiguration
    static class DnsFalso {
        @Bean
        @Primary
        ConsultaTxt consultaTxtFalsa() {
            return nome -> {
                if (dnsForaDoAr) throw new ErroDeNegocio(HttpStatus.SERVICE_UNAVAILABLE, "Não foi possível consultar o DNS agora. Tente de novo em instantes.");
                return TXT.getOrDefault(nome, List.of());
            };
        }
    }

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void limpar() {
        TXT.clear();
        dnsForaDoAr = false;
        jdbc.update("delete from loja_dominio where host like '%lojadom%' or host like '%outradom%'");
        for (String t : new String[] {"loja_regra_plataforma", "cliente", "box", "onboarding", "usuario"}) {
            jdbc.update("delete from " + t + " where loja_id in (select id from loja where slug in (?, 'outradom'))", SLUG);
        }
        jdbc.update("delete from loja where slug in (?, 'outradom')", SLUG);
    }

    private void criarLoja(String slug) throws Exception {
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"" + slug + "\",\"nome\":\"Loja Dom\",\"tipo\":\"barbearia\",\"donoUsuario\":\"dona\",\"donoNome\":\"Dona\"}")).andExpect(status().isCreated());
    }

    private String cadastrar(String slug, String host) throws Exception {
        return mvc.perform(post(BASE + "/" + slug + "/dominios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"host\":\"" + host + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    private static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem " + nome + ": " + json);
        return m.group(1);
    }

    private int perguntaDoCaddy(String host) throws Exception {
        return mvc.perform(get("/interno/dominio-permitido").param("domain", host)).andReturn().getResponse().getStatus();
    }

    @Test
    void semAChaveNadaFunciona() throws Exception {
        mvc.perform(get(BASE + "/offbox/dominios")).andExpect(status().isForbidden());
        mvc.perform(post(BASE + "/offbox/dominios").contentType(MediaType.APPLICATION_JSON).content("{\"host\":\"agenda.x.com.br\"}")).andExpect(status().isForbidden());
        mvc.perform(post(BASE + "/offbox/dominios/verificar").param("host", "agenda.x.com.br")).andExpect(status().isForbidden());
        mvc.perform(delete(BASE + "/offbox/dominios").param("host", "agenda.x.com.br")).andExpect(status().isForbidden());
    }

    @Test
    void soValeDepoisDeProvarOTxtENuncaAntes() throws Exception {
        criarLoja(SLUG);
        String json = cadastrar(SLUG, "  Agenda.LojaDom.com.br. ");
        assertEquals(HOST_PROPRIO, campo(json, "host"));
        assertEquals("_agendz-verificacao." + HOST_PROPRIO, campo(json, "txtNome"));
        String valor = campo(json, "txtValor");
        assertEquals(true, valor.startsWith("agendz-verificacao=") && valor.length() > 30);
        mvc.perform(get(BASE + "/" + SLUG + "/dominios").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk()).andExpect(jsonPath("$[0].verificado").value(false));
        // cadastrado mas NÃO verificado: o Caddy não emite certificado e o endereço não resolve para a loja
        assertEquals(404, perguntaDoCaddy(HOST_PROPRIO));
        // sem registro no DNS, ou com valor de outro token: continua não verificado
        mvc.perform(post(BASE + "/" + SLUG + "/dominios/verificar").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(status().isOk())
                .andExpect(jsonPath("$.acabouDeVerificar").value(false)).andExpect(jsonPath("$.dominio.verificado").value(false));
        TXT.put("_agendz-verificacao." + HOST_PROPRIO, List.of("agendz-verificacao=outro-token", "v=spf1 -all"));
        mvc.perform(post(BASE + "/" + SLUG + "/dominios/verificar").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(jsonPath("$.dominio.verificado").value(false));
        assertEquals(404, perguntaDoCaddy(HOST_PROPRIO));
        // registro certo: verifica
        TXT.put("_agendz-verificacao." + HOST_PROPRIO, List.of("v=spf1 -all", valor));
        mvc.perform(post(BASE + "/" + SLUG + "/dominios/verificar").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(status().isOk())
                .andExpect(jsonPath("$.acabouDeVerificar").value(true)).andExpect(jsonPath("$.dominio.verificado").value(true));
        assertEquals(200, perguntaDoCaddy(HOST_PROPRIO));
        // de novo: já verificado, não repete
        mvc.perform(post(BASE + "/" + SLUG + "/dominios/verificar").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(jsonPath("$.acabouDeVerificar").value(false))
                .andExpect(jsonPath("$.dominio.verificado").value(true));
        // o endereço agora resolve para a loja
        mvc.perform(get("/api/publico/loja").with(host(HOST_PROPRIO))).andExpect(status().isOk());
        // remover tira o certificado e o endereço, a loja continua
        mvc.perform(delete(BASE + "/" + SLUG + "/dominios").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(status().isNoContent());
        assertEquals(404, perguntaDoCaddy(HOST_PROPRIO));
        assertEquals(1, jdbc.queryForObject("select count(*) from loja where slug = ?", Integer.class, SLUG));
        mvc.perform(delete(BASE + "/" + SLUG + "/dominios").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(status().isNotFound());
    }

    @Test
    void enderecosRuinsOuDaPlataformaSaoRecusados() throws Exception {
        criarLoja(SLUG);
        for (String ruim : new String[] {"https://agenda.lojadom.com.br", "agenda.lojadom.com.br/x", "agenda.lojadom.com.br:8080", "lojadom", "lojadom.agendz.io", "agendz.io", "localhost", "10.0.0.1", "a b.com.br", "", "-x.lojadom.com.br"}) {
            mvc.perform(post(BASE + "/" + SLUG + "/dominios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"host\":\"" + ruim + "\"}"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post(BASE + "/" + SLUG + "/dominios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from loja_dominio where loja_id = (select id from loja where slug = ?)", Integer.class, SLUG));
    }

    @Test
    void mesmoEnderecoNaoVaiParaDuasLojasNemPassaDeTresPorLoja() throws Exception {
        criarLoja(SLUG);
        cadastrar(SLUG, HOST_PROPRIO);
        mvc.perform(post(BASE + "/" + SLUG + "/dominios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"host\":\"" + HOST_PROPRIO + "\"}")).andExpect(status().isConflict());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"outradom\",\"nome\":\"Outra\",\"tipo\":\"barbearia\",\"donoUsuario\":\"dona\",\"donoNome\":\"Dona\"}")).andExpect(status().isCreated());
        mvc.perform(post(BASE + "/outradom/dominios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"host\":\"" + HOST_PROPRIO + "\"}")).andExpect(status().isConflict());
        // a outra loja não verifica nem remove o domínio da primeira
        mvc.perform(post(BASE + "/outradom/dominios/verificar").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(status().isNotFound());
        mvc.perform(delete(BASE + "/outradom/dominios").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(status().isNotFound());
        cadastrar(SLUG, "a.lojadom.com.br");
        cadastrar(SLUG, "b.lojadom.com.br");
        mvc.perform(post(BASE + "/" + SLUG + "/dominios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"host\":\"c.lojadom.com.br\"}")).andExpect(status().isConflict());
        mvc.perform(get(BASE + "/inexistente/dominios").header("X-Interno-Chave", CHAVE)).andExpect(status().isNotFound());
    }

    @Test
    void dnsForaDoArNaoVerificaENaoVazaDetalhe() throws Exception {
        criarLoja(SLUG);
        cadastrar(SLUG, HOST_PROPRIO);
        dnsForaDoAr = true;
        mvc.perform(post(BASE + "/" + SLUG + "/dominios/verificar").header("X-Interno-Chave", CHAVE).param("host", HOST_PROPRIO)).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.mensagem").value("Não foi possível consultar o DNS agora. Tente de novo em instantes."));
        assertEquals(false, jdbc.queryForObject("select verificado from loja_dominio where host = ?", Boolean.class, HOST_PROPRIO));
    }
}
