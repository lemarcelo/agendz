package br.com.agendz.comissao;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** Os MESMOS casos de tests/comissao-equivalencia.test.mjs (equivalencia/comissao.json), sem banco: a ordem serviço > funcionário > estabelecimento. */
class ComissaoEquivalenciaTest {

    private static BigDecimal numero(JsonNode n) {
        return n == null || n.isNull() ? null : new BigDecimal(n.asText());
    }

    @Test
    void osMesmosCasosDaApiSimuladaDaoOMesmoPercentualNoServidor() throws Exception {
        JsonNode raiz;
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/comissao.json")) {
            raiz = new ObjectMapper().readTree(in);
        }
        JsonNode casos = raiz.get("casos");
        assertTrue(casos.size() >= 15, "fixture carregada");
        for (JsonNode c : casos) {
            BigDecimal obtido = Comissao.percentual(numero(c.get("estabelecimento").get("comissaoPadrao")), c.get("usuario").get("papel").asText(),
                    numero(c.get("usuario").get("comissaoPct")), numero(c.get("servico").get("comissaoPct")));
            BigDecimal esperado = new BigDecimal(c.get("esperado").asText());
            assertEquals(0, esperado.compareTo(obtido), c.get("nome").asText() + ": esperado " + esperado + " e veio " + obtido);
        }
    }
}
