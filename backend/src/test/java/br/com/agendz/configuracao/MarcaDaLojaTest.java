package br.com.agendz.configuracao;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** Logo e tema da loja (Estabelecimento do site real): só quem tem a seção, tipo da logo pelo CONTEÚDO, cores #rrggbb, uma loja nunca grava a marca de outra. */
class MarcaDaLojaTest extends BaseApi {

    static final String PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAAAAAAAAAAAAAAAAAA=";
    static final String JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAAAAAAAAAAAAA==";
    static final String WEBP = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4IAAAAAAAAAAAAAAAAA==";
    static final String SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==";

    @Autowired
    JdbcTemplate jdbc;

    Map<String, Object> apex, dalforno;

    @BeforeEach
    void guardar() {
        apex = jdbc.queryForMap("select logo, tema_cor, tema_cor2 from loja where slug = 'apex'");
        dalforno = jdbc.queryForMap("select logo, tema_cor, tema_cor2 from loja where slug = 'dalforno'");
    }

    @AfterEach
    void devolver() {
        jdbc.update("update loja set logo = ?, tema_cor = ?, tema_cor2 = ? where slug = 'apex'", apex.get("logo"), apex.get("tema_cor"), apex.get("tema_cor2"));
        jdbc.update("update loja set logo = ?, tema_cor = ?, tema_cor2 = ? where slug = 'dalforno'", dalforno.get("logo"), dalforno.get("tema_cor"), dalforno.get("tema_cor2"));
        jdbc.update("delete from escala_faixa");
    }

    private static String json(String logo, String c1, String c2) {
        return "{\"logo\":" + (logo == null ? "null" : "\"" + logo + "\"") + ",\"temaCor\":" + (c1 == null ? "null" : "\"" + c1 + "\"") + ",\"temaCor2\":" + (c2 == null ? "null" : "\"" + c2 + "\"") + "}";
    }

    private void gravar(String host, String token, String corpo, int esperado) throws Exception {
        mvc.perform(put("/api/estabelecimento/marca").with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().is(esperado));
    }

