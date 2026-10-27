package br.apex.support;

import java.time.Clock;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration
public class ConfiguracaoDeTeste {
    @Bean @Primary
    public RelogioDeTeste relogioDeTeste() { return new RelogioDeTeste(); }

    @Bean @Primary
    public Clock clock(RelogioDeTeste r) { return r; }
}
