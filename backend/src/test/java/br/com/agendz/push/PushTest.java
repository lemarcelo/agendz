package br.com.agendz.push;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Aviso com o app fechado (v130): inscrição do aparelho (só serviços de push conhecidos, chaves conferidas, até 5 por pessoa, só o dono da inscrição mexe),
 * mensagem de teste que chega criptografada e só abre com a chave do aparelho, envio dos avisos do painel (dono e recepção recebem todos, profissional só os seus,
 * uma vez só, nada de aviso velho), inscrição morta apagada e isolamento entre lojas. O serviço de push é falso: nada sai pela rede.
 */
@Import(PushTest.ServicoDePushFalso.class)
class PushTest extends BaseApi {

    private static final String LOJA_OFFBOX = "00000000-0000-0000-0000-0000000000b2";
    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";

    record Envio(String endpoint, byte[] corpo, String autorizacao, int ttl) {
    }

    static final List<Envio> ENVIOS = new CopyOnWriteArrayList<>();
    static final Map<String, Enviador.Resultado> RESPOSTAS = new ConcurrentHashMap<>();

    @TestConfiguration
    static class ServicoDePushFalso {
        @Bean
        @Primary
        Enviador enviadorFalso() {
            return (endpoint, corpo, autorizacao, ttl) -> {
                ENVIOS.add(new Envio(endpoint, corpo, autorizacao, ttl));
                return RESPOSTAS.getOrDefault(endpoint, Enviador.Resultado.ENTREGUE);
            };
        }
    }

    /** Um aparelho de mentira: par de chaves e segredo de autenticação, como o navegador gera. */
    record Aparelho(String endpoint, KeyPair par, byte[] auth) {
        static Aparelho novo() {
            byte[] a = new byte[16];
            new SecureRandom().nextBytes(a);
            return new Aparelho("https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID().toString().replace("-", ""), WebPush.novoPar(), a);
        }

        String corpo(String nome) {
            return "{\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\"" + WebPush.base64url(WebPush.ponto((ECPublicKey) par.getPublic())) + "\",\"auth\":\"" + WebPush.base64url(auth) + "\"}"
                    + (nome == null ? "" : ",\"aparelho\":\"" + nome + "\"") + "}";
        }
    }

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PushAvisos avisos;
    @Autowired
    PushConfig config;
    @Autowired
    br.com.agendz.auth.LimiteDeLogin limiteLogin;

    String dono, colaborador, alan;
    UUID donoId, colaboradorId;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        limiteLogin.limpar(LOJA_OFFBOX + "|proprietario"); limiteLogin.limpar(LOJA_OFFBOX + "|colaborador1"); limiteLogin.limpar(LOJA_DALFORNO + "|alan");
        dono = token(OFFBOX, "proprietario");
        colaborador = token(OFFBOX, "colaborador1");
        alan = token(DALFORNO, "alan");
        donoId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'proprietario'", UUID.class, LOJA_OFFBOX);
        colaboradorId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'colaborador1'", UUID.class, LOJA_OFFBOX);
    }

    @AfterEach
    void limpar() {
        ENVIOS.clear();
        RESPOSTAS.clear();
        jdbc.update("delete from push_inscricao");
        jdbc.update("delete from aviso_painel");
    }

    // ---------------------------------------------------------------- ajudantes

