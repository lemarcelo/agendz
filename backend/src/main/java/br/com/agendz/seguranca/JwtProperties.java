package br.com.agendz.seguranca;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Segredo (HS256) e validade do token. O segredo vem do ambiente (JWT_SEGREDO); sem ele, ou curto demais, a API não sobe. */
@ConfigurationProperties(prefix = "agendz.jwt")
public record JwtProperties(String segredo, long validadeMinutos, long validadeRedeConfiavelDias) {
    public JwtProperties {
        if (validadeMinutos <= 0) validadeMinutos = 1440; // v119: sessão fora de rede confiável vale 24 h
        if (validadeRedeConfiavelDias <= 0) validadeRedeConfiavelDias = 365; // "sem vencimento" na rede confiável: um ano, renovado a cada login (e revogável)
    }
}
