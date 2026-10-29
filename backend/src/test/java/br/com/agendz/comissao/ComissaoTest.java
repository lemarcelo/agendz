package br.com.agendz.comissao;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
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

/** Comissão (5d-4b): percentual congelado, relatório do dono, "Meus ganhos" sem valor cheio, pagar sem duplicar, cancelar/restaurar e lançamento atrasado. */
class ComissaoTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";

    @Autowired
    JdbcTemplate jdbc;

    String davi, pablo, alan;
    UUID pabloId, marceloId, daviId;
    String lavagem, pomada;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = token(APEX, "pablo");
        alan = token(DALFORNO, "alan");
        pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, LOJA_APEX);
        marceloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'marcelo'", UUID.class, LOJA_APEX);
        daviId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'davi'", UUID.class, LOJA_APEX);
        lavagem = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"preco\":80,\"duracaoMin\":60,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        pomada = id(mvc.perform(post("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Pomada\",\"preco\":45,\"comissaoPct\":10,\"estoque\":50}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from comissao_pagamento");
        jdbc.update("delete from movimento_estoque");
        jdbc.update("delete from material");
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

    private ResultActions atender(String token, String corpo) throws Exception {
        return mvc.perform(post("/api/atendimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String lavar(UUID prof, String extra) {
        return "{\"profissionalId\":\"" + prof + "\",\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\",\"porte\":\"medio\"},\"servicoIds\":[\"" + lavagem + "\"]" + extra + "}";
    }

    private String criar(String token, UUID prof, String extra) throws Exception {
        return id(atender(token, lavar(prof, extra)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions ler(String token, String url) throws Exception {
        return mvc.perform(get(url).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions pagar(String token, String corpo, String chave) throws Exception {
        var req = post("/api/comissoes/pagamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo);
        if (chave != null) req = req.header("Idempotency-Key", chave);
        return mvc.perform(req);
    }

    private ResultActions pagarMes(String token, String chave) throws Exception {
        return pagar(token, "{\"profissionalId\":\"" + pabloId + "\",\"de\":\"" + hoje() + "\",\"ate\":\"" + hoje() + "\"}", chave);
    }

    private static LocalDate hoje() {
        return Instant.now().atZone(Fuso.BRASIL).toLocalDate();
    }

    private static final String MES = "/api/comissoes?de=%s&ate=%s";

    private ResultActions relatorio(String token) throws Exception {
        return ler(token, String.format(MES, hoje(), hoje()));
    }

    // ---------------------------------------------------------------- cálculo e congelamento

    @Test
    void percentualFicaCongeladoEORelatorioDoDonoMostraAParteDaCasa() throws Exception {
        criar(davi, pabloId, ""); // geral = 50%
        mvc.perform(put("/api/estabelecimento/comissao").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"comissaoPadrao\":30}")).andExpect(status().isOk());
        criar(davi, pabloId, ""); // agora 30%; o primeiro segue em 50%
        relatorio(davi).andExpect(status().isOk()).andExpect(jsonPath("$.profissionais", hasSize(1))).andExpect(jsonPath("$.profissionais[0].nome").isNotEmpty())
                .andExpect(jsonPath("$.profissionais[0].atendimentos").value(2)).andExpect(jsonPath("$.profissionais[0].base").value(160.0))
                .andExpect(jsonPath("$.profissionais[0].comissao").value(64.0)).andExpect(jsonPath("$.profissionais[0].casa").value(96.0))
                .andExpect(jsonPath("$.profissionais[0].aPagar").value(64.0)).andExpect(jsonPath("$.profissionais[0].pago").value(0.0))
                .andExpect(jsonPath("$.totais.comissao").value(64.0)).andExpect(jsonPath("$.totais.casa").value(96.0));
        assertEquals(2, jdbc.queryForObject("select count(*) from agendamento_servico where comissao_pct is not null", Integer.class));
    }

    @Test
    void servicoComPercentualProprioVenceEZeroSignificaSemComissao() throws Exception {
        String lixa = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Polimento\",\"preco\":200,\"duracaoMin\":60,\"intervaloMin\":0,\"comissaoPct\":25}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String zero = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Brinde\",\"preco\":10,\"duracaoMin\":10,\"intervaloMin\":0,\"comissaoPct\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        atender(davi, "{\"profissionalId\":\"" + pabloId + "\",\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\",\"porte\":\"medio\"},\"servicoIds\":[\"" + lixa + "\",\"" + zero + "\"]}").andExpect(status().isCreated());
        relatorio(davi).andExpect(jsonPath("$.profissionais[0].base").value(210.0)).andExpect(jsonPath("$.profissionais[0].comissao").value(50.0))
                .andExpect(jsonPath("$.profissionais[0].casa").value(160.0));
    }

    @Test
    void donoQueAtendeFicaComTudoENaoRecebeComissao() throws Exception {
        criar(davi, daviId, "");
        relatorio(davi).andExpect(jsonPath("$.profissionais[0].semComissao").value(true)).andExpect(jsonPath("$.profissionais[0].comissao").value(80.0))
                .andExpect(jsonPath("$.profissionais[0].casa").value(0.0)).andExpect(jsonPath("$.profissionais[0].aPagar").value(0.0))
                .andExpect(jsonPath("$.totais.comissao").value(0.0)).andExpect(jsonPath("$.totais.aPagar").value(0.0));
        pagar(davi, "{\"profissionalId\":\"" + daviId + "\",\"de\":\"" + hoje() + "\",\"ate\":\"" + hoje() + "\"}", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("O proprietário não recebe comissão: o que ele atende já é dele."));
    }

    @Test
    void produtoVendidoPorOutraPessoaEDaComissaoDeQuemVendeu() throws Exception {
        // atendimento do Marcelo; o Pablo vendeu a pomada (10%): 45 × 10% = 4,50 para o Pablo; o serviço (50%) é do Marcelo
        atender(davi, lavar(marceloId, ",\"produtos\":[{\"materialId\":\"" + pomada + "\",\"qtd\":1}],\"vendedorId\":\"" + pabloId + "\"")).andExpect(status().isCreated());
        relatorio(davi).andExpect(jsonPath("$.profissionais", hasSize(2)))
                .andExpect(jsonPath("$.profissionais[?(@.id == '" + pabloId + "')].comissao").value(4.5))
                .andExpect(jsonPath("$.profissionais[?(@.id == '" + marceloId + "')].comissao").value(40.0))
                .andExpect(jsonPath("$.totais.comissao").value(44.5));
    }

    @Test
    void produtoSemPercentualUsaOPercentualDaPessoaQueVendeEFicaCongelado() throws Exception {
        String cera = id(mvc.perform(post("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Cera\",\"preco\":100,\"estoque\":50}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String vendaCera = ",\"produtos\":[{\"materialId\":\"" + cera + "\",\"qtd\":1}],\"vendedorId\":\"" + pabloId + "\"";
        // sem percentual no produto nem na pessoa: a venda não comissiona
        String a1 = criar(davi, marceloId, vendaCera);
        assertEquals(0.0, jdbc.queryForObject("select coalesce(max(comissao_pct),0)::float8 from agendamento_produto where agendamento_id = ?::uuid", Double.class, a1));
        // a pessoa passa a ter 8% sobre produtos: vale para a próxima venda; a anterior não muda
        jdbc.update("update usuario set comissao_produto_pct = 8 where id = ?", pabloId);
        String a2 = criar(davi, marceloId, vendaCera);
        assertEquals(8.0, jdbc.queryForObject("select comissao_pct::float8 from agendamento_produto where agendamento_id = ?::uuid", Double.class, a2));
        assertEquals(0.0, jdbc.queryForObject("select coalesce(max(comissao_pct),0)::float8 from agendamento_produto where agendamento_id = ?::uuid", Double.class, a1));
        // o percentual do próprio produto vence o da pessoa (pomada: 10%)
        String a3 = criar(davi, marceloId, ",\"produtos\":[{\"materialId\":\"" + pomada + "\",\"qtd\":1}],\"vendedorId\":\"" + pabloId + "\"");
        assertEquals(10.0, jdbc.queryForObject("select comissao_pct::float8 from agendamento_produto where agendamento_id = ?::uuid", Double.class, a3));
        // Pablo recebe 8% de 100 pela cera e 10% de 45 pela pomada (os serviços são do Marcelo)
        relatorio(davi).andExpect(jsonPath("$.profissionais[?(@.id == '" + pabloId + "')].comissao").value(12.5));
    }

    // ---------------------------------------------------------------- meus ganhos e permissão

    @Test
    void meusGanhosMostraSoOQueEleRecebeENadaDoValorCheio() throws Exception {
        criar(davi, pabloId, "");
        ler(pablo, "/api/comissoes/meu?de=" + hoje() + "&ate=" + hoje()).andExpect(status().isOk()).andExpect(jsonPath("$.linhas", hasSize(1)))
                .andExpect(jsonPath("$.linhas[0].receber").value(40.0)).andExpect(jsonPath("$.linhas[0].servicos[0]").value("Lavagem"))
                .andExpect(jsonPath("$.linhas[0].base").doesNotExist()).andExpect(jsonPath("$.linhas[0].casa").doesNotExist()).andExpect(jsonPath("$.linhas[0].pct").doesNotExist())
                .andExpect(jsonPath("$.totais.receber").value(40.0)).andExpect(jsonPath("$.totais.aReceber").value(40.0)).andExpect(jsonPath("$.totais.jaPago").value(0.0))
                .andExpect(jsonPath("$.totais.casa").doesNotExist()).andExpect(jsonPath("$.profissionais").doesNotExist());
    }

    @Test
    void permissoesDoRelatorioEDoPagamento() throws Exception {
        criar(davi, pabloId, "");
        relatorio(pablo).andExpect(status().isForbidden());
        ler(davi, "/api/comissoes/meu?de=" + hoje() + "&ate=" + hoje()).andExpect(status().isForbidden());
        pagarMes(pablo, null).andExpect(status().isForbidden());
        mvc.perform(get(String.format(MES, hoje(), hoje())).with(host(APEX))).andExpect(status().isUnauthorized());
        // outra loja não vê nada da Apex
        mvc.perform(get(String.format(MES, hoje(), hoje())).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk()).andExpect(jsonPath("$.profissionais", hasSize(0)));
        // token da Apex no endereço da Dalforno não vale
        mvc.perform(get(String.format(MES, hoje(), hoje())).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isForbidden());
    }

    @Test
    void periodoInvalidoRecusaComMensagem() throws Exception {
        ler(davi, "/api/comissoes").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Informe o período."));
        ler(davi, "/api/comissoes?de=2026-10-10&ate=2026-10-01").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("A data final não pode ser antes da inicial."));
        ler(davi, "/api/comissoes?de=2025-01-01&ate=2026-12-31").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("O período pode ter no máximo 366 dias."));
        ler(davi, "/api/comissoes?mes=outubro").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Período inválido."));
        ler(davi, "/api/comissoes?mes=2026-10").andExpect(status().isOk());
    }

    // ---------------------------------------------------------------- pagar

    @Test
    void pagarMarcaComoPagoEUmSegundoPagamentoNaoTemOQuePagar() throws Exception {
        criar(davi, pabloId, "");
        criar(davi, pabloId, "");
        pagarMes(davi, null).andExpect(status().isCreated()).andExpect(jsonPath("$.valor").value(80.0)).andExpect(jsonPath("$.atendimentos").value(2));
        relatorio(davi).andExpect(jsonPath("$.profissionais[0].pago").value(80.0)).andExpect(jsonPath("$.profissionais[0].aPagar").value(0.0))
                .andExpect(jsonPath("$.totais.pago").value(80.0));
        ler(pablo, "/api/comissoes/meu?de=" + hoje() + "&ate=" + hoje()).andExpect(jsonPath("$.totais.jaPago").value(80.0)).andExpect(jsonPath("$.linhas[0].paga").value(true));
        pagarMes(davi, null).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Não há comissão a pagar neste período para esse profissional."));
        assertEquals(1, jdbc.queryForObject("select count(*) from comissao_pagamento", Integer.class));
    }

    @Test
    void mesmaChaveDePagamentoNaoPagaDuasVezes() throws Exception {
        criar(davi, pabloId, "");
        String chave = "pagamento-de-teste-0001-abcdef";
        pagarMes(davi, chave).andExpect(status().isCreated());
        pagarMes(davi, chave).andExpect(status().isCreated()).andExpect(jsonPath("$.valor").value(40.0));
        assertEquals(1, jdbc.queryForObject("select count(*) from comissao_pagamento", Integer.class));
    }

    // ---------------------------------------------------------------- cancelar e restaurar

    @Test
    void cancelarZeraAComissaoSeguraOMotivoERestauraVolta() throws Exception {
        String ag = criar(davi, pabloId, "");
        String base = "/api/agendamentos/" + ag + "/comissao/";
        mvc.perform(post(base + "cancelar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"abc\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Informe o motivo do cancelamento da comissão (pelo menos 5 letras)."));
        mvc.perform(post(base + "cancelar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)).contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"Cortesia da casa\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(base + "cancelar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"Cortesia da casa\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(post(base + "cancelar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"Cortesia da casa\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("A comissão já está cancelada."));
        relatorio(davi).andExpect(jsonPath("$.profissionais[0].comissao").value(0.0)).andExpect(jsonPath("$.profissionais[0].casa").value(80.0)).andExpect(jsonPath("$.profissionais[0].aPagar").value(0.0))
                .andExpect(jsonPath("$.profissionais[0].linhas[0].cancelada").value(true)).andExpect(jsonPath("$.profissionais[0].linhas[0].comissaoOriginal").value(40.0))
                .andExpect(jsonPath("$.profissionais[0].linhas[0].motivoCancelada").value("Cortesia da casa"));
        ler(pablo, "/api/comissoes/meu?de=" + hoje() + "&ate=" + hoje()).andExpect(jsonPath("$.linhas[0].receber").value(0.0)).andExpect(jsonPath("$.linhas[0].cancelada").value(true));
        pagarMes(davi, null).andExpect(status().isBadRequest());
        ler(davi, "/api/agendamentos/" + ag).andExpect(jsonPath("$.historico[?(@.campo == 'comissão')]", hasSize(1)));
        mvc.perform(post(base + "restaurar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isNoContent());
        mvc.perform(post(base + "restaurar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Não há comissão cancelada para restaurar."));
        relatorio(davi).andExpect(jsonPath("$.profissionais[0].comissao").value(40.0)).andExpect(jsonPath("$.profissionais[0].aPagar").value(40.0));
    }

    @Test
    void comissaoPagaNaoSeCancela() throws Exception {
        String ag = criar(davi, pabloId, "");
        pagarMes(davi, null).andExpect(status().isCreated());
        mvc.perform(post("/api/agendamentos/" + ag + "/comissao/cancelar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"motivo\":\"Cortesia da casa\"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Comissão já paga: não dá para cancelar."));
    }

    // ---------------------------------------------------------------- lançamento atrasado

    @Test
    void lancamentoAtrasadoDePeriodoJaPagoEntraNoProximoPagamento() throws Exception {
        Instant antes = Instant.now().minus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES);
        LocalDate dia = antes.atZone(Fuso.BRASIL).toLocalDate();
        String retro = ",\"inicio\":\"" + antes + "\",\"motivoRetroativo\":\"Esqueci de lançar no dia\"";
        criar(davi, pabloId, retro);
        pagar(davi, "{\"profissionalId\":\"" + pabloId + "\",\"de\":\"" + dia + "\",\"ate\":\"" + dia + "\"}", null).andExpect(status().isCreated());
        // lança outro do mesmo dia, já com o período pago: vai para o próximo pagamento
        String atrasado = criar(davi, pabloId, retro.replace("Esqueci de lançar no dia", "Esqueci de novo"));
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento where comissao_em is not null", Integer.class));
        ler(davi, "/api/agendamentos/" + atrasado).andExpect(jsonPath("$.historico[?(@.campo == 'lançamento retroativo' && @.para =~ /.*próximo pagamento.*/)]", hasSize(1)));
        ler(davi, String.format(MES, dia, dia)).andExpect(jsonPath("$.profissionais[0].atendimentos").value(1)).andExpect(jsonPath("$.profissionais[0].pago").value(40.0));
        relatorio(davi).andExpect(jsonPath("$.profissionais[0].atendimentos").value(1)).andExpect(jsonPath("$.profissionais[0].aPagar").value(40.0));
        pagarMes(davi, null).andExpect(status().isCreated()).andExpect(jsonPath("$.valor").value(40.0));
    }
}