    private ResultActions como(MockHttpServletRequestBuilder req, String loja, String token, String corpo) throws Exception {
        MockHttpServletRequestBuilder r = req.with(host(loja)).header(HttpHeaders.AUTHORIZATION, bearer(token));
        return mvc.perform(corpo == null ? r : r.contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions inscrever(String token, Aparelho a, String nome) throws Exception {
        return como(post("/api/push/inscricoes"), OFFBOX, token, a.corpo(nome));
    }

    private int contar(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    /** O lado do aparelho (RFC 8291): abre o corpo com a chave privada dele. */
    static byte[] abrir(byte[] corpo, KeyPair aparelho, byte[] auth) {
        try {
            ByteBuffer b = ByteBuffer.wrap(corpo);
            byte[] sal = new byte[16];
            b.get(sal);
            b.getInt();
            byte[] idDaChave = new byte[b.get() & 0xff];
            b.get(idDaChave); // chave pública efêmera do servidor
            byte[] cifrado = new byte[b.remaining()];
            b.get(cifrado);
            KeyAgreement ka = KeyAgreement.getInstance("ECDH");
            ka.init(aparelho.getPrivate());
            ka.doPhase(WebPush.publica(idDaChave), true);
            byte[] segredo = ka.generateSecret();
            byte[] uaPublica = WebPush.ponto((ECPublicKey) aparelho.getPublic());
            byte[] ikm = hkdf(hmac(auth, segredo), concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublica, idDaChave), 32);
            byte[] prk = hmac(sal, ikm);
            byte[] cek = hkdf(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
            byte[] nonce = hkdf(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
            byte[] aberto = c.doFinal(cifrado);
            int fim = aberto.length - 1;
            while (fim >= 0 && aberto[fim] == 0) fim--;
            assertEquals(2, aberto[fim], "delimitador do último registro");
            return Arrays.copyOf(aberto, fim);
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] hmac(byte[] chave, byte[] dado) throws java.security.GeneralSecurityException {
        Mac m = Mac.getInstance("HmacSHA256");
        m.init(new SecretKeySpec(chave, "HmacSHA256"));
        return m.doFinal(dado);
    }

    private static byte[] hkdf(byte[] prk, byte[] info, int tamanho) throws java.security.GeneralSecurityException {
        return Arrays.copyOf(hmac(prk, concat(info, new byte[] {1})), tamanho);
    }

    private static byte[] concat(byte[]... partes) {
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
        for (byte[] p : partes) o.write(p, 0, p.length);
        return o.toByteArray();
    }

    private void aviso(UUID profissional, String texto, String criadoHa) {
        jdbc.update("insert into aviso_painel (loja_id, profissional_id, tipo, texto, criado_em, push_em) values (?::uuid, ?, 'pedido', ?, now() - ?::interval, null)", LOJA_OFFBOX, profissional, texto, criadoHa);
    }

    // ---------------------------------------------------------------- testes

    @Test
    void chavePublicaSoComLoginEComRecursoLigado() throws Exception {
        assertTrue(config.ligado());
        mvc.perform(get("/api/push/chave").with(host(OFFBOX))).andExpect(status().isUnauthorized());
        como(get("/api/push/chave"), OFFBOX, colaborador, null).andExpect(status().isOk()).andExpect(jsonPath("$.chave").value(config.publica()));
    }

    @Test
    void inscricaoValidaApareceSemEndpointNemChavesERecusaOQueNaoEPushDeVerdade() throws Exception {
        Aparelho a = Aparelho.novo();
        mvc.perform(post("/api/push/inscricoes").with(host(OFFBOX)).contentType(MediaType.APPLICATION_JSON).content(a.corpo(null))).andExpect(status().isUnauthorized());
        inscrever(colaborador, a, "Celular do Colab").andExpect(status().isCreated()).andExpect(jsonPath("$.aparelho").value("Celular do Colab")).andExpect(jsonPath("$.id").exists());
        como(get("/api/push/inscricoes"), OFFBOX, colaborador, null).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(content().string(not(containsString(a.endpoint())))).andExpect(content().string(not(containsString("p256dh")))).andExpect(content().string(not(containsString("auth"))));
        // o mesmo aparelho de novo não duplica
        inscrever(colaborador, a, "Outro nome").andExpect(status().isCreated());
        assertEquals(1, contar("select count(*) from push_inscricao"));
        // endereço que não é de serviço de push conhecido, chave fora da curva e segredo curto
        Aparelho b = Aparelho.novo();
        como(post("/api/push/inscricoes"), OFFBOX, colaborador, b.corpo(null).replace("https://fcm.googleapis.com", "https://localhost")).andExpect(status().isBadRequest());
        como(post("/api/push/inscricoes"), OFFBOX, colaborador, b.corpo(null).replace("https://fcm.googleapis.com", "http://fcm.googleapis.com")).andExpect(status().isBadRequest());
        como(post("/api/push/inscricoes"), OFFBOX, colaborador, b.corpo(null).replaceAll("\"auth\":\"[^\"]+\"", "\"auth\":\"curto\"")).andExpect(status().isBadRequest());
        como(post("/api/push/inscricoes"), OFFBOX, colaborador, b.corpo(null).replaceAll("\"p256dh\":\"[^\"]+\"", "\"p256dh\":\"" + "A".repeat(87) + "\"")).andExpect(status().isBadRequest());
        como(post("/api/push/inscricoes"), OFFBOX, colaborador, "{\"endpoint\":\"\",\"keys\":{}}").andExpect(status().isBadRequest());
        assertEquals(1, contar("select count(*) from push_inscricao"));
    }

    @Test
    void ateCincoAparelhosPorPessoaESoOdonoDaInscricaoRemove() throws Exception {
        Aparelho primeiro = Aparelho.novo();
        inscrever(colaborador, primeiro, null).andExpect(status().isCreated());
        for (int i = 0; i < 4; i++) inscrever(colaborador, Aparelho.novo(), null).andExpect(status().isCreated());
        inscrever(colaborador, Aparelho.novo(), null).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value(containsString("5 aparelhos")));
        inscrever(dono, Aparelho.novo(), null).andExpect(status().isCreated()); // o limite é por pessoa
        String id = jdbc.queryForObject("select id::text from push_inscricao where endpoint = ?", String.class, primeiro.endpoint());
        como(delete("/api/push/inscricoes/" + id), OFFBOX, dono, null).andExpect(status().isNotFound());          // de outra pessoa
        como(delete("/api/push/inscricoes/" + id), DALFORNO, alan, null).andExpect(status().isNotFound());         // de outra loja
        assertEquals(6, contar("select count(*) from push_inscricao"));
        como(delete("/api/push/inscricoes/" + id), OFFBOX, colaborador, null).andExpect(status().isNoContent());
        assertEquals(5, contar("select count(*) from push_inscricao"));
        inscrever(colaborador, Aparelho.novo(), null).andExpect(status().isCreated()); // abriu vaga
    }

    @Test
    void mensagemDeTesteChegaCriptografadaEOEnderecoMortoSomeDaLista() throws Exception {
        Aparelho vivo = Aparelho.novo();
        Aparelho morto = Aparelho.novo();
        inscrever(colaborador, vivo, "Vivo").andExpect(status().isCreated());
        inscrever(colaborador, morto, "Morto").andExpect(status().isCreated());
        RESPOSTAS.put(morto.endpoint(), Enviador.Resultado.INSCRICAO_MORTA);
        como(post("/api/push/teste"), OFFBOX, colaborador, null).andExpect(status().isOk()).andExpect(jsonPath("$.enviados").value(1)).andExpect(jsonPath("$.falhas").value(1));
        assertEquals(2, ENVIOS.size());
        Envio para = ENVIOS.stream().filter(e -> e.endpoint().equals(vivo.endpoint())).findFirst().orElseThrow();
        assertTrue(para.autorizacao().startsWith("vapid t=") && para.autorizacao().endsWith(", k=" + config.publica()), para.autorizacao());
        assertEquals(EntregaPush.TTL_SEGUNDOS, para.ttl());
        String texto = new String(abrir(para.corpo(), vivo.par(), vivo.auth()), StandardCharsets.UTF_8);
        assertTrue(texto.contains("Teste: o aviso com o app fechado está funcionando.") && texto.contains("\"titulo\""), texto);
        assertFalse(new String(para.corpo(), StandardCharsets.ISO_8859_1).contains("Teste"), "o corpo que vai pela rede é só bytes cifrados");
        como(get("/api/push/inscricoes"), OFFBOX, colaborador, null).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].aparelho").value("Vivo"));
        mvc.perform(post("/api/push/teste").with(host(OFFBOX))).andExpect(status().isUnauthorized());
    }

    @Test
    void avisoDoPainelVaiSoParaQuemVeOAvisoEUmaVezSoENuncaOVelho() throws Exception {
        Aparelho doDono = Aparelho.novo();
        Aparelho doColab = Aparelho.novo();
        Aparelho deOutraLoja = Aparelho.novo();
        inscrever(dono, doDono, null).andExpect(status().isCreated());
        inscrever(colaborador, doColab, null).andExpect(status().isCreated());
        como(post("/api/push/inscricoes"), DALFORNO, alan, deOutraLoja.corpo(null)).andExpect(status().isCreated());
        // aviso do colaborador, aviso de outro profissional (não existe aqui: usa o dono como "outro") e um aviso velho
        aviso(colaboradorId, "Maria pediu um horário", "10 seconds");
        aviso(donoId, "João pediu um horário", "10 seconds");
        aviso(colaboradorId, "Aviso de ontem", "2 hours");
        assertEquals(3, avisos.executar(), "dono recebe 2, o profissional 1");
        List<String> paraDono = ENVIOS.stream().filter(e -> e.endpoint().equals(doDono.endpoint())).map(e -> new String(abrir(e.corpo(), doDono.par(), doDono.auth()), StandardCharsets.UTF_8)).toList();
        List<String> paraColab = ENVIOS.stream().filter(e -> e.endpoint().equals(doColab.endpoint())).map(e -> new String(abrir(e.corpo(), doColab.par(), doColab.auth()), StandardCharsets.UTF_8)).toList();
        assertEquals(2, paraDono.size(), "o dono recebe todos os avisos novos");
        assertTrue(paraDono.stream().anyMatch(t -> t.contains("Maria pediu um horário")) && paraDono.stream().anyMatch(t -> t.contains("João pediu um horário")));
        assertEquals(1, paraColab.size(), "o profissional recebe só o dele");
        assertTrue(paraColab.get(0).contains("Maria pediu um horário"));
        assertTrue(ENVIOS.stream().noneMatch(e -> e.endpoint().equals(deOutraLoja.endpoint())), "aviso de uma loja nunca vai para aparelho de outra");
        assertTrue(ENVIOS.stream().noneMatch(e -> new String(e.corpo(), StandardCharsets.ISO_8859_1).contains("ontem")));
        int antes = ENVIOS.size();
        assertEquals(0, avisos.executar(), "segunda rodada não repete");
        assertEquals(antes, ENVIOS.size());
    }

    @Test
    void semInscricaoNaLojaNadaEEnviadoEOAvisoContinuaDisponivelNoPainel() throws Exception {
        aviso(colaboradorId, "Sem ninguém inscrito", "5 seconds");
        assertEquals(0, avisos.executar());
        assertTrue(ENVIOS.isEmpty());
        como(get("/api/avisos"), OFFBOX, dono, null).andExpect(status().isOk()).andExpect(jsonPath("$[0].texto").value("Sem ninguém inscrito"));
    }

    @Test
    void servicoDePushDizendoQueOAparelhoNaoExisteApagaAInscricaoEFalhaPassageiraSoConta() throws Exception {
        Aparelho morto = Aparelho.novo();
        Aparelho instavel = Aparelho.novo();
        inscrever(dono, morto, null).andExpect(status().isCreated());
        inscrever(dono, instavel, null).andExpect(status().isCreated());
        RESPOSTAS.put(morto.endpoint(), Enviador.Resultado.INSCRICAO_MORTA);
        RESPOSTAS.put(instavel.endpoint(), Enviador.Resultado.FALHOU);
        aviso(donoId, "Teste de morte", "3 seconds");
        avisos.executar();
        assertEquals(0, contar("select count(*) from push_inscricao where endpoint = ?", morto.endpoint()));
        assertEquals(1, contar("select count(*) from push_inscricao where endpoint = ? and falhas = 1", instavel.endpoint()));
    }

    @Test
    void pessoaDesativadaNaoRecebeEPessoaApagadaLevaAsInscricoes() throws Exception {
        Aparelho a = Aparelho.novo();
        inscrever(colaborador, a, null).andExpect(status().isCreated());
        jdbc.update("update usuario set ativo = false where id = ?", colaboradorId);
        try {
            aviso(colaboradorId, "Para quem saiu", "3 seconds");
            avisos.executar();
            assertTrue(ENVIOS.isEmpty(), "pessoa desativada não recebe");
        } finally {
            jdbc.update("update usuario set ativo = true where id = ?", colaboradorId);
        }
        // isolamento por RLS: a inscrição não aparece para outra loja
        como(get("/api/push/inscricoes"), DALFORNO, alan, null).andExpect(jsonPath("$", hasSize(0)));
    }
}
