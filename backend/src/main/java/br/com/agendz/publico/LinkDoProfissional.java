package br.com.agendz.publico;

import br.com.agendz.cifra.Cifra;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * B3: token assinado do link com profissional ({@code #agendar-<token>}). Formato: 32 hex do id + 8 hex do vencimento (segundos) + 22 caracteres
 * do HMAC (Cifra.hash amarrado à loja, domínio "link-prof"). Sem dado pessoal. Token de outra loja, adulterado, vencido ou mal formado
 * vale como "não é token": {@link #validar} devolve vazio e quem chama NÃO diz o motivo.
 */
@Component
public class LinkDoProfissional {

    public static final Duration VALIDADE = Duration.ofDays(180);
    private static final Pattern FORMATO = Pattern.compile("^[0-9a-f]{40}[A-Za-z0-9_-]{22}$");
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private final Cifra cifra;
    private final Clock relogio;

    public LinkDoProfissional(Cifra cifra, Clock relogio) {
        this.cifra = cifra;
        this.relogio = relogio;
    }

    public String emitir(UUID loja, UUID profissionalId) {
        return montar(loja, profissionalId, Instant.now(relogio).plus(VALIDADE).getEpochSecond());
    }

    String montar(UUID loja, UUID profissionalId, long venceEmSegundos) {
        String corpo = profissionalId.toString().replace("-", "") + String.format("%08x", venceEmSegundos);
        return corpo + assinatura(loja, corpo);
    }

    /** O profissional do token, se ele for desta loja, íntegro e dentro da validade; senão vazio (sem motivo). */
    public Optional<UUID> validar(UUID loja, String token) {
        if (token == null || !FORMATO.matcher(token).matches()) return Optional.empty();
        String corpo = token.substring(0, 40);
        byte[] esperado = assinatura(loja, corpo).getBytes(StandardCharsets.UTF_8);
        byte[] recebido = token.substring(40).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(esperado, recebido)) return Optional.empty(); // comparação em tempo constante
        long vence = Long.parseLong(corpo.substring(32), 16);
        if (vence < Instant.now(relogio).getEpochSecond()) return Optional.empty();
        String h = corpo.substring(0, 32);
        return Optional.of(UUID.fromString(h.substring(0, 8) + "-" + h.substring(8, 12) + "-" + h.substring(12, 16) + "-" + h.substring(16, 20) + "-" + h.substring(20)));
    }

    private String assinatura(UUID loja, String corpo) {
        byte[] mac = java.util.HexFormat.of().parseHex(cifra.hash(loja, "link-prof", corpo));
        return B64.encodeToString(mac).substring(0, 22);
    }
}
