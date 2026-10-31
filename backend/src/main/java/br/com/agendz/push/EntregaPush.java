package br.com.agendz.push;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import org.springframework.stereotype.Component;

/** Criptografa a mensagem para o aparelho, assina como servidor (VAPID) e entrega pelo {@link Enviador}. */
@Component
public class EntregaPush {

    /** Mensagem de aviso de agenda vale por 1 hora: depois disso já não é novidade. */
    public static final int TTL_SEGUNDOS = 3600;

    private final PushConfig config;
    private final Enviador enviador;
    private final Clock relogio;

    public EntregaPush(PushConfig config, Enviador enviador, Clock relogio) {
        this.config = config;
        this.enviador = enviador;
        this.relogio = relogio;
    }

    public Enviador.Resultado enviar(Inscricoes.Alvo alvo, String json) {
        if (!config.ligado()) return Enviador.Resultado.FALHOU;
        try {
            byte[] corpo = WebPush.criptografar(json.getBytes(StandardCharsets.UTF_8), WebPush.debase64url(alvo.p256dh()), WebPush.debase64url(alvo.auth()));
            String jwt = WebPush.jwtVapid(Destinos.origem(alvo.endpoint()), relogio.instant().getEpochSecond() + 12 * 3600, config.contato(), config.privada());
            return enviador.enviar(alvo.endpoint(), corpo, "vapid t=" + jwt + ", k=" + config.publica(), TTL_SEGUNDOS);
        } catch (IllegalArgumentException e) {
            return Enviador.Resultado.INSCRICAO_MORTA; // chave do aparelho ilegível: não adianta tentar de novo
        }
    }
}
