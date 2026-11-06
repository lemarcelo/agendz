package br.com.agendz.agenda;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/** B2: os MESMOS casos de equivalencia/modo-escolha.json que tests-jest/modo-escolha.test.mjs roda na API simulada. */
class ModoEscolhaEquivalenciaTest {

    private static final long H = 3_600_000L;

    @TestFactory
    Stream<DynamicTest> casos() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/modo-escolha.json")) {
            JsonNode raiz = new ObjectMapper().readTree(in);
            JsonNode casos = raiz.get("casos");
            assertTrue(casos.size() >= 20, "casos suficientes para valer como contrato");
            List<DynamicTest> testes = new ArrayList<>();
            for (JsonNode c : casos) {
                testes.add(DynamicTest.dynamicTest("modo · " + c.get("nome").asText(), () -> {
                    List<String> ids = new ArrayList<>();
                    c.get("ids").forEach(x -> ids.add(x.asText()));
                    List<Folga.Ag> ags = new ArrayList<>();
                    c.path("agendamentos").forEach(a -> ags.add(new Folga.Ag(a.get("p").asText(), Math.round(a.get("h").asDouble() * H), a.path("cancelado").asBoolean(false))));
                    Map<String, Integer> ja = new HashMap<>();
                    c.path("ja").fields().forEachRemaining(e -> ja.put(e.getKey(), e.getValue().asInt()));
                    Map<String, Double> sorteio = new HashMap<>();
                    c.path("sorteio").fields().forEachRemaining(e -> sorteio.put(e.getKey(), e.getValue().asDouble()));
                    String ponteiro = c.hasNonNull("ponteiro") ? c.get("ponteiro").asText() : null;
                    long mesIni = Math.round(c.path("mes").path("ini").asDouble(-240) * H);
                    long mesFim = Math.round(c.path("mes").path("fim").asDouble(480) * H);
                    List<String> esperado = new ArrayList<>();
                    c.get("esperado").forEach(x -> esperado.add(x.asText()));
                    ModoEscolha.Limites l = new ModoEscolha.Limites(0, 24 * H, Folga.JANELA_DIAS * 24 * H, mesIni, mesFim);
                    assertEquals(esperado, ModoEscolha.ordenar(c.get("modo").asText(), ids, ags, l, ja, sorteio, ponteiro));
                }));
            }
            return testes.stream();
        }
    }
}
