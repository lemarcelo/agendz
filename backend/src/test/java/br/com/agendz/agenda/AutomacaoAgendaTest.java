package br.com.agendz.agenda;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

/** Conclusão e cancelamento automáticos (AgendaAutomatica = engine.tick): o que muda, o que não muda e o histórico do Sistema. */
class AutomacaoAgendaTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    AgendaAutomatica automacao;

    String davi, servico;
    UUID pablo, cliente;
    Instant base; // três dias atrás, hora redonda

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, LOJA_APEX);
        cliente = jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Ana Auto', 'v1:teste', md5('auto')) returning id", UUID.class, LOJA_APEX);
        String json = mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem auto\",\"preco\":80,\"duracaoMin\":30,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        servico = id(json);
        base = Instant.now().minus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
    }

    private static String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private String marcar(Instant inicio, String statusInicial) throws Exception {
        String corpo = "{\"clienteId\":\"" + cliente + "\",\"profissionalId\":\"" + pablo + "\",\"servicoIds\":[\"" + servico + "\"],\"inicio\":\"" + inicio + "\",\"status\":\"" + statusInicial + "\"}";
        String json = mvc.perform(post("/api/agendamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return id(json);
    }

    private void mudarStatus(String id, String novo) throws Exception {
        mvc.perform(put("/api/agendamentos/" + id + "/status").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + novo + "\"}")).andExpect(status().isOk());
    }

    private String situacao(String id) {
        return jdbc.queryForObject("select status || '/' || coalesce(motivo_cancelamento, '-') from agendamento where id = ?::uuid", String.class, id);
    }

    private String eventoDoSistema(String id) {
        return jdbc.queryForObject("select coalesce(string_agg(de || '>' || para, ';' order by id), '') from agendamento_evento where agendamento_id = ?::uuid and autor_nome = 'Sistema'", String.class, id);
    }

    @Test
    void concluiOConfirmadoECancelaOSemConfirmacaoSemTocarNoResto() throws Exception {
        String confirmado = marcar(base, "confirmado");
        String semConfirmar = marcar(base.plus(2, ChronoUnit.HOURS), "a_confirmar");
        String futuro = marcar(Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS), "confirmado");
        // status escolhido à mão DEPOIS do horário começar: o sistema não mexe
        String manual = marcar(base.plus(4, ChronoUnit.HOURS), "a_confirmar");
        mudarStatus(manual, "confirmado");
        // ...mas remarcar libera o fluxo automático de novo
        String remarcado = marcar(base.plus(6, ChronoUnit.HOURS), "a_confirmar");
        mudarStatus(remarcado, "confirmado");
        mvc.perform(put("/api/agendamentos/" + remarcado + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"inicio\":\"" + base.plus(8, ChronoUnit.HOURS) + "\"}")).andExpect(status().isOk());

        assertEquals(3, automacao.executar(Instant.now()), "concluído, cancelado sem confirmação e o remarcado");
        assertEquals("concluido/-", situacao(confirmado));
        assertEquals("Confirmado>Concluído (automático)", eventoDoSistema(confirmado));
        assertEquals("cancelado/falta_confirmacao", situacao(semConfirmar));
        assertEquals("A confirmar>Cancelado (sem confirmação)", eventoDoSistema(semConfirmar));
        assertEquals("confirmado/-", situacao(futuro));
        assertEquals("confirmado/-", situacao(manual));
        assertEquals("", eventoDoSistema(manual));
        assertEquals("concluido/-", situacao(remarcado));

        assertEquals(0, automacao.executar(Instant.now()), "rodar de novo não muda nada");
    }

    @Test
    void naoMexeAntesDoFimDoServico() throws Exception {
        String emAndamento = marcar(Instant.now().minus(10, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.MINUTES), "confirmado"); // serviço de 30 min ainda não terminou
        assertEquals(0, automacao.executar(Instant.now()));
        assertEquals("confirmado/-", situacao(emAndamento));
    }
}
