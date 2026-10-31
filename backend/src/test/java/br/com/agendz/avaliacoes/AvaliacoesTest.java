package br.com.agendz.avaliacoes;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.HexFormat;
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
 * Avaliações do atendimento e mensagens em lote no servidor (V35): seção `avaliacoes` (padrão de ninguém; o profissional vê só as próprias), só atendimento concluído,
 * token pessoal (só o hash no banco, uso único, errado/vencido/reusado respondem igual), anônimo SEM identidade no JSON com a regra do Admin desligada (e com nome
 * quando ligada), ocultar só pelo dono com motivo, fila em lote (telefone, duplicado, opt-out, período, limite 200, uma aberta por pessoa), limite de pedidos na porta
 * pública e isolamento entre lojas (API e Row Level Security). Usa a Offbox (barbearia) e a Dalforno como "outra loja".
 */
class AvaliacoesTest extends BaseApi {

    private static final String LOJA_OFFBOX = "00000000-0000-0000-0000-0000000000b2";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String CHAVE_INTERNA = "chave-interna-so-para-teste-0123456789";
    private static final String ERRO_TOKEN = "Este link de avaliação não é válido ou já foi usado.";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    DataSource ds;
    @Autowired
    br.com.agendz.publico.LimitePublico limitePublico;
    @Autowired
    br.com.agendz.auth.LimiteDeLogin limiteLogin;

    String dono, colaborador, alan;
    UUID colaboradorId, donoId;
    String corte, barba;
    int telefone;
    int ipN;
    int seq;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        limitePublico.reiniciar();
        zerarLogin();
        dono = token(OFFBOX, "proprietario");
        colaborador = token(OFFBOX, "colaborador1");
        alan = token(DALFORNO, "alan");
        colaboradorId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'colaborador1'", UUID.class, LOJA_OFFBOX);
        donoId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'proprietario'", UUID.class, LOJA_OFFBOX);
        corte = id(escrever(post("/api/servicos"), dono, "{\"nome\":\"Corte\",\"preco\":40,\"duracaoMin\":30,\"intervaloMin\":0}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        barba = id(escrever(post("/api/servicos"), dono, "{\"nome\":\"Barba\",\"preco\":25,\"duracaoMin\":30,\"intervaloMin\":0}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        telefone = 0;
        ipN = 0;
        seq = 0;
    }

    private void zerarLogin() {
        limiteLogin.limpar(LOJA_OFFBOX + "|proprietario");
        limiteLogin.limpar(LOJA_OFFBOX + "|colaborador1");
        limiteLogin.limpar(LOJA_DALFORNO + "|alan");
    }

    @AfterEach
    void limpar() {
        jdbc.update("update usuario set permissoes = '{}'::jsonb, papel = 'profissional' where identificador = 'colaborador1'");
        jdbc.update("delete from loja_regra_plataforma where loja_id = ?::uuid", LOJA_OFFBOX);
        jdbc.update("delete from fila_mensagem_item");
        jdbc.update("delete from fila_mensagem");
        jdbc.update("delete from avaliacao_evento");
        jdbc.update("delete from avaliacao_servico");
        jdbc.update("delete from avaliacao");
        jdbc.update("delete from avaliacao_acesso");
        jdbc.update("delete from aviso_painel");
        jdbc.update("delete from acesso_publico");
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
        jdbc.update("delete from escala_faixa");
        jdbc.update("delete from configuracao_loja");
    }

    // ---------------------------------------------------------------- ajudantes

    private static String id(String json) {
        return campo(json, "id");
    }

    private static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem " + nome + ": " + json);
        return m.group(1);
    }

    private static String sha256(String t) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(t.getBytes(StandardCharsets.UTF_8)));
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

    private String novoIp() {
        ipN += 1;
        return "10.88." + (ipN / 250) + "." + (ipN % 250 + 1);
    }

