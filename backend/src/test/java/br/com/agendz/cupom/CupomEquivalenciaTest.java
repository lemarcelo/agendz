package br.com.agendz.cupom;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.agendz.cupom.CupomRegras.Item;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Os MESMOS casos de tests/cupons-equivalencia.test.mjs (equivalencia/cupons.json), sem banco: desconto de cada serviço e leitura da chave. */
class CupomEquivalenciaTest {

    private static JsonNode raiz() throws Exception {
        try (InputStream in = CupomEquivalenciaTest.class.getResourceAsStream("/equivalencia/cupons.json")) {
            return new ObjectMapper().readTree(in);
        }
    }

    private static BigDecimal numero(JsonNode n) {
        return n == null || n.isNull() ? null : new BigDecimal(n.asText());
    }

    @Test
    void osMesmosCasosDaApiSimuladaDaoOMesmoDescontoNoServidor() throws Exception {
        JsonNode casos = raiz().get("descontos");
        assertTrue(casos.size() >= 14, "fixture carregada");
        for (JsonNode c : casos) {
            List<String> cobre = new ArrayList<>();
            c.get("servicoIds").forEach(x -> cobre.add(x.asText()));
            List<Item> itens = new ArrayList<>();
            c.get("itens").forEach(i -> itens.add(new Item(i.get("id").asText(), numero(i.get("valor")))));
            Map<String, BigDecimal> obtido = CupomRegras.descontos(c.get("tipo").asText(), cobre, numero(c.get("percentual")), numero(c.get("valor")), itens);
            JsonNode esperado = c.get("esperado");
            assertEquals(esperado.size(), obtido.size(), c.get("nome").asText() + ": quantidade de serviços com desconto");
            Iterator<Map.Entry<String, JsonNode>> campos = esperado.fields();
            while (campos.hasNext()) {
                Map.Entry<String, JsonNode> e = campos.next();
                BigDecimal valor = obtido.get(e.getKey());
                assertTrue(valor != null && numero(e.getValue()).compareTo(valor) == 0,
                        c.get("nome").asText() + ": esperado " + e.getValue() + " em " + e.getKey() + " e veio " + valor);
            }
        }
    }

    @Test
    void asMesmasChavesSaoAceitasOuRecusadas() throws Exception {
        JsonNode casos = raiz().get("chaves");
        assertTrue(casos.size() >= 10, "fixture carregada");
        for (JsonNode c : casos) {
            String entrada = c.get("entrada").isNull() ? null : c.get("entrada").asText();
            String esperado = c.get("esperado").isNull() ? null : c.get("esperado").asText();
            if (esperado == null) assertNull(CupomRegras.normalizar(entrada), String.valueOf(entrada));
            else assertEquals(esperado, CupomRegras.normalizar(entrada), entrada);
        }
    }

    @Test
    void aChaveGeradaTemOFormatoEUsaSoOAlfabetoSemConfusao() {
        for (int i = 0; i < 200; i++) {
            String k = CupomRegras.gerarChave();
            assertTrue(k.matches("^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$"), k);
            assertEquals(k, CupomRegras.normalizar(k.toLowerCase()));
        }
        assertTrue(CupomRegras.igualConstante("ABCD-EFGH-JKMN", "ABCD-EFGH-JKMN"));
        assertTrue(!CupomRegras.igualConstante("ABCD-EFGH-JKMN", "ABCD-EFGH-JKMM"));
        assertTrue(!CupomRegras.igualConstante("ABCD", "ABCD-EFGH-JKMN"));
    }
}
