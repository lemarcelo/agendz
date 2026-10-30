package br.com.agendz.auth.passkey;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Desafios de passkey: 32 bytes aleatórios, vinculados à loja (e, no cadastro, à pessoa), de USO ÚNICO (consumir remove) e com validade de 2 minutos.
 * Em memória (uma API). Teto de desafios abertos por loja: o endereço de entrada é público e não pode virar jeito de encher a memória.
 */
@Component
public class DesafiosPasskey {

    static final long VALIDADE_MS = 2 * 60 * 1000L;
    static final int MAX_POR_LOJA = 500;
    private static final SecureRandom ALEATORIO = new SecureRandom();

    public record Emitido(String id, byte[] desafio) {
    }

    private record Guardado(byte[] desafio, UUID lojaId, UUID usuarioId, String tipo, long expiraEm) {
    }

    private final Map<String, Guardado> abertos = new ConcurrentHashMap<>();
    private final Clock relogio;

    public DesafiosPasskey(Clock relogio) {
        this.relogio = relogio;
    }

    /** `usuarioId` nulo na entrada (a pessoa só é conhecida pela credencial). Devolve nulo quando a loja já tem desafios demais abertos. */
    public Emitido emitir(String tipo, UUID lojaId, UUID usuarioId) {
        long agora = relogio.millis();
        abertos.values().removeIf(g -> g.expiraEm() < agora);
        long daLoja = abertos.values().stream().filter(g -> g.lojaId().equals(lojaId)).count();
        if (daLoja >= MAX_POR_LOJA) return null;
        byte[] d = new byte[32];
        ALEATORIO.nextBytes(d);
        byte[] idBytes = new byte[18];
        ALEATORIO.nextBytes(idBytes);
        String id = Webauthn.b64(idBytes);
        abertos.put(id, new Guardado(d, lojaId, usuarioId, tipo, agora + VALIDADE_MS));
        return new Emitido(id, d);
    }

    /** Usa o desafio uma vez só: some mesmo quando a conferência seguinte falha. Devolve nulo se não existe, venceu, ou é de outra loja, pessoa ou tipo. */
    public byte[] consumir(String id, String tipo, UUID lojaId, UUID usuarioId) {
        if (id == null) return null;
        Guardado g = abertos.remove(id);
        if (g == null || g.expiraEm() < relogio.millis()) return null;
        if (!g.tipo().equals(tipo) || !g.lojaId().equals(lojaId)) return null;
        if (usuarioId != null && !usuarioId.equals(g.usuarioId())) return null;
        return g.desafio();
    }
}
