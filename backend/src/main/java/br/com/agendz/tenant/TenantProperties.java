package br.com.agendz.tenant;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuração de DNS: subdomínios de UM rótulo destes domínios apontam para a loja. */
@ConfigurationProperties(prefix = "agendz")
public record TenantProperties(List<String> dominiosBase, boolean permitirQuery) {
    public TenantProperties {
        dominiosBase = dominiosBase == null ? List.of() : List.copyOf(dominiosBase);
    }
}
