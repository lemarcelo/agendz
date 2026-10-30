package br.com.agendz.auth.passkey;

import java.math.BigInteger;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Conferência de passkey (WebAuthn nível 2) só com o JDK, sem biblioteca: cadastro com atestado "none" e entrada por assinatura.
 * Aceita ES256 (alg -7, P-256) e RS256 (alg -257, RSA de 2048 bits ou mais). Exige presença do usuário (UP) e verificação do usuário (UV: digital,
 * rosto ou PIN do aparelho). Quem chama entrega o desafio guardado no servidor (uso único), o rpId (o Host da loja) e a regra da origem.
 * Qualquer divergência lança {@link Recusa}; o motivo é só para o log, a resposta ao cliente é sempre a mesma.
 */
public final class Webauthn {

    private Webauthn() {
    }

    public static final int ES256 = -7;
    public static final int RS256 = -257;

    /** Recusa da conferência (o texto vai para o log, nunca para a tela). */
    public static final class Recusa extends RuntimeException {
        public Recusa(String motivo) {
            super(motivo);
        }
    }

    /** Campos do clientDataJSON que a conferência usa (o JSON em si é lido por quem chama). */
    public record ClientData(String tipo, String desafio, String origem, boolean outraOrigem) {
    }

    /** O que sobra de um cadastro válido: a credencial, a chave pública (COSE, como veio) e o contador inicial. */
    public record Cadastro(byte[] credencialId, byte[] chavePublicaCose, int alg, long contador) {
    }

    public static String b64(byte[] b) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public static byte[] deB64(String s) {
        try {
            return Base64.getUrlDecoder().decode(s);
        } catch (IllegalArgumentException e) {
            throw new Recusa("base64 inválido");
        }
    }

    private static byte[] sha256(byte[] b) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(b);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void conferirCliente(ClientData cd, String tipoEsperado, byte[] desafio, Predicate<String> origemOk) {
        if (cd == null || !tipoEsperado.equals(cd.tipo())) throw new Recusa("tipo do clientData");
        if (cd.outraOrigem()) throw new Recusa("crossOrigin");
        if (cd.desafio() == null || !MessageDigest.isEqual(deB64(cd.desafio()), desafio)) throw new Recusa("desafio diferente");
        if (cd.origem() == null || !origemOk.test(cd.origem())) throw new Recusa("origem " + cd.origem());
    }

    private static void conferirAutenticador(byte[] auth, String rpId) {
        if (auth.length < 37) throw new Recusa("authData curto");
        byte[] hash = Arrays.copyOfRange(auth, 0, 32);
        if (!MessageDigest.isEqual(hash, sha256(rpId.getBytes(java.nio.charset.StandardCharsets.UTF_8)))) throw new Recusa("rpIdHash");
        int flags = auth[32] & 0xff;
        if ((flags & 0x01) == 0) throw new Recusa("sem presença do usuário");
        if ((flags & 0x04) == 0) throw new Recusa("sem verificação do usuário");
    }

    private static long contador(byte[] auth) {
        return ((auth[33] & 0xffL) << 24) | ((auth[34] & 0xffL) << 16) | ((auth[35] & 0xffL) << 8) | (auth[36] & 0xffL);
    }

    /** Cadastro (navigator.credentials.create) com atestado "none". */
    public static Cadastro cadastro(String rpId, byte[] desafio, ClientData cd, byte[] atestado, Predicate<String> origemOk) {
        conferirCliente(cd, "webauthn.create", desafio, origemOk);
        Cbor.Lido lido;
        try {
            lido = Cbor.ler(atestado, 0);
        } catch (IllegalArgumentException e) {
            throw new Recusa("atestado: " + e.getMessage());
        }
        if (!(lido.valor() instanceof Map<?, ?> mapa) || lido.fim() != atestado.length) throw new Recusa("atestado fora do formato");
        if (!"none".equals(mapa.get("fmt"))) throw new Recusa("formato de atestado não aceito: " + mapa.get("fmt"));
        if (!(mapa.get("authData") instanceof byte[] auth)) throw new Recusa("sem authData");
        conferirAutenticador(auth, rpId);
        if ((auth[32] & 0x40) == 0 || auth.length < 55) throw new Recusa("sem dados da credencial");
        int tam = ((auth[53] & 0xff) << 8) | (auth[54] & 0xff);
        if (tam < 16 || tam > 1023 || 55 + tam > auth.length) throw new Recusa("tamanho da credencial");
        byte[] credencial = Arrays.copyOfRange(auth, 55, 55 + tam);
        Cbor.Lido chave;
        try {
            chave = Cbor.ler(auth, 55 + tam);
        } catch (IllegalArgumentException e) {
            throw new Recusa("chave: " + e.getMessage());
        }
        if (!(chave.valor() instanceof Map<?, ?> cose)) throw new Recusa("chave fora do formato");
        int alg = cose.get(3L) instanceof Long a ? a.intValue() : 0;
        chaveDe(cose, alg); // confere que a chave é de um tipo aceito e bem formada
        return new Cadastro(credencial, Arrays.copyOfRange(auth, 55 + tam, chave.fim()), alg, contador(auth));
    }