    @Test
    void donoGravaLogoETemaELeDeVoltaEAPaginaPublicaMostra() throws Exception {
        String t = token(DALFORNO, "alan");
        mvc.perform(put("/api/estabelecimento/marca").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content(json(PNG, "#B45309", "#f2a93b")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.temaCor").value("#b45309")).andExpect(jsonPath("$.temaCor2").value("#f2a93b"));
        mvc.perform(get("/api/estabelecimento/marca").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.logo").value(PNG)).andExpect(jsonPath("$.temaCor").value("#b45309"));
        mvc.perform(get("/api/publico/loja").with(host(DALFORNO))).andExpect(jsonPath("$.logo").value(PNG)).andExpect(jsonPath("$.temaCor").value("#b45309")).andExpect(jsonPath("$.temaCor2").value("#f2a93b"));
    }

    @Test
    void jpegEWebpTambemValemEOCorpoInteiroSubstitui() throws Exception {
        String t = token(DALFORNO, "alan");
        gravar(DALFORNO, t, json(JPEG, null, null), 200);
        gravar(DALFORNO, t, json(WEBP, "#0f4c5c", null), 200);
        // sem logo e sem cores: volta ao padrão
        mvc.perform(put("/api/estabelecimento/marca").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content(json(null, null, null)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/estabelecimento/marca").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(jsonPath("$.logo").doesNotExist()).andExpect(jsonPath("$.temaCor").doesNotExist());
    }

    @Test
    void entradaInvalidaERecusadaENadaMuda() throws Exception {
        String t = token(DALFORNO, "alan");
        gravar(DALFORNO, t, json(PNG, "#112233", "#445566"), 200);
        String invalida = "Logo inválida: use PNG, JPEG ou WebP de até 100 KB.";
        String[][] casos = {
                {json(SVG, null, null), invalida},                                                  // SVG fica de fora
                {json("data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAAAAAAAAAAAAA==", null, null), invalida}, // cabeçalho diz PNG, o conteúdo é JPEG
                {json("data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAAAAAAAAAAAAAAAAAA=", null, null), invalida},
                {json("data:image/png;base64,curta", null, null), invalida},
                {json("http://exemplo.com/logo.png", null, null), invalida},
                {json("data:image/png;base64," + "A".repeat(140_000), null, null), invalida},       // acima do teto
                {json(PNG, "vermelho", "#445566"), "Cor do tema inválida: use #rrggbb."},
                {json(PNG, "#12345", null), "Cor do tema inválida: use #rrggbb."},
                {json(PNG, "#112233", "azul"), "Cor do tema inválida: use #rrggbb."},
                {json(PNG, null, "#445566"), "Informe a cor principal do tema."},
        };
        for (String[] c : casos) {
            mvc.perform(put("/api/estabelecimento/marca").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON).content(c[0]))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value(c[1]));
        }
        mvc.perform(get("/api/estabelecimento/marca").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)))
                .andExpect(jsonPath("$.logo").value(PNG)).andExpect(jsonPath("$.temaCor").value("#112233"));
    }

    @Test
    void quemNaoTemAProtecaoDeEstabelecimentoNaoLeNemGrava() throws Exception {
        String prof = token(APEX, "pablo");
        gravar(APEX, prof, json(PNG, null, null), 403);
        mvc.perform(get("/api/estabelecimento/marca").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof))).andExpect(status().isForbidden());
        mvc.perform(get("/api/estabelecimento/marca").with(host(APEX))).andExpect(status().isUnauthorized());
        // a escala (expediente) da loja também só muda com a seção Estabelecimento
        mvc.perform(put("/api/estabelecimento/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(prof)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"18:00\"]]}}}")).andExpect(status().isForbidden());
    }

    @Test
    void cadaLojaTemASuaMarcaEUmaNuncaGravaNaOutra() throws Exception {
        String davi = token(APEX, "davi"), alan = token(DALFORNO, "alan");
        gravar(APEX, davi, json(JPEG, "#7f1d3a", "#c2415d"), 200);
        // a Dalforno segue com a marca dela
        mvc.perform(get("/api/estabelecimento/marca").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk());
        org.junit.jupiter.api.Assertions.assertEquals(dalforno.get("logo"), jdbc.queryForObject("select logo from loja where slug = 'dalforno'", String.class));
        // token da Apex com o Host da Dalforno é recusado e nada é gravado em nenhuma das duas
        gravar(DALFORNO, davi, json(PNG, "#000000", null), 403);
        Map<String, Object> d = jdbc.queryForMap("select logo, tema_cor from loja where slug = 'dalforno'");
        org.junit.jupiter.api.Assertions.assertEquals(dalforno.get("logo"), d.get("logo"));
        org.junit.jupiter.api.Assertions.assertEquals(dalforno.get("tema_cor"), d.get("tema_cor"));
        mvc.perform(get("/api/publico/loja").with(host(APEX))).andExpect(jsonPath("$.logo").value(startsWith("data:image/jpeg;base64,")));
    }

    @Test
    void aFuncaoDoBancoSemLojaNaSessaoNaoGravaNada() {
        List<Integer> r = jdbc.execute((java.sql.Connection c) -> {
            try (var st = c.createStatement()) {
                st.execute("select set_config('app.loja_id', '', false)");
                var rs = st.executeQuery("select loja_gravar_marca('" + PNG + "', '#112233', null)");
                rs.next();
                return List.of(rs.getInt(1));
            }
        });
        org.junit.jupiter.api.Assertions.assertEquals(0, r.get(0));
        org.junit.jupiter.api.Assertions.assertEquals(dalforno.get("logo"), jdbc.queryForObject("select logo from loja where slug = 'dalforno'", String.class));
    }

    @Test
    void expedienteDaLojaPodeSerGravadoPeloDonoEViraLeituraParaAPaginaDeEstabelecimento() throws Exception {
        String t = token(DALFORNO, "alan");
        mvc.perform(put("/api/estabelecimento/escala").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"14:00\",\"18:00\"],[\"09:00\",\"12:00\"]]},\"0\":{\"aberto\":false}}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.semana.1.faixas[0][0]").value("09:00")).andExpect(jsonPath("$.semana.0.aberto").value(false));
        mvc.perform(put("/api/estabelecimento/escala").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"12:00\"],[\"11:00\",\"13:00\"]]}}}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/estabelecimento/escala").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(t)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"semana\":{}}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Abra pelo menos um dia da semana"));
    }
}
