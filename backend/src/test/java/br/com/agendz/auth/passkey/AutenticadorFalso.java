package br.com.agendz.auth.passkey;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;

/** Faz o papel do aparelho do usuário nos testes: gera a chave, monta o atestado "none" e assina a entrada, como um navegador com digital faria. */
public final class AutenticadorFalso {

    public final KeyPair par;
    public final byte[] credencialId;
    private long contador;

    public AutenticadorFalso(byte[] credencialId) {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
            g.initialize(new ECGenParameterSpec("secp256r1"));
            this.par = g.generateKeyPair();
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
        this.credencialId = credencialId;
    }

    // ---- CBOR mínimo para escrever ----
    private static void cabeca(ByteArrayOutputStream o, int tipo, long n) {
        if (n < 24) o.write((tipo << 5) | (int) n);
        else if (n < 256) { o.write((tipo << 5) | 24); o.write((int) n); }
        else { o.write((tipo << 5) | 25); o.write((int) (n >> 8)); o.write((int) (n & 0xff)); }
    }

    static void inteiro(ByteArrayOutputStream o, long v) {
        if (v >= 0) cabeca(o, 0, v); else cabeca(o, 1, -1 - v);
    }

    static void bytes(ByteArrayOutputStream o, byte[] b) {
        cabeca(o, 2, b.length);
        o.writeBytes(b);
    }

    static void texto(ByteArrayOutputStream o, String s) {
        byte[] b = s.getBytes(StandardCharsets.UTF_8);
        cabeca(o, 3, b.length);
        o.writeBytes(b);
    }

    private static byte[] sem0(java.math.BigInteger v) {
        byte[] b = v.toByteArray();
        if (b.length == 33 && b[0] == 0) return java.util.Arrays.copyOfRange(b, 1, 33);
        if (b.length < 32) { byte[] r = new byte[32]; System.arraycopy(b, 0, r, 32 - b.length, b.length); return r; }
        return b;
    }

    public byte[] chaveCose() {
        ECPublicKey pub = (ECPublicKey) par.getPublic();
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        cabeca(o, 5, 5);
        inteiro(o, 1); inteiro(o, 2);
        inteiro(o, 3); inteiro(o, -7);
        inteiro(o, -1); inteiro(o, 1);
        inteiro(o, -2); bytes(o, sem0(pub.getW().getAffineX()));
        inteiro(o, -3); bytes(o, sem0(pub.getW().getAffineY()));
        return o.toByteArray();
    }

    public static byte[] sha256(byte[] b) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(b);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static byte[] clientData(String tipo, String desafioB64, String origem) {
        return ("{\"type\":\"" + tipo + "\",\"challenge\":\"" + desafioB64 + "\",\"origin\":\"" + origem + "\",\"crossOrigin\":false}").getBytes(StandardCharsets.UTF_8);
    }

    /** flags: 0x01 presença, 0x04 verificação do usuário, 0x40 credencial incluída. */
    public byte[] authData(String rpId, int flags, long contador, boolean comCredencial) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.writeBytes(sha256(rpId.getBytes(StandardCharsets.UTF_8)));
        o.write(flags);
        o.write((int) (contador >> 24)); o.write((int) (contador >> 16)); o.write((int) (contador >> 8)); o.write((int) contador);
        if (comCredencial) {
            o.writeBytes(new byte[16]);
            o.write(credencialId.length >> 8); o.write(credencialId.length & 0xff);
            o.writeBytes(credencialId);
            o.writeBytes(chaveCose());
        }
        return o.toByteArray();
    }

    public byte[] atestado(String rpId, int flags) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        cabeca(o, 5, 3);
        texto(o, "fmt"); texto(o, "none");
        texto(o, "attStmt"); cabeca(o, 5, 0);
        texto(o, "authData"); bytes(o, authData(rpId, flags, 0, true));
        return o.toByteArray();
    }

    public record Assinada(byte[] authData, byte[] clientData, byte[] assinatura) {
    }

    /** Entrada: a cada uso o contador sobe, como num autenticador de verdade. */
    public Assinada entrada(String rpId, String desafioB64, String origem, int flags) {
        contador++;
        byte[] auth = authData(rpId, flags, contador, false);
        byte[] cd = clientData("webauthn.get", desafioB64, origem);
        try {
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initSign(par.getPrivate());
            byte[] dados = new byte[auth.length + 32];
            System.arraycopy(auth, 0, dados, 0, auth.length);
            System.arraycopy(sha256(cd), 0, dados, auth.length, 32);
            s.update(dados);
            return new Assinada(auth, cd, s.sign());
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
