package br.com.agendz.cifra;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * Cifra por campo dos dados pessoais (CPF, telefone, nascimento): AES-256-GCM com IV aleatório de 96 bits por valor, no formato
 * {@code v1:<iv>:<texto cifrado>:<tag>} (o prefixo permite trocar a chave depois). Campo cifrado não se consulta por igualdade; para achar e
 * impedir duplicidade guarda-se {@link #hash} (HMAC-SHA256 com pepper, amarrado à loja, então o mesmo CPF em duas lojas não casa).
 * A chave de cifra e o pepper são derivados de segredos DIFERENTES do ambiente; nunca vão para o banco, o log ou o repositório.
 * Perder a CIFRA_CHAVE = perder os dados cifrados: guarde uma cópia fora da VPS e fora do backup do banco.
 */
@Component
public class Cifra {

    private static final int MIN_SEGREDO = 32;
    private static final int TAG_BITS = 128;
    private static final int TAG_BYTES = TAG_BITS / 8;
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder D64 = Base64.getUrlDecoder();

    private final SecretKeySpec chaveAes;
    private final SecretKeySpec chaveHmac;
    private final SecureRandom aleatorio = new SecureRandom();

    public Cifra(CifraProperties p) {
        String chave = p.chave() == null ? "" : p.chave();
        String pepper = p.pepper() == null ? "" : p.pepper();
        if (chave.length() < MIN_SEGREDO || pepper.length() < MIN_SEGREDO) {
            throw new IllegalStateException("CIFRA_CHAVE e CIFRA_PEPPER ausentes ou curtos: use valores aleatórios de pelo menos 32 caracteres cada.");
        }
        if (chave.equals(pepper)) throw new IllegalStateException("CIFRA_CHAVE e CIFRA_PEPPER precisam ser diferentes.");
        this.chaveAes = new SecretKeySpec(derivar("agendz/cifra/v1|" + chave), "AES");
        this.chaveHmac = new SecretKeySpec(derivar("agendz/hash/v1|" + pepper), "HmacSHA256");
    }

    private static byte[] derivar(String texto) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(texto.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public String cifrar(String claro) {
        if (claro == null) return null;
        try {
            byte[] iv = new byte[12];
            aleatorio.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, chaveAes, new GCMParameterSpec(TAG_BITS, iv));
            byte[] saida = c.doFinal(claro.getBytes(StandardCharsets.UTF_8));
            byte[] texto = Arrays.copyOfRange(saida, 0, saida.length - TAG_BYTES);
            byte[] tag = Arrays.copyOfRange(saida, saida.length - TAG_BYTES, saida.length);
            return "v1:" + B64.encodeToString(iv) + ":" + B64.encodeToString(texto) + ":" + B64.encodeToString(tag);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Falha ao cifrar", e);
        }
    }

    public String decifrar(String cifrado) {
        if (cifrado == null) return null;
        try {
            String[] p = cifrado.split(":");
            if (p.length != 4 || !"v1".equals(p[0])) throw new IllegalStateException("Formato de campo cifrado desconhecido");
            byte[] texto = D64.decode(p[2]);
            byte[] tag = D64.decode(p[3]);
            byte[] entrada = new byte[texto.length + tag.length];
            System.arraycopy(texto, 0, entrada, 0, texto.length);
            System.arraycopy(tag, 0, entrada, texto.length, tag.length);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, chaveAes, new GCMParameterSpec(TAG_BITS, D64.decode(p[1])));
            return new String(c.doFinal(entrada), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("Falha ao decifrar (chave errada ou dado alterado)", e);
        }
    }

    /** Hash para busca e unicidade. {@code dominio} separa os usos ("tel", "cpf"); {@code normalizado} é o valor já padronizado (só dígitos). */
    public String hash(UUID loja, String dominio, String normalizado) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(chaveHmac);
            return HexFormat.of().formatHex(mac.doFinal((loja + "|" + dominio + "|" + normalizado).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Falha ao calcular o hash", e);
        }
    }
}
