package br.com.agendz.cupom;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.escala.Fuso;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
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

/**
 * Cupons e vales (5d-4c-2): cadastro só de quem tem Estabelecimento, chave gerada no servidor, uso derivado dos agendamentos, limite total e por cliente,
 * desconto por serviço, bloqueio por chave errada (a tentativa fica gravada mesmo com o pedido recusado), cupom no Atender, comissão sobre o valor com desconto
 * e isolamento entre lojas.
 */
class CupomTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final Pattern FORMATO = Pattern.compile("^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$");

    @Autowired
    JdbcTemplate jdbc;

    String davi, pablo, alan;
    UUID pabloId;
    String lavagem, polimento;
    Instant futuro;
    int telefone;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = token(APEX, "pablo");
        alan = token(DALFORNO, "alan");
        pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, LOJA_APEX);
        lavagem = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"preco\":80,\"duracaoMin\":60,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        polimento = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Polimento\",\"preco\":200,\"duracaoMin\":60,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        futuro = Instant.now().plus(10, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
        telefone = 0;
    }

    @AfterEach
    void limpar() {
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

    private static LocalDate hoje() {
        return Instant.now().atZone(Fuso.BRASIL).toLocalDate();
    }

    private ResultActions pedir(String host, String token, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req) throws Exception {
        return mvc.perform(req.with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions criarCupom(String token, String corpo) throws Exception {
        return pedir(APEX, token, post("/api/cupons").contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String corpoCupom(String nome, String tipo, String extra, LocalDate inicio, LocalDate fim, int usosMax, int porCliente) {
        return "{\"nome\":\"" + nome + "\",\"tipo\":\"" + tipo + "\"" + extra + ",\"inicio\":\"" + inicio + "\",\"fim\":\"" + fim + "\",\"usosMax\":" + usosMax + ",\"usosPorCliente\":" + porCliente + "}";
    }

    /** Cria um cupom de 25% vigente e devolve [id, chave]. */
    private String[] cupomPercentual(String nome, int pct, int usosMax, int porCliente) throws Exception {
        String r = criarCupom(davi, corpoCupom(nome, "percentual", ",\"percentual\":" + pct, hoje().minusDays(1), hoje().plusDays(30), usosMax, porCliente))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return new String[]{id(r), texto(r, "chave")};
    }

    /** Agendamento futuro de Lavagem (R$ 80) para um cliente novo (telefone único por chamada). */
    private String agendar(String... extraServicos) throws Exception {
        StringBuilder servicos = new StringBuilder("\"" + lavagem + "\"");
        for (String s : extraServicos) servicos.append(",\"").append(s).append("\"");
        return agendarComTelefone("5399900" + String.format("%04d", telefone + 1), servicos.toString(), "");
    }

    private String agendarComTelefone(String tel, String servicos, String extra) throws Exception {
        telefone += 1; // cada chamada usa uma hora própria: o mesmo profissional nunca fica com dois horários no mesmo instante
        String corpo = "{\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[" + servicos + "],\"nome\":\"Cliente\",\"telefone\":\"" + tel + "\",\"inicio\":\"" + futuro.plus(telefone, ChronoUnit.HOURS) + "\"" + extra + "}";
        return id(pedir(APEX, davi, post("/api/atendimentos").contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions aplicar(String token, String agendamento, String chave) throws Exception {
        return pedir(APEX, token, post("/api/agendamentos/" + agendamento + "/cupom").contentType(MediaType.APPLICATION_JSON).content("{\"chave\":\"" + chave + "\"}"));
    }

    private int tentativas(String quem) {
        List<Integer> n = jdbc.queryForList("select n from cupom_tentativa where quem = ?", Integer.class, quem);
        return n.isEmpty() ? 0 : n.get(0);
    }

    // ---------------------------------------------------------------- cadastro

    @Test
    void aChaveNasceNoServidorEQuemNaoTemEstabelecimentoNaoVe() throws Exception {
        String r = criarCupom(davi, corpoCupom("Black Friday", "percentual", ",\"percentual\":15", hoje(), hoje().plusDays(7), 50, 2)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.situacao").value("vigente")).andExpect(jsonPath("$.usos").value(0)).andExpect(jsonPath("$.servicoIds", hasSize(0)))
                .andReturn().getResponse().getContentAsString();
        assertEquals(true, FORMATO.matcher(texto(r, "chave")).matches(), "formato XXXX-XXXX-XXXX sem 0, O, 1, I");
        // a chave nunca vem do cliente
        criarCupom(davi, "{\"nome\":\"X\",\"tipo\":\"percentual\",\"percentual\":10,\"chave\":\"AAAA-BBBB-CCCC\",\"inicio\":\"" + hoje() + "\",\"fim\":\"" + hoje() + "\",\"usosMax\":1,\"usosPorCliente\":1}")
                .andExpect(status().isBadRequest());
        // o profissional não tem Estabelecimento: nem lê nem grava
        pedir(APEX, pablo, get("/api/cupons")).andExpect(status().isForbidden());
        criarCupom(pablo, corpoCupom("Meu", "percentual", ",\"percentual\":10", hoje(), hoje(), 1, 1)).andExpect(status().isForbidden());
        pedir(APEX, davi, get("/api/cupons")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Black Friday"));
    }

    @Test
    void validacoesDoCadastro() throws Exception {
        LocalDate h = hoje();
        String[][] ruins = {
                {corpoCupom("A", "inexistente", "", h, h, 1, 1), "Escolha o tipo: vale serviço, desconto em % ou em R$."},
                {corpoCupom("A", "servico", "", h, h, 1, 1), "O vale precisa dizer qual serviço ele cobre."},
                {corpoCupom("A", "percentual", ",\"percentual\":0", h, h, 1, 1), "O desconto em % vai de 1 a 100."},
                {corpoCupom("A", "percentual", ",\"percentual\":101", h, h, 1, 1), "O desconto em % vai de 1 a 100."},
                {corpoCupom("A", "valor", ",\"valor\":0", h, h, 1, 1), "Informe o valor do desconto em reais (maior que zero)."},
                {corpoCupom("A", "valor", ",\"valor\":10001", h, h, 1, 1), "Informe o valor do desconto em reais (maior que zero)."},
                {corpoCupom("A", "valor", ",\"valor\":10", h, h.minusDays(1), 1, 1), "A vigência termina antes de começar."},
                {corpoCupom("A", "valor", ",\"valor\":10", h, h, 0, 1), "Quantas vezes o cupom pode ser usado no total: de 1 a 10000."},
                {corpoCupom("A", "valor", ",\"valor\":10", h, h, 1, 101), "Quantas vezes cada cliente pode usar: de 1 a 100."},
                {corpoCupom("   ", "valor", ",\"valor\":10", h, h, 1, 1), "Dê um nome ao cupom."},
                {corpoCupom("A", "servico", ",\"servicoIds\":[\"" + UUID.randomUUID() + "\"]", h, h, 1, 1), "Serviço não encontrado."},
        };
        for (String[] r : ruins) criarCupom(davi, r[0]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value(r[1]));
        pedir(APEX, davi, get("/api/cupons")).andExpect(jsonPath("$", hasSize(0)));
        // vale com serviço e valor fixo com serviços escolhidos
        criarCupom(davi, corpoCupom("Vale lavagem", "servico", ",\"servicoIds\":[\"" + lavagem + "\"]", h, h.plusDays(5), 3, 1)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.servicoIds[0]").value(lavagem)).andExpect(jsonPath("$.percentual").doesNotExist());
    }

    @Test
    void historicoNaoSeAlteraNovaChaveInvalidaAAntigaENuncaUsadoApaga() throws Exception {
        String[] a = cupomPercentual("A", 10, 5, 1);
        // vencido (fim ontem) vai para o histórico: não altera, não troca a chave
        String vencido = id(criarCupom(davi, corpoCupom("Velho", "percentual", ",\"percentual\":10", hoje().minusDays(10), hoje().minusDays(1), 5, 1)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.situacao").value("expirado")).andReturn().getResponse().getContentAsString());
        pedir(APEX, davi, put("/api/cupons/" + vencido).contentType(MediaType.APPLICATION_JSON).content(corpoCupom("Velho 2", "percentual", ",\"percentual\":20", hoje(), hoje(), 5, 1)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Cupom do histórico não se altera. Use-o como modelo para criar outro."));
        pedir(APEX, davi, post("/api/cupons/" + vencido + "/chave")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Cupom do histórico não tem chave nova."));
        // vigente altera; a chave nova invalida a antiga
        pedir(APEX, davi, put("/api/cupons/" + a[0]).contentType(MediaType.APPLICATION_JSON).content(corpoCupom("A2", "percentual", ",\"percentual\":20", hoje(), hoje().plusDays(3), 4, 1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nome").value("A2")).andExpect(jsonPath("$.percentual").value(20.0)).andExpect(jsonPath("$.chave").value(a[1]));
        String nova = texto(pedir(APEX, davi, post("/api/cupons/" + a[0] + "/chave")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "chave");
        assertEquals(false, nova.equals(a[1]));
        String ag = agendar();
        aplicar(davi, ag, a[1]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Cupom inválido ou indisponível."));
        aplicar(davi, ag, nova).andExpect(status().isOk());
        // usado: só encerra (vai para o histórico); nunca usado: apaga
        pedir(APEX, davi, delete("/api/cupons/" + a[0])).andExpect(status().isOk()).andExpect(jsonPath("$.desativado").value(true));
        pedir(APEX, davi, get("/api/cupons")).andExpect(jsonPath("$[?(@.id=='" + a[0] + "')].situacao").value(hasItem("inativo")));
        pedir(APEX, davi, delete("/api/cupons/" + vencido)).andExpect(status().isOk()).andExpect(jsonPath("$.desativado").value(false));
        pedir(APEX, davi, get("/api/cupons")).andExpect(jsonPath("$", hasSize(1)));
        pedir(APEX, davi, delete("/api/cupons/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }

    // ---------------------------------------------------------------- aplicar e retirar

    @Test
    void aplicarGuardaODescontoPorServicoNaoMostraAChaveERetirarDesfaz() throws Exception {
        String[] c = cupomPercentual("Lavagem 25%", 25, 5, 1);
        String ag = agendar(polimento); // 80 + 200
        // minúsculas e sem hífens também valem
        aplicar(davi, ag, c[1].toLowerCase().replace("-", "")).andExpect(status().isOk())
                .andExpect(jsonPath("$.desconto").value(70.0)).andExpect(jsonPath("$.cupom.nome").value("Lavagem 25%")).andExpect(jsonPath("$.cupom.chave").doesNotExist())
                .andExpect(jsonPath("$.servicos[0].desconto").value(20.0)).andExpect(jsonPath("$.servicos[1].desconto").value(50.0)).andExpect(jsonPath("$.total").value(280.0));
        pedir(APEX, davi, get("/api/agendamentos/" + ag)).andExpect(jsonPath("$.historico[*].campo").value(hasItem("cupom")));
        pedir(APEX, davi, get("/api/cupons")).andExpect(jsonPath("$[0].usos").value(1));
        // só um cupom por horário
        String[] outro = cupomPercentual("Outro", 10, 5, 1);
        aplicar(davi, ag, outro[1]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Esse horário já tem um cupom. Retire o atual para usar outro."));
        pedir(APEX, davi, delete("/api/agendamentos/" + ag + "/cupom")).andExpect(status().isOk()).andExpect(jsonPath("$.desconto").value(0))
                .andExpect(jsonPath("$.cupom").doesNotExist()).andExpect(jsonPath("$.servicos[0].desconto").value(0.0));
        pedir(APEX, davi, delete("/api/agendamentos/" + ag + "/cupom")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Esse horário não tem cupom."));
        pedir(APEX, davi, get("/api/cupons")).andExpect(jsonPath("$[?(@.id=='" + c[0] + "')].usos").value(hasItem(0)));
    }

    @Test
    void valeServicoESoOsServicosQueOCupomCobre() throws Exception {
        String vale = texto(criarCupom(davi, corpoCupom("Vale polimento", "servico", ",\"servicoIds\":[\"" + polimento + "\"]", hoje(), hoje().plusDays(5), 5, 1))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "chave");
        String soLavagem = agendar();
        aplicar(davi, soLavagem, vale).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Esse cupom não vale para os serviços deste horário."));
        String comPolimento = agendar(polimento);
        aplicar(davi, comPolimento, vale).andExpect(status().isOk()).andExpect(jsonPath("$.desconto").value(200.0)).andExpect(jsonPath("$.servicos[1].desconto").value(200.0))
                .andExpect(jsonPath("$.servicos[0].desconto").value(0.0));
    }

    @Test
    void limiteTotalEPorClienteECancelarDevolveOUso() throws Exception {
        String[] c = cupomPercentual("Só dois", 10, 2, 1);
        String um = agendarComTelefone("53999000001", "\"" + lavagem + "\"", "");
        String doisMesmoCliente = agendarComTelefone("53999000001", "\"" + lavagem + "\"", ""); // mesmo cliente
        aplicar(davi, um, c[1]).andExpect(status().isOk());
        aplicar(davi, doisMesmoCliente, c[1]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Esse cliente já usou esse cupom o máximo de vezes."));
        String tres = agendarComTelefone("53999000002", "\"" + lavagem + "\"", "");
        String quatro = agendarComTelefone("53999000003", "\"" + lavagem + "\"", "");
        aplicar(davi, tres, c[1]).andExpect(status().isOk());
        aplicar(davi, quatro, c[1]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Esse cupom já foi usado até o limite."));
        // cancelar o horário devolve o uso (derivado, sem contador)
        pedir(APEX, davi, put("/api/agendamentos/" + um + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"cancelado\"}")).andExpect(status().isOk());
        pedir(APEX, davi, get("/api/cupons")).andExpect(jsonPath("$[0].usos").value(1));
        aplicar(davi, quatro, c[1]).andExpect(status().isOk());
    }

    @Test
    void cupomForaDaVigenciaEHorarioConcluidoOuLocalNaoAceitam() throws Exception {
        String futuroCupom = texto(criarCupom(davi, corpoCupom("Amanhã", "percentual", ",\"percentual\":10", hoje().plusDays(2), hoje().plusDays(9), 5, 1)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.situacao").value("futuro")).andReturn().getResponse().getContentAsString(), "chave");
        String vencido = texto(criarCupom(davi, corpoCupom("Ontem", "percentual", ",\"percentual\":10", hoje().minusDays(9), hoje().minusDays(1), 5, 1)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "chave");
        String ag = agendar();
        aplicar(davi, ag, futuroCupom).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Esse cupom ainda não começou a valer."));
        aplicar(davi, ag, vencido).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Esse cupom venceu."));
        String[] bom = cupomPercentual("Bom", 10, 5, 1);
        pedir(APEX, davi, put("/api/agendamentos/" + ag + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"cancelado\"}")).andExpect(status().isOk());
        aplicar(davi, ag, bom[1]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Só dá para usar cupom em horário a confirmar ou confirmado."));
        // atendimento local (já aconteceu) não usa cupom, nem pelo Atender
        pedir(APEX, davi, post("/api/atendimentos").contentType(MediaType.APPLICATION_JSON)
                .content("{\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[\"" + lavagem + "\"],\"cupomChave\":\"" + bom[1] + "\"}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Cupom só vale em agendamento (data futura)."));
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento", Integer.class), "o atendimento recusado não foi criado");
    }

    @Test
    void oProfissionalSoMexeNoCupomDoProprioHorarioMasPrecisaDoAcessoAoCupom() throws Exception {
        String[] c = cupomPercentual("P", 10, 5, 1);
        String doPablo = agendar();
        String outro = id(pedir(APEX, davi, post("/api/atendimentos").contentType(MediaType.APPLICATION_JSON)
                .content("{\"profissionalId\":\"" + jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'marcelo'", UUID.class, LOJA_APEX)
                        + "\",\"servicoIds\":[\"" + lavagem + "\"],\"nome\":\"Z\",\"telefone\":\"53999009999\",\"inicio\":\"" + futuro.plus(30, ChronoUnit.HOURS) + "\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        aplicar(pablo, outro, c[1]).andExpect(status().isNotFound());
        aplicar(pablo, doPablo, c[1]).andExpect(status().isOk());
    }

    // ---------------------------------------------------------------- tentativas erradas

    @Test
    void cincoChavesErradasBloqueiamEATentativaFicaGravadaMesmoComOPedidoRecusado() throws Exception {
        String[] c = cupomPercentual("Segredo", 10, 5, 1);
        String ag = agendar();
        for (int i = 1; i <= 4; i++) {
            aplicar(davi, ag, "AAAA-BBBB-CCC" + i).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Cupom inválido ou indisponível."));
            assertEquals(i, tentativas(jdbc.queryForObject("select id::text from usuario where identificador = 'davi' and loja_id = ?::uuid", String.class, LOJA_APEX)), "a tentativa errada fica gravada");
        }
        aplicar(davi, ag, "não é uma chave").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Cupom inválido ou indisponível."));
        // 5ª errada: bloqueado, mesmo com a chave certa
        aplicar(davi, ag, c[1]).andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.mensagem").value(containsString("Muitas tentativas com chave errada")));
        assertEquals(1, jdbc.queryForObject("select count(*) from cupom_tentativa where ate is not null", Integer.class));
        // outro usuário não é bloqueado
        aplicar(pablo, ag, c[1]).andExpect(status().isOk());
    }

    @Test
    void acertarZeraAsTentativas() throws Exception {
        String[] c = cupomPercentual("Zera", 10, 5, 1);
        String ag = agendar();
        aplicar(davi, ag, "AAAA-BBBB-CCCC").andExpect(status().isBadRequest());
        aplicar(davi, ag, "AAAA-BBBB-CCCD").andExpect(status().isBadRequest());
        aplicar(davi, ag, c[1]).andExpect(status().isOk());
        assertEquals(0, jdbc.queryForObject("select count(*) from cupom_tentativa", Integer.class));
    }

    // ---------------------------------------------------------------- Atender, comissão e lojas

    @Test
    void atenderComCupomCriaOAgendamentoComODescontoEChaveErradaNaoCriaNada() throws Exception {
        String[] c = cupomPercentual("No Atender", 50, 5, 1);
        String corpo = "{\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[\"" + lavagem + "\"],\"nome\":\"Rita\",\"telefone\":\"53999001111\",\"inicio\":\"" + futuro + "\",\"cupomChave\":\"";
        pedir(APEX, davi, post("/api/atendimentos").contentType(MediaType.APPLICATION_JSON).content(corpo + "AAAA-BBBB-CCCC\"}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Cupom inválido ou indisponível."));
        assertEquals(0, jdbc.queryForObject("select count(*) from agendamento", Integer.class), "cupom recusado: o agendamento também não é criado");
        assertEquals(0, jdbc.queryForObject("select count(*) from cliente", Integer.class), "nem o cliente");
        assertEquals(1, jdbc.queryForObject("select coalesce(sum(n), 0) from cupom_tentativa", Integer.class), "mas a tentativa errada ficou gravada");
        pedir(APEX, davi, post("/api/atendimentos").contentType(MediaType.APPLICATION_JSON).content(corpo + c[1] + "\"}")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.desconto").value(40.0)).andExpect(jsonPath("$.cupom.nome").value("No Atender")).andExpect(jsonPath("$.status").value("a_confirmar"));
        pedir(APEX, davi, get("/api/cupons")).andExpect(jsonPath("$[0].usos").value(1));
    }

    @Test
    void aComissaoUsaOValorComDesconto() throws Exception {
        String[] c = cupomPercentual("25%", 25, 5, 1); // lavagem 80 → desconto 20 → base 60 → 50% = 30
        String ag = agendar();
        aplicar(davi, ag, c[1]).andExpect(status().isOk());
        // o atendimento acontece hoje, já concluído
        jdbc.update("update agendamento set status = 'concluido', inicio = now() - interval '30 minutes', fim_servico = now() - interval '5 minutes', fim_ocupado = now() - interval '5 minutes' where id = ?::uuid", ag);
        pedir(APEX, davi, get("/api/comissoes?de=" + hoje() + "&ate=" + hoje())).andExpect(status().isOk())
                .andExpect(jsonPath("$.profissionais[0].base").value(60.0)).andExpect(jsonPath("$.profissionais[0].comissao").value(30.0)).andExpect(jsonPath("$.profissionais[0].casa").value(30.0));
    }

    @Test
    void cupomDeUmaLojaNaoApareceNemFuncionaNaOutra() throws Exception {
        String[] c = cupomPercentual("Só da Apex", 10, 5, 1);
        pedir(DALFORNO, alan, get("/api/cupons")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        pedir(DALFORNO, alan, put("/api/cupons/" + c[0]).contentType(MediaType.APPLICATION_JSON).content(corpoCupom("X", "percentual", ",\"percentual\":10", hoje(), hoje(), 1, 1))).andExpect(status().isNotFound());
        pedir(DALFORNO, alan, post("/api/cupons/" + c[0] + "/chave")).andExpect(status().isNotFound());
        pedir(DALFORNO, alan, delete("/api/cupons/" + c[0])).andExpect(status().isNotFound());
        String corte = id(pedir(DALFORNO, alan, post("/api/servicos").contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Corte\",\"preco\":45,\"duracaoMin\":45,\"intervaloMin\":0}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        UUID alanId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'alan'", UUID.class, LOJA_DALFORNO);
        String ag = id(pedir(DALFORNO, alan, post("/api/atendimentos").contentType(MediaType.APPLICATION_JSON)
                .content("{\"profissionalId\":\"" + alanId + "\",\"servicoIds\":[\"" + corte + "\"],\"nome\":\"W\",\"telefone\":\"53999007777\",\"inicio\":\"" + futuro + "\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        pedir(DALFORNO, alan, post("/api/agendamentos/" + ag + "/cupom").contentType(MediaType.APPLICATION_JSON).content("{\"chave\":\"" + c[1] + "\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Cupom inválido ou indisponível."));
    }
}
