package br.com.agendz.agenda;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/** B9c: os MESMOS casos de equivalencia/folga.json que tests/profissional-auto.test.mjs roda na API simulada (ordem do mais livre para o menos livre). */
class FolgaEquivalenciaTest {

    private static final long H = 3_600_000L;

    @TestFactory
    Stream<DynamicTest> casos() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/folga.json")) {
            JsonNode raiz = new ObjectMapper().readTree(in);
            JsonNode casos = raiz.get("casos");
            assertTrue(casos.size() >= 8, "casos suficientes para valer como contrato");
            List<DynamicTest> testes = new ArrayList<>();
            for (JsonNode c : casos) {
                testes.add(DynamicTest.dynamicTest("folga · " + c.get("nome").asText(), () -> {
                    List<String> ids = new ArrayList<>();
                    c.get("ids").forEach(x -> ids.add(x.asText()));
                    List<Folga.Ag> ags = new ArrayList<>();
                    c.get("agendamentos").forEach(a -> ags.add(new Folga.Ag(a.get("p").asText(), Math.round(a.get("h").asDouble() * H), a.path("cancelado").asBoolean(false))));
                    List<String> esperado = new ArrayList<>();
                    c.get("esperado").forEach(x -> esperado.add(x.asText()));
                    assertEquals(esperado, Folga.ordenar(ids, ags, 0, 24 * H, Folga.JANELA_DIAS * 24 * H));
                }));
            }
            return testes.stream();
        }
    }
}
