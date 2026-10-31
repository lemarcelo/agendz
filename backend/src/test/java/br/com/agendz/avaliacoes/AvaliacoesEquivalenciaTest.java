package br.com.agendz.avaliacoes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Os MESMOS casos de tests/avaliacoes-equivalencia.test.mjs (equivalencia/avaliacoes.json), sem banco: nota, texto, anonimato, motivo, modelo, média, período e WhatsApp. */
class AvaliacoesEquivalenciaTest {

    private static JsonNode raiz() throws Exception {
        try (InputStream in = AvaliacoesEquivalenciaTest.class.getResourceAsStream("/equivalencia/avaliacoes.json")) {
            return new ObjectMapper().readTree(in);
        }
    }

    @Test
    void notaTextoEAnonimato() throws Exception {
        JsonNode casos = raiz().get("validar");
        assertTrue(casos.size() >= 20, "fixture carregada");
        for (JsonNode c : casos) {
            JsonNode entrada = c.get("entrada");
            if (c.has("repetirTexto") && entrada.isObject()) {
                ObjectNode copia = ((ObjectNode) entrada).deepCopy();
                copia.put("texto", "a".repeat(c.get("repetirTexto").asInt()));
                entrada = copia;
            }
            AvaliacaoRegras.Validada v = AvaliacaoRegras.validar(entrada);
            JsonNode esp = c.get("esperado");
            String nome = c.get("nome").asText();
            assertEquals(esp.get("ok").asBoolean(), v.ok(), nome);
            if (v.ok()) {
                assertEquals(esp.get("dados").get("nota").asInt(), v.nota(), nome);
                assertEquals(esp.get("dados").get("texto").asText(), v.texto(), nome);
                assertEquals(esp.get("dados").get("anonimo").asBoolean(), v.anonimo(), nome);
            } else {
                assertEquals(esp.get("erro").asText(), v.erro(), nome);
            }
        }
    }

    @Test
    void motivoDeOcultar() throws Exception {
        for (JsonNode c : raiz().get("motivo")) {
            String entrada = c.has("repetir") ? "a".repeat(c.get("repetir").asInt()) : c.get("entrada").isTextual() ? c.get("entrada").asText() : null;
            String m = AvaliacaoRegras.motivo(entrada);
            JsonNode esp = c.get("esperado");
            assertEquals(esp.get("ok").asBoolean(), m != null, c.get("nome").asText());
            if (m != null) assertEquals(esp.get("motivo").asText(), m, c.get("nome").asText());
        }
    }

    @Test
    void modeloDaMensagemEmLote() throws Exception {
        for (JsonNode c : raiz().get("modelo")) {
            String modelo = c.has("repetir") ? "a".repeat(c.get("repetir").asInt()) : c.get("modelo").isNull() ? null : c.get("modelo").asText();
            String erro = AvaliacaoRegras.validarModelo(modelo, c.get("tipo").asText());
            JsonNode esp = c.get("esperado");
            String nome = c.get("nome").asText();
            assertEquals(esp.get("ok").asBoolean(), erro == null, nome);
            if (erro != null) assertEquals(esp.get("erro").asText(), erro, nome);
            else assertEquals(esp.get("modelo").asText(), AvaliacaoRegras.modeloLimpo(modelo), nome);
        }
    }

    @Test
    void aplicarOModelo() throws Exception {
        for (JsonNode c : raiz().get("aplicar")) {
            JsonNode d = c.get("dados");
            String nome = d.get("nome").isNull() ? null : d.get("nome").asText();
            assertEquals(c.get("esperado").asText(), AvaliacaoRegras.aplicarModelo(c.get("modelo").asText(), nome, d.get("loja").asText(), d.get("link").asText()), c.get("nome").asText());
        }
    }

    @Test
    void mediaEDistribuicao() throws Exception {
        for (JsonNode c : raiz().get("resumo")) {
            List<Integer> notas = new ArrayList<>();
            c.get("notas").forEach(n -> notas.add(n.asInt()));
            AvaliacaoRegras.Resumo r = AvaliacaoRegras.resumir(notas);
            JsonNode esp = c.get("esperado");
            assertEquals(esp.get("total").asInt(), r.total());
            if (esp.get("media").isNull()) assertNull(r.media());
            else assertEquals(esp.get("media").asDouble(), r.media(), 0.0001, c.get("notas").toString());
            for (int i = 0; i < 5; i++) assertEquals(esp.get("distribuicao").get(i).asInt(), r.distribuicao()[i]);
        }
    }

    @Test
    void periodo() throws Exception {
        for (JsonNode c : raiz().get("periodo")) {
            AvaliacaoRegras.Periodo p = AvaliacaoRegras.periodo(c.get("de").isNull() ? null : c.get("de").asText(), c.get("ate").isNull() ? null : c.get("ate").asText());
            JsonNode esp = c.get("esperado");
            String nome = c.get("nome").asText();
            if (esp.has("erro")) assertEquals(esp.get("erro").asText(), p.erro(), nome);
            else {
                assertNull(p.erro(), nome);
                assertEquals(esp.get("semLimite").asBoolean(), p.semLimite(), nome);
            }
        }
    }

    @Test
    void telefoneDoWhatsapp() throws Exception {
        JsonNode casos = raiz().get("whatsapp");
        assertFalse(casos.isEmpty());
        for (JsonNode c : casos) {
            String tel = c.get("telefone").isNull() ? null : c.get("telefone").asText();
            assertEquals(c.get("numero").asText(), AvaliacaoRegras.numeroWhatsapp(tel), c.get("nome").asText());
            assertEquals(c.get("mascarado").asText(), AvaliacaoRegras.telefoneMascarado(tel), c.get("nome").asText());
        }
    }
}
