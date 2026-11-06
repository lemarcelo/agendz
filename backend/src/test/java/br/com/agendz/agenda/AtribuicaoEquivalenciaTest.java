package br.com.agendz.agenda;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.agendz.erro.ErroDeNegocio;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/** Bloco B1: os MESMOS casos de equivalencia/atribuicao.json que tests-jest/atribuicao.test.mjs roda na API simulada (profissional por serviço → agendamentos em sequência). */
class AtribuicaoEquivalenciaTest {

    private static UUID id(String nome) {
        return UUID.nameUUIDFromBytes(nome.getBytes(StandardCharsets.UTF_8));
    }

    @TestFactory
    Stream<DynamicTest> casos() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/atribuicao.json")) {
            JsonNode casos = new ObjectMapper().readTree(in).get("casos");
            assertTrue(casos.size() >= 9, "casos suficientes para valer como contrato");
            List<DynamicTest> testes = new ArrayList<>();
            for (JsonNode c : casos) {
                testes.add(DynamicTest.dynamicTest("atribuição · " + c.get("nome").asText(), () -> {
                    List<UUID> servicos = new ArrayList<>();
                    c.get("servicos").forEach(x -> servicos.add(id(x.asText())));
                    Map<UUID, UUID> porServico = new LinkedHashMap<>();
                    c.get("porServico").fields().forEachRemaining(e -> porServico.put(id(e.getKey()), id(e.getValue().asText())));
                    if (c.path("erro").asBoolean(false)) {
                        assertThrows(ErroDeNegocio.class, () -> AtribuicaoDeServicos.agrupar(servicos, porServico));
                        return;
                    }
                    List<AtribuicaoDeServicos.Grupo> grupos = AtribuicaoDeServicos.agrupar(servicos, porServico);
                    List<AtribuicaoDeServicos.Grupo> esperado = new ArrayList<>();
                    c.get("grupos").forEach(g -> {
                        List<UUID> s = new ArrayList<>();
                        g.get("s").forEach(x -> s.add(id(x.asText())));
                        esperado.add(new AtribuicaoDeServicos.Grupo(id(g.get("p").asText()), s));
                    });
                    assertEquals(esperado, grupos);
                }));
            }
            return testes.stream();
        }
    }
}
