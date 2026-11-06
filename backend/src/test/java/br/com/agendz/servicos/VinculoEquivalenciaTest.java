package br.com.agendz.servicos;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/** Bloco A1: os MESMOS casos de equivalencia/vinculo.json que tests-jest/vinculo.test.mjs roda na API simulada (quem realiza todos os serviços do pedido). */
class VinculoEquivalenciaTest {

    private static UUID id(String nome) {
        return UUID.nameUUIDFromBytes(nome.getBytes(StandardCharsets.UTF_8));
    }

    @TestFactory
    Stream<DynamicTest> casos() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/vinculo.json")) {
            JsonNode casos = new ObjectMapper().readTree(in).get("casos");
            assertTrue(casos.size() >= 7, "casos suficientes para valer como contrato");
            List<DynamicTest> testes = new ArrayList<>();
            for (JsonNode c : casos) {
                testes.add(DynamicTest.dynamicTest("vínculo · " + c.get("nome").asText(), () -> {
                    Map<UUID, List<UUID>> porServico = new HashMap<>();
                    c.get("porServico").fields().forEachRemaining(e -> {
                        List<UUID> quem = new ArrayList<>();
                        e.getValue().forEach(x -> quem.add(id(x.asText())));
                        porServico.put(id(e.getKey()), quem);
                    });
                    List<UUID> servicos = new ArrayList<>();
                    c.get("servicos").forEach(x -> servicos.add(id(x.asText())));
                    assertEquals(c.get("esperado").asBoolean(), VinculoServicos.realizaTodos(porServico, id(c.get("profissional").asText()), servicos));
                }));
            }
            return testes.stream();
        }
    }
}
