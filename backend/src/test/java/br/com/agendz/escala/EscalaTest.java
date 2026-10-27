package br.com.agendz.escala;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/** Expediente da loja e escala do profissional: validação, permissão, isolamento e a agenda recusando horário em que ninguém atende (Gate 3). */
class EscalaTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    // segunda 09:00–12:00 e 14:00–18:00 (os outros dias fechados)
    private static final String SEGUNDA = "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"],[\"14:00\",\"18:00\"]]}}}";

    @Autowired
    JdbcTemplate jdbc;

    String davi, pablo;
    UUID pabloId, marceloId, clienteApex, clienteDalforno;
    LocalDate segunda;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = token(APEX, "pablo");
        pabloId = usuario(LOJA_APEX, "pablo");
        marceloId = usuario(LOJA_APEX, "marcelo");
        clienteApex = cliente(LOJA_APEX, "Ana", "5553999000010");
        clienteDalforno = cliente(LOJA_DALFORNO, "Beto", "5553999000011");
        segunda = LocalDate.now(Fuso.BRASIL).plusDays(14).with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from escala_faixa");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
    }

    private UUID usuario(String loja, String login) {
        return jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = ?", UUID.class, loja, login);
    }

    private UUID cliente(String loja, String nome, String telefone) {
        return jdbc.queryForObject("insert into cliente (loja_id, nome, telefone) values (?::uuid, ?, ?) returning id", UUID.class, loja, nome, telefone);
    }

    private String servico(String host, String token, int minutos, boolean multiDia) throws Exception {
        String json = mvc.perform(post("/api/servicos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"Serv " + minutos + (multiDia ? " dias" : "") + "\",\"preco\":50,\"duracaoMin\":" + minutos + ",\"multiDia\":" + multiDia + "}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException(json);
        return m.group(1);
    }

    private Instant local(LocalDate dia, int hora, int minuto) {
        return ZonedDateTime.of(dia, LocalTime.of(hora, minuto), Fuso.BRASIL).toInstant();
    }

    private ResultActions agendar(String host, String token, UUID cliente, UUID prof, String servico, Instant inicio) throws Exception {
        return mvc.perform(post("/api/agendamentos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"clienteId\":\"" + cliente + "\",\"profissionalId\":\"" + prof + "\",\"servicoIds\":[\"" + servico + "\"],\"inicio\":\"" + inicio + "\",\"status\":\"confirmado\"}"));
    }

    private ResultActions gravarLoja(String host, String token, String corpo) throws Exception {
        return mvc.perform(put("/api/estabelecimento/escala").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions gravarProfissional(String host, String token, UUID id, String corpo) throws Exception {
        return mvc.perform(put("/api/profissionais/" + id + "/escala").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String idDe(ResultActions r) throws Exception {
        String json = r.andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException(json);
        return m.group(1);
    }

    @Test
    void donoGravaOExpedienteEElePodeSerLido() throws Exception {
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk())
                .andExpect(jsonPath("$.semana['1'].aberto").value(true)).andExpect(jsonPath("$.semana['1'].faixas", hasSize(2)))
                .andExpect(jsonPath("$.semana['1'].faixas[0][0]").value("09:00")).andExpect(jsonPath("$.semana['1'].faixas[1][1]").value("18:00"))
                .andExpect(jsonPath("$.semana['0'].aberto").value(false)).andExpect(jsonPath("$.semana['0'].faixas", hasSize(0)));
        // o profissional lê, mas não grava
        mvc.perform(get("/api/estabelecimento/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.semana['1'].faixas", hasSize(2)));
        gravarLoja(APEX, pablo, SEGUNDA).andExpect(status().isForbidden());
        mvc.perform(get("/api/estabelecimento/escala").with(host(APEX))).andExpect(status().isUnauthorized());
        // gravar de novo troca tudo (não acumula faixas)
        gravarLoja(APEX, davi, "{\"semana\":{\"2\":{\"aberto\":true,\"faixas\":[[\"08:00\",\"10:00\"]]}}}").andExpect(status().isOk())
                .andExpect(jsonPath("$.semana['1'].aberto").value(false)).andExpect(jsonPath("$.semana['2'].faixas", hasSize(1)));
        // outra loja não vê o expediente desta
        mvc.perform(get("/api/estabelecimento/escala").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(token(DALFORNO, "alan"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.semana['2'].aberto").value(false));
        // o token de uma loja não vale em outra
        gravarLoja(DALFORNO, davi, SEGUNDA).andExpect(status().isForbidden());
    }

    @Test
    void escalaInvalidaEhRecusadaENadaMuda() throws Exception {
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk());
        String[] ruins = {
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"12:00\",\"09:00\"]]}}}",                       // fim antes do início
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"09:00\"]]}}}",                       // vazia
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"],[\"11:00\",\"13:00\"]]}}}", // sobreposta
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"25:00\",\"26:00\"]]}}}",                       // hora inexistente
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"9:00\",\"12:00\"]]}}}",                        // formato
                "{\"semana\":{\"7\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]}}}",                       // dia 7
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[]}}}",                                            // aberto sem horário
                "{\"semana\":{\"1\":{\"aberto\":false,\"faixas\":[]}}}",                                           // nenhum dia aberto
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"01:00\",\"02:00\"],[\"03:00\",\"04:00\"],[\"05:00\",\"06:00\"],[\"07:00\",\"08:00\"],[\"09:00\",\"10:00\"],[\"11:00\",\"12:00\"],[\"13:00\",\"14:00\"]]}}}", // 7 faixas
                "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\"]]}}}",                                  // par incompleto
                "{}"};
        for (String ruim : ruins) gravarLoja(APEX, davi, ruim).andExpect(status().isBadRequest());
        mvc.perform(get("/api/estabelecimento/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$.semana['1'].faixas", hasSize(2)));
    }

    @Test
    void semExpedienteCadastradoNadaEhRestringido() throws Exception {
        String sv = servico(APEX, davi, 60, false);
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda.minusDays(1), 3, 0)).andExpect(status().isCreated()); // domingo 03:00
    }

    @Test
    void agendaRecusaForaDoExpedienteDaLojaEAceitaDentroInclusiveNasBordas() throws Exception {
        String sv = servico(APEX, davi, 60, false);
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk());
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 10, 0)).andExpect(status().isCreated());   // dentro
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 17, 0)).andExpect(status().isCreated());   // termina às 18:00, na borda
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 9, 0)).andExpect(status().isCreated());    // começa às 09:00, na borda
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 8, 0)).andExpect(status().isConflict());   // antes de abrir
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 11, 30)).andExpect(status().isConflict()); // atravessa o almoço
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 17, 30)).andExpect(status().isConflict()); // passa das 18:00
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 23, 30)).andExpect(status().isConflict()); // atravessa a meia-noite
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda.minusDays(1), 10, 0)).andExpect(status().isConflict()); // domingo fechado
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda.plusDays(1), 10, 0)).andExpect(status().isConflict());  // terça fechada
    }

    @Test
    void ohorarioEhContadoNoFusoDaLojaNaoEmUtc() throws Exception {
        String sv = servico(APEX, davi, 60, false);
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk());
        // 09:00 em São Paulo = 12:00 UTC (GMT-3): abre; 12:00 em São Paulo = 15:00 UTC: é o almoço
        Instant nove = local(segunda, 9, 0);
        agendar(APEX, davi, clienteApex, pabloId, sv, nove).andExpect(status().isCreated());
        agendar(APEX, davi, clienteApex, marceloId, sv, local(segunda, 12, 0)).andExpect(status().isConflict());
        agendar(APEX, davi, clienteApex, marceloId, sv, nove.minusSeconds(3600)).andExpect(status().isConflict()); // "08:00 local" nunca passa por 09:00 UTC
    }

    @Test
    void escalaDoProfissionalRestringeAindaMaisEVazioVoltaAAcompanharALoja() throws Exception {
        String sv = servico(APEX, davi, 60, false);
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk());
        gravarProfissional(APEX, davi, pabloId, "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"10:00\",\"12:00\"]]}}}").andExpect(status().isOk())
                .andExpect(jsonPath("$.semana['1'].faixas", hasSize(1)));
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 10, 0)).andExpect(status().isCreated());
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 14, 0)).andExpect(status().isConflict());   // a loja abre, ele não
        agendar(APEX, davi, clienteApex, marceloId, sv, local(segunda, 14, 0)).andExpect(status().isCreated());  // quem não tem escala própria segue a loja
        agendar(APEX, davi, clienteApex, marceloId, sv, local(segunda, 8, 0)).andExpect(status().isConflict());
        // mesmo com folga na dele, a loja fechada vale: escala do profissional não amplia o expediente
        gravarProfissional(APEX, davi, marceloId, "{\"semana\":{\"0\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]}}}").andExpect(status().isOk());
        agendar(APEX, davi, clienteApex, marceloId, sv, local(segunda.minusDays(1), 10, 0)).andExpect(status().isConflict());
        // escala vazia apaga a própria e ele volta a seguir a loja
        gravarProfissional(APEX, davi, pabloId, "{\"semana\":{}}").andExpect(status().isOk()).andExpect(jsonPath("$.semana['1'].faixas", hasSize(0)));
        agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 14, 0)).andExpect(status().isCreated());
    }

    @Test
    void permissaoDaEscalaDoProfissional() throws Exception {
        String corpo = "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"10:00\",\"12:00\"]]}}}";
        gravarProfissional(APEX, pablo, pabloId, corpo).andExpect(status().isOk());                       // a própria
        gravarProfissional(APEX, pablo, marceloId, corpo).andExpect(status().isNotFound());               // a de outro: 404
        mvc.perform(get("/api/profissionais/" + marceloId + "/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isNotFound());
        mvc.perform(get("/api/profissionais/" + pabloId + "/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isOk());
        mvc.perform(get("/api/profissionais/" + marceloId + "/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk());
        // dono de outra loja não alcança o profissional desta (id de outra loja = 404, como se não existisse)
        gravarProfissional(DALFORNO, token(DALFORNO, "alan"), pabloId, corpo).andExpect(status().isNotFound());
        gravarProfissional(APEX, davi, UUID.randomUUID(), corpo).andExpect(status().isNotFound());
    }

    @Test
    void remarcarEReativarRevalidamOExpediente() throws Exception {
        String sv = servico(APEX, davi, 60, false);
        String ag = idDe(agendar(APEX, davi, clienteApex, pabloId, sv, local(segunda, 10, 0)).andExpect(status().isCreated()));
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk());
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"inicio\":\"" + local(segunda, 20, 0) + "\"}")).andExpect(status().isConflict());
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"inicio\":\"" + local(segunda, 15, 0) + "\"}")).andExpect(status().isOk());
        // cancelar, mudar o expediente para outro dia e reativar: o horário antigo já não é atendido
        mvc.perform(put("/api/agendamentos/" + ag + "/status").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"cancelado\"}")).andExpect(status().isOk());
        gravarLoja(APEX, davi, "{\"semana\":{\"2\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]}}}").andExpect(status().isOk());
        mvc.perform(put("/api/agendamentos/" + ag + "/status").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"confirmado\"}")).andExpect(status().isConflict());
    }

    @Test
    void servicoDeVariosDiasSoExigeAEntradaDentroDoExpediente() throws Exception {
        String longo = servico(APEX, davi, 3000, true);
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk());
        agendar(APEX, davi, clienteApex, pabloId, longo, local(segunda, 10, 0)).andExpect(status().isCreated());   // 50 h de serviço, mas a entrada é em horário de trabalho
        agendar(APEX, davi, clienteApex, marceloId, longo, local(segunda, 20, 0)).andExpect(status().isConflict()); // entrada fora do expediente
    }

    @Test
    void expedienteDeUmaLojaNaoRestringeAOutra() throws Exception {
        gravarLoja(APEX, davi, SEGUNDA).andExpect(status().isOk());
        String alan = token(DALFORNO, "alan");
        String sv = servico(DALFORNO, alan, 60, false);
        UUID alanId = usuario(LOJA_DALFORNO, "alan");
        agendar(DALFORNO, alan, clienteDalforno, alanId, sv, local(segunda.minusDays(1), 3, 0)).andExpect(status().isCreated()); // Dalforno sem expediente: livre
    }
}
