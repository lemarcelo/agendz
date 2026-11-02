package br.com.agendz.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Prova de "não sou um robô" (Google reCAPTCHA v2) pedida no login depois de erros seguidos.
 * Ligado só com as duas chaves no ambiente (RECAPTCHA_CHAVE_SITE e RECAPTCHA_SEGREDO); sem elas o login segue com o bloqueio de sempre.
 * O segredo nunca sai do servidor; a chave do site é pública (vai para o navegador). Falha de rede com o Google = prova recusada (nunca libera).
 */
@Component
public class Recaptcha {

    private static final String VERIFICAR = "https://www.google.com/recaptcha/api/siteverify";

    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
    private volatile String chaveSite;
    private final String segredo;
    private volatile Predicate<String> trocaDeTeste; // só os testes usam

    public Recaptcha(@Value("${agendz.recaptcha.chave-site:}") String chaveSite, @Value("${agendz.recaptcha.segredo:}") String segredo) {
        this.chaveSite = chaveSite == null ? "" : chaveSite.trim();
        this.segredo = segredo == null ? "" : segredo.trim();
    }

    public boolean ativo() {
        return !chaveSite.isEmpty() && (trocaDeTeste != null || !segredo.isEmpty());
    }

    public boolean ativo(String chaveSiteLoja, String segredoLoja) {
        if (trocaDeTeste != null) return true;
        if (chaveSiteLoja != null && !chaveSiteLoja.isBlank() && segredoLoja != null && !segredoLoja.isBlank()) {
            return true;
        }
        return ativo();
    }

    /** Chave pública para o navegador; nula quando o reCAPTCHA está desligado. */
    public String chaveSite() {
        return ativo() ? chaveSite : null;
    }

    /** Chave pública para o navegador considerando configuração da loja com fallback global. */
    public String chaveSite(String chaveLoja) {
        if (chaveLoja != null && !chaveLoja.isBlank()) return chaveLoja.trim();
        return chaveSite();
    }

    public boolean valido(String resposta) {
        return valido(resposta, null);
    }

    public boolean valido(String resposta, String segredoLoja) {
        if (resposta == null || resposta.isBlank() || resposta.length() > 4096) return false;
        if (trocaDeTeste != null) return trocaDeTeste.test(resposta);
        String segredoEfetivo = (segredoLoja != null && !segredoLoja.isBlank()) ? segredoLoja.trim() : this.segredo;
        if (segredoEfetivo.isEmpty()) return false;
        try {
            String corpo = "secret=" + URLEncoder.encode(segredoEfetivo, StandardCharsets.UTF_8) + "&response=" + URLEncoder.encode(resposta, StandardCharsets.UTF_8);
            HttpRequest req = HttpRequest.newBuilder(URI.create(VERIFICAR)).timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(corpo)).build();
            HttpResponse<String> r = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) return false;
            JsonNode n = json.readTree(r.body());
            return n.path("success").asBoolean(false);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /** Só para testes: liga o reCAPTCHA com uma chave de mentira e uma regra no lugar da chamada ao Google. */
    public void ligarParaTeste(String chave, Predicate<String> regra) {
        this.chaveSite = chave;
        this.trocaDeTeste = regra;
    }

    /** Só para testes: volta ao que o ambiente configurou. */
    public void desligarTeste(String chaveOriginal) {
        this.chaveSite = chaveOriginal == null ? "" : chaveOriginal;
        this.trocaDeTeste = null;
    }
}
