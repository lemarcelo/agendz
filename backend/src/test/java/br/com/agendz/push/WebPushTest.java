package br.com.agendz.push;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.util.Base64;
import org.junit.jupiter.api.Test;

/** Criptografia do Web Push (RFC 8291) e VAPID (RFC 8292): vetor de teste oficial do RFC, ida e volta e entradas ruins. Não precisa de banco. */
class WebPushTest {

    static final String AS_PRIVADA = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    static final String AS_PUBLICA = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    static final String UA_PUBLICA = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    static final String AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
    static final String SAL = "DGv6ra1nlYgDCS1FRnbzlw";
    static final String ESPERADO = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

    @Test
    void vetorDeTesteDoRfc8291BateByteAByte() {
        KeyPair servidor = new KeyPair(WebPush.publica(WebPush.debase64url(AS_PUBLICA)), WebPush.privada(WebPush.debase64url(AS_PRIVADA)));
        byte[] corpo = WebPush.criptografar("When I grow up, I want to be a watermelon".getBytes(StandardCharsets.UTF_8), WebPush.debase64url(UA_PUBLICA), WebPush.debase64url(AUTH), servidor,
                WebPush.debase64url(SAL));
        assertEquals(ESPERADO, WebPush.base64url(corpo));
    }

    @Test
    void idaEVoltaComParNovoACadaMensagem() {
        KeyPair aparelho = WebPush.novoPar();
        byte[] auth = new byte[16];
        new java.security.SecureRandom().nextBytes(auth);
        byte[] ponto = WebPush.ponto((ECPublicKey) aparelho.getPublic());
        byte[] a = WebPush.criptografar("Olá, avisos".getBytes(StandardCharsets.UTF_8), ponto, auth);
        byte[] b = WebPush.criptografar("Olá, avisos".getBytes(StandardCharsets.UTF_8), ponto, auth);
        assertFalse(java.util.Arrays.equals(a, b), "sal e par efêmero novos a cada mensagem");
        assertEquals("Olá, avisos", new String(PushTest.abrir(a, aparelho, auth), StandardCharsets.UTF_8));
    }

    @Test
    void recusaChavePublicaForaDaCurvaEEntradasRuins() {
        byte[] ruim = WebPush.debase64url(UA_PUBLICA);
        ruim[64] ^= 1; // um bit a mais no Y: o ponto sai da curva
        assertThrows(IllegalArgumentException.class, () -> WebPush.publica(ruim));
        assertThrows(IllegalArgumentException.class, () -> WebPush.publica(new byte[65]));
        assertThrows(IllegalArgumentException.class, () -> WebPush.publica(new byte[10]));
        assertThrows(IllegalArgumentException.class, () -> WebPush.privada(new byte[32]));
        assertThrows(IllegalArgumentException.class, () -> WebPush.debase64url("não é base64"));
        assertThrows(IllegalArgumentException.class, () -> WebPush.criptografar(new byte[1], WebPush.debase64url(UA_PUBLICA), new byte[5]));
        assertThrows(IllegalArgumentException.class, () -> WebPush.criptografar(new byte[2001], WebPush.debase64url(UA_PUBLICA), WebPush.debase64url(AUTH)));
        assertEquals(87, WebPush.base64url(WebPush.debase64url(UA_PUBLICA)).length());
    }

    @Test
    void jwtVapidTemTresPartesEAssinaturaConfereComAChavePublica() throws Exception {
        KeyPair par = WebPush.novoPar();
        String jwt = WebPush.jwtVapid("https://fcm.googleapis.com", 2000000000L, "mailto:suporte@agendz.io", (ECPrivateKey) par.getPrivate());
        String[] p = jwt.split("\\.");
        assertEquals(3, p.length);
        assertEquals("{\"typ\":\"JWT\",\"alg\":\"ES256\"}", new String(Base64.getUrlDecoder().decode(p[0]), StandardCharsets.UTF_8));
        String corpo = new String(Base64.getUrlDecoder().decode(p[1]), StandardCharsets.UTF_8);
        assertTrue(corpo.contains("\"aud\":\"https://fcm.googleapis.com\"") && corpo.contains("\"exp\":2000000000") && corpo.contains("\"sub\":\"mailto:suporte@agendz.io\""), corpo);
        Signature v = Signature.getInstance("SHA256withECDSAinP1363Format");
        v.initVerify(par.getPublic());
        v.update((p[0] + "." + p[1]).getBytes(StandardCharsets.US_ASCII));
        assertTrue(v.verify(Base64.getUrlDecoder().decode(p[2])));
        assertEquals(64, Base64.getUrlDecoder().decode(p[2]).length);
    }

    @Test
    void destinosSoAceitamServicosDePushConhecidosEmHttps() {
        assertTrue(Destinos.permitido("https://fcm.googleapis.com/fcm/send/abc123-def456"));
        assertTrue(Destinos.permitido("https://updates.push.services.mozilla.com/wpush/v2/abcdefghijk"));
        assertTrue(Destinos.permitido("https://web.push.apple.com/QGh2abcdefghijklmnop"));
        assertTrue(Destinos.permitido("https://wns2-par02p.notify.windows.com/w/?token=abcdefghijk"));
        for (String ruim : new String[] {"http://fcm.googleapis.com/fcm/send/abcdefghijk", "https://localhost/fcm/send/abcdefghijk", "https://127.0.0.1/abcdefghijklmnopqrst",
                "https://fcm.googleapis.com.evil.com/fcm/send/abcdefghijk", "https://evilfcm.googleapis.com.br/abcdefghijklmnop", "https://user:senha@fcm.googleapis.com/fcm/send/abcdef",
                "https://fcm.googleapis.com:8443/fcm/send/abcdefghijk", "https://fcm.googleapis.com/fcm/send/abc def", "https://169.254.169.254/latest/meta-data/aaaa", "ftp://fcm.googleapis.com/x/abcdefghijklmn",
                "", "https://notifyxwindows.com/abcdefghijklmnopq"}) {
            assertFalse(Destinos.permitido(ruim), ruim);
        }
        assertFalse(Destinos.permitido(null));
        assertFalse(Destinos.permitido("https://fcm.googleapis.com/" + "a".repeat(600)));
    }
}
