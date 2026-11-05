package br.com.agendz.push;

import java.net.URI;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

/** POST ao serviço de push (RFC 8030). Sem redirecionamento; tempo curto; 404/410 = inscrição morta. */
@Component
public class EnviadorHttp implements Enviador {

    private static final Logger LOG = LoggerFactory.getLogger(EnviadorHttp.class);
    private final HttpClient http;

    public EnviadorHttp(@Value("${agendz.push.proxy:}") String proxy) {
        var b = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER);
        if (proxy != null && !proxy.isBlank()) {
            URI u = URI.create(proxy);
            if (!"http".equals(u.getScheme()) || u.getHost() == null || u.getPort() < 1 || u.getUserInfo() != null || u.getPath() == null || !u.getPath().isEmpty() || u.getQuery() != null || u.getFragment() != null) throw new IllegalArgumentException("Proxy de notificações inválido.");
            b.proxy(ProxySelector.of(InetSocketAddress.createUnresolved(u.getHost(), u.getPort())));
        }
        this.http = b.build();
    }

    @Override
    public Resultado enviar(String endpoint, byte[] corpo, String autorizacao, int ttlSegundos) {
        if (!Destinos.permitido(endpoint)) return Resultado.INSCRICAO_MORTA; // endpoint estranho nunca é chamado
        try {
            HttpRequest r = HttpRequest.newBuilder(URI.create(endpoint)).timeout(Duration.ofSeconds(10))
                    .header("Content-Encoding", "aes128gcm").header("Content-Type", "application/octet-stream")
                    .header("TTL", String.valueOf(ttlSegundos)).header("Urgency", "high").header("Authorization", autorizacao)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(corpo)).build();
            int status = http.send(r, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status >= 200 && status < 300) return Resultado.ENTREGUE;
            if (status == 404 || status == 410) return Resultado.INSCRICAO_MORTA;
            LOG.warn("Serviço de push respondeu {} ({})", status, Destinos.origem(endpoint));
            return Resultado.FALHOU;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Resultado.FALHOU;
        } catch (java.io.IOException | RuntimeException e) {
            LOG.warn("Falha ao falar com o serviço de push ({}): {}", Destinos.origem(endpoint), e.getClass().getSimpleName());
            return Resultado.FALHOU;
        }
    }
}
