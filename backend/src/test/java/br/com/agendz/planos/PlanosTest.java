package br.com.agendz.planos;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.escala.Fuso;
import br.com.agendz.publico.LimitePublico;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
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
 * Planos de serviço no servidor (V32): seção `planos` (padrão de ninguém), catálogo, assinatura, mensalidade com Idempotency-Key, uso no Atender (desconto = preço,
 * cota, adiantamento, intervalo), cancelar devolve o corte, estorno que não deixa horário sem cobertura, encerrar com dívida, pedido e saldo públicos (sem login,
 * com limite e resposta genérica) e isolamento entre lojas (API, IDOR e Row Level Security). Usa a Offbox (barbearia) e a Dalforno como "outra loja".
 */
class PlanosTest extends BaseApi {

    private static final String LOJA_OFFBOX = "00000000-0000-0000-0000-0000000000b2";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String TODA_SEMANA = "{\"semana\":{\"0\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},"
            + "\"2\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"3\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"4\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},"
            + "\"5\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]},\"6\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"]]}}}";
    private static final String CHAVE = "chave-de-repeticao-0001";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    DataSource ds;
    @Autowired
    LimitePublico limitePublico;
    @Autowired
    br.com.agendz.auth.LimiteDeLogin limiteLogin;
    @Autowired
    br.com.agendz.agenda.HorariosFixos horariosFixos;

    String dono, colaborador, alan;
    UUID colaboradorId;
    String corte, barba, planoId;
    LocalDate m1; // 1º dia do mês que vem: datas fixas dentro de um mês só, longe da virada
    String mes1, mes2;
    int telefone;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        limitePublico.reiniciar();
        // outro teste da mesma JVM pode ter deixado o login desses usuários bloqueado (429): zera antes de entrar
        limiteLogin.limpar(LOJA_OFFBOX + "|proprietario"); limiteLogin.limpar(LOJA_OFFBOX + "|colaborador1"); limiteLogin.limpar(LOJA_DALFORNO + "|alan");
        dono = token(OFFBOX, "proprietario");
        colaborador = token(OFFBOX, "colaborador1");
        alan = token(DALFORNO, "alan");
        colaboradorId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'colaborador1'", UUID.class, LOJA_OFFBOX);
        mvc.perform(put("/api/estabelecimento/escala").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON).content(TODA_SEMANA))
                .andExpect(status().isOk());
        corte = id(escrever(post("/api/servicos"), dono, "{\"nome\":\"Corte\",\"preco\":40,\"duracaoMin\":30,\"intervaloMin\":0}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        barba = id(escrever(post("/api/servicos"), dono, "{\"nome\":\"Barba\",\"preco\":25,\"duracaoMin\":30,\"intervaloMin\":0}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        m1 = LocalDate.now(Fuso.BRASIL).plusMonths(1).withDayOfMonth(1);
        mes1 = String.format("%04d-%02d", m1.getYear(), m1.getMonthValue());
        mes2 = String.format("%04d-%02d", m1.plusMonths(1).getYear(), m1.plusMonths(1).getMonthValue());
        telefone = 0;
        planoId = null;
    }

    @AfterEach
    void limpar() {
        jdbc.update("update usuario set permissoes = '{}'::jsonb where identificador = 'colaborador1'");
        jdbc.update("delete from pedido_plano");
        jdbc.update("delete from aviso_painel");
        jdbc.update("delete from acesso_publico");
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from assinatura_fixo_aviso");
        jdbc.update("delete from assinatura_fixo");
        jdbc.update("delete from assinatura_evento");
        jdbc.update("delete from assinatura_pagamento");
        jdbc.update("delete from assinatura");
        jdbc.update("delete from plano_servico");
        jdbc.update("delete from plano");
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

    // ---------------------------------------------------------------- ajudantes

    private static String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private static Instant as(LocalDate d, int hora) {
        return ZonedDateTime.of(d, LocalTime.of(hora, 0), Fuso.BRASIL).toInstant();
    }

    private ResultActions escrever(MockHttpServletRequestBuilder req, String token, String corpo) throws Exception {
        return mvc.perform(req.with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions ler(String url, String token) throws Exception {
        return mvc.perform(get(url).with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private String novoTelefone() {
        telefone += 1;
        return "5399900" + String.format("%04d", telefone);
    }

    private String corpoPlano(String nome, int preco, int cortes, String... servicos) {
        StringBuilder s = new StringBuilder();
        for (String x : servicos) s.append(s.length() == 0 ? "" : ",").append("\"").append(x).append("\"");
        return "{\"nome\":\"" + nome + "\",\"descricao\":\"Plano de teste\",\"preco\":" + preco + ",\"cortes\":" + cortes + ",\"servicoIds\":[" + s
                + "],\"adianta\":1,\"acumuloMeses\":2,\"intervaloDias\":3}";
    }

    private String criarPlano(String nome, int preco, int cortes, String... servicos) throws Exception {
        return id(escrever(post("/api/planos"), dono, corpoPlano(nome, preco, cortes, servicos)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String criarCliente(String nome, String tel) throws Exception {
        return id(escrever(post("/api/clientes"), dono, "{\"nome\":\"" + nome + "\",\"telefone\":\"" + tel + "\"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions contratar(String token, String cliente, String plano, String inicioMes) throws Exception {
        return escrever(post("/api/assinaturas"), token, "{\"clienteId\":\"" + cliente + "\",\"planoId\":\"" + plano + "\",\"inicioMes\":\"" + inicioMes + "\"}");
    }

    private ResultActions pagar(String assinatura, String mes) throws Exception {
        return escrever(post("/api/assinaturas/" + assinatura + "/pagamentos"), dono, "{\"mes\":\"" + mes + "\",\"forma\":\"pix\"}");
    }

    private String pagamentoDe(String assinatura, String mes) {
        return jdbc.queryForObject("select id::text from assinatura_pagamento where assinatura_id = ?::uuid and mes = ? and not estornado", String.class, assinatura, mes);
    }

    /** Plano de 2 cortes por mês (Corte) + cliente + assinatura que começa no mês que vem; devolve [assinatura, cliente, telefone]. */
    private String[] assinaturaAtiva(boolean pagarMes1) throws Exception {
        planoId = criarPlano("Plano Mensal", 120, 2, corte);
        String tel = novoTelefone();
        String cliente = criarCliente("Cliente Plano", tel);
        String assinatura = id(contratar(dono, cliente, planoId, mes1).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        if (pagarMes1) pagar(assinatura, mes1).andExpect(status().isCreated());
        return new String[]{assinatura, cliente, tel};
    }

    private String corpoAtender(String tel, String servicos, Instant inicio, String assinatura) {
        return "{\"profissionalId\":\"" + colaboradorId + "\",\"servicoIds\":[" + servicos + "],\"nome\":\"Cliente Plano\",\"telefone\":\"" + tel + "\",\"inicio\":\"" + inicio + "\""
                + (assinatura == null ? "" : ",\"assinaturaId\":\"" + assinatura + "\"") + "}";
    }

    private ResultActions atender(String tel, String servicos, int dia, int hora, String assinatura) throws Exception {
        return escrever(post("/api/atendimentos"), dono, corpoAtender(tel, servicos, as(m1.withDayOfMonth(dia), hora), assinatura));
    }

    /** Saldo de cortes ao fim de um mês, lido do extrato derivado dos agendamentos (o `restantes` do Atender só olha o mês corrente, e o plano de teste começa no mês que vem). */
    private void saldoDoMes(String assinatura, String mes, int esperado) throws Exception {
        ler("/api/planos", dono).andExpect(status().isOk())
                .andExpect(jsonPath("$.assinaturas[0].extrato[?(@.mes=='" + mes + "')].saldoFim").value(org.hamcrest.Matchers.contains(esperado)));
    }

    private int contar(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    // ---------------------------------------------------------------- permissão

    @Test
    void soQuemTemASecaoPlanosEntraEOpadraoEDeNinguem() throws Exception {
        ler("/api/planos", colaborador).andExpect(status().isForbidden());
        escrever(post("/api/planos"), colaborador, corpoPlano("Do colaborador", 100, 2, corte)).andExpect(status().isForbidden());
        mvc.perform(get("/api/planos").with(host(OFFBOX))).andExpect(status().isUnauthorized());
        // o dono libera por pessoa; revogar volta a recusar
        jdbc.update("update usuario set permissoes = '{\"planos\": true}'::jsonb where identificador = 'colaborador1'");
        ler("/api/planos", colaborador).andExpect(status().isOk());
        jdbc.update("update usuario set permissoes = '{\"planos\": false}'::jsonb where identificador = 'colaborador1'");
        ler("/api/planos", colaborador).andExpect(status().isForbidden());
        ler("/api/planos", dono).andExpect(status().isOk());
    }

    // ---------------------------------------------------------------- catálogo

    @Test
    void catalogoValidaNomeRepetidoPrecoCortesEServicos() throws Exception {
        String p = criarPlano("Plano Ouro", 150, 4, corte, barba);
        ler("/api/planos", dono).andExpect(status().isOk()).andExpect(jsonPath("$.planos", hasSize(1))).andExpect(jsonPath("$.planos[0].servicoIds", hasSize(2)));
        escrever(post("/api/planos"), dono, corpoPlano("plano ouro", 150, 4, corte)).andExpect(status().isBadRequest());   // nome repetido (sem diferenciar maiúsculas)
        escrever(post("/api/planos"), dono, corpoPlano("Sem preço", 0, 4, corte)).andExpect(status().isBadRequest());
        escrever(post("/api/planos"), dono, corpoPlano("Cortes demais", 100, 32, corte)).andExpect(status().isBadRequest());
        escrever(post("/api/planos"), dono, corpoPlano("Sem serviço", 100, 2)).andExpect(status().isBadRequest());
        escrever(post("/api/planos"), dono, corpoPlano("Serviço fantasma", 100, 2, UUID.randomUUID().toString())).andExpect(status().isBadRequest());
        escrever(put("/api/planos/" + p), dono, corpoPlano("Plano Ouro", 160, 4, corte)).andExpect(status().isOk()).andExpect(jsonPath("$.preco").value(160)).andExpect(jsonPath("$.servicoIds", hasSize(1)));
        assertEquals(1, contar("select count(*) from plano"));
    }

    @Test
    void removerPlanoNuncaContratadoApagaEContratadoSoDesativa() throws Exception {
        String solto = criarPlano("Plano Solto", 80, 2, corte);
        escrever(delete("/api/planos/" + solto), dono, "").andExpect(status().isOk()).andExpect(jsonPath("$.desativado").value(false));
        assertEquals(0, contar("select count(*) from plano where id = ?::uuid", solto));
        String[] a = assinaturaAtiva(false);
        escrever(delete("/api/planos/" + planoId), dono, "").andExpect(status().isOk()).andExpect(jsonPath("$.desativado").value(true));
        assertFalse(jdbc.queryForObject("select ativo from plano where id = ?::uuid", Boolean.class, planoId));
        // plano desativado não se contrata de novo
        String outro = criarCliente("Outro", novoTelefone());
        contratar(dono, outro, planoId, mes1).andExpect(status().isNotFound());
        // serviço que está num plano só desativa
        escrever(delete("/api/servicos/" + corte), dono, "").andExpect(status().is2xxSuccessful());
        assertEquals(1, contar("select count(*) from servico where id = ?::uuid", corte));
        assertTrue(a[0].length() > 0);
    }

    // ---------------------------------------------------------------- assinatura e mensalidade

    @Test
    void semMensalidadeNaoHaCorteEPagarAtivaAAssinatura() throws Exception {
        String[] a = assinaturaAtiva(false);
        assertEquals("pendente", jdbc.queryForObject("select status from assinatura where id = ?::uuid", String.class, a[0]));
        atender(a[2], "\"" + corte + "\"", 5, 9, a[0]).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("Esse plano não está ativo."));
        pagar(a[0], mes1).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ativa")).andExpect(jsonPath("$.pagamentos", hasSize(1)))
                .andExpect(jsonPath("$.pagamentos[0].valor").value(120));
        assertEquals("ativa", jdbc.queryForObject("select status from assinatura where id = ?::uuid", String.class, a[0]));
        // mensalidade do mesmo mês duas vezes: 409; forma inválida: 400; mês antes do início: 400
        pagar(a[0], mes1).andExpect(status().isConflict());
        escrever(post("/api/assinaturas/" + a[0] + "/pagamentos"), dono, "{\"mes\":\"" + mes2 + "\",\"forma\":\"fiado\"}").andExpect(status().isBadRequest());
        pagar(a[0], "2000-01").andExpect(status().isBadRequest());
        // um cliente só tem um plano em andamento
        contratar(dono, a[1], planoId, mes1).andExpect(status().isConflict());
    }

    @Test
    void mensalidadeComChaveDeRepeticaoNaoRegistraDuasVezes() throws Exception {
        String[] a = assinaturaAtiva(false);
        String corpo = "{\"mes\":\"" + mes1 + "\",\"forma\":\"dinheiro\"}";
        MockHttpServletRequestBuilder req = post("/api/assinaturas/" + a[0] + "/pagamentos").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .header("Idempotency-Key", CHAVE).contentType(MediaType.APPLICATION_JSON).content(corpo);
        mvc.perform(req).andExpect(status().isCreated());
        mvc.perform(post("/api/assinaturas/" + a[0] + "/pagamentos").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .header("Idempotency-Key", CHAVE).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated());   // mesma resposta, sem registrar de novo
        assertEquals(1, contar("select count(*) from assinatura_pagamento where assinatura_id = ?::uuid", a[0]));
        // a mesma chave com outro corpo é conflito
        mvc.perform(post("/api/assinaturas/" + a[0] + "/pagamentos").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(dono))
                .header("Idempotency-Key", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"mes\":\"" + mes2 + "\",\"forma\":\"dinheiro\"}")).andExpect(status().isConflict());
    }

    // ---------------------------------------------------------------- uso no Atender

    @Test
    void usarOPlanoDaServicoDeGracaAdiantaUmCorteERecusaOQuarto() throws Exception {
        String[] a = assinaturaAtiva(true);
        // 1º corte: serviço coberto sai de graça (desconto = preço) e o agendamento guarda o plano
        atender(a[2], "\"" + corte + "\"", 2, 9, a[0]).andExpect(status().isCreated()).andExpect(jsonPath("$.plano.nome").value("Plano Mensal"));
        assertEquals(0, new BigDecimal("40.00").compareTo(jdbc.queryForObject("select desconto from agendamento_servico where servico_id = ?::uuid", BigDecimal.class, corte)));
        assertTrue(jdbc.queryForObject("select plano from agendamento_servico where servico_id = ?::uuid", Boolean.class, corte));
        assertEquals(a[0], jdbc.queryForObject("select plano_assinatura_id::text from agendamento", String.class));
        // intervalo mínimo de 3 dias entre cortes
        atender(a[2], "\"" + corte + "\"", 3, 9, a[0]).andExpect(status().isConflict());
        // 2º corte (acaba a cota), 3º adiantado do mês seguinte (a cota deixa 1), 4º recusado
        atender(a[2], "\"" + corte + "\"", 8, 9, a[0]).andExpect(status().isCreated());
        atender(a[2], "\"" + corte + "\"", 14, 9, a[0]).andExpect(status().isCreated());
        atender(a[2], "\"" + corte + "\"", 20, 9, a[0]).andExpect(status().isConflict());
        assertEquals(3, contar("select count(*) from agendamento where plano_assinatura_id = ?::uuid", a[0]));
        // o saldo é derivado dos agendamentos: nada de contador gravado
        saldoDoMes(a[0], mes1, -1);
        ler("/api/planos/cliente/" + a[1], dono).andExpect(status().isOk()).andExpect(jsonPath("$.plano.assinaturaId").value(a[0])).andExpect(jsonPath("$.plano.servicoIds", hasSize(1)));
    }

    @Test
    void servicoForaDoPlanoEPlanoDeOutroClienteSaoRecusados() throws Exception {
        String[] a = assinaturaAtiva(true);
        atender(a[2], "\"" + barba + "\"", 5, 9, a[0]).andExpect(status().isBadRequest());   // Barba não faz parte do plano
        // corte (do plano) + barba (fora): corte de graça, barba cobrada normal
        atender(a[2], "\"" + corte + "\",\"" + barba + "\"", 5, 10, a[0]).andExpect(status().isCreated());
        assertEquals(0, new BigDecimal("40.00").compareTo(jdbc.queryForObject("select desconto from agendamento_servico where servico_id = ?::uuid", BigDecimal.class, corte)));
        assertEquals(0, new BigDecimal("0.00").compareTo(jdbc.queryForObject("select desconto from agendamento_servico where servico_id = ?::uuid", BigDecimal.class, barba)));
        // a assinatura é do cliente da assinatura: outro telefone não usa
        atender(novoTelefone(), "\"" + corte + "\"", 12, 9, a[0]).andExpect(status().isNotFound());
        // plano inexistente
        atender(a[2], "\"" + corte + "\"", 12, 10, UUID.randomUUID().toString()).andExpect(status().isNotFound());
    }

    @Test
    void cancelarDevolveOCorteEFaltaDeConfirmacaoNaoDevolve() throws Exception {
        String[] a = assinaturaAtiva(true);
        String primeiro = id(atender(a[2], "\"" + corte + "\"", 2, 9, a[0]).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        atender(a[2], "\"" + corte + "\"", 8, 9, a[0]).andExpect(status().isCreated());
        saldoDoMes(a[0], mes1, 0);
        escrever(put("/api/agendamentos/" + primeiro + "/status"), dono, "{\"status\":\"cancelado\"}").andExpect(status().isOk());
        saldoDoMes(a[0], mes1, 1);   // o corte voltou
        // cancelado por falta de confirmação (automação, horário que não veio do link) continua gastando o corte
        jdbc.update("update agendamento set motivo_cancelamento = 'falta_confirmacao' where id = ?::uuid", primeiro);
        saldoDoMes(a[0], mes1, 0);
    }

    @Test
    void remarcarUmHorarioDePlanoTambemPrecisaCaberNaCota() throws Exception {
        String[] a = assinaturaAtiva(true);
        String primeiro = id(atender(a[2], "\"" + corte + "\"", 2, 9, a[0]).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        atender(a[2], "\"" + corte + "\"", 8, 9, a[0]).andExpect(status().isCreated());
        // colado no outro corte (intervalo de 3 dias): recusado, e o horário continua onde estava
        escrever(put("/api/agendamentos/" + primeiro + "/remarcar"), dono, "{\"inicio\":\"" + as(m1.withDayOfMonth(9), 9) + "\"}").andExpect(status().isConflict());
        assertEquals(as(m1.withDayOfMonth(2), 9), jdbc.queryForObject("select inicio from agendamento where id = ?::uuid", java.sql.Timestamp.class, primeiro).toInstant());
        // longe do outro e dentro da cota: pode
        escrever(put("/api/agendamentos/" + primeiro + "/remarcar"), dono, "{\"inicio\":\"" + as(m1.withDayOfMonth(20), 9) + "\"}").andExpect(status().isOk());
        saldoDoMes(a[0], mes1, 0);
    }

    @Test
    void estornoQueDeixariaCorteSemCoberturaERecusado() throws Exception {
        String[] a = assinaturaAtiva(true);
        pagar(a[0], mes2).andExpect(status().isCreated());
        // 2 cortes em mes1 (cota), 1 em mes2: tudo coberto
        atender(a[2], "\"" + corte + "\"", 2, 9, a[0]).andExpect(status().isCreated());
        atender(a[2], "\"" + corte + "\"", 8, 9, a[0]).andExpect(status().isCreated());
        Instant noMes2 = as(m1.plusMonths(1).withDayOfMonth(10), 9);
        escrever(post("/api/atendimentos"), dono, corpoAtender(a[2], "\"" + corte + "\"", noMes2, a[0])).andExpect(status().isCreated());
        // estornar mes1 deixa os 2 cortes de mes1 sem mensalidade
        String pag1 = pagamentoDe(a[0], mes1);
        escrever(post("/api/assinaturas/" + a[0] + "/pagamentos/" + pag1 + "/estorno"), dono, "{\"motivo\":\"Pagou em duplicidade\"}").andExpect(status().isConflict());
        assertEquals(0, contar("select count(*) from assinatura_pagamento where id = ?::uuid and estornado", pag1));   // nada mudou
        // motivo curto é recusado; id de outra assinatura/pagamento não existe
        escrever(post("/api/assinaturas/" + a[0] + "/pagamentos/" + UUID.randomUUID() + "/estorno"), dono, "{\"motivo\":\"Pagou em duplicidade\"}").andExpect(status().isNotFound());
        escrever(post("/api/assinaturas/" + a[0] + "/pagamentos/" + pagamentoDe(a[0], mes2) + "/estorno"), dono, "{\"motivo\":\"x\"}").andExpect(status().isBadRequest());
    }

    @Test
    void encerrarComCorteAdiantadoViraDividaQueTravaOPlanoNovoAteQuitar() throws Exception {
        String[] a = assinaturaAtiva(true);
        atender(a[2], "\"" + corte + "\"", 2, 9, a[0]).andExpect(status().isCreated());
        atender(a[2], "\"" + corte + "\"", 8, 9, a[0]).andExpect(status().isCreated());
        atender(a[2], "\"" + corte + "\"", 14, 9, a[0]).andExpect(status().isCreated());   // adiantado: saldo -1
        escrever(post("/api/assinaturas/" + a[0] + "/encerrar"), dono, "{\"motivo\":\"x\"}").andExpect(status().isBadRequest());
        escrever(post("/api/assinaturas/" + a[0] + "/encerrar"), dono, "{\"motivo\":\"Cliente mudou de cidade\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("cancelada")).andExpect(jsonPath("$.divida").value(1)).andExpect(jsonPath("$.dividaQuitada").value(false));
        escrever(post("/api/assinaturas/" + a[0] + "/encerrar"), dono, "{\"motivo\":\"Cliente mudou de cidade\"}").andExpect(status().isConflict());
        contratar(dono, a[1], planoId, mes1).andExpect(status().isConflict());   // dívida trava plano novo
        escrever(post("/api/assinaturas/" + a[0] + "/quitar"), dono, "").andExpect(status().isOk()).andExpect(jsonPath("$.dividaQuitada").value(true));
        escrever(post("/api/assinaturas/" + a[0] + "/quitar"), dono, "").andExpect(status().isConflict());   // não repete
        contratar(dono, a[1], planoId, mes1).andExpect(status().isCreated());
    }

    @Test
    void quemSoLancaNaAgendaVeOPlanoDoClienteSemValorDeMensalidade() throws Exception {
        String[] a = assinaturaAtiva(true);
        // a seção Planos continua negada; o atendimento pode consultar o plano do cliente, e a resposta nunca traz o valor
        ler("/api/planos", colaborador).andExpect(status().isForbidden());
        ler("/api/planos/cliente/" + a[1], colaborador).andExpect(status().isOk()).andExpect(jsonPath("$.plano.plano").value("Plano Mensal"))
                .andExpect(content().string(not(containsString("preco")))).andExpect(content().string(not(containsString("valor"))));
    }

    // ---------------------------------------------------------------- pedidos pelo link (sem login)

    private ResultActions pedirPlano(String ip, String nome, String tel, String plano, String site) throws Exception {
        return mvc.perform(post("/api/publico/planos/pedidos").with(host(OFFBOX)).header("X-Forwarded-For", ip).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"" + nome + "\",\"telefone\":\"" + tel + "\",\"planoId\":\"" + plano + "\"" + (site == null ? "" : ",\"site\":\"" + site + "\"") + "}"));
    }

    @Test
    void aPaginaPublicaMostraSoOQuePodeSerPublico() throws Exception {
        planoId = criarPlano("Plano Mensal", 120, 2, corte, barba);
        String escondido = criarPlano("Plano Escondido", 90, 1, corte);
        escrever(put("/api/planos/" + escondido), dono, corpoPlano("Plano Escondido", 90, 1, corte).replace("}", ",\"ativo\":false}")).andExpect(status().isOk());
        mvc.perform(get("/api/publico/planos").with(host(OFFBOX)).header("X-Forwarded-For", "10.40.0.1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.planos", hasSize(1))).andExpect(jsonPath("$.planos[0].nome").value("Plano Mensal")).andExpect(jsonPath("$.planos[0].servicos", hasSize(2)))
                .andExpect(content().string(not(containsString("adianta")))).andExpect(content().string(not(containsString("criadoPor"))));
        // link desligado: a página não oferece plano e o pedido é recusado
        escrever(put("/api/estabelecimento/link-agendamento"), dono, "{\"ativo\":false}").andExpect(status().isOk());
        mvc.perform(get("/api/publico/planos").with(host(OFFBOX)).header("X-Forwarded-For", "10.40.0.2")).andExpect(status().isOk()).andExpect(jsonPath("$.planos", hasSize(0)));
        pedirPlano("10.40.0.3", "Maria", novoTelefone(), planoId, null).andExpect(status().isForbidden());
    }

    @Test
    void pedidoPublicoNaoDuplicaRecusaIscaETelefoneInvalidoEOdonoAceitaOuRecusa() throws Exception {
        planoId = criarPlano("Plano Mensal", 120, 2, corte);
        String tel = novoTelefone();
        pedirPlano("10.41.0.1", "Maria Souza", tel, planoId, null).andExpect(status().isCreated()).andExpect(jsonPath("$.ok").value(true));
        pedirPlano("10.41.0.2", "Maria Souza", tel, planoId, null).andExpect(status().isCreated());   // mesma resposta, sem duplicar
        assertEquals(1, contar("select count(*) from pedido_plano where status = 'novo'"));
        assertEquals(0, contar("select count(*) from pedido_plano where telefone_cif = ?", tel));   // o telefone nunca fica em texto puro
        pedirPlano("10.41.0.3", "Robô", novoTelefone(), planoId, "http://spam").andExpect(status().isBadRequest());   // isca preenchida
        pedirPlano("10.41.0.4", "Maria", "123", planoId, null).andExpect(status().isBadRequest());
        pedirPlano("10.41.0.5", "Maria", novoTelefone(), UUID.randomUUID().toString(), null).andExpect(status().isBadRequest());
        assertEquals(1, contar("select count(*) from pedido_plano"));
        // o painel: sem a seção, 403; o pedido aparece na listagem com o telefone decifrado
        ler("/api/planos", dono).andExpect(jsonPath("$.pedidos", hasSize(1))).andExpect(jsonPath("$.pedidos[0].telefone").value("55" + tel));
        String pedido = jdbc.queryForObject("select id::text from pedido_plano", String.class);
        escrever(post("/api/planos/pedidos/" + pedido + "/aceitar"), colaborador, "").andExpect(status().isForbidden());
        escrever(post("/api/planos/pedidos/" + pedido + "/aceitar"), dono, "").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("pendente"))
                .andExpect(jsonPath("$.cliente.nome").value("Maria Souza"));
        assertEquals(1, contar("select count(*) from cliente"));
        escrever(post("/api/planos/pedidos/" + pedido + "/aceitar"), dono, "").andExpect(status().isNotFound());   // já resolvido
        // recusar
        String tel2 = novoTelefone();
        pedirPlano("10.41.0.6", "João Lima", tel2, planoId, null).andExpect(status().isCreated());
        String pedido2 = jdbc.queryForObject("select id::text from pedido_plano where status = 'novo'", String.class);
        escrever(post("/api/planos/pedidos/" + pedido2 + "/recusar"), dono, "").andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        escrever(post("/api/planos/pedidos/" + pedido2 + "/recusar"), dono, "").andExpect(status().isNotFound());
        assertEquals(1, contar("select count(*) from cliente"));   // recusar não cadastra ninguém
    }

    @Test
    void oPedidoTrintaEUmEhRecusadoPorExcesso() throws Exception {
        planoId = criarPlano("Plano Mensal", 120, 2, corte);
        for (int i = 1; i <= 30; i++) pedirPlano("10.42.1." + i, "Cliente " + i, novoTelefone(), planoId, null).andExpect(status().isCreated());
        assertEquals(30, contar("select count(*) from pedido_plano where status = 'novo'"));
        pedirPlano("10.42.2.1", "Cliente 31", novoTelefone(), planoId, null).andExpect(status().isConflict());
        assertEquals(30, contar("select count(*) from pedido_plano"));
    }

    @Test
    void umMesmoTelefoneNaoPedeSemParar() throws Exception {
        planoId = criarPlano("Plano Mensal", 120, 2, corte);
        String outro = criarPlano("Plano Prata", 80, 1, corte);
        String tel = novoTelefone();
        pedirPlano("10.43.0.1", "Maria", tel, planoId, null).andExpect(status().isCreated());
        pedirPlano("10.43.0.2", "Maria", tel, outro, null).andExpect(status().isCreated());
        pedirPlano("10.43.0.3", "Maria", tel, planoId, null).andExpect(status().isCreated());   // repetido: conta no limite do telefone, mas responde igual
        pedirPlano("10.43.0.4", "Maria", tel, outro, null).andExpect(status().isTooManyRequests());   // 4º em 15 minutos
    }

    // ---------------------------------------------------------------- saldo público

    @Test
    void saldoPublicoDaSoCortesRespostaGenericaELimite() throws Exception {
        String[] a = assinaturaAtiva(true);
        // plano começa no mês que vem: hoje (mês atual) o saldo é genérico mesmo com plano ativo? Não: a consulta lista o plano ativo; aqui só conferimos o formato
        mvc.perform(get("/api/publico/planos/saldo?telefone=" + a[2]).with(host(OFFBOX)).header("X-Forwarded-For", "10.44.0.1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.planos", hasSize(1))).andExpect(jsonPath("$.planos[0].plano").value("Plano Mensal")).andExpect(jsonPath("$.planos[0].cortesPorMes").value(2))
                .andExpect(content().string(not(containsString("120")))).andExpect(content().string(not(containsString("Cliente Plano")))).andExpect(content().string(not(containsString(a[2]))));
        // telefone sem plano e telefone inválido: a mesma resposta genérica
        String generico = PlanoRegras.GENERICO_SALDO;
        mvc.perform(get("/api/publico/planos/saldo?telefone=" + novoTelefone()).with(host(OFFBOX)).header("X-Forwarded-For", "10.44.0.2")).andExpect(status().isOk())
                .andExpect(jsonPath("$.planos", hasSize(0))).andExpect(jsonPath("$.aviso").value(generico));
        mvc.perform(get("/api/publico/planos/saldo?telefone=12").with(host(OFFBOX)).header("X-Forwarded-For", "10.44.0.3")).andExpect(status().isOk()).andExpect(jsonPath("$.aviso").value(generico));
        // 5 consultas por telefone a cada 15 minutos (a 1ª acima já contou): a 6ª é barrada
        for (int i = 0; i < 4; i++) mvc.perform(get("/api/publico/planos/saldo?telefone=" + a[2]).with(host(OFFBOX)).header("X-Forwarded-For", "10.44.1." + i)).andExpect(status().isOk());
        mvc.perform(get("/api/publico/planos/saldo?telefone=" + a[2]).with(host(OFFBOX)).header("X-Forwarded-For", "10.44.1.9")).andExpect(status().isTooManyRequests());
    }

    // ---------------------------------------------------------------- isolamento entre lojas

    @Test
    void outraLojaNaoVeNemMexeEmPlanoAssinaturaNemPedido() throws Exception {
        String[] a = assinaturaAtiva(true);
        pedirPlano("10.45.0.1", "Maria", novoTelefone(), planoId, null).andExpect(status().isCreated());
        String pedido = jdbc.queryForObject("select id::text from pedido_plano", String.class);
        String pag = pagamentoDe(a[0], mes1);
        // a Dalforno (dono Alan) lista a própria loja: nada da Offbox
        mvc.perform(get("/api/planos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk())
                .andExpect(jsonPath("$.planos", hasSize(0))).andExpect(jsonPath("$.assinaturas", hasSize(0))).andExpect(jsonPath("$.pedidos", hasSize(0)));
        // ids da Offbox na Dalforno: sempre 404, nunca dado
        mvc.perform(put("/api/planos/" + planoId).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content(corpoPlano("Invasor", 10, 1, corte))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/planos/" + planoId).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        mvc.perform(post("/api/assinaturas").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"clienteId\":\"" + a[1] + "\",\"planoId\":\"" + planoId + "\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/assinaturas/" + a[0] + "/pagamentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"mes\":\"" + mes2 + "\",\"forma\":\"pix\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/assinaturas/" + a[0] + "/pagamentos/" + pag + "/estorno").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"motivo\":\"Tentativa de outra loja\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/assinaturas/" + a[0] + "/encerrar").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"motivo\":\"Tentativa de outra loja\"}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/assinaturas/" + a[0] + "/quitar").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        mvc.perform(post("/api/planos/pedidos/" + pedido + "/aceitar").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        mvc.perform(post("/api/planos/pedidos/" + pedido + "/recusar").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        // plano do cliente da outra loja: sem plano (nunca o da Offbox)
        mvc.perform(get("/api/planos/cliente/" + a[1]).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk()).andExpect(jsonPath("$.plano").doesNotExist());
        // nada mudou na Offbox
        assertEquals("ativa", jdbc.queryForObject("select status from assinatura where id = ?::uuid", String.class, a[0]));
        assertEquals(1, contar("select count(*) from assinatura_pagamento where assinatura_id = ?::uuid and not estornado", a[0]));
        assertEquals(1, contar("select count(*) from pedido_plano where status = 'novo'"));
        // a página pública da Dalforno não mostra plano da Offbox
        mvc.perform(get("/api/publico/planos").with(host(DALFORNO)).header("X-Forwarded-For", "10.45.0.9")).andExpect(status().isOk()).andExpect(jsonPath("$.planos", hasSize(0)));
        // plano da Offbox como serviço da Dalforno no Atender: assinatura desconhecida lá
        mvc.perform(post("/api/atendimentos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"servicoIds\":[],\"nome\":\"X\",\"telefone\":\"" + a[2] + "\",\"inicio\":\"" + as(m1.withDayOfMonth(5), 9) + "\",\"assinaturaId\":\"" + a[0] + "\"}")).andExpect(status().is4xxClientError());
    }

    private int contarComo(String lojaId, String tabela) throws SQLException {
        try (Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.execute("SET LOCAL ROLE agendz_app");
                if (lojaId != null) st.execute("SELECT set_config('app.loja_id', '" + lojaId + "', true)");
                try (ResultSet rs = st.executeQuery("select count(*) from " + tabela)) {
                    rs.next();
                    return rs.getInt(1);
                }
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    void oBancoEscondeOsPlanosDeOutraLojaMesmoSemAAplicacao() throws Exception {
        String[] a = assinaturaAtiva(true);
        pedirPlano("10.46.0.1", "Maria", novoTelefone(), planoId, null).andExpect(status().isCreated());
        atender(a[2], "\"" + corte + "\"", 2, 9, a[0]).andExpect(status().isCreated());
        for (String tabela : new String[]{"plano", "plano_servico", "assinatura", "assinatura_pagamento", "assinatura_evento", "pedido_plano"}) {
            assertTrue(contarComo(LOJA_OFFBOX, tabela) > 0, tabela + " da própria loja");
            assertEquals(0, contarComo(LOJA_DALFORNO, tabela), tabela + " de outra loja");
            assertEquals(0, contarComo(null, tabela), tabela + " sem loja na transação");
        }
    }

    @Test
    void obancoRecusaAssinaturaDeUmaLojaComClienteDeOutra() throws Exception {
        String[] a = assinaturaAtiva(false);
        String clienteDalforno = jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Caio', 'v1:teste', md5('5511900000099')) returning id::text",
                String.class, LOJA_DALFORNO);
        // a chave estrangeira composta (loja_id, cliente_id) impede misturar lojas até para quem é dono do banco
        boolean recusou = false;
        try {
            jdbc.update("insert into assinatura (loja_id, cliente_id, plano_id, plano_foto, status, inicio_mes, dia_cobranca) values (?::uuid, ?::uuid, ?::uuid, '{}'::jsonb, 'pendente', ?, 5)",
                    LOJA_OFFBOX, clienteDalforno, planoId, mes1);
        } catch (org.springframework.dao.DataAccessException e) {
            recusou = true;
        }
        assertTrue(recusou, "assinatura com cliente de outra loja");
        assertTrue(a[0].length() > 0);
    }

    // ---------------------------------------------------------------- horários fixos do assinante (v128)

    private String corpoFixo(int dow, String hm, String... servicos) {
        StringBuilder s = new StringBuilder();
        for (String x : servicos) s.append(s.length() == 0 ? "" : ",").append("\"").append(x).append("\"");
        return "{\"fixos\":[{\"dia\":" + dow + ",\"hm\":\"" + hm + "\",\"profissionalId\":\"" + colaboradorId + "\",\"servicoIds\":[" + s + "]}]}";
    }

    private ResultActions fixos(String token, String assinatura, String corpo) throws Exception {
        return escrever(post("/api/assinaturas/" + assinatura + "/fixos"), token, corpo);
    }

    private static int dow(LocalDate d) {
        return d.getDayOfWeek().getValue() % 7; // domingo = 0
    }

    @Test
    void horarioFixoValidaPermiteSoComASecaoECriaPelaAutomacaoSemDuplicar() throws Exception {
        String[] a = assinaturaAtiva(true);
        LocalDate dia = m1.withDayOfMonth(5);
        String corpo = corpoFixo(dow(dia), "09:00", corte);
        // sem login 401; sem a seção planos 403
        mvc.perform(post("/api/assinaturas/" + a[0] + "/fixos").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isUnauthorized());
        fixos(colaborador, a[0], corpo).andExpect(status().isForbidden());
        // entradas ruins: nada é gravado
        fixos(dono, a[0], corpoFixo(7, "09:00", corte)).andExpect(status().isBadRequest());
        fixos(dono, a[0], corpoFixo(dow(dia), "9:00", corte)).andExpect(status().isBadRequest());
        fixos(dono, a[0], corpoFixo(dow(dia), "09:00", barba)).andExpect(status().isBadRequest());   // serviço fora do plano
        fixos(dono, a[0], corpoFixo(dow(dia), "09:00")).andExpect(status().isBadRequest());           // sem serviço
        fixos(dono, UUID.randomUUID().toString(), corpo).andExpect(status().isNotFound());
        assertEquals(0, contar("select count(*) from assinatura_fixo"));
        // ok: aparece na assinatura e na lista de planos
        fixos(dono, a[0], corpo).andExpect(status().isOk()).andExpect(jsonPath("$.assinatura.fixos", hasSize(1))).andExpect(jsonPath("$.apagados").value(0));
        ler("/api/planos", dono).andExpect(jsonPath("$.assinaturas[0].fixos", hasSize(1))).andExpect(jsonPath("$.assinaturas[0].fixos[0].hm").value("09:00"));
        assertEquals(1, contar("select count(*) from assinatura_evento where assinatura_id = ?::uuid and acao = 'horários fixos'", a[0]));
        // a automação cria o dia 5 e o dia 12 (14 dias à frente de 6 dias antes do dia 5), confirmados, gastando o corte do plano, e a segunda rodada não duplica
        Instant agora = as(dia.minusDays(6), 8);
        assertEquals(2, horariosFixos.materializar(UUID.fromString(LOJA_OFFBOX), agora));
        assertEquals(2, contar("select count(*) from agendamento where fixo_id is not null and status = 'confirmado' and plano_assinatura_id = ?::uuid", a[0]));
        assertEquals(0, horariosFixos.materializar(UUID.fromString(LOJA_OFFBOX), agora));
        assertEquals(2, contar("select count(*) from agendamento where fixo_id is not null"));
        // o horário fixo é reservado: outro cliente não toma o dia 19 (ainda sem agendamento), mas o próprio assinante pode
        atender(novoTelefone(), "\"" + corte + "\"", 19, 9, null).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("Esse horário é fixo de um cliente com plano. Escolha outro horário."));
        atender(novoTelefone(), "\"" + corte + "\"", 19, 10, null).andExpect(status().isCreated());   // outro horário do mesmo dia segue livre
        // trocar a lista (tirar o fixo) leva embora os agendamentos futuros ainda não realizados
        fixos(dono, a[0], "{\"fixos\":[]}").andExpect(status().isOk()).andExpect(jsonPath("$.apagados").value(2)).andExpect(jsonPath("$.assinatura.fixos", hasSize(0)));
        assertEquals(0, contar("select count(*) from agendamento where fixo_id is not null"));
        atender(novoTelefone(), "\"" + corte + "\"", 19, 9, null).andExpect(status().isCreated());       // reserva solta com o fixo
    }

    @Test
    void horarioFixoOcupadoPorOutroNaoCriaEAvisaUmaVezSoEEncerrarApagaOsFuturos() throws Exception {
        String[] a = assinaturaAtiva(true);
        LocalDate dia = m1.withDayOfMonth(5);
        // outro cliente já está confirmado no dia 5 às 09:00
        atender(novoTelefone(), "\"" + corte + "\"", 5, 9, null).andExpect(status().isCreated());
        fixos(dono, a[0], corpoFixo(dow(dia), "09:00", corte)).andExpect(status().isOk());
        Instant agora = as(dia.minusDays(6), 8);
        assertEquals(1, horariosFixos.materializar(UUID.fromString(LOJA_OFFBOX), agora));   // só o dia 12
        assertEquals(1, contar("select count(*) from aviso_painel where tipo = 'fixo'"));
        assertEquals(0, horariosFixos.materializar(UUID.fromString(LOJA_OFFBOX), agora));
        assertEquals(1, contar("select count(*) from aviso_painel where tipo = 'fixo'"), "o aviso é um por ocorrência, nunca repetido a cada minuto");
        ler("/api/avisos", dono).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.tipo=='fixo')]").exists());
        // encerrar o plano tira da agenda o fixo que ainda não aconteceu e apaga a lista de fixos
        escrever(post("/api/assinaturas/" + a[0] + "/encerrar"), dono, "{\"motivo\":\"mudou de cidade\"}").andExpect(status().isOk());
        assertEquals(0, contar("select count(*) from agendamento where fixo_id is not null"));
        assertEquals(0, contar("select count(*) from assinatura_fixo"));
        fixos(dono, a[0], corpoFixo(dow(dia), "09:00", corte)).andExpect(status().isConflict());   // assinatura encerrada não aceita fixo
    }
}
