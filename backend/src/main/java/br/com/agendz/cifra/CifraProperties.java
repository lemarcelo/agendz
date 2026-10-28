package br.com.agendz.cifra;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Chave de cifra (AES-256-GCM) e pepper dos hashes (HMAC-SHA256). Vêm do ambiente (CIFRA_CHAVE, CIFRA_PEPPER); sem eles, ou curtos, a API não sobe. */
@ConfigurationProperties(prefix = "agendz.cifra")
public record CifraProperties(String chave, String pepper) {
}
