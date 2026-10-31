package br.com.agendz.push;

import java.security.interfaces.ECPrivateKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Chaves VAPID do servidor (v130). Geradas uma vez na VPS por `deploy/preparar-api.sh` e guardadas em `.env` (`VAPID_PUBLICA`, `VAPID_PRIVADA`, base64url).
 * Sem as duas, o aviso com o app fechado fica desligado (a tela diz isso) e nada mais muda. Trocar a chave depois invalida todas as inscrições (as pessoas ativam de novo).
 */
@Component
public class PushConfig {

    private final String publica;
    private final ECPrivateKey privada;
    private final String contato;

    public PushConfig(@Value("${agendz.push.publica:}") String publica, @Value("${agendz.push.privada:}") String privada, @Value("${agendz.push.contato:mailto:suporte@agendz.io}") String contato) {
        ECPrivateKey k = null;
        String p = publica == null ? "" : publica.trim();
        try {
            if (!p.isEmpty() && privada != null && !privada.isBlank()) {
                WebPush.publica(WebPush.debase64url(p)); // confere que é um ponto da curva
                k = WebPush.privada(WebPush.debase64url(privada.trim()));
            }
        } catch (IllegalArgumentException e) {
            k = null; // chave malformada: recurso desligado, o resto do servidor sobe normal
        }
        this.privada = k;
        this.publica = k == null ? "" : p;
        this.contato = contato == null || !(contato.startsWith("mailto:") || contato.startsWith("https://")) ? "mailto:suporte@agendz.io" : contato;
    }

    public boolean ligado() {
        return privada != null;
    }

    public String publica() {
        return publica;
    }

    public ECPrivateKey privada() {
        return privada;
    }

    public String contato() {
        return contato;
    }
}
