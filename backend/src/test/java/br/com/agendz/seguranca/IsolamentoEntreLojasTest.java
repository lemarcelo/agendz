package br.com.agendz.seguranca;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.time.Instant;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.spec.SecretKeySpec;
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
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * Gate 3 (isolamento entre lojas) na camada HTTP:
 * (a) id de cliente de outra loja -> 404; (b) token de uma loja no Host de outra -> 403; (c) host desconhecido -> 404 (LojaPorEnderecoTest);
 * (d) X-Forwarded-Host forjado ignorado (LojaPorEnderecoTest); (f) RLS no banco (IsolamentoNoBancoTest). (e) arquivos: ainda não existem.
 * Mais: token ausente, adulterado, expirado, de outro segredo e sem assinatura (alg none) -> 401.
 */
class IsolamentoEntreLojasTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    JwtEncoder encoder;

    @BeforeEach
    void limpar() {
        jdbc.update("delete from cliente");
    }

    private String criarCliente(String hostDaLoja, String token, String nome, String telefone) throws Exception {
        String json = mvc.perform(post("/api/clientes").with(host(hostDaLoja)).header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nome\":\"" + nome + "\",\"telefone\":\"" + telefone + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    @Test
    void cadaLojaListaSoOsSeusClientes() throws Exception {
        String tA = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        criarCliente(APEX, tA, "Cliente da Apex", "5553999000001");
        criarCliente(DALFORNO, tB, "Cliente da Dalforno", "5553999000002");
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Cliente da Apex"));
        mvc.perform(get("/api/clientes").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB)))
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Cliente da Dalforno"));
    }

    @Test
    void a_clienteDeOutraLojaDa404NaoRevelaQueExiste() throws Exception {
        String tA = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        String idDaApex = criarCliente(APEX, tA, "Só da Apex", "5553999000003");
        mvc.perform(get("/api/clientes/" + idDaApex).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/clientes/" + idDaApex).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tB)))
                .andExpect(status().isNotFound());
    }

    @Test
    void b_tokenDeUmaLojaNoHostDeOutraDa403() throws Exception {
        String tA = token(APEX, "davi");
        mvc.perform(get("/api/clientes").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tA)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/clientes").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(tA))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"X\",\"telefone\":\"5553999000004\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void mesmoTelefoneEmLojasDiferentesPodeMasNaMesmaLojaDa409() throws Exception {
        String tA = token(APEX, "davi"), tB = token(DALFORNO, "alan");
        criarCliente(APEX, tA, "Ana", "5553999000005");
        criarCliente(DALFORNO, tB, "Ana", "5553999000005");
        mvc.perform(post("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Outra Ana\",\"telefone\":\"5553999000005\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void validacaoDoCorpoDa400() throws Exception {
        String tA = token(APEX, "davi");
        mvc.perform(post("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"\",\"telefone\":\"123\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/clientes/nao-e-uuid").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(tA)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void tokenAdulteradoOuFalsoDa401() throws Exception {
        String valido = token(APEX, "davi");
        String[] partes = valido.split("\\.");
        // 1) assinatura alterada
        String sig = partes[2];
        char trocado = sig.charAt(5) == 'A' ? 'B' : 'A';
        String adulterado = partes[0] + "." + partes[1] + "." + sig.substring(0, 5) + trocado + sig.substring(6);
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(adulterado)))
                .andExpect(status().isUnauthorized());
        // 2) sem assinatura (alg none)
        String semAssinatura = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\"}".getBytes()) + "." + partes[1] + ".";
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(semAssinatura)))
                .andExpect(status().isUnauthorized());
        // 3) assinado com outro segredo
        JwtEncoder outro = new NimbusJwtEncoder(new com.nimbusds.jose.jwk.source.ImmutableSecret<>(
                new SecretKeySpec("outro-segredo-de-32-bytes-ou-mais-0123456789".getBytes(), "HmacSHA256")));
        String deOutro = emitir(outro, Instant.now().plusSeconds(3600));
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(deOutro)))
                .andExpect(status().isUnauthorized());
        // 4) expirado (mesmo segredo certo)
        String expirado = emitir(encoder, Instant.now().minusSeconds(3600));
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(expirado)))
                .andExpect(status().isUnauthorized());
        // 5) lixo
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, "Bearer lixo"))
                .andExpect(status().isUnauthorized());
    }

    private String emitir(JwtEncoder enc, Instant expira) {
        JwtClaimsSet claims = JwtClaimsSet.builder().subject("00000000-0000-0000-0000-000000000001")
                .issuedAt(expira.minusSeconds(7200)).expiresAt(expira)
                .claim("loja", "00000000-0000-0000-0000-0000000000a1").claim("papel", "dono").build();
        return enc.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
}
