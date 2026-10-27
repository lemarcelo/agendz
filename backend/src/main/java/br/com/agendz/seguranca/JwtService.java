package br.com.agendz.seguranca;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** Emite o token da pessoa logada. O claim `loja` amarra o token à loja: outra loja (outro Host) recusa com 403. */
@Service
public class JwtService {

    private final JwtEncoder encoder;
    private final JwtProperties props;
    private final Clock relogio;

    public JwtService(JwtEncoder encoder, JwtProperties props, Clock relogio) {
        this.encoder = encoder;
        this.props = props;
        this.relogio = relogio;
    }

    public String emitir(UUID usuarioId, UUID lojaId, String papel, String nome) {
        Instant agora = Instant.now(relogio);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("agendz")
                .subject(usuarioId.toString())
                .issuedAt(agora)
                .expiresAt(agora.plus(Duration.ofMinutes(props.validadeMinutos())))
                .claim("loja", lojaId.toString())
                .claim("papel", papel)
                .claim("nome", nome)
                .build();
        JwsHeader cabecalho = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(cabecalho, claims)).getTokenValue();
    }
}
