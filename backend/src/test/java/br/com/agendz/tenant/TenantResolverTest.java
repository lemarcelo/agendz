package br.com.agendz.tenant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

/** Espelho de tests/tenant.test.mjs: a regra é a mesma do protótipo. */
class TenantResolverTest {

    private final Function<String, Optional<String>> banco =
            h -> "agenda.apexestetica.com.br".equals(h) ? Optional.of("apex") : Optional.empty();
    private final TenantResolver producao = new TenantResolver(List.of("agendz.io", "localhost"), false);
    private final TenantResolver demo = new TenantResolver(List.of("agendz.io"), true);

    private String slug(TenantResolver r, String host, String caminho, String query) {
        return r.resolver(host, caminho, query, banco).slug();
    }

    @Test
    void subdominioDeUmRotulo() {
        assertEquals("apex", slug(producao, "apex.agendz.io", "/", null));
        assertEquals("dalforno", slug(producao, "dalforno.localhost", "/", null));
        assertEquals("subdominio", producao.resolver("offbox.agendz.io", "/", null, banco).via());
    }

    @Test
    void normalizaMaiusculaPortaEPontoFinal() {
        assertEquals("dalforno", slug(producao, "DALFORNO.agendz.io", "/", null));
        assertEquals("dalforno", slug(producao, "dalforno.agendz.io:8443", "/", null));
        assertEquals("dalforno", slug(producao, "dalforno.agendz.io.", "/", null));
        assertEquals("dalforno", slug(producao, "DALFORNO.agendz.io.:443", "/", null));
    }

    @Test
    void recusaHostEngenhosoOuReservado() {
        assertNull(slug(producao, "a.b.agendz.io", "/", null));
        assertNull(slug(producao, "dalforno.agendz.io.evil.com", "/", null));
        assertNull(slug(producao, "evilagendz.io", "/", null));
        assertNull(slug(producao, "www.agendz.io", "/", null));
        assertNull(slug(producao, "api.agendz.io", "/", null));
        assertNull(slug(producao, "-x.agendz.io", "/", null));
    }

    @Test
    void dominioProprioGanhaDeQualquerOutraPista() {
        var r = producao.resolver("agenda.apexestetica.com.br", "/agendar/dalforno", "offbox", banco);
        assertEquals("apex", r.slug());
        assertEquals("dominio", r.via());
    }

    @Test
    void caminhoPublico() {
        assertEquals("dalforno", slug(producao, "agendz.io", "/agendar/Dalforno/", null));
        assertNull(slug(producao, "agendz.io", "/agendar/api", null));
        assertNull(slug(producao, "agendz.io", "/agendar/a/b", null));
    }

    @Test
    void queryDaLojaSoQuandoPermitida() {
        assertNull(slug(producao, "agendz.io", "/", "dalforno"));
        assertEquals("dalforno", slug(demo, "agendz.io", "/", "dalforno"));
        assertNull(slug(demo, "agendz.io", "/", "../x"));
    }

    @Test
    void slugValido() {
        assertTrue(TenantResolver.slugValido("dalforno"));
        assertTrue(TenantResolver.slugValido("a1-b2"));
        assertFalse(TenantResolver.slugValido("Dalforno"));
        assertFalse(TenantResolver.slugValido("a_b"));
        assertFalse(TenantResolver.slugValido("admin"));
        assertFalse(TenantResolver.slugValido("x".repeat(41)));
        assertFalse(TenantResolver.slugValido(null));
    }
}
