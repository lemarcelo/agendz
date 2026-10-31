package br.com.agendz.push;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Web Push em Java puro (sem biblioteca): criptografia da mensagem (RFC 8291, aes128gcm) e assinatura do servidor (VAPID, RFC 8292, ES256).
 * A mensagem só abre no aparelho de quem se inscreveu; o serviço de push (Google, Mozilla, Apple) só repassa bytes.
 */
public final class WebPush {

    public static final int TAMANHO_REGISTRO = 4096;
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final SecureRandom ALEATORIO = new SecureRandom();
    private static final ECParameterSpec P256 = curva();

    private WebPush() {
    }

    private static ECParameterSpec curva() {
        try {
            AlgorithmParameters p = AlgorithmParameters.getInstance("EC");
            p.init(new ECGenParameterSpec("secp256r1"));
            return p.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("curva P-256 indisponível", e);
        }
    }

    public static String base64url(byte[] b) {
        return B64.encodeToString(b);
    }

    /** Aceita base64url com ou sem preenchimento; qualquer outra coisa lança IllegalArgumentException. */
    public static byte[] debase64url(String s) {
        if (s == null || !s.matches("[A-Za-z0-9_-]+={0,2}")) throw new IllegalArgumentException("base64url inválido");
        return Base64.getUrlDecoder().decode(s);
    }

    // ---------------------------------------------------------------- chaves

    /** Ponto não comprimido (65 bytes: 0x04, X, Y) de uma chave pública P-256. */
    public static byte[] ponto(ECPublicKey k) {
        byte[] r = new byte[65];
        r[0] = 4;
        copiar32(k.getW().getAffineX(), r, 1);
        copiar32(k.getW().getAffineY(), r, 33);
        return r;
    }

    private static void copiar32(BigInteger v, byte[] destino, int posicao) {
        byte[] b = v.toByteArray();
        int inicio = b.length > 32 ? b.length - 32 : 0; // tira o zero de sinal
        int tam = b.length - inicio;
        System.arraycopy(b, inicio, destino, posicao + 32 - tam, tam);
    }

    /** Chave pública a partir dos 65 bytes; recusa o que não está na curva (ataque de ponto inválido). */
    public static ECPublicKey publica(byte[] ponto65) {
        if (ponto65 == null || ponto65.length != 65 || ponto65[0] != 4) throw new IllegalArgumentException("chave pública inválida");
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(ponto65, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(ponto65, 33, 65));
        BigInteger p = ((java.security.spec.ECFieldFp) P256.getCurve().getField()).getP();
        if (x.compareTo(p) >= 0 || y.compareTo(p) >= 0) throw new IllegalArgumentException("chave pública inválida");
        BigInteger lado = y.multiply(y).subtract(x.multiply(x).multiply(x)).subtract(P256.getCurve().getA().multiply(x)).subtract(P256.getCurve().getB()).mod(p);
        if (lado.signum() != 0) throw new IllegalArgumentException("chave pública inválida");
        try {
            return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("chave pública inválida", e);
        }
    }

    /** Chave privada a partir do escalar de 32 bytes. */
    public static ECPrivateKey privada(byte[] escalar32) {
        if (escalar32 == null || escalar32.length != 32) throw new IllegalArgumentException("chave privada inválida");
        BigInteger d = new BigInteger(1, escalar32);
        if (d.signum() == 0 || d.compareTo(P256.getOrder()) >= 0) throw new IllegalArgumentException("chave privada inválida");
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(d, P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("chave privada inválida", e);
        }
    }

    public static KeyPair novoPar() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"), ALEATORIO);
            return g.generateKeyPair();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static byte[] escalar(ECPrivateKey k) {
        byte[] r = new byte[32];
        copiar32(k.getS(), r, 0);
        return r;
    }

    // ---------------------------------------------------------------- criptografia (RFC 8291)

    private static byte[] hmac(byte[] chave, byte[]... partes) {
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(chave, "HmacSHA256"));
            for (byte[] p : partes) m.update(p);
            return m.doFinal();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] expandir(byte[] prk, byte[] info, int tamanho) { // HKDF-Expand de um bloco só (tamanho <= 32)
        return Arrays.copyOf(hmac(prk, info, new byte[] {1}), tamanho);
    }

    private static byte[] juntar(byte[]... partes) {
        int total = 0;
        for (byte[] p : partes) total += p.length;
        byte[] r = new byte[total];
        int pos = 0;
        for (byte[] p : partes) {
            System.arraycopy(p, 0, r, pos, p.length);
            pos += p.length;
        }
        return r;
    }

    /** Corpo pronto para o POST ao serviço de push (Content-Encoding: aes128gcm). Par efêmero e sal novos a cada mensagem. */
    public static byte[] criptografar(byte[] mensagem, byte[] publicaDoAparelho65, byte[] auth16) {
        byte[] sal = new byte[16];
        ALEATORIO.nextBytes(sal);
        return criptografar(mensagem, publicaDoAparelho65, auth16, novoPar(), sal);
    }

    /** Versão com par efêmero e sal dados (testes). */
    public static byte[] criptografar(byte[] mensagem, byte[] publicaDoAparelho65, byte[] auth16, KeyPair servidor, byte[] sal) {
        if (auth16 == null || auth16.length != 16) throw new IllegalArgumentException("segredo de autenticação inválido");
        if (mensagem.length > 2000) throw new IllegalArgumentException("mensagem grande demais"); // 1 registro só; o serviço de push garante 4096 bytes no corpo todo
        try {
            ECPublicKey aparelho = publica(publicaDoAparelho65);
            byte[] publicaServidor = ponto((ECPublicKey) servidor.getPublic());
            KeyAgreement ka = KeyAgreement.getInstance("ECDH");
            ka.init(servidor.getPrivate());
            ka.doPhase(aparelho, true);
            byte[] segredo = ka.generateSecret();
            byte[] prkChave = hmac(auth16, segredo);
            byte[] ikm = expandir(prkChave, juntar("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), publicaDoAparelho65, publicaServidor), 32);
            byte[] prk = hmac(sal, ikm);
            byte[] cek = expandir(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
            byte[] nonce = expandir(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
            byte[] cifrado = c.doFinal(juntar(mensagem, new byte[] {2})); // 0x02 = último registro
            ByteBuffer cab = ByteBuffer.allocate(21 + publicaServidor.length);
            cab.put(sal).putInt(TAMANHO_REGISTRO).put((byte) publicaServidor.length).put(publicaServidor);
            return juntar(cab.array(), cifrado);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("falha ao criptografar a mensagem", e);
        }
    }

    // ---------------------------------------------------------------- VAPID (RFC 8292)

    /** JWT ES256 que diz ao serviço de push quem está enviando (`aud` = origem do endpoint, até 24 h de validade). */
    public static String jwtVapid(String audiencia, long expiraEmSegundos, String contato, ECPrivateKey chave) {
        try {
            String cabecalho = B64.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
            String corpo = B64.encodeToString(("{\"aud\":\"" + audiencia + "\",\"exp\":" + expiraEmSegundos + ",\"sub\":\"" + contato + "\"}").getBytes(StandardCharsets.UTF_8));
            Signature s = Signature.getInstance("SHA256withECDSAinP1363Format");
            s.initSign(chave);
            s.update((cabecalho + "." + corpo).getBytes(StandardCharsets.US_ASCII));
            return cabecalho + "." + corpo + "." + B64.encodeToString(s.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("falha ao assinar o VAPID", e);
        }
    }
}
