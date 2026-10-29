package br.com.agendz.suporte;

import br.com.agendz.erro.ErroDeNegocio;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Conversa com a Admin API (chamados) pela rede interna do Docker (`http://admin-api:8080/interno/chamados`) com a mesma chave `INTERNO_CHAVE` das rotas internas.
 * A chave nunca entra em log, resposta nem mensagem de erro. 400/404/409/429 voltam com a mensagem do Admin; o resto vira 503 genérico (o suporte pode estar fora do ar).
 */
@Component
public class AdminLigacao {

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
    private final ObjectMapper json;
    private final String base;
    private final String chave;

    public AdminLigacao(ObjectMapper json, @Value("${agendz.admin.url:}") String base, @Value("${agendz.interno.chave:}") String chave) {
        this.json = json;
        this.base = base == null ? "" : base.trim().replaceAll("/+$", "");
        this.chave = chave == null ? "" : chave.trim();
    }

    public ObjectMapper objetos() {
        return json;
    }

    public JsonNode obter(String caminhoComQuery) {
        return chamar("GET", caminhoComQuery, null);
    }

    public JsonNode enviar(String caminho, Object corpo) {
        return chamar("POST", caminho, corpo);
    }

    private JsonNode chamar(String metodo, String caminho, Object corpo) {
        if (base.isEmpty() || chave.length() < 16) throw indisponivel();
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + "/interno/chamados" + caminho)).timeout(Duration.ofSeconds(15)).header("X-Interno-Chave", chave).header("Accept", "application/json");
            if (corpo == null) b.GET();
            else b.header("Content-Type", "application/json").method(metodo, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(corpo), StandardCharsets.UTF_8));
            HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int s = r.statusCode();
            JsonNode resposta = r.body() == null || r.body().isBlank() ? json.createObjectNode() : json.readTree(r.body());
            if (s >= 200 && s < 300) return resposta;
            if (s == 400 || s == 404 || s == 409 || s == 429) {
                String msg = resposta.hasNonNull("mensagem") ? resposta.get("mensagem").asText() : "O suporte recusou o pedido.";
                throw new ErroDeNegocio(HttpStatus.valueOf(s), msg);
            }
            throw indisponivel();
        } catch (ErroDeNegocio e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw indisponivel();
        } catch (IOException | RuntimeException e) {
            throw indisponivel();
        }
    }

    private static ErroDeNegocio indisponivel() {
        return new ErroDeNegocio(HttpStatus.SERVICE_UNAVAILABLE, "O suporte não está disponível agora. Tente de novo em instantes.");
    }
}
