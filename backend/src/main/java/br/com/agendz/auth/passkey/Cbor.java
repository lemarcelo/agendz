package br.com.agendz.auth.passkey;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Leitor mínimo de CBOR (RFC 8949), só o que o WebAuthn usa: inteiros, bytes, texto, listas e mapas, com tamanho definido.
 * Entrada nunca é confiável: profundidade, tamanho e quantidade de itens têm teto; qualquer outra coisa lança {@link IllegalArgumentException}.
 * Inteiros viram {@link Long}, bytes viram {@code byte[]}, texto vira {@link String}, listas viram {@link List} e mapas viram {@link Map}.
 */
final class Cbor {

    private static final int MAX_PROFUNDIDADE = 4;
    private static final int MAX_ITENS = 64;

    private final byte[] dados;
    private int pos;

    private Cbor(byte[] dados, int inicio) {
        this.dados = dados;
        this.pos = inicio;
    }

    /** Resultado da leitura: o valor e a posição logo depois dele (a chave pública vem seguida de extensões opcionais). */
    record Lido(Object valor, int fim) {
    }

    static Lido ler(byte[] dados, int inicio) {
        Cbor c = new Cbor(dados, inicio);
        Object v = c.item(0);
        return new Lido(v, c.pos);
    }

    private int byteAtual() {
        if (pos >= dados.length) throw new IllegalArgumentException("CBOR truncado");
        return dados[pos++] & 0xff;
    }

    private long argumento(int info) {
        if (info < 24) return info;
        int n = switch (info) {
            case 24 -> 1;
            case 25 -> 2;
            case 26 -> 4;
            case 27 -> 8;
            default -> throw new IllegalArgumentException("CBOR com tamanho indefinido não é aceito");
        };
        long v = 0;
        for (int i = 0; i < n; i++) v = (v << 8) | byteAtual();
        if (v < 0) throw new IllegalArgumentException("CBOR grande demais");
        return v;
    }

    private int tamanho(long v) {
        if (v < 0 || v > dados.length) throw new IllegalArgumentException("CBOR com tamanho impossível");
        return (int) v;
    }

    private Object item(int profundidade) {
        if (profundidade > MAX_PROFUNDIDADE) throw new IllegalArgumentException("CBOR profundo demais");
        int ib = byteAtual();
        int tipo = ib >> 5;
        long arg = argumento(ib & 0x1f);
        switch (tipo) {
            case 0:
                return arg;
            case 1:
                return -1 - arg;
            case 2: {
                int n = tamanho(arg);
                if (pos + n > dados.length) throw new IllegalArgumentException("CBOR truncado");
                byte[] b = new byte[n];
                System.arraycopy(dados, pos, b, 0, n);
                pos += n;
                return b;
            }
            case 3: {
                int n = tamanho(arg);
                if (pos + n > dados.length) throw new IllegalArgumentException("CBOR truncado");
                String s = new String(dados, pos, n, StandardCharsets.UTF_8);
                pos += n;
                return s;
            }
            case 4: {
                int n = tamanho(arg);
                if (n > MAX_ITENS) throw new IllegalArgumentException("CBOR com itens demais");
                List<Object> l = new ArrayList<>();
                for (int i = 0; i < n; i++) l.add(item(profundidade + 1));
                return l;
            }
            case 5: {
                int n = tamanho(arg);
                if (n > MAX_ITENS) throw new IllegalArgumentException("CBOR com itens demais");
                Map<Object, Object> m = new LinkedHashMap<>();
                for (int i = 0; i < n; i++) {
                    Object k = item(profundidade + 1);
                    if (!(k instanceof Long) && !(k instanceof String)) throw new IllegalArgumentException("chave de mapa CBOR inválida");
                    m.put(k, item(profundidade + 1));
                }
                return m;
            }
            default:
                throw new IllegalArgumentException("tipo CBOR não aceito");
        }
    }
}
