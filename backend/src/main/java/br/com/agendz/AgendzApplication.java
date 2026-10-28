package br.com.agendz;

import br.com.agendz.cifra.CifraProperties;
import br.com.agendz.seguranca.JwtProperties;
import br.com.agendz.tenant.TenantProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({TenantProperties.class, JwtProperties.class, CifraProperties.class})
public class AgendzApplication {
    public static void main(String[] args) {
        SpringApplication.run(AgendzApplication.class, args);
    }
}