    /**
     * Entrada (navigator.credentials.get): confere a assinatura e devolve o novo contador. Contador que não cresce (quando algum dos dois é maior que zero)
     * indica credencial clonada e é recusado.
     */
    public static long entrada(String rpId, byte[] desafio, ClientData cd, byte[] clientDataBruto, byte[] auth, byte[] assinatura,
                               byte[] chavePublicaCose, int alg, long contadorGuardado, Predicate<String> origemOk) {
        conferirCliente(cd, "webauthn.get", desafio, origemOk);
        conferirAutenticador(auth, rpId);
        long novo = contador(auth);
        if ((contadorGuardado > 0 || novo > 0) && novo <= contadorGuardado) throw new Recusa("contador não cresceu");
        Cbor.Lido chave;
        try {
            chave = Cbor.ler(chavePublicaCose, 0);
        } catch (IllegalArgumentException e) {
            throw new Recusa("chave guardada: " + e.getMessage());
        }
        if (!(chave.valor() instanceof Map<?, ?> cose)) throw new Recusa("chave guardada fora do formato");
        PublicKey pk = chaveDe(cose, alg);
        byte[] dados = new byte[auth.length + 32];
        System.arraycopy(auth, 0, dados, 0, auth.length);
        System.arraycopy(sha256(clientDataBruto), 0, dados, auth.length, 32);
        try {
            Signature s = Signature.getInstance(alg == ES256 ? "SHA256withECDSA" : "SHA256withRSA");
            s.initVerify(pk);
            s.update(dados);
            if (!s.verify(assinatura)) throw new Recusa("assinatura inválida");
        } catch (java.security.GeneralSecurityException e) {
            throw new Recusa("assinatura ilegível");
        }
        return novo;
    }

    private static byte[] bytes(Map<?, ?> cose, long k) {
        if (!(cose.get(k) instanceof byte[] b)) throw new Recusa("chave sem o campo " + k);
        return b;
    }

    private static PublicKey chaveDe(Map<?, ?> cose, int alg) {
        try {
            Object kty = cose.get(1L);
            if (alg == ES256) {
                if (!Long.valueOf(2).equals(kty) || !Long.valueOf(1).equals(cose.get(-1L))) throw new Recusa("chave EC fora do P-256");
                byte[] x = bytes(cose, -2), y = bytes(cose, -3);
                if (x.length != 32 || y.length != 32) throw new Recusa("coordenadas EC");
                AlgorithmParameters ap = AlgorithmParameters.getInstance("EC");
                ap.init(new ECGenParameterSpec("secp256r1"));
                ECParameterSpec curva = ap.getParameterSpec(ECParameterSpec.class);
                return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(new BigInteger(1, x), new BigInteger(1, y)), curva));
            }
            if (alg == RS256) {
                if (!Long.valueOf(3).equals(kty)) throw new Recusa("chave RSA");
                BigInteger n = new BigInteger(1, bytes(cose, -1)), e = new BigInteger(1, bytes(cose, -2));
                if (n.bitLength() < 2048 || n.bitLength() > 4096 || e.bitLength() > 32 || !e.testBit(0)) throw new Recusa("parâmetros RSA");
                return KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(n, e));
            }
        } catch (java.security.GeneralSecurityException e) {
            throw new Recusa("chave inválida");
        }
        throw new Recusa("algoritmo não aceito: " + alg);
    }
}
