package br.apex.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Base dos testes de integração. Sobe o Spring inteiro com PostgreSQL de verdade (Testcontainers), porque algumas garantias
 * (restrição de exclusão de horário, UNIQUE de crédito e de e2eid) só existem no banco.
 *
 * Pré-requisito do código de produção: o perfil "test" carrega o mesmo seed de src/services/seed.js
 * (u-davi dono, u-pablo e u-marcelo esteticistas, c-marcelo/c-igor/c-jon, s-lav-detalhada/s-lav-motor/s-higien-interna/s-lav-simples, senha "1234").
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("test")
@Import(ConfiguracaoDeTeste.class)
public abstract class IntegrationTestBase {

    @Container @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    public static final String SENHA = "1234";
    /** Telefone de c-marcelo no seed, como o WhatsApp entrega: código do país + DDD + número. */
    public static final String TEL_MARCELO = "5555997114020";
    /** Mesmo miolo do telefone de c-marcelo, só que sem o 55: é um número de OUTRO país (ex.: +51 Peru), não o DDD 55. */
    public static final String TEL_ESTRANGEIRO = "55997114020";

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected RelogioDeTeste relogio;
    @Autowired protected JdbcTemplate jdbc;

    @BeforeEach
    void reiniciarRelogio() {
        relogio.definir(Instant.parse("2026-10-11T12:00:00Z"));
    }

    // ---------- login e chamadas ----------

    protected String token(String apelido) throws Exception {
        MvcResult r = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("identificador", apelido, "senha", SENHA))))
                .andExpect(status().isOk()).andReturn();
        return json.readTree(r.getResponse().getContentAsString()).get("token").asText();
    }

    protected ResultActions chamar(HttpMethod metodo, String caminho, String token, Object corpo) throws Exception {
        MockHttpServletRequestBuilder b = request(metodo, caminho).contentType(MediaType.APPLICATION_JSON);
        if (token != null) b.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (corpo != null) b.content(corpo instanceof String s ? s : json.writeValueAsString(corpo));
        return mvc.perform(b);
    }

    /** Chamada da porta do WhatsApp: assinatura válida do webhook e o número do remetente vindo do canal (cabeçalho), nunca do corpo. */
    protected ResultActions doWhatsApp(HttpMethod metodo, String caminho, String remetente, Object corpo) throws Exception {
        String corpoJson = corpo == null ? "" : json.writeValueAsString(corpo);
        MockHttpServletRequestBuilder b = request(metodo, caminho).contentType(MediaType.APPLICATION_JSON)
                .header("X-Remetente-WhatsApp", remetente)
                .header("X-Hub-Signature-256", Assinaturas.hmacSha256("segredo-de-teste", corpoJson));
        if (corpo != null) b.content(corpoJson);
        return mvc.perform(b);
    }

    protected JsonNode corpo(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    // ---------- datas (sempre no fuso de São Paulo) ----------

    /** Instante de {@code diasAdiante} dias úteis (a Apex fecha aos domingos) à frente, na hora HH:mm. */
    protected Instant diaUtil(int diasAdiante, String hhmm) {
        ZonedDateTime base = relogio.agora().atZone(RelogioDeTeste.SAO_PAULO);
        LocalDate d = base.toLocalDate();
        int contados = 0;
        while (contados < diasAdiante) {
            d = d.plusDays(1);
            if (d.getDayOfWeek().getValue() != 7) contados++;
        }
        return ZonedDateTime.of(d, LocalTime.parse(hhmm), RelogioDeTeste.SAO_PAULO).toInstant();
    }

    protected Instant antesDe(Instant inicio, Duration d) { return inicio.minus(d); }

    // ---------- criação de agendamento pelo painel (usado por vários testes) ----------

    protected String criarAgendamento(String tokenPainel, String clienteId, String esteticistaId, java.util.List<String> servicos, Instant inicio) throws Exception {
        ResultActions r = chamar(HttpMethod.POST, "/agendamentos", tokenPainel, Map.of(
                "clienteId", clienteId, "esteticistaId", esteticistaId, "servicoIds", servicos, "inicio", inicio.toString()))
                .andExpect(status().isCreated());
        return corpo(r).get("id").asText();
    }
}
