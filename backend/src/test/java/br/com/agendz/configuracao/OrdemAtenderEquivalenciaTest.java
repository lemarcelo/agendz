package br.com.agendz.configuracao;

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

/** B9b: os MESMOS casos de equivalencia/ordem-atender.json que tests/ordem-atender.test.mjs roda na API simulada. */
class OrdemAtenderEquivalenciaTest {

    @TestFactory
    Stream<DynamicTest> casos() throws Exception {
        ObjectMapper json = new ObjectMapper();
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/ordem-atender.json")) {
            JsonNode casos = json.readTree(in).get("casos");
            assertTrue(casos.size() >= 10, "casos suficientes para valer como contrato");
            List<DynamicTest> testes = new ArrayList<>();
            for (JsonNode c : casos) {
                testes.add(DynamicTest.dynamicTest("ordem do Atender · " + c.get("nome").asText(), () -> {
                    Object entrada = json.treeToValue(c.get("entrada"), Object.class);
                    assertEquals(c.get("valida").asBoolean(), OrdemDoAtender.valida(entrada));
                    Object esperado = json.treeToValue(c.get("esperado"), Object.class);
                    assertEquals(esperado, json.readValue(json.writeValueAsString(OrdemDoAtender.sanear(entrada)), Object.class));
                }));
            }
            return testes.stream();
        }
    }

    @TestFactory
    Stream<DynamicTest> gravarELer() {
        return Stream.of(DynamicTest.dynamicTest("texto gravado volta saneado; nulo e lixo voltam à fábrica", () -> {
            var ordem = OrdemDoAtender.sanear(java.util.Map.of("futuro", java.util.Map.of("veiculo", List.of("porte"))));
            assertEquals(ordem, OrdemDoAtender.deJson(OrdemDoAtender.paraJson(ordem)));
            assertEquals(OrdemDoAtender.padrao(), OrdemDoAtender.deJson(null));
            assertEquals(OrdemDoAtender.padrao(), OrdemDoAtender.deJson("{lixo"));
        }));
    }
}
