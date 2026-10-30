package br.com.agendz.auth.rede;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Login automático por rede confiável (v119): só confia na rede quem acabou de entrar; a rede é a que o SERVIDOR viu (nunca vem do corpo); token de rede confiável
 * vale na rede e, fora dela, só por 24 h; "Sair", remover a rede e a troca de senha derrubam o token; limite de 5 redes por pessoa.
 */
class RedeConfiavelTest extends BaseApi {

    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String CASA = "203.0.113.10";
    private static final String OUTRA = "198.51.100.77";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    JwtEncoder encoder;

    @BeforeEach
    @AfterEach
    void limpar() {
        jdbc.update("delete from rede_confiavel");
    }

    private static RequestPostProcessor de(String ip) {
        return r -> {
            r.addHeader("X-Forwarded-For", ip);
            return r;
        };
    }

    private String entrar(String ip, boolean automatico) throws Exception {
        return mvc.perform(post("/api/auth/login").with(host(DALFORNO)).with(de(ip)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identificador\":\"alan\",\"senha\":\"1234\",\"loginAutomatico\":" + automatico + "}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static String tokenDe(String json) {
        Matcher m = Pattern.compile("\"token\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException(json);
        return m.group(1);
    }

    private ResultActions eu(String token, String ip) throws Exception {
        return mvc.perform(get("/api/usuarios/me").with(host(DALFORNO)).with(de(ip)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private String confiar(String token, String ip) throws Exception {
        return tokenDe(mvc.perform(post("/api/auth/redes-confiaveis").with(host(DALFORNO)).with(de(ip)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rotulo\":\"Casa\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.redeConfiavel").value(true)).andReturn().getResponse().getContentAsString());
    }

    private String idAlan() {
        return jdbc.queryForObject("select id::text from usuario where identificador = 'alan' and loja_id = ?::uuid", String.class, LOJA_DALFORNO);
    }

    /** Token com o relógio atrasado (o servidor assina de verdade): simula "faz tempo que entrou". */
    private String tokenAntigo(Duration idade, boolean auto, String rid, int rv) {
        Instant emitido = Instant.now().minus(idade);
        JwtClaimsSet.Builder b = JwtClaimsSet.builder().issuer("agendz").subject(idAlan()).issuedAt(emitido).expiresAt(Instant.now().plus(Duration.ofDays(30)))
                .claim("loja", LOJA_DALFORNO).claim("papel", "dono").claim("nome", "Alan");
        if (auto) b.claim("auto", true).claim("rid", rid).claim("rv", rv);
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), b.build())).getTokenValue();
    }

    @Test
    void semMarcarLoginAutomaticoNaoPerguntaENaoGravaRede() throws Exception {
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).with(de(CASA)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("alan", "1234")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.perguntarRede").value(false)).andExpect(jsonPath("$.redeConfiavel").value(false));
        assertEquals(0, jdbc.queryForObject("select count(*) from rede_confiavel", Integer.class));
    }

    @Test
    void redeNovaPerguntaEDepoisDeConfiarOProximoLoginJaVemLongoSemPerguntar() throws Exception {
        String json = entrar(CASA, true);
        org.hamcrest.MatcherAssert.assertThat(json, org.hamcrest.Matchers.containsString("\"perguntarRede\":true"));
        String curto = tokenDe(json);
        String longo = confiar(curto, CASA);
        eu(longo, CASA).andExpect(status().isOk());
        entrarSemPerguntar(CASA);
        // outra rede: não é confiável, volta a perguntar (se marcou) e o token é o comum
        org.hamcrest.MatcherAssert.assertThat(entrar(OUTRA, true), org.hamcrest.Matchers.containsString("\"perguntarRede\":true"));
        // a rede é a que o servidor viu: o corpo não escolhe
        assertEquals(1, jdbc.queryForObject("select count(*) from rede_confiavel", Integer.class));
    }

    private void entrarSemPerguntar(String ip) throws Exception {
        mvc.perform(post("/api/auth/login").with(host(DALFORNO)).with(de(ip)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("alan", "1234")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.redeConfiavel").value(true)).andExpect(jsonPath("$.perguntarRede").value(false));
    }

    @Test
    void soConfiaNaRedeQuemAcabouDeEntrar() throws Exception {
        String velho = tokenAntigo(Duration.ofMinutes(11), false, null, 0);
        mvc.perform(post("/api/auth/redes-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(velho))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        assertEquals(0, jdbc.queryForObject("select count(*) from rede_confiavel", Integer.class));
        mvc.perform(post("/api/auth/redes-confiaveis").with(host(DALFORNO)).with(de(CASA)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
    }

    @Test
    void tokenLongoVaiAteOFimNaRedeEForaDelaSoPorVinteEQuatroHoras() throws Exception {
        String longo = confiar(tokenDe(entrar(CASA, true)), CASA);
        String rid = jdbc.queryForObject("select id::text from rede_confiavel", String.class);
        int rv = jdbc.queryForObject("select versao from rede_confiavel", Integer.class);
        String antigo = tokenAntigo(Duration.ofDays(40), true, rid, rv);
        eu(antigo, CASA).andExpect(status().isOk()); // na rede confiável não expira
        eu(antigo, OUTRA).andExpect(status().isUnauthorized()); // em outra rede, 40 dias depois: pede nova autenticação
        eu(tokenAntigo(Duration.ofHours(23), true, rid, rv), OUTRA).andExpect(status().isOk());
        eu(tokenAntigo(Duration.ofHours(25), true, rid, rv), OUTRA).andExpect(status().isUnauthorized());
        eu(longo, OUTRA).andExpect(status().isOk()); // recém-emitido vale em qualquer rede
    }

    @Test
    void sairRemoverEVersaoErradaDerrubamOTokenLongo() throws Exception {
        String longo = confiar(tokenDe(entrar(CASA, true)), CASA);
        mvc.perform(post("/api/auth/sair").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(longo))).andExpect(status().isNoContent());
        eu(longo, CASA).andExpect(status().isUnauthorized());
        // login na mesma rede gera token novo (a rede continua confiável)
        entrarSemPerguntar(CASA);
        String novo = tokenDe(entrar(CASA, false));
        eu(novo, CASA).andExpect(status().isOk());
        // remover a rede: o token longo some junto
        String id = jdbc.queryForObject("select id::text from rede_confiavel", String.class);
        mvc.perform(get("/api/usuarios/me/redes-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(novo)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].atual").value(true)).andExpect(jsonPath("$[0].rotulo").value("Casa"));
        mvc.perform(delete("/api/usuarios/me/redes-confiaveis/" + UUID.randomUUID()).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(novo))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/usuarios/me/redes-confiaveis/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(novo))).andExpect(status().isNoContent());
        eu(tokenAntigo(Duration.ofMinutes(1), true, id, 1), CASA).andExpect(status().isUnauthorized());
    }

    @Test
    void pessoaDesativadaOuComOutroPapelPerdeOTokenLongoESessaoReabreComOMesmoToken() throws Exception {
        String longo = confiar(tokenDe(entrar(CASA, true)), CASA);
        mvc.perform(get("/api/auth/sessao").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(longo)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").value(longo)).andExpect(jsonPath("$.redeConfiavel").value(true)).andExpect(jsonPath("$.papel").value("dono"));
        try {
            jdbc.update("update usuario set ativo = false where id = ?::uuid", idAlan());
            eu(longo, CASA).andExpect(status().isUnauthorized());
            jdbc.update("update usuario set ativo = true, papel = 'atendente' where id = ?::uuid", idAlan());
            eu(longo, CASA).andExpect(status().isUnauthorized());
        } finally {
            jdbc.update("update usuario set ativo = true, papel = 'dono' where id = ?::uuid", idAlan());
        }
        eu(longo, CASA).andExpect(status().isOk());
    }

    @Test
    void trocarASenhaDerrubaTodosOsTokensLongos() throws Exception {
        String longo = confiar(tokenDe(entrar(CASA, true)), CASA);
        jdbc.update("update rede_confiavel set versao = versao + 1"); // o que PUT /api/usuarios/me/senha faz (RedesConfiaveis.encerrarTodas)
        eu(longo, CASA).andExpect(status().isUnauthorized());
    }

    @Test
    void ateCincoRedesPorPessoaEOutraLojaNaoVeAsDeLa() throws Exception {
        for (int i = 1; i <= 5; i++) {
            String ip = "203.0.113." + i;
            confiar(tokenDe(entrar(ip, true)), ip);
        }
        String ip6 = "203.0.113.99";
        mvc.perform(post("/api/auth/redes-confiaveis").with(host(DALFORNO)).with(de(ip6)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe(entrar(ip6, true))))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        assertEquals(5, jdbc.queryForObject("select count(*) from rede_confiavel", Integer.class));
        // a mesma rede em outra loja não é a mesma rede confiável (o hash é amarrado à loja e à pessoa)
        String offbox = token(OFFBOX, "proprietario");
        mvc.perform(get("/api/usuarios/me/redes-confiaveis").with(host(OFFBOX)).with(de("203.0.113.1")).header(HttpHeaders.AUTHORIZATION, bearer(offbox)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }
}
