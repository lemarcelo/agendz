package br.com.agendz.agenda;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.math.BigDecimal;
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

/** F (V60): serviço de duração indefinida — cadastro, Atender com vários blocos de horário e valor lançado, mistura com serviço fixo e o WhatsApp do estabelecimento. */
class DuracaoIndefinidaTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";

    @Autowired
    JdbcTemplate jdbc;

    String davi;
    UUID pabloId;
    String pintura, lavagem;
    Instant base;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, LOJA_APEX);
        pintura = id(servico("{\"nome\":\"Pintura de peça\",\"preco\":200,\"duracaoIndefinida\":true,\"duracaoTexto\":\"De 1 a 3 dias\"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        lavagem = id(servico("{\"nome\":\"Lavagem\",\"preco\":80,\"duracaoMin\":60,\"intervaloMin\":0}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        base = Instant.now().plus(12, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        jdbc.update("delete from agendamento"); // os blocos saem junto (ON DELETE CASCADE)
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
        jdbc.update("update configuracao_loja set whatsapp_loja = null");
    }

    private static String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private ResultActions servico(String corpo) throws Exception {
        return mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions atender(String corpo) throws Exception {
        return mvc.perform(post("/api/atendimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String corpo(String servicos, String extra) {
        return "{\"profissionalId\":\"" + pabloId + "\",\"status\":\"confirmado\",\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\",\"porte\":\"medio\"},\"servicoIds\":[" + servicos + "]" + extra + "}";
    }

    private String bloco(int deMinutos, int ateMinutos) {
        return "{\"inicio\":\"" + base.plus(deMinutos, ChronoUnit.MINUTES) + "\",\"fim\":\"" + base.plus(ateMinutos, ChronoUnit.MINUTES) + "\"}";
    }

    @Test
    void cadastroGravaDuracaoNulaEOsTextos() throws Exception {
        assertEquals(1, jdbc.queryForObject("select count(*) from servico where id = ?::uuid and duracao_min is null and duracao_texto = 'De 1 a 3 dias' and preco_modo = 'fixo'", Integer.class, pintura));
        servico("{\"nome\":\"Sem preço\",\"duracaoIndefinida\":true}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Informe o preço."));
        servico("{\"nome\":\"Lista curta\",\"duracaoIndefinida\":true,\"precoModo\":\"lista\",\"precoOpcoes\":[{\"descricao\":\"Só uma\",\"valor\":10}]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("A lista de valores precisa de 2 a 10 opções, cada uma com descrição e valor."));
        servico("{\"nome\":\"Faixa ruim\",\"duracaoIndefinida\":true,\"precoModo\":\"faixa\",\"preco\":100,\"precoMax\":100}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("O valor máximo precisa ser maior que o mínimo."));
        servico("{\"nome\":\"Lista boa\",\"duracaoIndefinida\":true,\"precoModo\":\"lista\",\"precoOpcoes\":[{\"descricao\":\"Simples\",\"valor\":90},{\"descricao\":\"Completa\",\"valor\":140}]}")
                .andExpect(status().isCreated());
        assertEquals(0, new BigDecimal("90").compareTo(jdbc.queryForObject("select preco from servico where nome = 'Lista boa'", BigDecimal.class)), "o preço de base é o menor da lista");
    }

    @Test
    void indefinidoSemBlocosNaoAtende() throws Exception {
        atender(corpo("\"" + pintura + "\"", ",\"inicio\":\"" + base + "\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Marque os horários de Pintura de peça: o serviço não tem duração fixa."));
    }

    @Test
    void blocosSemServicoIndefinidoNaoValem() throws Exception {
        atender(corpo("\"" + lavagem + "\"", ",\"blocos\":[" + bloco(0, 60) + "]")).andExpect(status().isBadRequest());
    }

    @Test
    void variosBlocosGravamValorLancadoEInicioDoPrimeiro() throws Exception {
        String r = atender(corpo("\"" + pintura + "\"", ",\"blocos\":[" + bloco(300, 360) + "," + bloco(0, 90) + "],\"valores\":[{\"servicoId\":\"" + pintura + "\",\"valor\":345.50}]"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String ag = id(r);
        assertEquals(Instant.parse(base.toString()), jdbc.queryForObject("select inicio from agendamento where id = ?::uuid", java.sql.Timestamp.class, ag).toInstant(), "início = primeiro bloco");
        assertEquals(2, jdbc.queryForObject("select count(*) from agendamento_bloco where agendamento_id = ?::uuid", Integer.class, ag));
        assertEquals(0, new BigDecimal("345.50").compareTo(jdbc.queryForObject("select preco from agendamento_servico where agendamento_id = ?::uuid", BigDecimal.class, ag)),
                "o valor lançado é o preço do item (base de total e comissão)");
        assertEquals(0, jdbc.queryForObject("select duracao_min from agendamento_servico where agendamento_id = ?::uuid", Integer.class, ag), "item indefinido grava duração 0");
    }

    @Test
    void semValorLancadoVaiOPrecoDeBase() throws Exception {
        String ag = id(atender(corpo("\"" + pintura + "\"", ",\"blocos\":[" + bloco(0, 60) + "]")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(0, new BigDecimal("200").compareTo(jdbc.queryForObject("select preco from agendamento_servico where agendamento_id = ?::uuid", BigDecimal.class, ag)));
    }

    @Test
    void blocoSobrepostoBarraEOVaoEntreBlocosFicaLivre() throws Exception {
        atender(corpo("\"" + pintura + "\"", ",\"blocos\":[" + bloco(0, 60) + "," + bloco(240, 300) + "]")).andExpect(status().isCreated());
        atender(corpo("\"" + pintura + "\"", ",\"blocos\":[" + bloco(30, 90) + "]")).andExpect(status().isConflict());
        atender(corpo("\"" + pintura + "\"", ",\"blocos\":[" + bloco(120, 180) + "]")).andExpect(status().isCreated());
    }

    @Test
    void blocosQueSeSobrepoemNoPedidoSaoRecusados() throws Exception {
        atender(corpo("\"" + pintura + "\"", ",\"blocos\":[" + bloco(0, 60) + "," + bloco(30, 90) + "]")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Os horários marcados se sobrepõem."));
    }

    @Test
    void misturaExigeASomaDosBlocosAtenderOFixo() throws Exception {
        String ambos = "\"" + pintura + "\",\"" + lavagem + "\"";
        atender(corpo(ambos, ",\"blocos\":[" + bloco(0, 30) + "]")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value(containsString("ao menos 60 min")));
        atender(corpo(ambos, ",\"blocos\":[" + bloco(0, 30) + "," + bloco(120, 150) + "]")).andExpect(status().isCreated());
    }

    @Test
    void valorLancadoSoValeEmServicoIndefinido() throws Exception {
        String ambos = "\"" + pintura + "\",\"" + lavagem + "\"";
        atender(corpo(ambos, ",\"blocos\":[" + bloco(0, 90) + "],\"valores\":[{\"servicoId\":\"" + lavagem + "\",\"valor\":5}]")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(containsString("é fixo")));
    }

    @Test
    void whatsappDoEstabelecimentoGuardaSo55DddENumero() throws Exception {
        mvc.perform(put("/api/estabelecimento/whatsapp").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"whatsapp\":\"(53) 99999-9999\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.whatsapp").value("5553999999999"));
        mvc.perform(get("/api/estabelecimento/whatsapp").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk()).andExpect(jsonPath("$.whatsapp").value("5553999999999"));
        mvc.perform(put("/api/estabelecimento/whatsapp").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"whatsapp\":\"123\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/estabelecimento/whatsapp").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"whatsapp\":\"\"}"))
                .andExpect(status().isOk());
    }
}
