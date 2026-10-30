package br.com.agendz.seguranca;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

/** Segurança da API: sem sessão, token Bearer (JWT HS256), rotas públicas explícitas e todo o resto exige login. */
@Configuration
@EnableMethodSecurity
public class SegurancaConfig {

    @Bean
    Clock relogio() {
        return Clock.systemUTC();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    @Bean
    SecretKey chaveJwt(JwtProperties props) {
        String segredo = props.segredo() == null ? "" : props.segredo();
        byte[] bytes = segredo.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("JWT_SEGREDO ausente ou curto: use um valor aleatório de pelo menos 32 caracteres.");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey chave) {
        return NimbusJwtDecoder.withSecretKey(chave).macAlgorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey chave) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(chave));
    }

    @Bean
    JwtAuthenticationConverter conversorDoToken() {
        JwtAuthenticationConverter c = new JwtAuthenticationConverter();
        c.setJwtGrantedAuthoritiesConverter(jwt -> {
            List<GrantedAuthority> autoridades = new ArrayList<>();
            String papel = jwt.getClaimAsString("papel");
            if (papel != null) autoridades.add(new SimpleGrantedAuthority("ROLE_" + papel.toUpperCase()));
            return autoridades;
        });
        return c;
    }

    @Bean
    SecurityFilterChain filtros(HttpSecurity http, JwtDecoder decoder, JwtAuthenticationConverter conversor) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable) // sem cookie de sessão: o token vai no cabeçalho Authorization
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.GET, "/api/publico/**", "/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/passkey/desafio", "/api/auth/passkey/entrar").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/publico/agendamentos", "/api/publico/agendamentos/*/cancelar", "/api/publico/agendamentos/*/remarcar", "/api/publico/meus", "/api/publico/planos/pedidos").permitAll() // link do cliente: sem login
                        .requestMatchers("/interno/**").permitAll() // só a rede interna (o Caddy não publica /interno)
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoder).jwtAuthenticationConverter(conversor)))
                .addFilterAfter(new ConferirLojaDoTokenFilter(), BearerTokenAuthenticationFilter.class)
                .addFilterAfter(new TrocarSenhaFilter(), ConferirLojaDoTokenFilter.class)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable);
        return http.build();
    }
}
