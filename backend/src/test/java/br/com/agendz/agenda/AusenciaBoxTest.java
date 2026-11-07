package br.com.agendz.agenda;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

/** Ausência do box (G2): bloqueia novos agendamentos naquele box, avisa os já marcados, só quem gerencia a agenda lança e remover libera de novo. */
class AusenciaBoxTest extends BaseApi {

    private static final String VEICULO = ",\"veiculo\":{\"placa\":\"BRA2E19\",\"modelo\":\"Creta\",\"porte\":\"medio\"}";

    @Autowired
    JdbcTemplate jdbc;

    String davi;
    UUID pabloId, cliente;
    String lavagem;
    Instant t;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, EsteticaDeTeste.LOJA_APEX);
        cliente = UUID.fromString(id(mvc.perform(post("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Ana Souza\",\"telefone\":\"(53) 99900-2001\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()));
        lavagem = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"precos\":{\"medio\":80},\"duracoes\":{\"medio\":60},\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        t = Instant.now().plus(10, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from ausencia_box");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        EsteticaDeTeste.restaurarBoxes(jdbc);
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
        jdbc.update("delete from escala_faixa");
        jdbc.update("delete from configuracao_loja");
    }

    private static String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private UUID box(String nome) {
        return jdbc.queryForObject("select id from box where nome = ?", UUID.class, nome);
    }

    private ResultActions agendar(Instant inicio) throws Exception {
        return mvc.perform(post("/api/agendamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"clienteId\":\"" + cliente + "\",\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[\"" + lavagem + "\"],\"inicio\":\"" + inicio + "\"" + VEICULO + "}"));
    }

    private ResultActions ausencia(String tokenDe, UUID box, Instant ini, Instant fim) throws Exception {
        return mvc.perform(post("/api/boxes/ausencias").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"boxId\":\"" + box + "\",\"motivo\":\"Manutenção\",\"intervalos\":[{\"ini\":\"" + ini + "\",\"fim\":\"" + fim + "\"}]}"));
    }

    @Test
    void ausenciaDoUnicoBoxBloqueiaONovoAgendamentoERemoverLibera() throws Exception {
        jdbc.update("delete from box where nome <> 'Box 1'");
        String criada = ausencia(davi, box("Box 1"), t.minus(1, ChronoUnit.HOURS), t.plus(3, ChronoUnit.HOURS)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.afetados.length()").value(0)).andReturn().getResponse().getContentAsString();
        agendar(t).andExpect(status().isConflict());
        mvc.perform(delete("/api/boxes/ausencias/" + id(criada)).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isNoContent());
        agendar(t).andExpect(status().isCreated());
    }

    @Test
    void comOutroBoxLivreOAgendamentoVaiParaEle() throws Exception {
        ausencia(davi, box("Box 1"), t.minus(1, ChronoUnit.HOURS), t.plus(3, ChronoUnit.HOURS)).andExpect(status().isCreated());
        agendar(t).andExpect(status().isCreated()).andExpect(jsonPath("$.estetica.box").value(org.hamcrest.Matchers.not("Box 1")));
    }

    @Test
    void agendamentoJaMarcadoNaoImpedeAAusenciaMasEAvisado() throws Exception {
        agendar(t).andExpect(status().isCreated()).andExpect(jsonPath("$.estetica.box").value("Box 1"));
        ausencia(davi, box("Box 1"), t.minus(1, ChronoUnit.HOURS), t.plus(3, ChronoUnit.HOURS)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.afetados.length()").value(1));
        assertEquals(1, jdbc.queryForObject("select count(*) from ausencia_box", Integer.class));
    }

    @Test
    void profissionalNaoLancaAusenciaDeBox() throws Exception {
        ausencia(token(APEX, "pablo"), box("Box 1"), t, t.plus(2, ChronoUnit.HOURS)).andExpect(status().isForbidden());
        assertEquals(0, jdbc.queryForObject("select count(*) from ausencia_box", Integer.class));
    }

    @Test
    void ausenciaNoPassadoEPeriodoInvertidoSaoRecusados() throws Exception {
        ausencia(davi, box("Box 1"), Instant.now().minus(3, ChronoUnit.DAYS), Instant.now().minus(2, ChronoUnit.DAYS)).andExpect(status().isBadRequest());
        ausencia(davi, box("Box 1"), t.plus(2, ChronoUnit.HOURS), t).andExpect(status().isBadRequest());
    }
}
