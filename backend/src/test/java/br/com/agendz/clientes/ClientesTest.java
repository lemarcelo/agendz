package br.com.agendz.clientes;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
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
 * Clientes (F2 parte 2): validação igual à da API simulada, CPF/telefone/nascimento cifrados no banco, busca, duplicidade, veículos por capacidade,
 * CPF completo e troca de telefone só para quem pode, e isolamento entre lojas. Espelha tests/clientes-equivalencia.test.mjs no lado do navegador.
 */
class ClientesTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";
    private static final String CPF_A = "529.982.247-25", CPF_B = "111.444.777-35";

    @Autowired
    JdbcTemplate jdbc;

    String davi, pablo, marcelo, alan;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = token(APEX, "pablo");
        marcelo = token(APEX, "marcelo");
        alan = token(DALFORNO, "alan");
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from cliente");
    }

    private ResultActions enviar(String metodo, String caminho, String host, String token, String corpo) throws Exception {
        var req = "PUT".equals(metodo) ? put(caminho) : post(caminho);
        return mvc.perform(req.with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions ler(String caminho, String host, String token) throws Exception {
        return mvc.perform(get(caminho).with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    /** Busca com o parâmetro `q` codificado uma única vez pelo MockMvc (colocar o texto na URL codificaria duas vezes). */
    private ResultActions buscar(String host, String token, String q) throws Exception {
        return mvc.perform(get("/api/clientes").queryParam("q", q).with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private String criar(String host, String token, String corpo) throws Exception {
        String json = enviar("POST", "/api/clientes", host, token, corpo).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private static String corpo(String nome, String tel) {
        return "{\"nome\":\"" + nome + "\",\"telefone\":\"" + tel + "\"}";
    }

    /** Agendamento direto no banco (a agenda tem testes próprios): liga o cliente a um profissional. */
    private void agendar(UUID cliente, String loginProfissional) {
        UUID prof = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = ?", UUID.class, LOJA_APEX, loginProfissional);
        jdbc.update("insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, total) "
                + "values (?::uuid, ?, ?, now() + interval '10 days', now() + interval '10 days 1 hour', now() + interval '10 days 1 hour', 'confirmado', 0)",
                LOJA_APEX, cliente, prof);
    }

    // ---------- validação (mesmas mensagens da API simulada) ----------

    @Test
    void nomeETelefoneObrigatoriosComAsMensagensDaApiSimulada() throws Exception {
        enviar("POST", "/api/clientes", APEX, davi, corpo("  ", "53999000001")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o nome ou apelido do cliente."));
        enviar("POST", "/api/clientes", APEX, davi, corpo("Ana", "123")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o telefone com DDD."));
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"Ana\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o telefone com DDD."));
    }

    @Test
    void telefoneAceitoComOuSemOCodigoDoPaisEComMascaraEGuardadoNormalizado() throws Exception {
        for (String t : new String[]{"(53) 99900-0001", "53999000001", "+55 53 99900-0001", "5553999000001"}) {
            enviar("POST", "/api/clientes", APEX, davi, corpo("Cliente " + t.length(), t)).andExpect(status().isCreated()).andExpect(jsonPath("$.telefone").value("5553999000001"));
        }
    }

    @Test
    void campoDesconhecidoNoCorpoDa400ENaoVirouCampoDoCadastro() throws Exception {
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"lojaId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isBadRequest());
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"id\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isBadRequest());
    }

    @Test
    void cpfNascimentoETextosSaoConferidos() throws Exception {
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"cpf\":\"123.456.789-00\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("CPF inválido."));
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"nascimento\":\"2999-01-01\"}").andExpect(status().isBadRequest());
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"nascimento\":\"31/12/1990\"}").andExpect(status().isBadRequest());
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"" + "x".repeat(101) + "\",\"telefone\":\"53999000001\"}").andExpect(status().isBadRequest());
    }

    // ---------- cifra ----------

    @Test
    void cpfTelefoneENascimentoFicamCifradosNoBancoENomeEmTextoPuro() throws Exception {
        criar(APEX, davi, "{\"nome\":\"Ana Souza\",\"apelido\":\"Aninha\",\"telefone\":\"(53) 99900-0001\",\"cpf\":\"" + CPF_A + "\",\"nascimento\":\"1990-05-17\"}");
        var l = jdbc.queryForMap("select nome, apelido, telefone_cif, telefone_hash, cpf_cif, cpf_hash, nascimento_cif from cliente");
        assertEquals("Ana Souza", l.get("nome"));
        assertEquals("Aninha", l.get("apelido"));
        for (String coluna : new String[]{"telefone_cif", "cpf_cif", "nascimento_cif"}) {
            String v = String.valueOf(l.get(coluna));
            assertTrue(v.startsWith("v1:"), coluna + " no formato v1");
            assertFalse(v.contains("999000001") || v.contains("52998224725") || v.contains("1990"), coluna + " não contém o valor em claro");
        }
        assertFalse(String.valueOf(l.get("telefone_hash")).contains("999000001"));
        assertEquals(64, String.valueOf(l.get("cpf_hash")).length(), "hash HMAC-SHA256 em hexadecimal");
    }

    @Test
    void omesmoValorCifradoDuasVezesNaoDaOMesmoTexto() throws Exception {
        criar(APEX, davi, corpo("Ana", "53999000001"));
        criar(APEX, davi, corpo("Bia", "53999000001"));
        var tels = jdbc.queryForList("select telefone_cif from cliente", String.class);
        assertEquals(2, tels.size());
        assertFalse(tels.get(0).equals(tels.get(1)), "IV aleatório por valor");
    }

    // ---------- duplicidade ----------

    @Test
    void mesmoTelefoneComNomesDiferentesPodeMasNomeETelefoneIguaisDa409SemDizerDeQuem() throws Exception {
        criar(APEX, davi, corpo("Ana", "53999000001"));
        criar(APEX, davi, corpo("Bia", "53999000001"));
        enviar("POST", "/api/clientes", APEX, davi, corpo("ANA", "(53) 99900-0001")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Já existe um cliente com esse nome e telefone."));
    }

    @Test
    void cpfRepetidoNaLojaDa409SemRevelarODonoMasEmOutraLojaPode() throws Exception {
        criar(APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"cpf\":\"" + CPF_A + "\"}");
        enviar("POST", "/api/clientes", APEX, davi, "{\"nome\":\"Carla\",\"telefone\":\"53999000002\",\"cpf\":\"52998224725\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esse CPF já está cadastrado.")).andExpect(jsonPath("$.mensagem").value(not(containsString("Ana"))));
        criar(DALFORNO, alan, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"cpf\":\"" + CPF_A + "\"}");
    }

    // ---------- edição ----------

    @Test
    void editarMudaSoOQueFoiEnviadoECpfEmBrancoApaga() throws Exception {
        String id = criar(APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"cpf\":\"" + CPF_A + "\",\"nascimento\":\"1990-05-17\"}");
        enviar("PUT", "/api/clientes/" + id, APEX, davi, "{\"apelido\":\"Aninha\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.apelido").value("Aninha")).andExpect(jsonPath("$.nome").value("Ana")).andExpect(jsonPath("$.telefone").value("5553999000001"))
                .andExpect(jsonPath("$.cpf").value("52998224725")).andExpect(jsonPath("$.nascimento").value("1990-05-17"));
        enviar("PUT", "/api/clientes/" + id, APEX, davi, "{\"cpf\":\"\",\"nascimento\":\"\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.cpf").doesNotExist()).andExpect(jsonPath("$.nascimento").doesNotExist()).andExpect(jsonPath("$.cpfMascarado").doesNotExist());
        enviar("PUT", "/api/clientes/" + id, APEX, davi, "{\"nome\":\"\"}").andExpect(status().isBadRequest());
    }

    @Test
    void editarClienteDeOutraLojaDa404() throws Exception {
        String id = criar(APEX, davi, corpo("Ana", "53999000001"));
        enviar("PUT", "/api/clientes/" + id, DALFORNO, alan, "{\"apelido\":\"x\"}").andExpect(status().isNotFound());
        enviar("PUT", "/api/clientes/" + UUID.randomUUID(), APEX, davi, "{\"apelido\":\"x\"}").andExpect(status().isNotFound());
    }

    @Test
    void editarParaNomeETelefoneDeOutroClienteDa409() throws Exception {
        criar(APEX, davi, corpo("Ana", "53999000001"));
        String bia = criar(APEX, davi, corpo("Bia", "53999000002"));
        enviar("PUT", "/api/clientes/" + bia, APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\"}").andExpect(status().isConflict());
    }

    // ---------- busca e lista ----------

    @Test
    void buscaPorNomeApelidoTelefoneParcialCpfEPlacaEListaSoTemCpfMascarado() throws Exception {
        criar(APEX, davi, "{\"nome\":\"Ana Souza\",\"apelido\":\"Aninha\",\"telefone\":\"53999000001\",\"cpf\":\"" + CPF_A + "\",\"veiculos\":[{\"placa\":\"abc-1234\",\"modelo\":\"Civic\",\"porte\":\"medio\"}]}");
        criar(APEX, davi, corpo("Bruno Lima", "11988887777"));
        ler("/api/clientes", APEX, pablo).andExpect(jsonPath("$", hasSize(2))).andExpect(jsonPath("$[0].cpf").doesNotExist()).andExpect(jsonPath("$[0].cpfMascarado").value("529.***.***-25"));
        for (String q : new String[]{"souza", "ANINHA", "99900", "(53) 9990", "5299822", "abc1234", "civic"}) {
            buscar(APEX, pablo, q)
                    .andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Ana Souza"));
        }
        ler("/api/clientes?q=bruno", APEX, pablo).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Bruno Lima"));
        ler("/api/clientes?q=zzzz", APEX, pablo).andExpect(jsonPath("$", hasSize(0)));
        ler("/api/clientes", DALFORNO, alan).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void buscaComCaracteresEspeciaisNaoQuebra() throws Exception {
        criar(APEX, davi, corpo("Ana", "53999000001"));
        for (String q : new String[]{"%", "_", "'; drop table cliente; --", "\\"}) {
            buscar(APEX, davi, q).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        }
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente", Integer.class));
    }

    // ---------- permissão por quem atende ----------

    @Test
    void profissionalQueNaoAtendeVeCpfMascaradoSemNascimentoENaoAlteraTelefoneCpfNemNascimento() throws Exception {
        String id = criar(APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"cpf\":\"" + CPF_A + "\",\"nascimento\":\"1990-05-17\"}");
        agendar(UUID.fromString(id), "pablo");
        ler("/api/clientes/" + id, APEX, marcelo).andExpect(status().isOk()).andExpect(jsonPath("$.dadosCompletos").value(false))
                .andExpect(jsonPath("$.cpf").doesNotExist()).andExpect(jsonPath("$.nascimento").doesNotExist()).andExpect(jsonPath("$.cpfMascarado").value("529.***.***-25"));
        enviar("PUT", "/api/clientes/" + id, APEX, marcelo, "{\"telefone\":\"53999000009\"}").andExpect(status().isForbidden());
        enviar("PUT", "/api/clientes/" + id, APEX, marcelo, "{\"cpf\":\"" + CPF_B + "\"}").andExpect(status().isForbidden());
        enviar("PUT", "/api/clientes/" + id, APEX, marcelo, "{\"nascimento\":\"1980-01-01\"}").andExpect(status().isForbidden());
        // nome e apelido qualquer um corrige; reenviar o mesmo telefone/CPF não conta como troca
        enviar("PUT", "/api/clientes/" + id, APEX, marcelo, "{\"apelido\":\"Ani\",\"telefone\":\"(53) 99900-0001\",\"cpf\":\"" + CPF_A + "\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.apelido").value("Ani"));
    }

    @Test
    void profissionalQueAtendeVeOCpfCompletoETrocaOTelefoneGravandoOAntigoEQuemTrocou() throws Exception {
        String id = criar(APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"cpf\":\"" + CPF_A + "\"}");
        agendar(UUID.fromString(id), "pablo");
        ler("/api/clientes/" + id, APEX, pablo).andExpect(jsonPath("$.dadosCompletos").value(true)).andExpect(jsonPath("$.cpf").value("52998224725"));
        enviar("PUT", "/api/clientes/" + id, APEX, pablo, "{\"telefone\":\"53999000009\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.telefone").value("5553999000009")).andExpect(jsonPath("$.telefoneAnterior").value("5553999000001"));
        var h = jdbc.queryForMap("select telefone_cif, trocado_por from cliente_telefone_anterior");
        assertTrue(String.valueOf(h.get("telefone_cif")).startsWith("v1:"));
        assertEquals(jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, LOJA_APEX), h.get("trocado_por"));
        // o número antigo já não acha o cliente; o novo acha
        ler("/api/clientes?q=999000001", APEX, davi).andExpect(jsonPath("$", hasSize(0)));
        ler("/api/clientes?q=999000009", APEX, davi).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void cadastroSemHorariosQualquerProfissionalCompletaOsDadosEDonoSempreMuda() throws Exception {
        String id = criar(APEX, marcelo, "{\"nome\":\"Novo\",\"telefone\":\"53999000001\"}");
        enviar("PUT", "/api/clientes/" + id, APEX, pablo, "{\"cpf\":\"" + CPF_B + "\"}").andExpect(status().isOk()).andExpect(jsonPath("$.cpf").value("11144477735"));
        agendar(UUID.fromString(id), "pablo");
        enviar("PUT", "/api/clientes/" + id, APEX, marcelo, "{\"telefone\":\"53999000007\"}").andExpect(status().isForbidden());
        enviar("PUT", "/api/clientes/" + id, APEX, davi, "{\"telefone\":\"53999000007\"}").andExpect(status().isOk()).andExpect(jsonPath("$.telefoneAnterior").value("5553999000001"));
    }

    @Test
    void semTokenOu403ComTokenDeOutraLoja() throws Exception {
        mvc.perform(get("/api/clientes").with(host(APEX))).andExpect(status().isUnauthorized());
        ler("/api/clientes", DALFORNO, davi).andExpect(status().isForbidden());
    }

    // ---------- veículos (capacidade usaVeiculo: só a estética automotiva) ----------

    @Test
    void esteticaGuardaVeiculosComPlacaFormatadaEMantemOIdAoEditar() throws Exception {
        String id = criar(APEX, davi, "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"veiculos\":["
                + "{\"placa\":\"abc1234\",\"marca\":\"Honda\",\"modelo\":\"Civic\",\"cor\":\"prata\",\"porte\":\"medio\"},"
                + "{\"placa\":\"bra2e19\",\"modelo\":\"Strada\",\"porte\":\"pickup\"}]}");
        String json = ler("/api/clientes/" + id, APEX, davi).andExpect(jsonPath("$.veiculos", hasSize(2))).andExpect(jsonPath("$.veiculos[0].placa").value("ABC-1234"))
                .andExpect(jsonPath("$.veiculos[1].placa").value("BRA2E19")).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"veiculos\":\\[\\{\"id\":\"([^\"]+)\"").matcher(json);
        assertTrue(m.find());
        String primeiro = m.group(1);
        // tira o segundo, muda a cor do primeiro (mesmo id) e acrescenta um novo
        enviar("PUT", "/api/clientes/" + id, APEX, davi, "{\"veiculos\":[{\"id\":\"" + primeiro + "\",\"placa\":\"ABC-1234\",\"modelo\":\"Civic\",\"cor\":\"preto\",\"porte\":\"medio\"},"
                + "{\"placa\":\"QWE1R23\",\"modelo\":\"Onix\",\"porte\":\"pequeno\"}]}").andExpect(status().isOk())
                .andExpect(jsonPath("$.veiculos", hasSize(2))).andExpect(jsonPath("$.veiculos[0].id").value(primeiro)).andExpect(jsonPath("$.veiculos[0].cor").value("preto"))
                .andExpect(jsonPath("$.veiculos[1].placa").value("QWE1R23"));
        // sem o campo `veiculos` a lista não muda; lista vazia remove todos
        enviar("PUT", "/api/clientes/" + id, APEX, davi, "{\"apelido\":\"x\"}").andExpect(jsonPath("$.veiculos", hasSize(2)));
        enviar("PUT", "/api/clientes/" + id, APEX, davi, "{\"veiculos\":[]}").andExpect(jsonPath("$.veiculos", hasSize(0)));
    }

    @Test
    void veiculoInvalidoRepetidoOuDemaisDa400ComAsMensagensDaApiSimulada() throws Exception {
        String base = "{\"nome\":\"Ana\",\"telefone\":\"53999000001\",\"veiculos\":";
        enviar("POST", "/api/clientes", APEX, davi, base + "[{\"placa\":\"XX\",\"modelo\":\"Civic\",\"porte\":\"medio\"}]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23)."));
        enviar("POST", "/api/clientes", APEX, davi, base + "[{\"placa\":\"ABC1234\",\"modelo\":\"C\",\"porte\":\"medio\"}]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Informe o modelo do veículo."));
        enviar("POST", "/api/clientes", APEX, davi, base + "[{\"placa\":\"ABC1234\",\"modelo\":\"Civic\",\"porte\":\"gigante\"}]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Escolha o porte do veículo."));
        enviar("POST", "/api/clientes", APEX, davi, base + "[{\"placa\":\"ABC-1234\",\"modelo\":\"Civic\",\"porte\":\"medio\"},{\"placa\":\"abc1234\",\"modelo\":\"Civic\",\"porte\":\"medio\"}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("A placa ABC-1234 aparece duas vezes nesse cliente."));
        StringBuilder onze = new StringBuilder("[");
        for (int i = 0; i < 11; i++) onze.append(i > 0 ? "," : "").append("{\"placa\":\"AAA").append(1000 + i).append("\",\"modelo\":\"Civic\",\"porte\":\"medio\"}");
        enviar("POST", "/api/clientes", APEX, davi, base + onze + "]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Veículos inválidos: no máximo 10 por cliente."));
        assertEquals(0, jdbc.queryForObject("select count(*) from cliente", Integer.class), "nada foi gravado");
    }

    @Test
    void barbeariaDescartaVeiculosEMesmaPlacaPodeEstarEmDoisClientes() throws Exception {
        String id = criar(DALFORNO, alan, "{\"nome\":\"Beto\",\"telefone\":\"53999000003\",\"veiculos\":[{\"placa\":\"ABC1234\",\"modelo\":\"Civic\",\"porte\":\"medio\"}]}");
        ler("/api/clientes/" + id, DALFORNO, alan).andExpect(jsonPath("$.veiculos", hasSize(0)));
        assertEquals(0, jdbc.queryForObject("select count(*) from cliente_veiculo", Integer.class));
        String a = criar(APEX, davi, "{\"nome\":\"A\",\"telefone\":\"53999000011\",\"veiculos\":[{\"placa\":\"ABC1234\",\"modelo\":\"Civic\",\"porte\":\"medio\"}]}");
        String b = criar(APEX, davi, "{\"nome\":\"B\",\"telefone\":\"53999000012\",\"veiculos\":[{\"placa\":\"ABC1234\",\"modelo\":\"Civic\",\"porte\":\"medio\"}]}");
        assertFalse(a.equals(b));
    }

    @Test
    void veiculoDeOutroClienteNaoEntraPeloIdEnviado() throws Exception {
        String a = criar(APEX, davi, "{\"nome\":\"A\",\"telefone\":\"53999000011\",\"veiculos\":[{\"placa\":\"ABC1234\",\"modelo\":\"Civic\",\"porte\":\"medio\"}]}");
        String b = criar(APEX, davi, "{\"nome\":\"B\",\"telefone\":\"53999000012\"}");
        UUID veiculoDeA = jdbc.queryForObject("select id from cliente_veiculo where cliente_id = ?", UUID.class, UUID.fromString(a));
        // B manda o id do veículo de A: vira veículo novo de B; o de A continua de A
        enviar("PUT", "/api/clientes/" + b, APEX, davi, "{\"veiculos\":[{\"id\":\"" + veiculoDeA + "\",\"placa\":\"XYZ9876\",\"modelo\":\"Gol\",\"porte\":\"pequeno\"}]}").andExpect(status().isOk());
        assertEquals("ABC-1234", jdbc.queryForObject("select placa from cliente_veiculo where id = ?", String.class, veiculoDeA));
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente_veiculo where cliente_id = ?", Integer.class, UUID.fromString(b)));
    }
}
