package br.com.agendz.auth.aparelho;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
 * Aparelho confiável (v125, B8): só confia quem acabou de entrar; o token vale em QUALQUER rede enquanto a linha do aparelho existir; "Sair", remover, trocar a
 * senha, desativar a pessoa, mudar o papel e 90 dias sem uso derrubam; até 5 aparelhos por pessoa; outra loja não vê nem remove os daqui.
 */
class AparelhoConfiavelTest extends BaseApi {

    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String CASA = "203.0.113.10";
    private static final String OUTRA = "198.51.100.77";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    JwtEncoder encoder;
    @Autowired
    AparelhosConfiaveis aparelhos;

    @BeforeEach
    @AfterEach
    void limpar() {
        jdbc.update("delete from aparelho_confiavel");
        jdbc.update("delete from rede_confiavel");
    }

    private static RequestPostProcessor de(String ip) {
        return r -> {
            r.addHeader("X-Forwarded-For", ip);
            return r;
        };
    }

    private String entrar(String ip) throws Exception {
        return mvc.perform(post("/api/auth/login").with(host(DALFORNO)).with(de(ip)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("alan", "1234")))
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

    private String confiar(String token, String rotulo) throws Exception {
        return tokenDe(mvc.perform(post("/api/auth/aparelhos-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rotulo\":\"" + rotulo + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.redeConfiavel").value(true)).andReturn().getResponse().getContentAsString());
    }

    private String idAlan() {
        return jdbc.queryForObject("select id::text from usuario where identificador = 'alan' and loja_id = ?::uuid", String.class, LOJA_DALFORNO);
    }

    private String idDoAparelho() {
        return jdbc.queryForObject("select id::text from aparelho_confiavel", String.class);
    }

    /** Token de aparelho com o relógio atrasado (o servidor assina de verdade): simula "faz tempo que entrou". */
    private String tokenAntigo(Duration idade, String aparelho) {
        Instant emitido = Instant.now().minus(idade);
        JwtClaimsSet.Builder b = JwtClaimsSet.builder().issuer("agendz").subject(idAlan()).issuedAt(emitido).expiresAt(Instant.now().plus(Duration.ofDays(30)))
                .claim("loja", LOJA_DALFORNO).claim("papel", "dono").claim("nome", "Alan");
        if (aparelho != null) b.claim("auto", true).claim("ap", true).claim("rid", aparelho);
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), b.build())).getTokenValue();
    }

    @Test
    void confiarNoAparelhoDaUmTokenQueValeEmQualquerRedeESessaoReabreComOMesmoToken() throws Exception {
        String longo = confiar(tokenDe(entrar(CASA)), "Celular Android · Chrome");
        eu(longo, CASA).andExpect(status().isOk());
        eu(longo, OUTRA).andExpect(status().isOk()); // 4G, outro Wi-Fi: continua valendo
        mvc.perform(get("/api/auth/sessao").with(host(DALFORNO)).with(de(OUTRA)).header(HttpHeaders.AUTHORIZATION, bearer(longo)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").value(longo)).andExpect(jsonPath("$.redeConfiavel").value(true)).andExpect(jsonPath("$.papel").value("dono"));
        mvc.perform(get("/api/usuarios/me/aparelhos-confiaveis").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(longo)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].rotulo").value("Celular Android · Chrome")).andExpect(jsonPath("$[0].atual").value(true));
        // uma sessão comum da mesma pessoa vê o aparelho, mas não como "atual"
        mvc.perform(get("/api/usuarios/me/aparelhos-confiaveis").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe(entrar(OUTRA)))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].atual").value(false));
        // o banco guarda só o id, o nome e as datas: nenhum segredo
        assertEquals(1, jdbc.queryForObject("select count(*) from aparelho_confiavel", Integer.class));
    }

    @Test
    void soConfiaQuemAcabouDeEntrarENuncaPeloProprioAparelho() throws Exception {
        String velho = tokenAntigo(Duration.ofMinutes(11), null);
        mvc.perform(post("/api/auth/aparelhos-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(velho))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/aparelhos-confiaveis").with(host(DALFORNO)).with(de(CASA)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
        assertEquals(0, jdbc.queryForObject("select count(*) from aparelho_confiavel", Integer.class));
        // quem já usa um aparelho confiável não cria outro a partir dele (nem pede rede confiável com ele)
        String longo = confiar(tokenDe(entrar(CASA)), "Celular");
        mvc.perform(post("/api/auth/aparelhos-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(longo))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        mvc.perform(post("/api/auth/redes-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(longo))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        assertEquals(1, jdbc.queryForObject("select count(*) from aparelho_confiavel", Integer.class));
    }

    @Test
    void nomeDoAparelhoEhLimpoELimitado() throws Exception {
        confiar(tokenDe(entrar(CASA)), "   ");
        assertEquals("Este aparelho", jdbc.queryForObject("select rotulo from aparelho_confiavel", String.class));
        jdbc.update("delete from aparelho_confiavel");
        mvc.perform(post("/api/auth/aparelhos-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe(entrar(CASA))))
                .contentType(MediaType.APPLICATION_JSON).content("{\"rotulo\":\"" + "x".repeat(61) + "\"}")).andExpect(status().isBadRequest());
        assertEquals("a b", AparelhosConfiaveis.rotuloLimpo("a\u0000 \t b"));
        assertEquals(60, AparelhosConfiaveis.rotuloLimpo("y".repeat(200)).length());
    }

    @Test
    void sairRemoverEOutraLojaDerrubamOAparelho() throws Exception {
        String longo = confiar(tokenDe(entrar(CASA)), "Celular");
        mvc.perform(post("/api/auth/sair").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(longo))).andExpect(status().isNoContent());
        eu(longo, CASA).andExpect(status().isUnauthorized());
        assertEquals(0, jdbc.queryForObject("select count(*) from aparelho_confiavel", Integer.class)); // sair tira a confiança: o próximo login pergunta de novo

        String outro = confiar(tokenDe(entrar(CASA)), "Tablet");
        String id = idDoAparelho();
        // outra loja não remove o daqui (RLS + id da pessoa): 404, e o aparelho continua valendo
        String offbox = token(OFFBOX, "proprietario");
        mvc.perform(delete("/api/usuarios/me/aparelhos-confiaveis/" + id).with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(offbox))).andExpect(status().isNotFound());
        mvc.perform(get("/api/usuarios/me/aparelhos-confiaveis").with(host(OFFBOX)).header(HttpHeaders.AUTHORIZATION, bearer(offbox)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        eu(outro, OUTRA).andExpect(status().isOk());
        // a própria pessoa remove (de outro aparelho ou do computador) e o token cai na hora
        mvc.perform(delete("/api/usuarios/me/aparelhos-confiaveis/" + UUID.randomUUID()).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe(entrar(OUTRA))))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/usuarios/me/aparelhos-confiaveis/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe(entrar(OUTRA))))).andExpect(status().isNoContent());
        eu(outro, OUTRA).andExpect(status().isUnauthorized());
    }

    @Test
    void trocarASenhaDesativarMudarOPapelEParadoPor90DiasDerrubam() throws Exception {
        String longo = confiar(tokenDe(entrar(CASA)), "Celular");
        // desativar ou mudar o papel
        try {
            jdbc.update("update usuario set ativo = false where id = ?::uuid", idAlan());
            eu(longo, OUTRA).andExpect(status().isUnauthorized());
            jdbc.update("update usuario set ativo = true, papel = 'atendente' where id = ?::uuid", idAlan());
            eu(longo, OUTRA).andExpect(status().isUnauthorized());
        } finally {
            jdbc.update("update usuario set ativo = true, papel = 'dono' where id = ?::uuid", idAlan());
        }
        eu(longo, OUTRA).andExpect(status().isOk());
        // parado por 90 dias: o aparelho deixa de valer
        jdbc.update("update aparelho_confiavel set ultimo_uso = now() - interval '89 days'");
        eu(longo, OUTRA).andExpect(status().isOk());
        jdbc.update("update aparelho_confiavel set ultimo_uso = now() - interval '91 days'");
        eu(longo, OUTRA).andExpect(status().isUnauthorized());
        // trocar a senha apaga todos (o que PUT /api/usuarios/me/senha e a senha refeita pela equipe fazem)
        jdbc.update("update aparelho_confiavel set ultimo_uso = now()");
        eu(longo, OUTRA).andExpect(status().isOk());
        String hashAntigo = jdbc.queryForObject("select senha_hash from usuario where id = ?::uuid", String.class, idAlan());
        try {
            mvc.perform(put("/api/usuarios/me/senha").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe(entrar(CASA))))
                    .contentType(MediaType.APPLICATION_JSON).content("{\"senhaAtual\":\"1234\",\"nova\":\"OutraSenha9876\"}")).andExpect(status().isOk());
            eu(longo, OUTRA).andExpect(status().isUnauthorized());
            assertEquals(0, jdbc.queryForObject("select count(*) from aparelho_confiavel where usuario_id = ?::uuid", Integer.class, idAlan()));
        } finally {
            jdbc.update("update usuario set senha_hash = ? where id = ?::uuid", hashAntigo, idAlan());
        }
        // token inventado com o id de um aparelho que não existe
        eu(tokenAntigo(Duration.ofMinutes(1), UUID.randomUUID().toString()), OUTRA).andExpect(status().isUnauthorized());
        // e um token comum assinado como "ap" sem linha não passa de jeito nenhum
        eu(tokenAntigo(Duration.ofMinutes(1), "nao-e-id"), OUTRA).andExpect(status().isUnauthorized());
    }

    @Test
    void ateCincoAparelhosPorPessoa() throws Exception {
        for (int i = 1; i <= 5; i++) confiar(tokenDe(entrar("203.0.113." + i)), "Aparelho " + i);
        mvc.perform(post("/api/auth/aparelhos-confiaveis").with(host(DALFORNO)).with(de(CASA)).header(HttpHeaders.AUTHORIZATION, bearer(tokenDe(entrar(CASA))))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isConflict());
        assertEquals(5, jdbc.queryForObject("select count(*) from aparelho_confiavel", Integer.class));
    }
}
