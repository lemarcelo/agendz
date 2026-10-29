package br.com.agendz.configuracao;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** Endereço e localização da loja: validação, interruptores desligados de fábrica, o que cada perfil lê, o que a página do cliente mostra e isolamento entre lojas. */
class LocalDaLojaTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    br.com.agendz.publico.LimitePublico limitePublico;

    @BeforeEach
    @AfterEach
    void limpar() {
        limitePublico.reiniciar();
        jdbc.update("delete from configuracao_loja");
    }

    private static final String COMPLETO = "{\"logradouro\":\"Rua das Flores\",\"numero\":\"120\",\"complemento\":\"Sala 2\",\"bairro\":\"Centro\",\"cidade\":\"Curitiba\",\"uf\":\"pr\",\"cep\":\"80010-000\","
            + "\"latitude\":-25.428356,\"longitude\":-49.273251,\"enderecoNoLink\":true,\"localizacaoNoWhatsapp\":true}";

    private void gravar(String host, String token, String corpo, int esperado) throws Exception {
        mvc.perform(put("/api/estabelecimento/local").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().is(esperado));
    }

    @Test
    void semConfiguracaoTudoVazioEInterruptoresDesligados() throws Exception {
        mvc.perform(get("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(token(DALFORNO, "alan"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enderecoNoLink").value(false)).andExpect(jsonPath("$.localizacaoNoWhatsapp").value(false))
                .andExpect(jsonPath("$.logradouro").doesNotExist());
    }

    @Test
    void donoGravaELeDeVolta() throws Exception {
        String t = token(DALFORNO, "alan");
        mvc.perform(put("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content(COMPLETO))
                .andExpect(status().isOk()).andExpect(jsonPath("$.uf").value("PR")).andExpect(jsonPath("$.cep").value("80010000"))
                .andExpect(jsonPath("$.enderecoTexto").value("Rua das Flores, 120 - Sala 2 - Centro - Curitiba/PR - CEP 80010-000"))
                .andExpect(jsonPath("$.localizacaoUrl").value("https://maps.google.com/?q=-25.428356,-49.273251"));
        mvc.perform(get("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(jsonPath("$.cidade").value("Curitiba")).andExpect(jsonPath("$.enderecoNoLink").value(true)).andExpect(jsonPath("$.localizacaoNoWhatsapp").value(true));
    }

    @Test
    void entradaInvalidaERecusadaComMensagem() throws Exception {
        String t = token(DALFORNO, "alan");
        String[][] casos = {
                {"{\"logradouro\":\"Rua A\"}", "Para guardar o endereço, informe pelo menos a rua e a cidade."},
                {"{\"cidade\":\"Curitiba\"}", "Para guardar o endereço, informe pelo menos a rua e a cidade."},
                {"{\"logradouro\":\"Rua A\",\"cidade\":\"X\",\"uf\":\"PRR\"}", "O estado pode ter até 2 letras."},
                {"{\"logradouro\":\"Rua A\",\"cidade\":\"X\",\"uf\":\"1A\"}", "O estado deve ter 2 letras (ex.: SP)."},
                {"{\"logradouro\":\"Rua A\",\"cidade\":\"X\",\"cep\":\"123\"}", "O CEP deve ter 8 números."},
                {"{\"latitude\":-25.4}", "Informe latitude e longitude juntas (ou deixe as duas vazias)."},
                {"{\"latitude\":95,\"longitude\":10}", "Localização inválida: latitude de -90 a 90 e longitude de -180 a 180."},
                {"{\"latitude\":10,\"longitude\":181}", "Localização inválida: latitude de -90 a 90 e longitude de -180 a 180."},
                {"{\"enderecoNoLink\":true}", "Informe o endereço (rua e cidade) para mostrá-lo no link de agendamento."},
                {"{\"localizacaoNoWhatsapp\":true}", "Informe a localização (latitude e longitude) para enviá-la no WhatsApp."},
        };
        for (String[] c : casos) {
            mvc.perform(put("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content(c[0]))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value(c[1]));
        }
        // nada foi gravado pelas tentativas recusadas
        mvc.perform(get("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t))).andExpect(jsonPath("$.logradouro").doesNotExist());
    }

    @Test
    void campoVazioApagaEDesligaTudoDeNovo() throws Exception {
        String t = token(DALFORNO, "alan");
        gravar(DALFORNO, t, COMPLETO, 200);
        mvc.perform(put("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.logradouro").doesNotExist()).andExpect(jsonPath("$.localizacaoUrl").doesNotExist())
                .andExpect(jsonPath("$.enderecoNoLink").value(false)).andExpect(jsonPath("$.localizacaoNoWhatsapp").value(false));
    }

    @Test
    void donoComOEnvioDesligadoNaoRecebeOLinkDoWhatsapp() throws Exception {
        String t = token(DALFORNO, "alan");
        gravar(DALFORNO, t, COMPLETO.replace("\"localizacaoNoWhatsapp\":true", "\"localizacaoNoWhatsapp\":false"), 200);
        mvc.perform(get("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(jsonPath("$.localizacaoUrl").value("https://maps.google.com/?q=-25.428356,-49.273251")).andExpect(jsonPath("$.localizacaoWhatsappUrl").doesNotExist());
    }

    @Test
    void quemSoUsaAAgendaVeApenasOLinkDoMapaComOEnvioLigado() throws Exception {
        String dono = token(APEX, "davi"), prof = token(APEX, "pablo");
        gravar(APEX, dono, COMPLETO.replace("\"localizacaoNoWhatsapp\":true", "\"localizacaoNoWhatsapp\":false"), 200);
        mvc.perform(get("/api/estabelecimento/local").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.localizacaoWhatsappUrl").doesNotExist()).andExpect(jsonPath("$.localizacaoUrl").doesNotExist()).andExpect(jsonPath("$.logradouro").doesNotExist()).andExpect(jsonPath("$.latitude").doesNotExist());
        gravar(APEX, dono, COMPLETO, 200);
        mvc.perform(get("/api/estabelecimento/local").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof)))
                .andExpect(jsonPath("$.localizacaoWhatsappUrl").value("https://maps.google.com/?q=-25.428356,-49.273251")).andExpect(jsonPath("$.localizacaoUrl").doesNotExist()).andExpect(jsonPath("$.logradouro").doesNotExist())
                .andExpect(jsonPath("$.cep").doesNotExist()).andExpect(jsonPath("$.latitude").doesNotExist());
        // quem não tem a seção estabelecimento não grava
        gravar(APEX, prof, COMPLETO, 403);
    }

    @Test
    void cadaLojaTemOSeuLocal() throws Exception {
        gravar(APEX, token(APEX, "davi"), COMPLETO, 200);
        mvc.perform(get("/api/estabelecimento/local").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(token(DALFORNO, "alan")))).andExpect(jsonPath("$.logradouro").doesNotExist());
    }

    @Test
    void paginaDoClienteSoMostraOEnderecoComOInterruptorLigado() throws Exception {
        String t = token(DALFORNO, "alan");
        gravar(DALFORNO, t, COMPLETO.replace("\"enderecoNoLink\":true", "\"enderecoNoLink\":false"), 200);
        mvc.perform(get("/api/publico/agendar").header("X-Forwarded-For", "10.9.9.9").with(host(DALFORNO))).andExpect(status().isOk()).andExpect(jsonPath("$.endereco").doesNotExist()).andExpect(jsonPath("$.mapaUrl").doesNotExist());
        gravar(DALFORNO, t, COMPLETO, 200);
        mvc.perform(get("/api/publico/agendar").header("X-Forwarded-For", "10.9.9.9").with(host(DALFORNO))).andExpect(jsonPath("$.endereco").value(containsString("Rua das Flores, 120")))
                .andExpect(jsonPath("$.mapaUrl").value("https://maps.google.com/?q=-25.428356,-49.273251"));
        // sem coordenadas, o mapa busca pelo endereço
        gravar(DALFORNO, t, "{\"logradouro\":\"Rua A\",\"cidade\":\"Curitiba\",\"enderecoNoLink\":true}", 200);
        mvc.perform(get("/api/publico/agendar").header("X-Forwarded-For", "10.9.9.9").with(host(DALFORNO))).andExpect(jsonPath("$.mapaUrl").value(containsString("https://www.google.com/maps/search/?api=1&query=Rua+A")));
    }
}
