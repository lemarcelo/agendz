package br.com.agendz.publico;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.escala.Fuso;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.concurrent.atomic.AtomicInteger;
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

/**
 * Link de agendamento do cliente na estética (Apex): o pedido traz o veículo (placa, modelo, porte), o porte define preço e duração, o horário só existe com
 * profissional E box livres, o carro nunca divide o box e remarcar mantém essas regras. O veículo do link não entra no cadastro de quem já é cliente.
 */
class LinkPublicoEsteticaTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";
    private static final String TODA_SEMANA = "{\"semana\":{\"0\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},"
            + "\"2\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"3\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"4\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},"
            + "\"5\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"6\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]}}}";
    private static final AtomicInteger SEQ = new AtomicInteger(10);

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    private LimitePublico limitePublico;

    String davi;
    String lavagem;
    LocalDate dia;
    String ip;
    int telefone;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        limitePublico.reiniciar();
        davi = token(APEX, "davi");
        mvc.perform(put("/api/estabelecimento/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(TODA_SEMANA))
                .andExpect(status().isOk());
        lavagem = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"precos\":{\"pequeno\":60,\"medio\":80,\"grande\":100,\"suv\":120,\"pickup\":140},\"duracoes\":{\"pequeno\":40,\"medio\":60,\"grande\":80,\"suv\":90,\"pickup\":100},\"intervaloMin\":0}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        dia = LocalDate.now(Fuso.BRASIL).plusDays(3);
        int n = SEQ.incrementAndGet();
        ip = "10.30." + (n / 250) + "." + (n % 250);
        telefone = 0;
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from aviso_painel");
        jdbc.update("delete from acesso_publico");
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente_veiculo");
        jdbc.update("delete from cliente");
        jdbc.update("delete from escala_faixa");
        jdbc.update("delete from configuracao_loja");
        jdbc.update("delete from box where loja_id = ?::uuid", LOJA_APEX);
        for (int i = 1; i <= 3; i++) jdbc.update("insert into box (loja_id, nome, ordem) values (?::uuid, ?, ?)", LOJA_APEX, "Box " + i, i - 1);
    }

    private static String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private static String texto(String json, String campo) {
        Matcher m = Pattern.compile("\"" + campo + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem " + campo + ": " + json);
        return m.group(1);
    }

    private static Instant as(LocalDate d, int hora, int minuto) {
        return ZonedDateTime.of(d, LocalTime.of(hora, minuto), Fuso.BRASIL).toInstant();
    }

    private String novoTelefone() {
        telefone += 1;
        return "5399910" + String.format("%04d", telefone);
    }

    private ResultActions horarios(String porte) throws Exception {
        return mvc.perform(get("/api/publico/horarios?data=" + dia + "&servicos=" + lavagem + (porte == null ? "" : "&porte=" + porte)).header("X-Forwarded-For", ip).with(host(APEX)));
    }

    private static String veiculo(String placa, String porte) {
        return ",\"veiculo\":{\"placa\":\"" + placa + "\",\"modelo\":\"Creta\",\"marca\":\"Hyundai\",\"cor\":\"Prata\",\"porte\":\"" + porte + "\"}";
    }

    private ResultActions pedir(String tel, Instant inicio, String extra) throws Exception {
        String corpo = "{\"nome\":\"Cliente Teste\",\"telefone\":\"" + tel + "\",\"servicoIds\":[\"" + lavagem + "\"],\"inicio\":\"" + inicio + "\"" + extra + "}";
        return mvc.perform(post("/api/publico/agendamentos").header("X-Forwarded-For", ip).with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private int contar(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    @Test
    void oDonoPodeTirarAObrigatoriedadeDoNomeEDosDadosDoVeiculoNoLink() throws Exception {
        // de fábrica tudo é obrigatório: sem veículo e sem nome o pedido é recusado
        pedir(novoTelefone(), as(dia, 9, 0), "").andExpect(status().isBadRequest());
        mvc.perform(get("/api/publico/agendar").header("X-Forwarded-For", ip).with(host(APEX))).andExpect(status().isOk())
                .andExpect(jsonPath("$.exigeNome").value(true)).andExpect(jsonPath("$.exigeVeiculo", hasSize(3)));
        // configuração inválida é recusada
        mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"veiculoObrigatorio\":[\"cor\"]}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"veiculoObrigatorio\":[\"placa\"],\"nomeObrigatorio\":false}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.nomeObrigatorio").value(false)).andExpect(jsonPath("$.veiculoObrigatorio[0]").value("placa"));
        // só a placa é exigida: sem placa recusa; com placa e sem modelo nem porte aceita (vale o porte médio) e o veículo fica só como foto
        pedir(novoTelefone(), as(dia, 9, 0), ",\"veiculo\":{\"modelo\":\"Onix\"}").andExpect(status().isBadRequest());
        String corpo = pedir(novoTelefone(), as(dia, 9, 0), ",\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"\",\"porte\":\"\"}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String agId = texto(corpo, "id");
        assertEquals("medio", jdbc.queryForObject("select porte from agendamento where id = ?::uuid", String.class, agId));
        assertEquals(new java.math.BigDecimal("80.00"), jdbc.queryForObject("select total from agendamento where id = ?::uuid", java.math.BigDecimal.class, agId));
        // placa informada errada continua recusada mesmo sem ser obrigatória
        mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"veiculoObrigatorio\":[]}")).andExpect(status().isOk());
        pedir(novoTelefone(), as(dia, 10, 0), ",\"veiculo\":{\"placa\":\"ZZ99\"}").andExpect(status().isBadRequest());
        // sem nada do veículo e sem nome: aceita, com o nome "Sem nome" no cadastro do telefone
        String corpo2 = mvc.perform(post("/api/publico/agendamentos").header("X-Forwarded-For", ip).with(host(APEX)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"\",\"telefone\":\"" + novoTelefone() + "\",\"servicoIds\":[\"" + lavagem + "\"],\"inicio\":\"" + as(dia, 10, 0) + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertEquals(1, contar("select count(*) from agendamento where id = ?::uuid and veiculo_placa is null", texto(corpo2, "id")));
        // nome de uma letra só nunca vale
        mvc.perform(post("/api/publico/agendamentos").header("X-Forwarded-For", ip).with(host(APEX)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"A\",\"telefone\":\"" + novoTelefone() + "\",\"servicoIds\":[\"" + lavagem + "\"],\"inicio\":\"" + as(dia, 11, 0) + "\"}")).andExpect(status().isBadRequest());
    }

    @Test
    void oProprietarioVeOQueFaltaQuandoOClienteNaoVeHorarios() throws Exception {
        mvc.perform(get("/api/estabelecimento/link-agendamento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk())
                .andExpect(jsonPath("$.pendencias", hasSize(0)));
        jdbc.update("update box set ativo = false where loja_id = ?::uuid", LOJA_APEX);
        mvc.perform(get("/api/estabelecimento/link-agendamento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk())
                .andExpect(jsonPath("$.pendencias", hasSize(1))).andExpect(jsonPath("$.pendencias[0]", containsString("Boxes")));
        mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"diasMax\":30}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pendencias[0]", containsString("Boxes")));
        jdbc.update("delete from escala_faixa");
        mvc.perform(get("/api/estabelecimento/link-agendamento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk())
                .andExpect(jsonPath("$.pendencias", hasItem(containsString("expediente"))));
    }

    @Test
    void aPaginaTrazOsPortesEOPrecoEADuracaoDeCadaUm() throws Exception {
        mvc.perform(get("/api/publico/agendar").header("X-Forwarded-For", ip).with(host(APEX))).andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true)).andExpect(jsonPath("$.tipo").value("estetica_automotiva")).andExpect(jsonPath("$.portes", hasSize(5)))
                .andExpect(jsonPath("$.servicos", hasSize(1))).andExpect(jsonPath("$.servicos[0].precos.suv").value(120)).andExpect(jsonPath("$.servicos[0].duracoes.suv").value(90))
                .andExpect(content().string(not(containsString("comissao")))).andExpect(content().string(not(containsString("custo"))));
    }

    @Test
    void osHorariosDependemDoPorteEExigemOPorte() throws Exception {
        horarios(null).andExpect(status().isBadRequest());
        horarios("carreta").andExpect(status().isBadRequest());
        horarios("pequeno").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(5))); // 40 min: 9:00 a 11:00
        horarios("suv").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(4))); // 90 min: 9:00 a 10:30
    }

    @Test
    void pedidoSemVeiculoOuComPorteInvalidoNaoEntra() throws Exception {
        pedir(novoTelefone(), as(dia, 9, 0), "").andExpect(status().isBadRequest());
        pedir(novoTelefone(), as(dia, 9, 0), veiculo("ABC", "suv")).andExpect(status().isBadRequest()); // placa inválida
        pedir(novoTelefone(), as(dia, 9, 0), veiculo("BRA2E19", "carreta")).andExpect(status().isBadRequest());
        assertEquals(0, contar("select count(*) from agendamento"));
    }

    @Test
    void oPedidoCongelaVeiculoPortePrecoEBoxENaoMexeNoCadastro() throws Exception {
        String tel = novoTelefone();
        String json = pedir(tel, as(dia, 9, 0), veiculo("BRA2E19", "suv")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.agendamento.total").value(120)).andExpect(jsonPath("$.agendamento.duracao").value(90))
                .andExpect(jsonPath("$.agendamento.veiculo.placa").value("BRA2E19")).andExpect(jsonPath("$.agendamento.veiculo.porte").value("suv"))
                .andReturn().getResponse().getContentAsString();
        String agendamento = id(json);
        assertEquals(1, contar("select count(*) from agendamento where id = ?::uuid and box_id is not null and porte = 'suv' and veiculo_placa = 'BRA2E19' and status = 'a_confirmar' and origem = 'link'", agendamento));
        assertEquals(0, contar("select count(*) from cliente_veiculo"), "o veículo do link não entra no cadastro do cliente");
        // o cliente que já existe pelo telefone continua com o cadastro dele, e o token só abre este horário
        pedir(tel, as(dia, 11, 0), veiculo("ABC1D23", "pequeno")).andExpect(status().isCreated());
        assertEquals(0, contar("select count(*) from cliente_veiculo"));
        assertEquals(1, contar("select count(*) from cliente"));
        assertEquals(2, contar("select count(*) from aviso_painel where texto like '%Creta%'"));
    }

    @Test
    void oCarroNuncaDivideOBoxEOHorarioSomeQuandoNaoHaBoxLivre() throws Exception {
        jdbc.update("update box set ativo = false where loja_id = ?::uuid and nome <> 'Box 1'", LOJA_APEX);
        pedir(novoTelefone(), as(dia, 9, 0), veiculo("BRA2E19", "pequeno")).andExpect(status().isCreated()); // 9:00 a 9:40 no único box
        // outro profissional estaria livre, mas o box não: o horário some e o pedido é recusado como "acabou de ser ocupado"
        horarios("pequeno").andExpect(jsonPath("$[?(@.inicio == '" + as(dia, 9, 0) + "')]").isEmpty());
        pedir(novoTelefone(), as(dia, 9, 30), veiculo("ABC1D23", "pequeno")).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value(LinkPublicoService.ERRO_HORARIO));
        // depois do fim do primeiro carro (9:40) o box volta a estar livre
        pedir(novoTelefone(), as(dia, 10, 0), veiculo("ABC1D23", "pequeno")).andExpect(status().isCreated());
        assertEquals(2, contar("select count(*) from agendamento where status <> 'cancelado'"));
    }

    @Test
    void semBoxCadastradoNaoHaHorario() throws Exception {
        jdbc.update("update box set ativo = false where loja_id = ?::uuid", LOJA_APEX);
        horarios("medio").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        pedir(novoTelefone(), as(dia, 9, 0), veiculo("BRA2E19", "medio")).andExpect(status().isConflict());
    }

    @Test
    void remarcarMantemOBoxEAsRegrasEOProprioHorarioContaComoLivre() throws Exception {
        jdbc.update("update box set ativo = false where loja_id = ?::uuid and nome <> 'Box 1'", LOJA_APEX);
        String json = pedir(novoTelefone(), as(dia, 9, 0), veiculo("BRA2E19", "pequeno")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String agendamento = id(json), token = texto(json, "token");
        // para remarcar, o próprio horário (9:00) aparece livre: ele ocupa o box, mas é o dele
        mvc.perform(get("/api/publico/agendamentos/" + agendamento + "/horarios?data=" + dia).header("X-Forwarded-For", ip).header("X-Acesso", token).with(host(APEX)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.inicio == '" + as(dia, 9, 0) + "')]").isNotEmpty());
        // outro carro ocupa 10:00; remarcar para cima dele é recusado, para 11:00 passa e o box continua o mesmo
        pedir(novoTelefone(), as(dia, 10, 0), veiculo("ABC1D23", "pequeno")).andExpect(status().isCreated());
        mvc.perform(post("/api/publico/agendamentos/" + agendamento + "/remarcar").header("X-Forwarded-For", ip).header("X-Acesso", token).with(host(APEX)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"inicio\":\"" + as(dia, 10, 0) + "\"}")).andExpect(status().isConflict());
        mvc.perform(post("/api/publico/agendamentos/" + agendamento + "/remarcar").header("X-Forwarded-For", ip).header("X-Acesso", token).with(host(APEX)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"inicio\":\"" + as(dia, 11, 0) + "\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("a_confirmar")).andExpect(jsonPath("$.veiculo.placa").value("BRA2E19"));
        assertEquals(1, contar("select count(*) from agendamento where id = ?::uuid and box_id is not null and inicio = ?", agendamento, java.time.OffsetDateTime.ofInstant(as(dia, 11, 0), java.time.ZoneOffset.UTC)));
    }
}
