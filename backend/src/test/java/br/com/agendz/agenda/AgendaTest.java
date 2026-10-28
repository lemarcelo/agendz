package br.com.agendz.agenda;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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

/** Agenda: conflito de horário por profissional, encaixe, intervalo, corrida, permissão por profissional e isolamento entre lojas (Gate 3). */
class AgendaTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";

    @Autowired
    JdbcTemplate jdbc;

    String davi, pablo, marcelo, alan;
    UUID pabloId, marceloId, daviId, alanId, clienteApex, clienteDalforno;
    Instant t; // um horário redondo, daqui a 10 dias

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = token(APEX, "pablo");
        marcelo = token(APEX, "marcelo");
        alan = token(DALFORNO, "alan");
        pabloId = usuario(LOJA_APEX, "pablo");
        marceloId = usuario(LOJA_APEX, "marcelo");
        daviId = usuario(LOJA_APEX, "davi");
        alanId = usuario(LOJA_DALFORNO, "alan");
        clienteApex = cliente(LOJA_APEX, "Ana", "5553999000010");
        clienteDalforno = cliente(LOJA_DALFORNO, "Beto", "5553999000011");
        t = Instant.now().plus(10, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
    }

    private UUID usuario(String loja, String login) {
        return jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = ?", UUID.class, loja, login);
    }

    private UUID cliente(String loja, String nome, String telefone) {
        return jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, ?, 'v1:teste', md5(?)) returning id", UUID.class, loja, nome, telefone);
    }

    private String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private String servico(String host, String token, String nome, int preco, int minutos, int intervalo) throws Exception {
        String json = mvc.perform(post("/api/servicos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"" + nome + "\",\"preco\":" + preco + ",\"duracaoMin\":" + minutos + ",\"intervaloMin\":" + intervalo + "}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return id(json);
    }

    private String corpo(UUID cliente, UUID prof, String servicos, Instant inicio, String extra) {
        return "{\"clienteId\":\"" + cliente + "\",\"profissionalId\":\"" + prof + "\",\"servicoIds\":[" + servicos + "],\"inicio\":\"" + inicio + "\"" + extra + "}";
    }

    private static String ids(String... s) {
        return "\"" + String.join("\",\"", s) + "\"";
    }

    private ResultActions marcar(String host, String token, String corpo) throws Exception {
        return mvc.perform(post("/api/agendamentos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String marcarOk(String token, UUID prof, String servicos, Instant inicio, String extra) throws Exception {
        return id(marcar(APEX, token, corpo(clienteApex, prof, servicos, inicio, extra)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions mudarStatus(String host, String token, String ag, String novo) throws Exception {
        return mvc.perform(put("/api/agendamentos/" + ag + "/status").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + novo + "\"}"));
    }

    @Test
    void totalEDuracaoSaemDosServicosECongelam() throws Exception {
        String a = servico(APEX, davi, "Lavagem", 80, 60, 10), b = servico(APEX, davi, "Cera", 50, 30, 0);
        String ag = id(marcar(APEX, davi, corpo(clienteApex, pabloId, ids(a, b), t, "")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.total").value(130)).andExpect(jsonPath("$.status").value("a_confirmar"))
                .andExpect(jsonPath("$.servicos", hasSize(2))).andExpect(jsonPath("$.servicos[0].nome").value("Lavagem"))
                .andReturn().getResponse().getContentAsString());
        // o último serviço (Cera) tem intervalo 0: ocupa 90 min
        mvc.perform(get("/api/agendamentos/" + ag).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$.fim").value(t.plus(90, ChronoUnit.MINUTES).toString()))
                .andExpect(jsonPath("$.fimOcupado").value(t.plus(90, ChronoUnit.MINUTES).toString()));
        // mudar o preço do serviço depois não muda o que já foi marcado
        mvc.perform(put("/api/servicos/" + a).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"preco\":999,\"duracaoMin\":60}")).andExpect(status().isOk());
        mvc.perform(get("/api/agendamentos/" + ag).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$.total").value(130)).andExpect(jsonPath("$.servicos[0].preco").value(80));
    }

    @Test
    void sobreporConfirmadoDa409ESoComEncaixePassa() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        marcarOk(davi, pabloId, ids(s), t, ",\"status\":\"confirmado\"");
        marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t.plus(30, ChronoUnit.MINUTES), "")).andExpect(status().isConflict());
        marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t.plus(30, ChronoUnit.MINUTES), ",\"encaixe\":true")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.encaixe").value(true));
        // logo depois do fim (60 min) não conflita
        marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t.plus(120, ChronoUnit.MINUTES), "")).andExpect(status().isCreated());
    }

    @Test
    void intervaloDoServicoContaNaOcupacao() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 15);
        marcarOk(davi, pabloId, ids(s), t, ",\"status\":\"confirmado\"");
        marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t.plus(70, ChronoUnit.MINUTES), "")).andExpect(status().isConflict());
        marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t.plus(75, ChronoUnit.MINUTES), "")).andExpect(status().isCreated());
    }

    @Test
    void outroProfissionalNaoConflita() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        marcarOk(davi, pabloId, ids(s), t, ",\"status\":\"confirmado\"");
        marcarOk(davi, marceloId, ids(s), t, ",\"status\":\"confirmado\"");
    }

    @Test
    void aConfirmarNaoBloqueiaMasAvisaEConfirmarCancelaOsQueCobrem() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        String primeiro = marcarOk(davi, pabloId, ids(s), t, "");
        String json = marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t, "")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.conflitosPendentes[0]").value(primeiro)).andReturn().getResponse().getContentAsString();
        String segundo = id(json);
        mudarStatus(APEX, davi, segundo, "confirmado").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("confirmado"));
        mvc.perform(get("/api/agendamentos/" + primeiro).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$.status").value("cancelado"));
    }

    @Test
    void canceladoNaoBloqueioEReativarRevalidaOHorario() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        String velho = marcarOk(davi, pabloId, ids(s), t, ",\"status\":\"confirmado\"");
        mudarStatus(APEX, davi, velho, "cancelado").andExpect(status().isOk());
        marcarOk(davi, pabloId, ids(s), t, ",\"status\":\"confirmado\""); // o horário foi tomado
        mudarStatus(APEX, davi, velho, "confirmado").andExpect(status().isConflict());
    }

    @Test
    void profissionalSoMexeNaPropriaAgenda() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        String doMarcelo = marcarOk(davi, marceloId, ids(s), t, "");
        String doPablo = marcarOk(pablo, pabloId, ids(s), t, "");
        marcar(APEX, pablo, corpo(clienteApex, marceloId, ids(s), t.plus(5, ChronoUnit.HOURS), "")).andExpect(status().isForbidden());
        mvc.perform(get("/api/agendamentos/" + doMarcelo).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isNotFound());
        mudarStatus(APEX, pablo, doMarcelo, "cancelado").andExpect(status().isNotFound());
        mvc.perform(put("/api/agendamentos/" + doMarcelo + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))
                .contentType(MediaType.APPLICATION_JSON).content("{\"inicio\":\"" + t.plus(3, ChronoUnit.HOURS) + "\"}")).andExpect(status().isNotFound());
        String de = t.minus(1, ChronoUnit.DAYS).toString(), ate = t.plus(1, ChronoUnit.DAYS).toString();
        mvc.perform(get("/api/agendamentos?de=" + de + "&ate=" + ate).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)))
                .andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(doPablo));
        mvc.perform(get("/api/agendamentos?de=" + de + "&ate=" + ate).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void remarcarMantemADuracaoRevalidaEOProfissionalSoTrocaPeloDono() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        marcarOk(davi, pabloId, ids(s), t.plus(2, ChronoUnit.HOURS), ",\"status\":\"confirmado\"");
        String ag = marcarOk(davi, pabloId, ids(s), t, "");
        // cai em cima do confirmado das 2h
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                .contentType(MediaType.APPLICATION_JSON).content("{\"inicio\":\"" + t.plus(2, ChronoUnit.HOURS) + "\"}")).andExpect(status().isConflict());
        Instant livre = t.plus(5, ChronoUnit.HOURS);
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"inicio\":\"" + livre + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.inicio").value(livre.toString()))
                .andExpect(jsonPath("$.fim").value(livre.plus(60, ChronoUnit.MINUTES).toString()));
        // profissional não repassa a outro; o dono sim
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))
                .contentType(MediaType.APPLICATION_JSON).content("{\"inicio\":\"" + livre + "\",\"profissionalId\":\"" + marceloId + "\"}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"inicio\":\"" + livre + "\",\"profissionalId\":\"" + marceloId + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.profissionalId").value(marceloId.toString()));
        // cancelado não remarca
        mudarStatus(APEX, davi, ag, "cancelado").andExpect(status().isOk());
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                .contentType(MediaType.APPLICATION_JSON).content("{\"inicio\":\"" + livre + "\"}")).andExpect(status().isConflict());
    }

    @Test
    void outraLojaNaoVeNemMexeNemUsaIdsDeFora() throws Exception {
        String sApex = servico(APEX, davi, "Lavagem", 80, 60, 0), sDal = servico(DALFORNO, alan, "Corte", 40, 30, 0);
        String ag = marcarOk(davi, pabloId, ids(sApex), t, ",\"status\":\"confirmado\"");
        mvc.perform(get("/api/agendamentos/" + ag).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        mudarStatus(DALFORNO, alan, ag, "cancelado").andExpect(status().isNotFound());
        mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))
                .contentType(MediaType.APPLICATION_JSON).content("{\"inicio\":\"" + t.plus(1, ChronoUnit.HOURS) + "\"}")).andExpect(status().isNotFound());
        String de = t.minus(1, ChronoUnit.DAYS).toString(), ate = t.plus(1, ChronoUnit.DAYS).toString();
        mvc.perform(get("/api/agendamentos?de=" + de + "&ate=" + ate).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)))
                .andExpect(jsonPath("$", hasSize(0)));
        // ids de outra loja no corpo: cliente (404), profissional (404), serviço (400)
        marcar(DALFORNO, alan, corpo(clienteApex, alanId, ids(sDal), t, "")).andExpect(status().isNotFound());
        marcar(DALFORNO, alan, corpo(clienteDalforno, daviId, ids(sDal), t, "")).andExpect(status().isNotFound());
        marcar(DALFORNO, alan, corpo(clienteDalforno, alanId, ids(sApex), t, "")).andExpect(status().isBadRequest());
        // o mesmo horário na outra loja não conflita (agenda é por loja)
        marcar(DALFORNO, alan, corpo(clienteDalforno, alanId, ids(sDal), t, ",\"status\":\"confirmado\"")).andExpect(status().isCreated());
        // e a Apex continua com o dela
        mvc.perform(get("/api/agendamentos/" + ag).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk());
    }

    @Test
    void tokenDeUmaLojaNoHostDeOutraDa403() throws Exception {
        mvc.perform(get("/api/agendamentos?de=" + t.minus(1, ChronoUnit.DAYS) + "&ate=" + t.plus(1, ChronoUnit.DAYS)).with(host(DALFORNO))
                .header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isForbidden());
    }

    @Test
    void validacaoDoCorpoDa400() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        String base = "\"clienteId\":\"" + clienteApex + "\",\"profissionalId\":\"" + pabloId + "\"";
        String[] ruins = {
                "{" + base + ",\"servicoIds\":[],\"inicio\":\"" + t + "\"}",                                                   // sem serviço
                "{" + base + ",\"servicoIds\":[" + ids(s, s) + "],\"inicio\":\"" + t + "\"}",                                  // serviço repetido
                "{" + base + ",\"servicoIds\":[" + ids(s) + "],\"inicio\":\"" + t.plusSeconds(30) + "\"}",                     // não é minuto exato
                "{" + base + ",\"servicoIds\":[" + ids(s) + "],\"inicio\":\"" + t.plus(500, ChronoUnit.DAYS) + "\"}",          // distante demais
                "{" + base + ",\"servicoIds\":[" + ids(s) + "],\"inicio\":\"" + t + "\",\"status\":\"concluido\"}",            // criar já concluído não existe
                "{" + base + ",\"servicoIds\":[" + ids(s) + "],\"inicio\":\"" + t + "\",\"lojaId\":\"x\"}",                    // campo desconhecido
                "{" + base + ",\"servicoIds\":[" + ids(s) + "]}",                                                              // sem início
        };
        for (String ruim : ruins) marcar(APEX, davi, ruim).andExpect(status().isBadRequest());
        String lista = onzeIdsQuaisquer(s);
        marcar(APEX, davi, "{" + base + ",\"servicoIds\":[" + lista + "],\"inicio\":\"" + t + "\"}").andExpect(status().isBadRequest());
        mvc.perform(get("/api/agendamentos?de=" + t + "&ate=" + t.plus(400, ChronoUnit.DAYS)).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/agendamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isBadRequest());
        mudarStatus(APEX, davi, UUID.randomUUID().toString(), "voando").andExpect(status().isBadRequest());
        mudarStatus(APEX, davi, UUID.randomUUID().toString(), "cancelado").andExpect(status().isNotFound());
    }

    private static String onzeIdsQuaisquer(String s) {
        // 11 ids diferentes (nem precisam existir: o limite de 10 é conferido antes)
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 11; i++) sb.append(i == 0 ? "" : ",").append("\"").append(UUID.randomUUID()).append("\"");
        return sb.toString();
    }

    @Test
    void duasMarcacoesAoMesmoTempoNoMesmoHorarioSoUmaPassa() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch largada = new CountDownLatch(1);
        Callable<Integer> tentativa = () -> {
            largada.await();
            return marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t, ",\"status\":\"confirmado\"")).andReturn().getResponse().getStatus();
        };
        Future<Integer> f1 = pool.submit(tentativa), f2 = pool.submit(tentativa);
        largada.countDown();
        List<Integer> codigos = List.of(f1.get(), f2.get());
        pool.shutdown();
        assertEquals(1, codigos.stream().filter(c -> c == 201).count(), "códigos: " + codigos);
        assertEquals(1, codigos.stream().filter(c -> c == 409).count(), "códigos: " + codigos);
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void servicoDesativadoOuProfissionalDesativadoNaoRecebe() throws Exception {
        String s = servico(APEX, davi, "Lavagem", 80, 60, 0);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/servicos/" + s).with(host(APEX))
                .header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isNoContent());
        marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s), t, "")).andExpect(status().isBadRequest());
        String s2 = servico(APEX, davi, "Cera", 50, 30, 0);
        mvc.perform(put("/api/profissionais/" + pabloId + "/atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                .contentType(MediaType.APPLICATION_JSON).content("{\"atende\":false}")).andExpect(status().isOk());
        marcar(APEX, davi, corpo(clienteApex, pabloId, ids(s2), t, "")).andExpect(status().isConflict());
        mvc.perform(put("/api/profissionais/" + pabloId + "/atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                .contentType(MediaType.APPLICATION_JSON).content("{\"atende\":true}")).andExpect(status().isOk());
    }
}
