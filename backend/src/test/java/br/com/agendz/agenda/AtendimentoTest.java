package br.com.agendz.agenda;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

/** Atender (parte 5c): atendimento local concluído, agendamento futuro, cliente por nome+telefone, dia anterior com motivo, permissão por profissional. */
class AtendimentoTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";

    @Autowired
    JdbcTemplate jdbc;

    String davi, pablo;
    UUID pabloId, marceloId;
    String lavagem;
    Instant futuro;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = token(APEX, "pablo");
        pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, LOJA_APEX);
        marceloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'marcelo'", UUID.class, LOJA_APEX);
        lavagem = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"preco\":80,\"duracaoMin\":60,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        futuro = Instant.now().plus(10, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
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

    private ResultActions atender(String host, String token, String corpo) throws Exception {
        return mvc.perform(post("/api/atendimentos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String corpo(UUID prof, String extra) {
        return "{" + (prof == null ? "" : "\"profissionalId\":\"" + prof + "\",") + "\"servicoIds\":[\"" + lavagem + "\"]" + extra + "}";
    }

    @Test
    void localNasceConcluidoEUmTelefoneNovoCriaOCadastroSemNome() throws Exception {
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"(53) 99900-0001\"")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("concluido")).andExpect(jsonPath("$.origem").value("atendimento"))
                .andExpect(jsonPath("$.total").value(80)).andExpect(jsonPath("$.clienteId").isNotEmpty());
        assertEquals("(53) 99900-0001", jdbc.queryForObject("select nome from cliente", String.class));
        assertEquals(Boolean.TRUE, jdbc.queryForObject("select sem_nome from cliente", Boolean.class));
        assertEquals("atendimento", jdbc.queryForObject("select origem_cadastro from cliente", String.class));
    }

    @Test
    void mesmoTelefoneReusaOCadastroENomeMaisCompletoAtualiza() throws Exception {
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000002\",\"nome\":\"João\"")).andExpect(status().isCreated());
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"(53) 99900-0002\",\"nome\":\"João Silva\"")).andExpect(status().isCreated());
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente", Integer.class));
        assertEquals("João Silva", jdbc.queryForObject("select nome from cliente", String.class));
        // nome diferente no mesmo número (família): cadastro novo, o primeiro fica como estava
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000002\",\"nome\":\"Maria\"")).andExpect(status().isCreated());
        assertEquals(2, jdbc.queryForObject("select count(*) from cliente", Integer.class));
    }

    @Test
    void cadastroSemNomeRecebeONomeDigitado() throws Exception {
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000003\"")).andExpect(status().isCreated());
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000003\",\"nome\":\"Carla\"")).andExpect(status().isCreated());
        assertEquals("Carla", jdbc.queryForObject("select nome from cliente", String.class));
        assertEquals(Boolean.FALSE, jdbc.queryForObject("select sem_nome from cliente", Boolean.class));
    }

    @Test
    void soNomeNaoCriaCadastroEFicaNoRegistro() throws Exception {
        atender(APEX, davi, corpo(pabloId, ",\"nome\":\"Cliente do balcão\"")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.clienteId").doesNotExist()).andExpect(jsonPath("$.nomeAvulso").value("Cliente do balcão"));
        assertEquals(0, jdbc.queryForObject("select count(*) from cliente", Integer.class));
    }

    @Test
    void telefoneInvalidoEServicoObrigatorio() throws Exception {
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"123\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Telefone com DDD e número (10 ou 11 dígitos)."));
        atender(APEX, davi, "{\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Escolha ao menos um serviço."));
        atender(APEX, davi, corpo(null, "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Escolha o profissional que atendeu."));
        assertEquals(0, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void localNaoConflitaComConfirmadoEJaAconteceu() throws Exception {
        Instant hora = Instant.now().minus(3, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MINUTES);
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000004\",\"inicio\":\"" + hora + "\"")).andExpect(status().isCreated());
        // outro no mesmo horário, mesmo profissional: é histórico, não há conflito
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000005\",\"inicio\":\"" + hora + "\"")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("concluido"));
    }

    @Test
    void diaAnteriorExigeMotivoEFicaNoHistorico() throws Exception {
        Instant ontem = Instant.now().minus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES);
        atender(APEX, davi, corpo(pabloId, ",\"inicio\":\"" + ontem + "\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o motivo do lançamento de um dia anterior (por que não foi registrado na hora)."));
        atender(APEX, davi, corpo(pabloId, ",\"inicio\":\"" + ontem + "\",\"motivoRetroativo\":\"abc\"")).andExpect(status().isBadRequest());
        String ag = id(atender(APEX, davi, corpo(pabloId, ",\"inicio\":\"" + ontem + "\",\"motivoRetroativo\":\"Esqueci de lançar no dia\"")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.motivoRetroativo").value("Esqueci de lançar no dia")).andReturn().getResponse().getContentAsString());
        mvc.perform(get("/api/agendamentos/" + ag).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$.historico[?(@.campo == 'lançamento retroativo')]", hasSize(1)));
    }

    @Test
    void profissionalLancaComoEleMesmoESoDeHoje() throws Exception {
        // pede o Marcelo, mas quem é o Pablo atende como Pablo
        atender(APEX, pablo, corpo(marceloId, "")).andExpect(status().isCreated()).andExpect(jsonPath("$.profissionalId").value(pabloId.toString()));
        Instant ontem = Instant.now().minus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES);
        atender(APEX, pablo, corpo(pabloId, ",\"inicio\":\"" + ontem + "\",\"motivoRetroativo\":\"Esqueci de lançar\"")).andExpect(status().isForbidden());
    }

    @Test
    void futuroPedeNomeETelefoneEViraAgendamentoAConfirmar() throws Exception {
        atender(APEX, davi, corpo(pabloId, ",\"inicio\":\"" + futuro + "\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Preencha os campos obrigatórios: nome, telefone."));
        atender(APEX, davi, corpo(pabloId, ",\"inicio\":\"" + futuro + "\",\"nome\":\"Ana\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Preencha o campo obrigatório: telefone."));
        atender(APEX, davi, corpo(pabloId, ",\"inicio\":\"" + futuro + "\",\"nome\":\"Ana Lima\",\"telefone\":\"53999000006\"")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("a_confirmar")).andExpect(jsonPath("$.origem").value("painel")).andExpect(jsonPath("$.clienteId").isNotEmpty());
        assertEquals("Ana Lima", jdbc.queryForObject("select nome from cliente", String.class));
    }

    @Test
    void futuroConfirmadoSeguePeloConflitoDeHorario() throws Exception {
        String base = ",\"inicio\":\"" + futuro + "\",\"nome\":\"Ana Lima\",\"telefone\":\"53999000007\",\"status\":\"confirmado\"";
        atender(APEX, davi, corpo(pabloId, base)).andExpect(status().isCreated());
        atender(APEX, davi, corpo(pabloId, base.replace("53999000007", "53999000008"))).andExpect(status().isConflict());
        atender(APEX, davi, corpo(pabloId, base.replace("confirmado", "concluido"))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Agendamento futuro nasce a confirmar ou confirmado."));
    }

    @Test
    void clienteDeOutraLojaNaoExiste() throws Exception {
        UUID dalforno = jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Beto', 'v1:teste', md5('5553999000011')) returning id",
                UUID.class, LOJA_DALFORNO);
        atender(APEX, davi, corpo(pabloId, ",\"clienteId\":\"" + dalforno + "\"")).andExpect(status().isNotFound());
    }

    @Test
    void semLoginNaoAtende() throws Exception {
        mvc.perform(post("/api/atendimentos").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpo(pabloId, ""))).andExpect(status().isUnauthorized());
    }
}