    /** Atendimento local concluído (agora) pelo colaborador; nome sem telefone vira atendimento sem cadastro. Devolve o id do agendamento. */
    private String atender(String nome, String tel, String... servicos) throws Exception {
        StringBuilder s = new StringBuilder();
        for (String x : servicos) s.append(s.length() == 0 ? "" : ",").append("\"").append(x).append("\"");
        String corpo = "{\"profissionalId\":\"" + colaboradorId + "\",\"servicoIds\":[" + s + "]" + (nome == null ? "" : ",\"nome\":\"" + nome + "\"") + (tel == null ? "" : ",\"telefone\":\"" + tel + "\"") + "}";
        String ag = id(escrever(post("/api/atendimentos"), dono, corpo).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("concluido")).andReturn().getResponse().getContentAsString());
        // o servidor arredonda o início ao minuto: sem isto todos empatam e a ordem da fila (mais recente primeiro) dependeria do id. Quem nasce depois fica mais recente.
        seq += 1;
        jdbc.update("update agendamento set inicio = inicio - ((5000 - ?) * interval '1 second') where id = ?::uuid", seq, ag);
        return ag;
    }

    private String pedir(String agendamento) throws Exception {
        return campo(escrever(post("/api/agendamentos/" + agendamento + "/avaliacao/pedido"), dono, "").andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "token");
    }

    private ResultActions pubGet(String host, String token, String ip) throws Exception {
        MockHttpServletRequestBuilder r = get("/api/publico/avaliacoes").with(host(host)).header("X-Forwarded-For", ip);
        return mvc.perform(token == null ? r : r.header("X-Acesso", token));
    }

    private ResultActions pubPost(String host, String token, String ip, String corpo) throws Exception {
        MockHttpServletRequestBuilder r = post("/api/publico/avaliacoes").with(host(host)).header("X-Forwarded-For", ip).contentType(MediaType.APPLICATION_JSON).content(corpo);
        return mvc.perform(token == null ? r : r.header("X-Acesso", token));
    }

    /** Pede o link e avalia pelo cliente; devolve o id da avaliação. */
    private String avaliar(String agendamento, String corpo) throws Exception {
        String t = pedir(agendamento);
        pubPost(OFFBOX, t, novoIp(), corpo).andExpect(status().isCreated());
        return jdbc.queryForObject("select id::text from avaliacao where agendamento_id = ?::uuid", String.class, agendamento);
    }

    private int contar(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    private String clienteDe(String agendamento) {
        return jdbc.queryForObject("select cliente_id::text from agendamento where id = ?::uuid", String.class, agendamento);
    }

    private void comoAtendente(String permissoes) throws Exception {
        jdbc.update("update usuario set papel = 'atendente', permissoes = ?::jsonb where identificador = 'colaborador1'", permissoes);
        zerarLogin();
        colaborador = token(OFFBOX, "colaborador1");
    }

    private void regraAnonimo(boolean ligada) throws Exception {
        mvc.perform(put("/interno/plataforma/lojas/offbox/regras").header("X-Interno-Chave", CHAVE_INTERNA).contentType(MediaType.APPLICATION_JSON).content("{\"avaliacaoMostraAnonimo\":" + ligada + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avaliacaoMostraAnonimo").value(ligada));
    }

    private static String hoje() {
        return LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).toString();
    }

    private String periodoDeHoje() {
        return "de=" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).minusDays(1) + "&ate=" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).plusDays(1);
    }

    // ---------------------------------------------------------------- permissão

    @Test
    void secaoAvaliacoesEDeNinguemPorPadraoEOProfissionalVeSoAsProprias() throws Exception {
        // profissional sem a seção: lista e resumo próprios (soMinhas), mas nunca a fila em lote
        ler("/api/avaliacoes", colaborador).andExpect(status().isOk()).andExpect(jsonPath("$.soMinhas").value(true));
        ler("/api/avaliacoes/resumo", colaborador).andExpect(status().isOk());
        ler("/api/mensagens/fila?" + periodoDeHoje(), colaborador).andExpect(status().isForbidden());
        escrever(post("/api/mensagens/filas"), colaborador, "{\"modelo\":\"Olá {nome} {link}\",\"de\":\"" + hoje() + "\",\"ate\":\"" + hoje() + "\"}").andExpect(status().isForbidden());
        mvc.perform(get("/api/avaliacoes").with(host(OFFBOX))).andExpect(status().isUnauthorized());
        // atendente sem a seção não vê nada; o dono libera por pessoa e revogar volta a recusar
        comoAtendente("{}");
        ler("/api/avaliacoes", colaborador).andExpect(status().isForbidden());
        ler("/api/avaliacoes/resumo", colaborador).andExpect(status().isForbidden());
        ler("/api/mensagens/fila?" + periodoDeHoje(), colaborador).andExpect(status().isForbidden());
        jdbc.update("update usuario set permissoes = '{\"avaliacoes\": true}'::jsonb where identificador = 'colaborador1'");
        ler("/api/avaliacoes", colaborador).andExpect(status().isOk()).andExpect(jsonPath("$.soMinhas").value(false));
        ler("/api/mensagens/fila?" + periodoDeHoje(), colaborador).andExpect(status().isOk());
        jdbc.update("update usuario set permissoes = '{\"avaliacoes\": false}'::jsonb where identificador = 'colaborador1'");
        ler("/api/avaliacoes", colaborador).andExpect(status().isForbidden());
        ler("/api/avaliacoes", dono).andExpect(status().isOk()).andExpect(jsonPath("$.soMinhas").value(false));
        // quem foi desativado perde o acesso mesmo com o token ainda válido
        jdbc.update("update usuario set papel = 'profissional', permissoes = '{}'::jsonb, ativo = false where identificador = 'colaborador1'");
        ler("/api/avaliacoes", colaborador).andExpect(status().is4xxClientError());
        jdbc.update("update usuario set ativo = true where identificador = 'colaborador1'");
    }

    @Test
    void profissionalVeSoAsPropriasEOFiltroDeOutroEIgnorado() throws Exception {
        String a1 = atender("Cliente Um", novoTelefone(), corte);
        String a2 = atender("Cliente Dois", novoTelefone(), corte);
        avaliar(a1, "{\"nota\":5,\"texto\":\"Da colaboradora\"}");
        avaliar(a2, "{\"nota\":2,\"texto\":\"Do dono\"}");
        jdbc.update("update avaliacao set profissional_id = ? where agendamento_id = ?::uuid", donoId, a2);
        ler("/api/avaliacoes", dono).andExpect(status().isOk()).andExpect(jsonPath("$.avaliacoes", hasSize(2)));
        ler("/api/avaliacoes", colaborador).andExpect(status().isOk()).andExpect(jsonPath("$.avaliacoes", hasSize(1))).andExpect(jsonPath("$.avaliacoes[0].texto").value("Da colaboradora"));
        // pedir o filtro de outro profissional não mostra as dele
        ler("/api/avaliacoes?profissionalId=" + donoId, colaborador).andExpect(jsonPath("$.avaliacoes", hasSize(1))).andExpect(jsonPath("$.avaliacoes[0].texto").value("Da colaboradora"));
        ler("/api/avaliacoes/resumo?profissionalId=" + donoId, colaborador).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.media").value(5.0));
        ler("/api/avaliacoes/resumo", dono).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.media").value(3.5));
        ler("/api/avaliacoes?profissionalId=" + donoId, dono).andExpect(jsonPath("$.avaliacoes", hasSize(1))).andExpect(jsonPath("$.avaliacoes[0].texto").value("Do dono"));
    }

    // ---------------------------------------------------------------- estrela e pedido

    @Test
    void soAtendimentoConcluidoComServicoEClienteComTelefoneRecebeOPedido() throws Exception {
        String ok = atender("Cliente Ok", novoTelefone(), corte);
        String semCadastro = atender("Só Nome", null, corte);
        String semFone = atender("Fone Ruim", "53899990001", corte);
        String optOut = atender("Não Quer", novoTelefone(), corte);
        String futuro = atender("Ainda Não", novoTelefone(), corte);
        String soProduto = atender("Só Produto", novoTelefone(), corte);
        escrever(put("/api/clientes/" + clienteDe(optOut)), dono, "{\"semMensagens\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.semMensagens").value(true));
        jdbc.update("update agendamento set status = 'confirmado' where id = ?::uuid", futuro);
        jdbc.update("delete from agendamento_servico where agendamento_id = ?::uuid", soProduto);
        ler("/api/agendamentos/" + ok + "/avaliacao", dono).andExpect(status().isOk()).andExpect(jsonPath("$.motivo").value("ok")).andExpect(jsonPath("$.jaAvaliou").value(false));
        String[][] casos = {{semCadastro, "sem_cadastro"}, {semFone, "sem_telefone"}, {optOut, "sem_mensagens"}, {futuro, "nao_concluido"}, {soProduto, "sem_servico"}};
        for (String[] c : casos) {
            ler("/api/agendamentos/" + c[0] + "/avaliacao", dono).andExpect(status().isOk()).andExpect(jsonPath("$.motivo").value(c[1])).andExpect(jsonPath("$.aviso").isNotEmpty());
            escrever(post("/api/agendamentos/" + c[0] + "/avaliacao/pedido"), dono, "").andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").isNotEmpty());
        }
        assertEquals(0, contar("select count(*) from avaliacao_acesso"));
        assertEquals(0, contar("select count(*) from agendamento where avaliacao_pedida_em is not null"));
        // o opt-out volta atrás e o pedido passa
        escrever(put("/api/clientes/" + clienteDe(optOut)), dono, "{\"semMensagens\":false}").andExpect(status().isOk()).andExpect(jsonPath("$.semMensagens").value(false));
        escrever(post("/api/agendamentos/" + optOut + "/avaliacao/pedido"), dono, "").andExpect(status().isOk());
    }

    @Test
    void pedirDevolveOTokenUmaVezSoOHashFicaNoBancoEPedirDeNovoTrocaOLink() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String corpo = escrever(post("/api/agendamentos/" + ag + "/avaliacao/pedido"), dono, "").andExpect(status().isOk()).andExpect(jsonPath("$.numero").isNotEmpty())
                .andExpect(jsonPath("$.nome").value("Cliente Ok")).andReturn().getResponse().getContentAsString();
        String t1 = campo(corpo, "token");
        assertTrue(t1.matches("[0-9a-f]{48}"));
        assertEquals(sha256(t1), jdbc.queryForObject("select token_hash from avaliacao_acesso where agendamento_id = ?::uuid", String.class, ag));
        assertEquals(0, contar("select count(*) from avaliacao_acesso where token_hash = ?", t1), "o token em claro nunca fica no banco");
        assertNotNull(jdbc.queryForObject("select avaliacao_pedida_em from agendamento where id = ?::uuid", java.sql.Timestamp.class, ag));
        ler("/api/agendamentos/" + ag + "/avaliacao", dono).andExpect(jsonPath("$.pedidaEm").isNotEmpty());
        pubGet(OFFBOX, t1, novoIp()).andExpect(status().isOk());
        String t2 = pedir(ag);
        assertNotEquals(t1, t2);
        assertEquals(1, contar("select count(*) from avaliacao_acesso where agendamento_id = ?::uuid", ag), "um token vivo por agendamento");
        pubGet(OFFBOX, t1, novoIp()).andExpect(status().isNotFound());
        pubGet(OFFBOX, t2, novoIp()).andExpect(status().isOk());
    }

    @Test
    void profissionalSoPedeOsSeusEAgendamentoDeOutraLojaEhNaoEncontrado() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        ler("/api/agendamentos/" + ag + "/avaliacao", colaborador).andExpect(status().isOk());
        jdbc.update("update agendamento set profissional_id = ? where id = ?::uuid", donoId, ag);
        ler("/api/agendamentos/" + ag + "/avaliacao", colaborador).andExpect(status().isNotFound());
        escrever(post("/api/agendamentos/" + ag + "/avaliacao/pedido"), colaborador, "").andExpect(status().isNotFound());
        // outra loja: o mesmo id é desconhecido
        mvc.perform(get("/api/agendamentos/" + ag + "/avaliacao").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        mvc.perform(post("/api/agendamentos/" + ag + "/avaliacao/pedido").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        assertEquals(0, contar("select count(*) from avaliacao_acesso"));
    }

    // ---------------------------------------------------------------- página pública

    @Test
    void paginaPublicaMostraSoLojaServicosProfissionalEData() throws Exception {
        String ag = atender("Maria Reservada", novoTelefone(), corte, barba);
        String t = pedir(ag);
        String corpo = pubGet(OFFBOX, t, novoIp()).andExpect(status().isOk()).andExpect(jsonPath("$.loja").isNotEmpty()).andExpect(jsonPath("$.servicos", hasSize(2)))
                .andExpect(jsonPath("$.servicos[0]").value("Corte")).andExpect(jsonPath("$.profissional").value("Colaborador 1")).andExpect(jsonPath("$.quando").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        assertFalse(corpo.contains("Maria") || corpo.contains("Reservada") || corpo.contains("5399900"), "a página nunca diz quem é o cliente");
        // o token nunca vale na URL
        mvc.perform(get("/api/publico/avaliacoes?token=" + t).with(host(OFFBOX)).header("X-Forwarded-For", novoIp())).andExpect(status().isNotFound());
        mvc.perform(get("/api/publico/avaliacoes").with(host(OFFBOX)).header("X-Forwarded-For", novoIp())).andExpect(status().isNotFound());
    }

    @Test
    void avaliarGravaUmaVezGastaOTokenEOutraLojaNaoEnxerga() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte, barba);
        String t = pedir(ag);
        // loja errada: mesma resposta de token inexistente
        pubGet(DALFORNO, t, novoIp()).andExpect(status().isNotFound()).andExpect(jsonPath("$.mensagem").value(ERRO_TOKEN));
        pubPost(DALFORNO, t, novoIp(), "{\"nota\":5}").andExpect(status().isNotFound());
        assertEquals(0, contar("select count(*) from avaliacao"));
        pubPost(OFFBOX, t, novoIp(), "{\"nota\":5,\"texto\":\"  Ótimo!  \",\"anonimo\":false}").andExpect(status().isCreated()).andExpect(jsonPath("$.ok").value(true));
        assertEquals(1, contar("select count(*) from avaliacao where agendamento_id = ?::uuid and nota = 5 and texto = 'Ótimo!' and not anonimo", ag));
        assertEquals(2, contar("select count(*) from avaliacao_servico"), "vale para todos os serviços do atendimento");
        // gasto: nem ver nem avaliar de novo
        pubGet(OFFBOX, t, novoIp()).andExpect(status().isNotFound()).andExpect(jsonPath("$.mensagem").value(ERRO_TOKEN));
        pubPost(OFFBOX, t, novoIp(), "{\"nota\":1}").andExpect(status().isNotFound()).andExpect(jsonPath("$.mensagem").value(ERRO_TOKEN));
        assertEquals(1, contar("select count(*) from avaliacao"));
        // um por agendamento: a estrela avisa e pedir de novo é recusado
        ler("/api/agendamentos/" + ag + "/avaliacao", dono).andExpect(jsonPath("$.jaAvaliou").value(true));
        escrever(post("/api/agendamentos/" + ag + "/avaliacao/pedido"), dono, "").andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("Este cliente já avaliou este atendimento."));
    }

    @Test
    void tokenErradoVencidoReusadoEDeAtendimentoQueDeixouDeSerAvaliavelRespondemIgual() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String ag2 = atender("Cliente Dois", novoTelefone(), corte);
        String ag3 = atender("Cliente Tres", novoTelefone(), corte);
        String vencido = pedir(ag);
        String reusado = pedir(ag2);
        String cancelado = pedir(ag3);
        // (pedir um novo limpa os vencidos, por isso o vencimento e o cancelamento só depois de pedir todos)
        jdbc.update("update avaliacao_acesso set expira_em = now() - interval '1 minute' where agendamento_id = ?::uuid", ag);
        pubPost(OFFBOX, reusado, novoIp(), "{\"nota\":4}").andExpect(status().isCreated());
        jdbc.update("update agendamento set status = 'cancelado' where id = ?::uuid", ag3);
        String[] ruins = {"0123456789abcdef0123456789abcdef0123456789abcdef", "curto", "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ", vencido, reusado, cancelado};
        String referenciaGet = null, referenciaPost = null;
        for (String r : ruins) {
            String g = pubGet(OFFBOX, r, novoIp()).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
            String p = pubPost(OFFBOX, r, novoIp(), "{\"nota\":4}").andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
            if (referenciaGet == null) {
                referenciaGet = g;
                referenciaPost = p;
            }
            assertEquals(referenciaGet, g, "GET igual para qualquer token ruim");
            assertEquals(referenciaPost, p, "POST igual para qualquer token ruim");
        }
        assertTrue(referenciaGet.contains(ERRO_TOKEN));
        assertEquals(1, contar("select count(*) from avaliacao"), "só a do token bom");
    }

    @Test
    void semTokenValidoNadaSeAprendeSobreOsCamposECampoRuimNaoGastaOToken() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String t = pedir(ag);
        // token errado + campos inválidos = a resposta do token (404), nunca a validação (400)
        pubPost(OFFBOX, "errado", novoIp(), "{\"nota\":99}").andExpect(status().isNotFound()).andExpect(jsonPath("$.mensagem").value(ERRO_TOKEN));
        String[][] ruins = {
                {"{\"nota\":0}", "Escolha uma nota de 1 a 5 estrelas."}, {"{\"nota\":6}", "Escolha uma nota de 1 a 5 estrelas."}, {"{\"nota\":4.5}", "Escolha uma nota de 1 a 5 estrelas."},
                {"{}", "Escolha uma nota de 1 a 5 estrelas."}, {"{\"nota\":\"abc\"}", "Escolha uma nota de 1 a 5 estrelas."}, {"{\"nota\":3,\"texto\":123}", "Comentário inválido."},
                {"{\"nota\":3,\"texto\":\"" + "a".repeat(501) + "\"}", "O comentário pode ter até 500 caracteres."}, {"{\"nota\":3,\"anonimo\":\"sim\"}", "Opção de anonimato inválida."}};
        String ip = novoIp();
        for (String[] r : ruins) pubPost(OFFBOX, t, ip, r[0]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value(r[1]));
        assertEquals(0, contar("select count(*) from avaliacao"));
        assertEquals(0, contar("select count(*) from avaliacao_acesso where usado_em is not null"), "campo ruim desfaz: o token continua valendo");
        pubPost(OFFBOX, t, ip, "{\"nota\":3,\"texto\":\"" + "a".repeat(500) + "\"}").andExpect(status().isCreated());
        // texto de pessoa fica como texto (nada vira HTML no servidor nem é apagado)
        String ag2 = atender("Cliente Dois", novoTelefone(), corte);
        pubPost(OFFBOX, pedir(ag2), novoIp(), "{\"nota\":4,\"texto\":\"<img src=x onerror=alert(1)>\"}").andExpect(status().isCreated());
        assertEquals("<img src=x onerror=alert(1)>", jdbc.queryForObject("select texto from avaliacao where agendamento_id = ?::uuid", String.class, ag2));
    }

    @Test
    void iscaDeRoboFingeSucessoENaoGravaNemGastaOToken() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String t = pedir(ag);
        pubPost(OFFBOX, t, novoIp(), "{\"nota\":5,\"site\":\"http://spam\"}").andExpect(status().isCreated());
        assertEquals(0, contar("select count(*) from avaliacao"));
        pubGet(OFFBOX, t, novoIp()).andExpect(status().isOk());
    }

    @Test
    void doisEnviosAoMesmoTempoGravamUmaAvaliacaoSo() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String t = pedir(ag);
        int[] codigos = new int[2];
        Thread[] ts = new Thread[2];
        for (int i = 0; i < 2; i++) {
            final int k = i;
            final String ip = novoIp();
            ts[i] = new Thread(() -> {
                try {
                    codigos[k] = pubPost(OFFBOX, t, ip, "{\"nota\":5}").andReturn().getResponse().getStatus();
                } catch (Exception e) {
                    codigos[k] = -1;
                }
            });
        }
        for (Thread x : ts) x.start();
        for (Thread x : ts) x.join();
        assertEquals(1, contar("select count(*) from avaliacao"));
        assertEquals(201 + 404, codigos[0] + codigos[1], "uma grava, a outra recebe a resposta do token gasto");
    }

    // ---------------------------------------------------------------- anônimo

    @Test
    void anonimoSemIdentidadeNoJsonComARegraDesligadaEComNomeQuandoLigada() throws Exception {
        String agA = atender("Zélia Reservada", novoTelefone(), corte);
        String agB = atender("Bruno Aberto", novoTelefone(), corte);
        avaliar(agA, "{\"nota\":4,\"texto\":\"Gostei\",\"anonimo\":true}");
        avaliar(agB, "{\"nota\":5,\"texto\":\"Adorei\",\"anonimo\":false}");
        String clienteA = clienteDe(agA);
        for (String quem : new String[]{dono, colaborador}) {
            String json = ler("/api/avaliacoes", quem).andExpect(status().isOk()).andExpect(jsonPath("$.mostraAnonimo").value(false)).andReturn().getResponse().getContentAsString();
            assertFalse(json.contains("Zélia") || json.contains("Reservada"), "nome do anônimo vazou: " + json);
            assertFalse(json.contains(clienteA) || json.contains(agA), "id de cliente ou agendamento do anônimo vazou: " + json);
            assertFalse(json.contains("5399900"), "telefone vazou");
            assertTrue(json.contains("Anônimo") && json.contains("Gostei"));
            assertTrue(json.contains("Bruno Aberto"), "quem não pediu anonimato aparece com o nome");
        }
        ler("/api/avaliacoes", dono).andExpect(jsonPath("$.avaliacoes[?(@.texto=='Gostei')].cliente").value(org.hamcrest.Matchers.contains("Anônimo")))
                .andExpect(jsonPath("$.avaliacoes[?(@.texto=='Gostei')].revelado").value(org.hamcrest.Matchers.contains(false)))
                .andExpect(jsonPath("$.avaliacoes[?(@.texto=='Gostei')].clienteId").isEmpty())
                .andExpect(jsonPath("$.avaliacoes[?(@.texto=='Gostei')].agendamentoId").isEmpty());
        // o anônimo continua na média
        ler("/api/avaliacoes/resumo", dono).andExpect(jsonPath("$.total").value(2));
        // o Admin liga a regra: o nome aparece, marcado como revelado
        regraAnonimo(true);
        String json = ler("/api/avaliacoes", dono).andExpect(jsonPath("$.mostraAnonimo").value(true)).andReturn().getResponse().getContentAsString();
        assertTrue(json.contains("Zélia Reservada") && json.contains(clienteA));
        ler("/api/avaliacoes", dono).andExpect(jsonPath("$.avaliacoes[?(@.texto=='Gostei')].revelado").value(org.hamcrest.Matchers.contains(true)))
                .andExpect(jsonPath("$.avaliacoes[?(@.texto=='Gostei')].anonimo").value(org.hamcrest.Matchers.contains(true)));
        // e desligar de novo esconde (a regra vale na hora, sem reiniciar)
        regraAnonimo(false);
        assertFalse(ler("/api/avaliacoes", dono).andReturn().getResponse().getContentAsString().contains("Zélia"));
    }

    // ---------------------------------------------------------------- por serviço, período, ocultar

    @Test
    void filtrosPorServicoEPeriodoEPeriodoRuimEhRecusado() throws Exception {
        String agA = atender("Cliente Um", novoTelefone(), corte);
        String agB = atender("Cliente Dois", novoTelefone(), corte, barba);
        avaliar(agA, "{\"nota\":3}");
        avaliar(agB, "{\"nota\":5}");
        ler("/api/avaliacoes?servicoId=" + corte, dono).andExpect(jsonPath("$.avaliacoes", hasSize(2)));
        ler("/api/avaliacoes?servicoId=" + barba, dono).andExpect(jsonPath("$.avaliacoes", hasSize(1))).andExpect(jsonPath("$.avaliacoes[0].nota").value(5))
                .andExpect(jsonPath("$.avaliacoes[0].servicos", hasSize(2))).andExpect(jsonPath("$.avaliacoes[0].servicos[1]").value("Barba")).andExpect(jsonPath("$.avaliacoes[0].servicoIds", hasSize(2)));
        ler("/api/avaliacoes/resumo?servicoId=" + barba, dono).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.distribuicao['5']").value(1)).andExpect(jsonPath("$.distribuicao['1']").value(0));
        ler("/api/avaliacoes?servicoId=" + UUID.randomUUID(), dono).andExpect(jsonPath("$.avaliacoes", hasSize(0)));
        ler("/api/avaliacoes?" + periodoDeHoje(), dono).andExpect(jsonPath("$.avaliacoes", hasSize(2)));
        ler("/api/avaliacoes?de=2020-01-01&ate=2020-01-31", dono).andExpect(jsonPath("$.avaliacoes", hasSize(0)));
        ler("/api/avaliacoes/resumo?de=2020-01-01&ate=2020-01-31", dono).andExpect(jsonPath("$.total").value(0)).andExpect(jsonPath("$.media").doesNotExist());
        ler("/api/avaliacoes?de=2026-10-01", dono).andExpect(status().isBadRequest());
        ler("/api/avaliacoes?de=2025-01-01&ate=2026-01-02", dono).andExpect(status().isBadRequest());
        ler("/api/avaliacoes?de=2026-10-31&ate=2026-10-01", dono).andExpect(status().isBadRequest());
        ler("/api/avaliacoes?servicoId=nao-e-id", dono).andExpect(status().isBadRequest());
    }

    @Test
    void ocultarEhSoDoDonoComMotivoNaoApagaESaiDaMedia() throws Exception {
        String a1 = atender("Cliente Um", novoTelefone(), corte);
        String a2 = atender("Cliente Dois", novoTelefone(), corte);
        avaliar(a1, "{\"nota\":5}");
        String ruim = avaliar(a2, "{\"nota\":1,\"texto\":\"Ofensiva\"}");
        escrever(post("/api/avaliacoes/" + ruim + "/ocultar"), colaborador, "{\"motivo\":\"Texto ofensivo\"}").andExpect(status().isForbidden());
        comoAtendente("{\"avaliacoes\": true}");
        escrever(post("/api/avaliacoes/" + ruim + "/ocultar"), colaborador, "{\"motivo\":\"Texto ofensivo\"}").andExpect(status().isForbidden());
        escrever(post("/api/avaliacoes/" + ruim + "/ocultar"), dono, "{\"motivo\":\"abc\"}").andExpect(status().isBadRequest());
        escrever(post("/api/avaliacoes/" + ruim + "/ocultar"), dono, "{\"motivo\":\"" + "a".repeat(201) + "\"}").andExpect(status().isBadRequest());
        escrever(post("/api/avaliacoes/" + ruim + "/ocultar"), dono, "{}").andExpect(status().isBadRequest());
        escrever(post("/api/avaliacoes/" + UUID.randomUUID() + "/ocultar"), dono, "{\"motivo\":\"Texto ofensivo\"}").andExpect(status().isNotFound());
        ler("/api/avaliacoes/resumo", dono).andExpect(jsonPath("$.total").value(2)).andExpect(jsonPath("$.media").value(3.0));
        escrever(post("/api/avaliacoes/" + ruim + "/ocultar"), dono, "{\"motivo\":\"Texto ofensivo\"}").andExpect(status().isOk());
        escrever(post("/api/avaliacoes/" + ruim + "/ocultar"), dono, "{\"motivo\":\"Texto ofensivo\"}").andExpect(status().isConflict());
        assertEquals(2, contar("select count(*) from avaliacao"), "ocultar não apaga");
        ler("/api/avaliacoes/resumo", dono).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.media").value(5.0));
        // o dono vê a oculta com o motivo; quem tem a seção e o profissional não a veem
        ler("/api/avaliacoes", dono).andExpect(jsonPath("$.avaliacoes", hasSize(2))).andExpect(jsonPath("$.avaliacoes[?(@.oculta==true)].motivoOculta").value(org.hamcrest.Matchers.contains("Texto ofensivo")));
        ler("/api/avaliacoes", colaborador).andExpect(jsonPath("$.avaliacoes", hasSize(1))).andExpect(jsonPath("$.avaliacoes[0].oculta").value(false));
        jdbc.update("update usuario set papel = 'profissional', permissoes = '{}'::jsonb where identificador = 'colaborador1'");
        zerarLogin();
        colaborador = token(OFFBOX, "colaborador1");
        ler("/api/avaliacoes", colaborador).andExpect(jsonPath("$.avaliacoes", hasSize(1)));
        ler("/api/avaliacoes/resumo", colaborador).andExpect(jsonPath("$.total").value(1));
        // reexibir volta à média; fica o histórico das duas mudanças
        escrever(post("/api/avaliacoes/" + ruim + "/reexibir"), dono, "{\"motivo\":\"Revisado com o cliente\"}").andExpect(status().isOk());
        escrever(post("/api/avaliacoes/" + ruim + "/reexibir"), dono, "{\"motivo\":\"Revisado com o cliente\"}").andExpect(status().isConflict());
        ler("/api/avaliacoes/resumo", dono).andExpect(jsonPath("$.total").value(2));
        assertEquals(2, contar("select count(*) from avaliacao_evento where avaliacao_id = ?::uuid", ruim));
        assertEquals(0, contar("select count(*) from avaliacao where oculta"));
    }

    // ---------------------------------------------------------------- mensagens em lote

    /** a1 e a2 (mesma pessoa), b (já avaliou), c (sem cadastro), d (telefone ruim), e (não quer), f (só ela tem Barba). */
    private String[] cenarioDaFila() throws Exception {
        String telA = novoTelefone(), telB = novoTelefone(), telE = novoTelefone(), telF = novoTelefone();
        String a1 = atender("Ana Lote", telA, corte);
        String a2 = atender("Ana Lote", telA, corte);
        String b = atender("Beto Lote", telB, corte);
        String c = atender("Só Nome", null, corte);
        String d = atender("Dani Lote", "53899990001", corte);
        String e = atender("Edu Lote", telE, corte);
        String f = atender("Fabi Lote", telF, corte, barba);
        escrever(put("/api/clientes/" + clienteDe(e)), dono, "{\"semMensagens\":true}").andExpect(status().isOk());
        avaliar(b, "{\"nota\":5}");
        return new String[]{a1, a2, b, c, d, e, f};
    }

    @Test
    void aPreviaDaFilaContaQuemFicouDeForaPorMotivo() throws Exception {
        cenarioDaFila();
        String periodo = periodoDeHoje();
        String corpo = ler("/api/mensagens/fila?tipo=avaliacao&" + periodo, dono).andExpect(status().isOk()).andExpect(jsonPath("$.limite").value(200))
                .andExpect(jsonPath("$.contagem.atendimentos").value(7)).andExpect(jsonPath("$.contagem.semCadastro").value(1)).andExpect(jsonPath("$.contagem.semTelefone").value(1))
                .andExpect(jsonPath("$.contagem.semMensagens").value(1)).andExpect(jsonPath("$.contagem.duplicados").value(1)).andExpect(jsonPath("$.contagem.jaAvaliou").value(1))
                .andExpect(jsonPath("$.contagem.excedente").value(0)).andExpect(jsonPath("$.itens", hasSize(2))).andExpect(jsonPath("$.itens[0].nome").value("Fabi Lote"))
                .andExpect(jsonPath("$.itens[1].nome").value("Ana Lote")).andExpect(jsonPath("$.itens[0].servicos", hasSize(2))).andReturn().getResponse().getContentAsString();
        assertFalse(corpo.contains("5399900"), "o telefone inteiro nunca vai na lista");
        assertTrue(corpo.contains("(53) •••••-"));
        // aviso geral: quem já avaliou volta à lista
        ler("/api/mensagens/fila?tipo=aviso&" + periodo, dono).andExpect(jsonPath("$.contagem.jaAvaliou").value(0)).andExpect(jsonPath("$.itens", hasSize(3)));
        // filtros: serviço e profissional
        ler("/api/mensagens/fila?servicoId=" + barba + "&" + periodo, dono).andExpect(jsonPath("$.itens", hasSize(1))).andExpect(jsonPath("$.contagem.atendimentos").value(1));
        ler("/api/mensagens/fila?profissionalId=" + donoId + "&" + periodo, dono).andExpect(jsonPath("$.itens", hasSize(0)));
        // período obrigatório e limitado
        ler("/api/mensagens/fila", dono).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Informe o período dos atendimentos (data inicial e final)."));
        ler("/api/mensagens/fila?de=2025-01-01&ate=2026-01-02", dono).andExpect(status().isBadRequest());
        ler("/api/mensagens/fila?tipo=outro&" + periodo, dono).andExpect(status().isBadRequest());
        ler("/api/mensagens/fila?de=2020-01-01&ate=2020-01-31", dono).andExpect(jsonPath("$.itens", hasSize(0)));
        assertEquals(0, contar("select count(*) from fila_mensagem"), "a prévia não grava nada");
    }

    @Test
    void filaNasceComModeloValidoUmaAbertaPorPessoaEOTelefoneSoVemNoClique() throws Exception {
        cenarioDaFila();
        String base = "\"de\":\"" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).minusDays(1) + "\",\"ate\":\"" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).plusDays(1) + "\"";
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"avaliacao\",\"modelo\":\"Olá {nome}\"," + base + "}").andExpect(status().isBadRequest());                     // sem {link}
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"aviso\",\"modelo\":\"Veja {link}\"," + base + "}").andExpect(status().isBadRequest());
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"avaliacao\",\"modelo\":\"Oi {cpf} {link}\"," + base + "}").andExpect(status().isBadRequest());
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"avaliacao\",\"modelo\":\"Oi\"," + base + "}").andExpect(status().isBadRequest());                                   // curto
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"avaliacao\",\"modelo\":\"Olá {nome} {link}\",\"de\":\"2020-01-01\",\"ate\":\"2020-01-31\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Ninguém para receber a mensagem com esses filtros."));
        assertEquals(0, contar("select count(*) from fila_mensagem"));
        String criada = escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"avaliacao\",\"modelo\":\"Olá, {nome}! Avalie a {loja}: {link}\"," + base + "}").andExpect(status().isOk())
                .andExpect(jsonPath("$.itens", hasSize(2))).andExpect(jsonPath("$.itens[0].id").value(1)).andExpect(jsonPath("$.itens[0].status").value("pendente"))
                .andExpect(jsonPath("$.encerrada").value(false)).andReturn().getResponse().getContentAsString();
        assertFalse(criada.contains("5399900"), "a fila guarda o telefone mascarado");
        String filaId = campo(criada, "id");
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"aviso\",\"modelo\":\"Olá {nome}\"," + base + "}").andExpect(status().isConflict());
        ler("/api/mensagens/filas/atual", dono).andExpect(status().isOk()).andExpect(jsonPath("$.fila.id").value(filaId)).andExpect(jsonPath("$.fila.itens", hasSize(2)));
        // enviado só depois de aberto
        escrever(put("/api/mensagens/filas/" + filaId + "/itens/1"), dono, "{\"status\":\"enviado\"}").andExpect(status().isConflict());
        escrever(put("/api/mensagens/filas/" + filaId + "/itens/1"), dono, "{\"status\":\"xis\"}").andExpect(status().isBadRequest());
        String aberto = escrever(post("/api/mensagens/filas/" + filaId + "/itens/1/abrir"), dono, "").andExpect(status().isOk()).andExpect(jsonPath("$.tipo").value("avaliacao"))
                .andExpect(jsonPath("$.numero").isNotEmpty()).andExpect(jsonPath("$.nome").value("Fabi Lote")).andReturn().getResponse().getContentAsString();
        String token = campo(aberto, "token");
        pubGet(OFFBOX, token, novoIp()).andExpect(status().isOk());
        ler("/api/mensagens/filas/atual", dono).andExpect(jsonPath("$.fila.itens[0].status").value("aberto"));
        escrever(put("/api/mensagens/filas/" + filaId + "/itens/1"), dono, "{\"status\":\"enviado\"}").andExpect(status().isOk()).andExpect(jsonPath("$.itens[0].status").value("enviado"));
        escrever(put("/api/mensagens/filas/" + filaId + "/itens/1"), dono, "{\"status\":\"pulou\"}").andExpect(status().isConflict());              // já tratado
        escrever(post("/api/mensagens/filas/" + filaId + "/itens/1/abrir"), dono, "").andExpect(status().isConflict());
        escrever(post("/api/mensagens/filas/" + filaId + "/itens/99/abrir"), dono, "").andExpect(status().isNotFound());
        escrever(put("/api/mensagens/filas/" + filaId + "/itens/2"), dono, "{\"status\":\"pulou\"}").andExpect(status().isOk());
        // a fila é de quem a criou: outra pessoa (mesmo com a seção) recebe 404
        comoAtendente("{\"avaliacoes\": true}");
        escrever(post("/api/mensagens/filas/" + filaId + "/itens/2/abrir"), colaborador, "").andExpect(status().isNotFound());
        escrever(post("/api/mensagens/filas/" + filaId + "/encerrar"), colaborador, "").andExpect(status().isNotFound());
        ler("/api/mensagens/filas/atual", colaborador).andExpect(jsonPath("$.fila").doesNotExist());
        // encerrar libera outra; fila encerrada não aceita mais nada
        escrever(post("/api/mensagens/filas/" + filaId + "/encerrar"), dono, "").andExpect(status().isOk());
        escrever(put("/api/mensagens/filas/" + filaId + "/itens/2"), dono, "{\"status\":\"pulou\"}").andExpect(status().isConflict());
        ler("/api/mensagens/filas/atual", dono).andExpect(jsonPath("$.fila").doesNotExist());
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"aviso\",\"modelo\":\"Olá {nome}, é da {loja}\"," + base + "}").andExpect(status().isOk()).andExpect(jsonPath("$.itens", hasSize(3)));
    }

    @Test
    void contatoQueFicouImpossivelEPuladoERegistradoNoClique() throws Exception {
        String[] ags = cenarioDaFila();
        String base = "\"de\":\"" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).minusDays(1) + "\",\"ate\":\"" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).plusDays(1) + "\"";
        String filaId = campo(escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"avaliacao\",\"modelo\":\"Olá {nome} {link}\"," + base + "}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "id");
        // depois de montada, a Fabi (item 1) pede para não receber: o clique não abre, pula e deixa registrado
        escrever(put("/api/clientes/" + clienteDe(ags[6])), dono, "{\"semMensagens\":true}").andExpect(status().isOk());
        escrever(post("/api/mensagens/filas/" + filaId + "/itens/1/abrir"), dono, "").andExpect(status().isConflict());
        assertEquals("pulou", jdbc.queryForObject("select status from fila_mensagem_item where fila_id = ?::uuid and ordem = 1", String.class, filaId));
        assertEquals("sem_mensagens", jdbc.queryForObject("select motivo from fila_mensagem_item where fila_id = ?::uuid and ordem = 1", String.class, filaId));
        assertEquals(0, contar("select count(*) from avaliacao_acesso where agendamento_id = ?::uuid", ags[6]));
        // a Ana (item 2) já avaliou nesse meio tempo: também pulada
        avaliar(ags[1], "{\"nota\":4}");
        escrever(post("/api/mensagens/filas/" + filaId + "/itens/2/abrir"), dono, "").andExpect(status().isConflict());
        assertEquals("ja_avaliou", jdbc.queryForObject("select motivo from fila_mensagem_item where fila_id = ?::uuid and ordem = 2", String.class, filaId));
    }

    @Test
    void filaTemNoMaximo200ContatosEORestoViraExcedente() throws Exception {
        for (int i = 0; i < 205; i++) atender("Contato " + i, novoTelefone(), corte);
        String base = "\"de\":\"" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).minusDays(1) + "\",\"ate\":\"" + LocalDate.now(br.com.agendz.escala.Fuso.BRASIL).plusDays(1) + "\"";
        ler("/api/mensagens/fila?tipo=aviso&" + periodoDeHoje(), dono).andExpect(jsonPath("$.itens", hasSize(200))).andExpect(jsonPath("$.contagem.excedente").value(5)).andExpect(jsonPath("$.contagem.atendimentos").value(205));
        escrever(post("/api/mensagens/filas"), dono, "{\"tipo\":\"aviso\",\"modelo\":\"Olá {nome}\"," + base + "}").andExpect(status().isOk()).andExpect(jsonPath("$.itens", hasSize(200))).andExpect(jsonPath("$.contagem.excedente").value(5));
        assertEquals(200, contar("select count(*) from fila_mensagem_item"));
    }

    // ---------------------------------------------------------------- limite de pedidos na porta pública

    @Test
    void portaPublicaTemLimiteEResponde429SemDizerSeOTokenExiste() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String t = pedir(ag);
        String ipRuim = novoIp();
        int primeiro429 = -1;
        for (int i = 1; i <= 20; i++) {
            int s = pubGet(OFFBOX, "0123456789abcdef0123456789abcdef0123456789abcde" + (i % 10), ipRuim).andReturn().getResponse().getStatus();
            if (s == 429 && primeiro429 < 0) primeiro429 = i;
            else assertTrue(s == 404 || s == 429);
        }
        assertTrue(primeiro429 > 0 && primeiro429 <= 16, "tentativas erradas esbarram no limite: " + primeiro429);
        // o mesmo IP, agora com o token certo, também espera (não dá para testar token por token sem custo)
        pubGet(OFFBOX, t, ipRuim).andExpect(status().isOk()); // o limite de falhas só conta erros; o geral (60/min) ainda não estourou
        // outro IP não é afetado
        pubGet(OFFBOX, t, novoIp()).andExpect(status().isOk());
        // 60 consultas por minuto por IP; a 61ª espera
        String ipGeral = novoIp();
        for (int i = 0; i < 60; i++) pubGet(OFFBOX, t, ipGeral).andExpect(status().isOk());
        pubGet(OFFBOX, t, ipGeral).andExpect(status().isTooManyRequests());
        pubPost(OFFBOX, t, ipGeral, "{\"nota\":5}").andExpect(status().isTooManyRequests());
        assertEquals(0, contar("select count(*) from avaliacao"), "429 não grava nem gasta o token");
    }

    // ---------------------------------------------------------------- outra loja

    @Test
    void outraLojaNaoVeNemMexeEOBancoRecusaPorRowLevelSecurity() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String av = avaliar(ag, "{\"nota\":5,\"texto\":\"Da Offbox\"}");
        mvc.perform(get("/api/avaliacoes").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk()).andExpect(jsonPath("$.avaliacoes", hasSize(0)));
        mvc.perform(get("/api/avaliacoes/resumo").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(jsonPath("$.total").value(0));
        mvc.perform(post("/api/avaliacoes/" + av + "/ocultar").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON).content("{\"motivo\":\"Tentando de fora\"}"))
                .andExpect(status().isNotFound());
        assertFalse(jdbc.queryForObject("select oculta from avaliacao where id = ?::uuid", Boolean.class, av));
        mvc.perform(get("/api/mensagens/fila?" + periodoDeHoje()).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk()).andExpect(jsonPath("$.itens", hasSize(0)));
        // token da Offbox na Dalforno: igual a token inexistente
        String t = pedir(atender("Outro Cliente", novoTelefone(), corte));
        pubGet(DALFORNO, t, novoIp()).andExpect(status().isNotFound()).andExpect(jsonPath("$.mensagem").value(ERRO_TOKEN));
        // Row Level Security: sem loja ou na loja errada o banco não devolve linha nenhuma
        for (String tabela : new String[]{"avaliacao", "avaliacao_servico", "avaliacao_evento", "avaliacao_acesso", "fila_mensagem", "fila_mensagem_item"}) {
            assertEquals(0, contarComo(null, tabela), tabela + " sem loja");
            assertEquals(0, contarComo(LOJA_DALFORNO, tabela), tabela + " na loja errada");
        }
        assertEquals(1, contarComo(LOJA_OFFBOX, "avaliacao"));
    }

    private int contarComo(String lojaId, String tabela) throws Exception {
        try (java.sql.Connection c = ds.getConnection()) {
            c.setAutoCommit(false);
            try (java.sql.Statement st = c.createStatement()) {
                st.execute("SET LOCAL ROLE agendz_app");
                if (lojaId != null) st.execute("SELECT set_config('app.loja_id', '" + lojaId + "', true)");
                try (java.sql.ResultSet rs = st.executeQuery("select count(*) from " + tabela)) {
                    rs.next();
                    return rs.getInt(1);
                }
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    void cadastroDoClienteGuardaOPedidoDeNaoReceberMensagens() throws Exception {
        String ag = atender("Cliente Ok", novoTelefone(), corte);
        String cli = clienteDe(ag);
        ler("/api/clientes/" + cli, dono).andExpect(jsonPath("$.semMensagens").value(false));
        escrever(put("/api/clientes/" + cli), dono, "{\"semMensagens\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.semMensagens").value(true)).andExpect(jsonPath("$.nome").value("Cliente Ok"));
        ler("/api/clientes", dono).andExpect(jsonPath("$[0].semMensagens").value(true));
        // um PUT sem o campo não mexe nele
        escrever(put("/api/clientes/" + cli), dono, "{\"apelido\":\"Clientão\"}").andExpect(status().isOk()).andExpect(jsonPath("$.semMensagens").value(true));
        escrever(post("/api/clientes"), dono, "{\"nome\":\"Novo Cliente\",\"telefone\":\"" + novoTelefone() + "\",\"semMensagens\":true}").andExpect(status().isCreated()).andExpect(jsonPath("$.semMensagens").value(true));
    }
}
