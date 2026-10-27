package br.com.agendz.seguranca;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Segredo (HS256) e validade do token. O segredo vem do ambiente (JWT_SEGREDO); sem ele, ou curto demais, a API não sobe. */
@ConfigurationProperties(prefix = "agendz.jwt")
public record JwtProperties(String segredo, long validadeMinutos) {
    public JwtProperties {
        if (validadeMinutos <= 0) validadeMinutos = 480;
    }
}
