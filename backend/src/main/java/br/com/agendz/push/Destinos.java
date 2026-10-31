package br.com.agendz.push;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;

/**
 * Para onde o servidor aceita enviar (v130). O endpoint vem do navegador da pessoa, então só vale https nos serviços de push conhecidos:
 * sem isso, qualquer usuário faria o servidor chamar um endereço interno (SSRF).
 */
public final class Destinos {

    /** Domínios dos serviços de push dos navegadores (Chrome/Edge/Android, Firefox, Safari/iOS, Windows). */
    private static final List<String> SERVICOS = List.of("fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com");

    private Destinos() {
    }

    public static boolean permitido(String endpoint) {
        if (endpoint == null || endpoint.length() < 20 || endpoint.length() > 600) return false;
        for (int i = 0; i < endpoint.length(); i++) {
            char c = endpoint.charAt(i);
            if (c <= ' ' || c > '~') return false; // sem espaço, controle ou não-ASCII
        }
        try {
            URI u = new URI(endpoint);
            if (!"https".equals(u.getScheme()) || u.getUserInfo() != null || u.getFragment() != null) return false;
            if (u.getPort() != -1 && u.getPort() != 443) return false;
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            for (String s : SERVICOS) if (host.equals(s) || host.endsWith("." + s)) return true;
            return false;
        } catch (URISyntaxException e) {
            return false;
        }
    }

    /** `https://host` do endpoint: é o `aud` do VAPID. */
    public static String origem(String endpoint) {
        URI u = URI.create(endpoint);
        return "https://" + u.getHost().toLowerCase(Locale.ROOT);
    }
}
