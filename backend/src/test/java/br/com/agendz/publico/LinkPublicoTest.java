package br.com.agendz.publico;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
import java.util.List;
import java.util.UUID;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Link de agendamento do cliente (5e-1), sem login: página, horários livres (só início e profissional), pedido que entra a confirmar com token do próprio horário,
 * cadastro do cliente pelo telefone, limite de 3 abertos, cancelamento só com 24 h ou mais, cupom, ligar/desligar, limites de uso e isolamento entre lojas.
 * Usa a Offbox (barbearia, dois profissionais) e a Dalforno (barbearia, sem expediente); a Apex (estética) ainda não agenda pelo link.
 */
class LinkPublicoTest extends BaseApi {

    private static final String LOJA_OFFBOX = "00000000-0000-0000-0000-0000000000b2";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String TODA_SEMANA = "{\"semana\":{\"0\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},"
            + "\"2\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"3\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"4\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},"
            + "\"5\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"6\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]}}}";
    private static final Pattern TOKEN = Pattern.compile("^[0-9a-f]{48}$");
    private static final AtomicInteger SEQ = new AtomicInteger(10);

    @Autowired
    JdbcTemplate jdbc;

    String dono, colaborador;
    UUID proprietarioId, colaboradorId;
    String corte;
    LocalDate dia;
    String ip;
    int telefone;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        dono = token(OFFBOX, "proprietario");
        colaborador = token(OFFBOX, "colaborador1");
        proprietarioId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'proprietario'", UUID.class, LOJA_OFFBOX);
        colaboradorId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'colaborador1'", UUID.class, LOJA_OFFBOX);
        mvc.perform(put("/api/estabelecimento/escala").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON).content(TODA_SEMANA))
                .andExpect(status().isOk());
        corte = id(mvc.perform(post("/api/servicos").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Corte\",\"preco\":40,\"duracaoMin\":30,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        dia = LocalDate.now(Fuso.BRASIL).plusDays(3);
        // cada teste é um "aparelho" próprio: o limite por IP (em memória, compartilhado entre os testes) não mistura um teste com o outro
        int n = SEQ.incrementAndGet();
        ip = "10.20." + (n / 250) + "." + (n % 250);
        telefone = 0;
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from acesso_publico");
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from cupom_tentativa");
        jdbc.update("delete from cupom_servico");
        jdbc.update("delete from cupom");
        jdbc.update("delete from comissao_pagamento");
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
        return "5399900" + String.format("%04d", telefone);
    }

    private MockHttpServletRequestBuilder doCliente(MockHttpServletRequestBuilder req) {
        return req.header("X-Forwarded-For", ip);
    }

    private ResultActions horarios(String host, LocalDate d, String servicos, String extra) throws Exception {
        return mvc.perform(doCliente(get("/api/publico/horarios?data=" + d + "&servicos=" + servicos + extra)).with(host(host)));
    }

    private String corpo(String nome, String tel, String servicos, Instant inicio, String extra) {
        return "{\"nome\":\"" + nome + "\",\"telefone\":\"" + tel + "\",\"servicoIds\":[" + servicos + "],\"inicio\":\"" + inicio + "\"" + extra + "}";
    }

    private ResultActions pedir(String host, String corpo) throws Exception {
        return mvc.perform(doCliente(post("/api/publico/agendamentos")).with(host(host)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    /** Pede o Corte de 30 min às 9h + `deslocamento` blocos de 30 min, com telefone novo; devolve o JSON da resposta (201). */
    private String agendar(int bloco, String extra) throws Exception {
        return pedir(OFFBOX, corpo("Cliente Teste", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0).plusSeconds(bloco * 1800L), extra)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private ResultActions meus(String host, String... tokens) throws Exception {
        String lista = String.join(",", java.util.Arrays.stream(tokens).map(t -> "\"" + t + "\"").toList());
        return mvc.perform(doCliente(post("/api/publico/meus")).with(host(host)).contentType(MediaType.APPLICATION_JSON).content("{\"tokens\":[" + lista + "]}"));
    }

    private ResultActions cancelar(String host, String agendamento, String token) throws Exception {
        MockHttpServletRequestBuilder req = doCliente(post("/api/publico/agendamentos/" + agendamento + "/cancelar")).with(host(host));
        return mvc.perform(token == null ? req : req.header("X-Acesso", token));
    }

    private int contar(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    // ---------------------------------------------------------------- página e horários

    @Test
    void aPaginaMostraSoOQuePodeSerPublicoESemLogin() throws Exception {
        mvc.perform(doCliente(get("/api/publico/agendar")).with(host(OFFBOX))).andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true)).andExpect(jsonPath("$.diasMax").value(30))
                .andExpect(jsonPath("$.servicos", hasSize(1))).andExpect(jsonPath("$.servicos[0].nome").value("Corte")).andExpect(jsonPath("$.servicos[0].duracao").value(30))
                .andExpect(jsonPath("$.servicos[0].preco").value(40)).andExpect(jsonPath("$.profissionais", hasSize(2)))
                .andExpect(content().string(not(containsString("comissao")))).andExpect(content().string(not(containsString("custo"))))
                .andExpect(content().string(not(containsString("senha")))).andExpect(content().string(not(containsString("identificador"))));
        // serviço de vários dias, combo e desativado não aparecem; só o que o link sabe agendar
        jdbc.update("update servico set ativo = false where id = ?::uuid", corte);
        mvc.perform(doCliente(get("/api/publico/agendar")).with(host(OFFBOX))).andExpect(jsonPath("$.servicos", hasSize(0)));
    }

    @Test
    void esteticaAindaNaoAgendaPeloLinkEFicaDesligada() throws Exception {
        mvc.perform(doCliente(get("/api/publico/agendar")).with(host(APEX))).andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(false)).andExpect(jsonPath("$.servicos", hasSize(0))).andExpect(jsonPath("$.aviso").value(LinkPublicoService.ERRO_DESLIGADO));
        pedir(APEX, corpo("Ana Lima", "5399900001", "\"" + UUID.randomUUID() + "\"", as(dia, 9, 0), "")).andExpect(status().isForbidden());
    }

    @Test
    void horariosLivresSaemDoExpedienteDe30EmMinutosSemMostrarOutrosClientes() throws Exception {
        horarios(OFFBOX, dia, corte, "").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(6)))
                .andExpect(jsonPath("$[0].inicio").value(as(dia, 9, 0).toString())).andExpect(jsonPath("$[5].inicio").value(as(dia, 11, 30).toString()))
                .andExpect(jsonPath("$[0].cliente").doesNotExist()).andExpect(jsonPath("$[0].profissionalId").exists());
        // a loja sem expediente cadastrado não oferece horário
        String alan = token(DALFORNO, "alan");
        String corteDalforno = id(mvc.perform(post("/api/servicos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Corte\",\"preco\":40,\"duracaoMin\":30,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        horarios(DALFORNO, dia, corteDalforno, "").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        // o serviço de uma loja não existe na outra
        horarios(DALFORNO, dia, corte, "").andExpect(status().isBadRequest());
        // o dia de hoje só mostra o que ainda não passou; dia passado e dia além do limite não têm nada
        horarios(OFFBOX, LocalDate.now(Fuso.BRASIL).minusDays(1), corte, "").andExpect(jsonPath("$", hasSize(0)));
        horarios(OFFBOX, LocalDate.now(Fuso.BRASIL).plusDays(45), corte, "").andExpect(jsonPath("$", hasSize(0)));
        // serviço que não existe ou lista vazia: erro de pedido
        horarios(OFFBOX, dia, UUID.randomUUID().toString(), "").andExpect(status().isBadRequest());
    }

    @Test
    void osDiasLivresPintamOCalendario() throws Exception {
        mvc.perform(doCliente(get("/api/publico/dias?de=" + dia + "&dias=4&servicos=" + corte)).with(host(OFFBOX))).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(4))).andExpect(jsonPath("$[0]").value(dia.toString()));
        // fecha o dia seguinte para os dois profissionais: ele some da lista
        for (UUID p : List.of(proprietarioId, colaboradorId)) {
            jdbc.update("insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, total) "
                            + "select ?::uuid, c.id, ?, ?, ?, ?, 'confirmado', 0 from (select ?::uuid as id) c",
                    LOJA_OFFBOX, p, java.sql.Timestamp.from(as(dia.plusDays(1), 8, 0)), java.sql.Timestamp.from(as(dia.plusDays(1), 12, 30)),
                    java.sql.Timestamp.from(as(dia.plusDays(1), 12, 30)), clienteAvulso());
        }
        mvc.perform(doCliente(get("/api/publico/dias?de=" + dia + "&dias=3&servicos=" + corte)).with(host(OFFBOX)))
                .andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$[1]").value(dia.plusDays(2).toString()));
    }

    private UUID clienteAvulso() {
        return jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Avulso', 'v1:teste', md5(?)) returning id",
                UUID.class, LOJA_OFFBOX, UUID.randomUUID().toString());
    }

    // ---------------------------------------------------------------- pedir um horário

    @Test
    void pedidoEntraAConfirmarComTokenDoProprioHorarioESomeDaLista() throws Exception {
        String r = pedir(OFFBOX, corpo("Maria Souza", "(53) 99900-0001", "\"" + corte + "\"", as(dia, 9, 0), ",\"profissionalId\":\"" + proprietarioId + "\""))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.agendamento.status").value("a_confirmar")).andExpect(jsonPath("$.agendamento.rotulo").value("Aguardando confirmação"))
                .andExpect(jsonPath("$.agendamento.servicos[0]").value("Corte")).andExpect(jsonPath("$.agendamento.total").value(40)).andExpect(jsonPath("$.agendamento.podeCancelar").value(true))
                .andExpect(content().string(not(containsString("telefone")))).andReturn().getResponse().getContentAsString();
        String token = texto(r, "token");
        assertTrue(TOKEN.matcher(token).matches(), "48 caracteres hexadecimais");
        // no banco só o hash: o token em si nunca fica gravado
        assertEquals(0, contar("select count(*) from acesso_publico where token_hash = ?", token));
        assertEquals(64, jdbc.queryForObject("select char_length(token_hash) from acesso_publico", Integer.class));
        assertEquals("link", jdbc.queryForObject("select origem from agendamento", String.class));
        assertEquals("link", jdbc.queryForObject("select origem_cadastro from cliente", String.class));
        assertEquals(proprietarioId, jdbc.queryForObject("select profissional_id from agendamento", UUID.class));
        assertEquals(1, contar("select count(*) from agendamento_evento where autor_nome = 'Cliente (link)' and campo = 'criação'"));
        // o painel enxerga o pedido como qualquer outro
        mvc.perform(get("/api/agendamentos?de=" + as(dia, 0, 0) + "&ate=" + as(dia, 23, 59)).with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].origem").value("link")).andExpect(jsonPath("$[0].status").value("a_confirmar"));
        // o horário ocupado some para aquele profissional (pendente também ocupa) e continua para o outro
        horarios(OFFBOX, dia, corte, "&profissionalId=" + proprietarioId).andExpect(jsonPath("$", hasSize(5))).andExpect(jsonPath("$[0].inicio").value(as(dia, 9, 30).toString()));
        horarios(OFFBOX, dia, corte, "").andExpect(jsonPath("$", hasSize(6))).andExpect(jsonPath("$[0].profissionalId").value(colaboradorId.toString()));
    }

    @Test
    void semEscolherProfissionalUsaOPrimeiroLivreEQuandoAcabaRecusa() throws Exception {
        String t1 = pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String t2 = pedir(OFFBOX, corpo("Bia Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertNotEquals(texto(t1, "token"), texto(t2, "token"));
        assertEquals(2, contar("select count(distinct profissional_id) from agendamento"), "cada pedido ficou com um profissional");
        pedir(OFFBOX, corpo("Cai Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(LinkPublicoService.ERRO_HORARIO));
        assertEquals(2, contar("select count(*) from agendamento"));
        horarios(OFFBOX, dia, corte, "").andExpect(jsonPath("$", hasSize(5))).andExpect(jsonPath("$[0].inicio").value(as(dia, 9, 30).toString()));
        // pedido que atravessa um horário ocupado também é recusado (corte de 30 min às 9h30 não bate; dois cortes juntos às 9h bateriam)
        pedir(OFFBOX, corpo("Dai Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 30), "")).andExpect(status().isCreated());
    }

    @Test
    void validacoesDoPedidoEIscaDeRobo() throws Exception {
        String s = "\"" + corte + "\"";
        Instant bom = as(dia, 9, 0);
        pedir(OFFBOX, corpo("A", novoTelefone(), s, bom, "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Informe o seu nome."));
        pedir(OFFBOX, corpo("Ana Lima", "12345", s, bom, "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Informe o telefone com DDD."));
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, bom, ",\"site\":\"http://spam\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Não foi possível agendar. Tente de novo."));
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "", bom, "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Escolha ao menos um serviço."));
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s + "," + s, bom, "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("O mesmo serviço aparece duas vezes."));
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + UUID.randomUUID() + "\"", bom, "")).andExpect(status().isBadRequest());
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, Instant.now().minusSeconds(3600).withNano(0), "")).andExpect(status().isBadRequest());
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, bom.plusSeconds(5), "")).andExpect(status().isBadRequest());
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, as(LocalDate.now(Fuso.BRASIL).plusDays(45), 9, 0), "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Escolha um dia e um horário."));
        // fora do expediente (13h) e atravessando o fim dele (11h45 + 30 min)
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, as(dia, 13, 0), "")).andExpect(status().isConflict());
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, as(dia, 11, 45), "")).andExpect(status().isConflict());
        // campo que a API não conhece (o cliente não escolhe loja, status, preço nem cliente) é recusado
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, bom, ",\"status\":\"confirmado\"")).andExpect(status().isBadRequest());
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), s, bom, ",\"clienteId\":\"" + UUID.randomUUID() + "\"")).andExpect(status().isBadRequest());
        assertEquals(0, contar("select count(*) from agendamento"));
        assertEquals(0, contar("select count(*) from cliente"), "pedido recusado não deixa cadastro");
    }

    @Test
    void servicoComAntecedenciaExigeAsHorasMinimas() throws Exception {
        jdbc.update("update servico set antecedencia_h = 72 where id = ?::uuid", corte);
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(LocalDate.now(Fuso.BRASIL).plusDays(1), 9, 0), "")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esse serviço exige 72 h de antecedência."));
        horarios(OFFBOX, LocalDate.now(Fuso.BRASIL).plusDays(1), corte, "").andExpect(jsonPath("$", hasSize(0)));
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(LocalDate.now(Fuso.BRASIL).plusDays(5), 9, 0), "")).andExpect(status().isCreated());
    }

    @Test
    void telefoneQueJaTemCadastroMandaENadaDoCadastroMuda() throws Exception {
        mvc.perform(post("/api/clientes").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Maria Souza\",\"telefone\":\"53999000001\"}")).andExpect(status().isCreated());
        String existente = jdbc.queryForObject("select id::text from cliente", String.class);
        pedir(OFFBOX, corpo("Mariana Hacker da Silva", "(53) 99900-0001", "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isCreated());
        assertEquals(1, contar("select count(*) from cliente"), "o mesmo número não criou outro cadastro");
        assertEquals("Maria Souza", jdbc.queryForObject("select nome from cliente", String.class), "quem digita no link não renomeia o cadastro");
        assertEquals("painel", jdbc.queryForObject("select origem_cadastro from cliente", String.class));
        assertEquals(existente, jdbc.queryForObject("select cliente_id::text from agendamento", String.class));
    }

    @Test
    void clienteComTresHorariosAbertosNaoPedeOQuarto() throws Exception {
        String tel = novoTelefone();
        for (int i = 0; i < 3; i++) pedir(OFFBOX, corpo("Ana Lima", tel, "\"" + corte + "\"", as(dia, 9, 0).plusSeconds(i * 1800L), "")).andExpect(status().isCreated());
        pedir(OFFBOX, corpo("Ana Lima", tel, "\"" + corte + "\"", as(dia, 10, 30), "")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Você já tem 3 horários marcados. Cancele um deles para agendar outro."));
        assertEquals(3, contar("select count(*) from agendamento"));
        assertEquals(1, contar("select count(*) from cliente"));
    }

    // ---------------------------------------------------------------- os próprios horários

    @Test
    void oTokenAbreSoOHorarioQueEleGuardaENuncaOsOutros() throws Exception {
        String tel = novoTelefone();
        String a = pedir(OFFBOX, corpo("Ana Lima", tel, "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String b = pedir(OFFBOX, corpo("Ana Lima", tel, "\"" + corte + "\"", as(dia, 10, 0), "")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String ta = texto(a, "token"), tb = texto(b, "token");
        meus(OFFBOX, ta).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].id").value(id(a)))
                .andExpect(content().string(not(containsString("telefone")))).andExpect(content().string(not(containsString("clienteId"))));
        meus(OFFBOX, ta, tb, "lixo", "0".repeat(48)).andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$[0].id").value(id(a))).andExpect(jsonPath("$[1].id").value(id(b)));
        meus(OFFBOX).andExpect(jsonPath("$", hasSize(0)));
        // token de uma loja não abre nada na outra
        meus(DALFORNO, ta, tb).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        // e o horário de um não é cancelado com o token do outro
        cancelar(OFFBOX, id(a), tb).andExpect(status().isNotFound());
        cancelar(DALFORNO, id(a), ta).andExpect(status().isNotFound());
        assertEquals(2, contar("select count(*) from agendamento where status = 'a_confirmar'"));
    }

    @Test
    void cancelarSoComVinteEQuatroHorasOuMaisEQuandoCancelaOHorarioVolta() throws Exception {
        String r = agendar(0, ",\"profissionalId\":\"" + proprietarioId + "\"");
        String ag = id(r), token = texto(r, "token");
        cancelar(OFFBOX, ag, null).andExpect(status().isNotFound());
        cancelar(OFFBOX, ag, "x".repeat(48)).andExpect(status().isNotFound());
        cancelar(OFFBOX, ag, token).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("cancelado")).andExpect(jsonPath("$.ativo").value(false)).andExpect(jsonPath("$.podeCancelar").value(false));
        assertEquals("cliente", jdbc.queryForObject("select motivo_cancelamento from agendamento", String.class));
        assertEquals(1, contar("select count(*) from agendamento_evento where campo = 'status' and para = 'Cancelado pelo cliente'"));
        horarios(OFFBOX, dia, corte, "&profissionalId=" + proprietarioId).andExpect(jsonPath("$", hasSize(6)));
        // já cancelado: não cancela de novo
        cancelar(OFFBOX, ag, token).andExpect(status().isNotFound());
        // menos de 24 h: a API recusa (não só o botão)
        String r2 = agendar(1, ",\"profissionalId\":\"" + proprietarioId + "\"");
        jdbc.update("update agendamento set inicio = now() + interval '2 hours', fim_servico = now() + interval '150 minutes', fim_ocupado = now() + interval '150 minutes' where id = ?::uuid", id(r2));
        cancelar(OFFBOX, id(r2), texto(r2, "token")).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem", containsString("24 horas")));
        assertEquals("a_confirmar", jdbc.queryForObject("select status from agendamento where id = ?::uuid", String.class, id(r2)));
        meus(OFFBOX, texto(r2, "token")).andExpect(jsonPath("$[0].podeCancelar").value(false)).andExpect(jsonPath("$[0].ativo").value(true));
        // concluído não cancela
        jdbc.update("update agendamento set status = 'concluido' where id = ?::uuid", id(r2));
        cancelar(OFFBOX, id(r2), texto(r2, "token")).andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- cupom

    private String[] cupom(int pct) throws Exception {
        LocalDate h = LocalDate.now(Fuso.BRASIL);
        String r = mvc.perform(post("/api/cupons").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Boas-vindas\",\"tipo\":\"percentual\",\"percentual\":" + pct + ",\"inicio\":\"" + h.minusDays(1) + "\",\"fim\":\"" + h.plusDays(30) + "\",\"usosMax\":10,\"usosPorCliente\":2}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return new String[]{id(r), texto(r, "chave")};
    }

    @Test
    void cupomNoPedidoDaDescontoEChaveErradaDerrubaOPedidoInteiro() throws Exception {
        String[] c = cupom(25);
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), ",\"cupomChave\":\"AAAA-BBBB-CCCC\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Cupom inválido ou indisponível."));
        assertEquals(0, contar("select count(*) from agendamento"), "chave errada: nenhum horário foi criado");
        assertEquals(0, contar("select count(*) from cliente"));
        assertEquals(1, contar("select n from cupom_tentativa where quem = ?", "link:" + ip), "a tentativa errada ficou gravada mesmo com o pedido recusado");
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), ",\"cupomChave\":\"" + c[1].toLowerCase() + "\"")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.agendamento.desconto").value(10)).andExpect(jsonPath("$.agendamento.cupom").value("Boas-vindas")).andExpect(jsonPath("$.agendamento.total").value(40));
        assertEquals(10.0, jdbc.queryForObject("select desconto::float8 from agendamento_servico", Double.class));
        assertEquals(0, contar("select count(*) from cupom_tentativa where quem = ?", "link:" + ip), "acertar zera a conta de erros");
    }

    @Test
    void cincoChavesErradasSeguidasBloqueiamOCupomPorQuinzeMinutos() throws Exception {
        String[] c = cupom(10);
        for (int i = 0; i < 5; i++) {
            pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), ",\"cupomChave\":\"ZZZZ-ZZZZ-Z" + (i + 2) + "ZZ\"")).andExpect(status().isBadRequest());
        }
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), ",\"cupomChave\":\"" + c[1] + "\"")).andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.mensagem", containsString("Muitas tentativas")));
        assertEquals(0, contar("select count(*) from agendamento"));
        // sem cupom o mesmo aparelho continua podendo agendar
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isCreated());
    }

    // ---------------------------------------------------------------- ligar e desligar, limites

    @Test
    void soODonoLigaEDesligaOLinkEDesligadoNinguemAgenda() throws Exception {
        mvc.perform(get("/api/estabelecimento/link-agendamento").with(host(OFFBOX))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/estabelecimento/link-agendamento").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colaborador))).andExpect(status().isForbidden());
        mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(colaborador)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ativo\":false}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/estabelecimento/link-agendamento").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk())
                .andExpect(jsonPath("$.ativo").value(true)).andExpect(jsonPath("$.diasMax").value(30)).andExpect(jsonPath("$.disponivel").value(true));
        for (String ruim : List.of("{\"diasMax\":0}", "{\"diasMax\":61}")) {
            mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON).content(ruim))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON).content("{\"ativo\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(false)).andExpect(jsonPath("$.diasMax").value(30));
        mvc.perform(doCliente(get("/api/publico/agendar")).with(host(OFFBOX))).andExpect(jsonPath("$.ativo").value(false)).andExpect(jsonPath("$.servicos", hasSize(0)));
        horarios(OFFBOX, dia, corte, "").andExpect(jsonPath("$", hasSize(0)));
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.mensagem").value(LinkPublicoService.ERRO_DESLIGADO));
        // religa e limita a 2 dias à frente
        mvc.perform(put("/api/estabelecimento/link-agendamento").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON).content("{\"ativo\":true,\"diasMax\":2}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.diasMax").value(2));
        pedir(OFFBOX, corpo("Ana Lima", novoTelefone(), "\"" + corte + "\"", as(dia, 9, 0), "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Escolha um dia e um horário."));
        horarios(OFFBOX, dia, corte, "").andExpect(jsonPath("$", hasSize(0)));
        // a configuração é de cada loja
        assertEquals(0, contar("select count(*) from configuracao_loja where loja_id = ?::uuid", LOJA_DALFORNO));
    }

    @Test
    void oMesmoTelefoneNaoPedeMaisDeCincoVezesPorMinuto() throws Exception {
        String tel = novoTelefone();
        for (int i = 0; i < 5; i++) pedir(OFFBOX, corpo("Ana Lima", tel, "\"" + UUID.randomUUID() + "\"", as(dia, 9, 0), "")).andExpect(status().isBadRequest());
        pedir(OFFBOX, corpo("Ana Lima", tel, "\"" + UUID.randomUUID() + "\"", as(dia, 9, 0), "")).andExpect(status().isTooManyRequests());
    }

    @Test
    void rotasDePedidoNaoAbremParaQuemNaoTemLojaNemParaOutrosMetodos() throws Exception {
        mvc.perform(post("/api/publico/agendamentos").with(host("naoexiste.agendz.io")).contentType(MediaType.APPLICATION_JSON)
                .content(corpo("Ana Lima", "5399900001", "\"" + corte + "\"", as(dia, 9, 0), ""))).andExpect(status().isNotFound());
        // só o que foi liberado é público: o resto da API continua exigindo login
        mvc.perform(post("/api/agendamentos").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/publico/outra-coisa").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }
}
