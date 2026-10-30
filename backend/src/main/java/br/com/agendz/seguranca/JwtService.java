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

    /** Token de rede confiável (v119): `auto` + `rid` (a rede) + `rv` (a versão: "Sair" ou trocar a senha a derruba). Vale por muito tempo, mas o filtro de rede só o aceita fora da rede por 24 h. */
    public String emitirDeRedeConfiavel(UUID usuarioId, UUID lojaId, String papel, String nome, UUID redeId, int versao) {
        Instant agora = Instant.now(relogio);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("agendz")
                .subject(usuarioId.toString())
                .issuedAt(agora)
                .expiresAt(agora.plus(Duration.ofDays(props.validadeRedeConfiavelDias())))
                .claim("loja", lojaId.toString())
                .claim("papel", papel)
                .claim("nome", nome)
                .claim("auto", true)
                .claim("rid", redeId.toString())
                .claim("rv", versao)
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    /** `trocar` = senha temporária: o token só serve para trocar a senha (TrocarSenhaFilter). */
    public String emitir(UUID usuarioId, UUID lojaId, String papel, String nome, boolean trocar) {
        Instant agora = Instant.now(relogio);
        JwtClaimsSet.Builder construtor = JwtClaimsSet.builder()
                .issuer("agendz")
                .subject(usuarioId.toString())
                .issuedAt(agora)
                .expiresAt(agora.plus(Duration.ofMinutes(props.validadeMinutos())))
                .claim("loja", lojaId.toString())
                .claim("papel", papel)
                .claim("nome", nome);
        if (trocar) construtor.claim("trocar", true);
        JwtClaimsSet claims = construtor.build();
        JwsHeader cabecalho = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(cabecalho, claims)).getTokenValue();
    }
}
