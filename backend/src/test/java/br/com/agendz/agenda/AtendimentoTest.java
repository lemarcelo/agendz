package br.com.agendz.agenda;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from movimento_estoque");
        jdbc.update("delete from material");
        jdbc.update("update usuario set pode_vender = true");
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
        jdbc.update("update configuracao_loja set forma_pagamento_padrao = null, campos_futuro = null, campos_local = null");
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
        return "{" + (prof == null ? "" : "\"profissionalId\":\"" + prof + "\",") + "\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\",\"porte\":\"medio\"},\"servicoIds\":[\"" + lavagem + "\"]" + extra + "}";
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
        // nome diferente no mesmo número: como no simulador, o telefone que já tem cadastro vale (o primeiro do número) e o nome do cadastro não muda
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000002\",\"nome\":\"Maria\"")).andExpect(status().isCreated());
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente", Integer.class));
        assertEquals("João Silva", jdbc.queryForObject("select nome from cliente", String.class));
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
                .andExpect(jsonPath("$.mensagem").value("Escolha ao menos um serviço ou um produto."));
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


    // ---------- produtos no atendimento (5d-4a) ----------

    private String pomada(int estoque) throws Exception {
        return id(mvc.perform(post("/api/produtos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Pomada\",\"preco\":45,\"comissaoPct\":10,\"custo\":22,\"estoque\":" + estoque + "}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private String comProdutos(UUID prof, String servicos, String produtos, String extra) {
        return "{" + (prof == null ? "" : "\"profissionalId\":\"" + prof + "\",") + "\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\",\"porte\":\"medio\"},\"servicoIds\":" + servicos + ",\"produtos\":" + produtos + extra + "}";
    }

    private double estoqueDe(String material) {
        return jdbc.queryForObject("select estoque from material where id = ?::uuid", Double.class, material);
    }

    private ResultActions mudarStatus(String agendamento, String novo) throws Exception {
        return mvc.perform(put("/api/agendamentos/" + agendamento + "/status").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + novo + "\"}"));
    }

    @Test
    void localComServicoEProdutoBaixaOEstoqueECongelaPrecoSemMostrarComissao() throws Exception {
        String m = pomada(10);
        atender(APEX, davi, comProdutos(pabloId, "[\"" + lavagem + "\"]", "[{\"materialId\":\"" + m + "\",\"qtd\":2}]", ",\"telefone\":\"53999000030\""))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("concluido")).andExpect(jsonPath("$.total").value(80)).andExpect(jsonPath("$.totalProdutos").value(90))
                .andExpect(jsonPath("$.produtos", hasSize(1))).andExpect(jsonPath("$.produtos[0].nome").value("Pomada")).andExpect(jsonPath("$.produtos[0].qtd").value(2))
                .andExpect(jsonPath("$.produtos[0].preco").value(45)).andExpect(jsonPath("$.produtos[0].vendedorId").value(pabloId.toString()))
                .andExpect(jsonPath("$.produtos[0].comissaoPct").doesNotExist());
        assertEquals(8.0, estoqueDe(m));
        assertEquals(1, jdbc.queryForObject("select count(*) from movimento_estoque where tipo = 'saida' and delta = -2", Integer.class));
        assertEquals(10.0, jdbc.queryForObject("select comissao_pct from agendamento_produto", Double.class));
        // mudar o preço do produto depois não muda o que já foi vendido
        mvc.perform(put("/api/produtos/" + m).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Pomada\",\"preco\":99,\"comissaoPct\":50}")).andExpect(status().isOk());
        assertEquals(45.0, jdbc.queryForObject("select preco from agendamento_produto", Double.class));
        assertEquals(10.0, jdbc.queryForObject("select comissao_pct from agendamento_produto", Double.class));
    }

    @Test
    void soProdutoDoVendedorEscolhidoOcupaUmMinutoENaoPedeServico() throws Exception {
        String m = pomada(5);
        // sem vendedor e sem serviço: precisa escolher
        atender(APEX, davi, comProdutos(null, "[]", "[{\"materialId\":\"" + m + "\",\"qtd\":1}]", "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Escolha o vendedor."));
        String ag = id(atender(APEX, davi, comProdutos(null, "[]", "[{\"materialId\":\"" + m + "\",\"qtd\":1}]", ",\"vendedorId\":\"" + pabloId + "\""))
                .andExpect(jsonPath("$.status").value("concluido")).andExpect(jsonPath("$.total").value(0)).andExpect(jsonPath("$.totalProdutos").value(45))
                .andExpect(jsonPath("$.servicos", hasSize(0))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento where id = ?::uuid and fim_servico = inicio + interval '1 minute'", Integer.class, ag));
        assertEquals(4.0, estoqueDe(m));
    }

    @Test
    void futuroPedeServicoEProdutoNaoBaixaAteConcluir() throws Exception {
        String m = pomada(5);
        String prod = "[{\"materialId\":\"" + m + "\",\"qtd\":1}]";
        atender(APEX, davi, comProdutos(pabloId, "[]", prod, ",\"inicio\":\"" + futuro + "\",\"nome\":\"Ana Lima\",\"telefone\":\"53999000031\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Para agendar um horário futuro, escolha ao menos um serviço. Produto sozinho só no atendimento de agora."));
        String ag = id(atender(APEX, davi, comProdutos(pabloId, "[\"" + lavagem + "\"]", prod, ",\"inicio\":\"" + futuro + "\",\"nome\":\"Ana Lima\",\"telefone\":\"53999000031\""))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("a_confirmar")).andExpect(jsonPath("$.produtos", hasSize(1))).andReturn().getResponse().getContentAsString());
        assertEquals(5.0, estoqueDe(m));
        mudarStatus(ag, "concluido").andExpect(status().isOk());
        assertEquals(4.0, estoqueDe(m));
        // concluir de novo não baixa outra vez; reabrir devolve; cancelar depois de reabrir não devolve duas vezes
        mudarStatus(ag, "concluido").andExpect(status().isOk());
        assertEquals(4.0, estoqueDe(m));
        mudarStatus(ag, "confirmado").andExpect(status().isOk());
        assertEquals(5.0, estoqueDe(m));
        mudarStatus(ag, "cancelado").andExpect(status().isOk());
        assertEquals(5.0, estoqueDe(m));
        assertEquals(2, jdbc.queryForObject("select count(*) from movimento_estoque", Integer.class));
        assertEquals(5.0, jdbc.queryForObject("select saldo from movimento_estoque order by em desc, saldo desc limit 1", Double.class));
    }

    @Test
    void estoqueInsuficienteVendedorInvalidoELimitesRecusamSemGravarNada() throws Exception {
        String m = pomada(1);
        String um = "[{\"materialId\":\"" + m + "\",\"qtd\":2}]";
        atender(APEX, davi, comProdutos(pabloId, "[\"" + lavagem + "\"]", um, "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Estoque insuficiente de Pomada (restam 1)."));
        atender(APEX, davi, comProdutos(pabloId, "[\"" + lavagem + "\"]", "[{\"materialId\":\"" + m + "\",\"qtd\":0}]", "")).andExpect(status().isBadRequest());
        atender(APEX, davi, comProdutos(pabloId, "[\"" + lavagem + "\"]", "[{\"materialId\":\"" + UUID.randomUUID() + "\",\"qtd\":1}]", "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Produto não encontrado."));
        jdbc.update("update usuario set pode_vender = false where id = ?", marceloId);
        atender(APEX, davi, comProdutos(pabloId, "[\"" + lavagem + "\"]", "[{\"materialId\":\"" + m + "\",\"qtd\":1}]", ",\"vendedorId\":\"" + marceloId + "\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Essa pessoa não pode vender produtos (Equipe > Pode vender produtos)."));
        assertEquals(0, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
        assertEquals(0, jdbc.queryForObject("select count(*) from movimento_estoque", Integer.class));
        assertEquals(1.0, estoqueDe(m));
    }

    @Test
    void profissionalVendeComoEleMesmoEProdutoVendidoSoDesativa() throws Exception {
        String m = pomada(5);
        atender(APEX, pablo, comProdutos(marceloId, "[\"" + lavagem + "\"]", "[{\"materialId\":\"" + m + "\",\"qtd\":1}]", ",\"vendedorId\":\"" + marceloId + "\""))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.produtos[0].vendedorId").value(pabloId.toString()));
        // já foi vendido: apagar só desativa
        mvc.perform(delete("/api/produtos/" + m).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk()).andExpect(jsonPath("$.desativado").value(true));
    }

    @Test
    void mesmaChaveComProdutoBaixaOEstoqueUmaVezSo() throws Exception {
        String m = pomada(5);
        String corpo = comProdutos(pabloId, "[\"" + lavagem + "\"]", "[{\"materialId\":\"" + m + "\",\"qtd\":2}]", "");
        atenderComChave(APEX, davi, CHAVE, corpo).andExpect(status().isCreated());
        atenderComChave(APEX, davi, CHAVE, corpo).andExpect(status().isCreated());
        assertEquals(3.0, estoqueDe(m));
        assertEquals(1, jdbc.queryForObject("select count(*) from movimento_estoque", Integer.class));
    }

    // ---------- chave de repetição (Idempotency-Key) ----------

    private static final String CHAVE = "chave-de-teste-0001-abcdef";

    private ResultActions atenderComChave(String host, String token, String chave, String corpo) throws Exception {
        return mvc.perform(post("/api/atendimentos").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).header("Idempotency-Key", chave)
                .contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    @Test
    void mesmaChaveDuasVezesGravaUmaSoEDevolveAMesmaResposta() throws Exception {
        String corpo = corpo(pabloId, ",\"telefone\":\"53999000020\",\"nome\":\"Ana\"");
        String um = atenderComChave(APEX, davi, CHAVE, corpo).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String dois = atenderComChave(APEX, davi, CHAVE, corpo).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertEquals(id(um), id(dois));
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente", Integer.class));
    }

    @Test
    void semChaveCadaPedidoGravaUm() throws Exception {
        String corpo = corpo(pabloId, ",\"telefone\":\"53999000021\"");
        atender(APEX, davi, corpo).andExpect(status().isCreated());
        atender(APEX, davi, corpo).andExpect(status().isCreated());
        assertEquals(2, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void mesmaChaveComOutroCorpoOuOutroUsuarioDa409() throws Exception {
        atenderComChave(APEX, davi, CHAVE, corpo(pabloId, ",\"telefone\":\"53999000022\"")).andExpect(status().isCreated());
        atenderComChave(APEX, davi, CHAVE, corpo(pabloId, ",\"telefone\":\"53999000023\"")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Essa chave de repetição já foi usada em outro pedido."));
        // outro usuário, mesmo corpo: nunca recebe a resposta alheia
        atenderComChave(APEX, pablo, CHAVE, corpo(pabloId, ",\"telefone\":\"53999000022\"")).andExpect(status().isConflict());
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void chaveForaDoFormatoDa400() throws Exception {
        atenderComChave(APEX, davi, "curta", corpo(pabloId, "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Chave de repetição inválida."));
        atenderComChave(APEX, davi, "com espaço e caracteres inválidos!!", corpo(pabloId, "")).andExpect(status().isBadRequest());
    }

    @Test
    void pedidoQueFalhouNaoDeixaChaveEPodeSerTentadoDeNovo() throws Exception {
        atenderComChave(APEX, davi, CHAVE, corpo(pabloId, ",\"telefone\":\"123\"")).andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from idempotencia", Integer.class));
        atenderComChave(APEX, davi, CHAVE, corpo(pabloId, ",\"telefone\":\"53999000024\"")).andExpect(status().isCreated());
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void agendamentoComChaveTambemNaoDuplica() throws Exception {
        UUID cliente = jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Ana', 'v1:teste', md5('5553999000030')) returning id", UUID.class, LOJA_APEX);
        String corpo = "{\"clienteId\":\"" + cliente + "\",\"profissionalId\":\"" + pabloId + "\",\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\",\"porte\":\"medio\"},\"servicoIds\":[\"" + lavagem + "\"],\"inicio\":\"" + futuro + "\"}";
        String um = mvc.perform(post("/api/agendamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).header("Idempotency-Key", CHAVE)
                .contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String dois = mvc.perform(post("/api/agendamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).header("Idempotency-Key", CHAVE)
                .contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertEquals(id(um), id(dois));
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void aMesmaChaveEmOutraLojaEIndependente() throws Exception {
        String alan = token(DALFORNO, "alan");
        UUID alanId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'alan'", UUID.class, LOJA_DALFORNO);
        String corte = id(mvc.perform(post("/api/servicos").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Corte\",\"preco\":45,\"duracaoMin\":45,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        atenderComChave(APEX, davi, CHAVE, corpo(pabloId, "")).andExpect(status().isCreated());
        atenderComChave(DALFORNO, alan, CHAVE, "{\"profissionalId\":\"" + alanId + "\",\"servicoIds\":[\"" + corte + "\"]}").andExpect(status().isCreated());
        assertEquals(2, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
        assertEquals(2, jdbc.queryForObject("select count(*) from idempotencia", Integer.class));
    }

    // ---------------------------------------------------------------- 5d-4c-1: forma de pagamento e regras do Atender

    private ResultActions regras(String host, String token, String corpo) throws Exception {
        return mvc.perform(put("/api/estabelecimento/regras-atendimento").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    @Test
    void localGuardaAFormaEscolhidaOuAPadraoDeFabricaPix() throws Exception {
        atender(APEX, davi, corpo(pabloId, "")).andExpect(status().isCreated()).andExpect(jsonPath("$.formaPagamento").value("pix"));
        atender(APEX, davi, corpo(pabloId, ",\"formaPagamento\":\"dinheiro\"")).andExpect(status().isCreated()).andExpect(jsonPath("$.formaPagamento").value("dinheiro"));
        atender(APEX, davi, corpo(pabloId, ",\"formaPagamento\":\"boleto\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Forma de pagamento inválida."));
        assertEquals(2, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
        assertEquals("dinheiro", jdbc.queryForObject("select forma_pagamento from agendamento where forma_pagamento = 'dinheiro'", String.class));
    }

    @Test
    void semPadraoOAtendimentoLocalObrigaEscolherAForma() throws Exception {
        regras(APEX, davi, "{\"formaPagamentoPadrao\":\"\"}").andExpect(status().isOk()).andExpect(jsonPath("$.formaPagamentoPadrao").value(""));
        atender(APEX, davi, corpo(pabloId, "")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Escolha a forma de pagamento."));
        atender(APEX, davi, corpo(pabloId, ",\"formaPagamento\":\"cartao\"")).andExpect(status().isCreated()).andExpect(jsonPath("$.formaPagamento").value("cartao"));
        regras(APEX, davi, "{\"formaPagamentoPadrao\":\"dinheiro\"}").andExpect(status().isOk());
        atender(APEX, davi, corpo(pabloId, "")).andExpect(status().isCreated()).andExpect(jsonPath("$.formaPagamento").value("dinheiro"));
        assertEquals(2, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void agendamentoFuturoNaoGuardaForma() throws Exception {
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000010\",\"nome\":\"Rita\",\"inicio\":\"" + futuro + "\"")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.formaPagamento").doesNotExist());
    }

    @Test
    void camposObrigatoriosDoLocalVemDasRegrasEComBomRotulo() throws Exception {
        regras(APEX, davi, "{\"camposObrigatorios\":{\"futuro\":[\"nome\",\"telefone\"],\"local\":[\"telefone\",\"formaPagamento\"]}}").andExpect(status().isOk());
        atender(APEX, davi, corpo(pabloId, "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Preencha o campo obrigatório: telefone."));
        regras(APEX, davi, "{\"formaPagamentoPadrao\":\"\",\"camposObrigatorios\":{\"futuro\":[\"nome\"],\"local\":[\"telefone\",\"formaPagamento\"]}}").andExpect(status().isOk());
        atender(APEX, davi, corpo(pabloId, "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Preencha os campos obrigatórios: telefone, forma de pagamento."));
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000011\",\"formaPagamento\":\"pix\"")).andExpect(status().isCreated());
        // o futuro agora só exige o nome
        atender(APEX, davi, corpo(pabloId, ",\"telefone\":\"53999000012\",\"inicio\":\"" + futuro + "\"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Preencha o campo obrigatório: nome."));
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
    }

    @Test
    void regrasInvalidasSaoRecusadasESoOProprietarioGrava() throws Exception {
        regras(APEX, davi, "{\"formaPagamentoPadrao\":\"boleto\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Forma de pagamento padrão inválida."));
        for (String ruim : new String[]{
                "{\"futuro\":[\"formaPagamento\"],\"local\":[]}", "{\"futuro\":[\"nome\",\"nome\"],\"local\":[]}", "{\"futuro\":[\"cpf\"],\"local\":[]}",
                "{\"futuro\":[],\"local\":[\"nome\",\"telefone\",\"profissional\",\"vendedor\",\"formaPagamento\",\"nome\"]}", "{\"futuro\":[]}"}) {
            regras(APEX, davi, "{\"camposObrigatorios\":" + ruim + "}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Campos obrigatórios inválidos."));
        }
        regras(APEX, pablo, "{\"formaPagamentoPadrao\":\"pix\"}").andExpect(status().isForbidden());
        // o profissional lê as regras (o formulário precisa do padrão e dos obrigatórios), mas não muda
        mvc.perform(get("/api/estabelecimento/regras-atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isOk())
                .andExpect(jsonPath("$.formaPagamentoPadrao").value("pix")).andExpect(jsonPath("$.futuro[0]").value("nome")).andExpect(jsonPath("$.futuro[1]").value("telefone"))
                .andExpect(jsonPath("$.local", hasSize(0)));
    }

    @Test
    void asRegrasDeUmaLojaNaoMudamAsDeOutra() throws Exception {
        regras(APEX, davi, "{\"formaPagamentoPadrao\":\"cartao\",\"camposObrigatorios\":{\"futuro\":[\"nome\"],\"local\":[\"telefone\"]}}").andExpect(status().isOk());
        String alan = token(DALFORNO, "alan");
        mvc.perform(get("/api/estabelecimento/regras-atendimento").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk())
                .andExpect(jsonPath("$.formaPagamentoPadrao").value("pix")).andExpect(jsonPath("$.local", hasSize(0))).andExpect(jsonPath("$.futuro", hasSize(2)));
        mvc.perform(get("/api/estabelecimento/regras-atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk())
                .andExpect(jsonPath("$.formaPagamentoPadrao").value("cartao")).andExpect(jsonPath("$.local[0]").value("telefone"));
        // gravar só a forma não apaga os campos já escolhidos
        regras(APEX, davi, "{\"formaPagamentoPadrao\":\"dinheiro\"}").andExpect(status().isOk()).andExpect(jsonPath("$.local[0]").value("telefone")).andExpect(jsonPath("$.futuro[0]").value("nome"));
    }
}
