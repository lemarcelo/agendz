package br.com.agendz.planos;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.agendz.escala.Fuso;
import br.com.agendz.planos.PlanoRegras.Extrato;
import br.com.agendz.planos.PlanoRegras.Foto;
import br.com.agendz.planos.PlanoRegras.Item;
import br.com.agendz.planos.PlanoRegras.Linha;
import br.com.agendz.planos.PlanoRegras.Pode;
import br.com.agendz.planos.PlanoRegras.Saldo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Os MESMOS casos de tests/planos-equivalencia.test.mjs (equivalencia/planos.json), sem banco: cota, acúmulo, adiantamento, intervalo, atraso, dívida e desconto. */
class PlanosEquivalenciaTest {

    private static JsonNode raiz() throws Exception {
        try (InputStream in = PlanosEquivalenciaTest.class.getResourceAsStream("/equivalencia/planos.json")) {
            return new ObjectMapper().readTree(in);
        }
    }

    private static Instant ts(String iso) {
        return LocalDateTime.parse(iso).atZone(Fuso.BRASIL).toInstant();
    }

    @Test
    void osMesmosCasosDaApiSimuladaDaoACotaDoServidor() throws Exception {
        JsonNode casos = raiz().get("casos");
        assertTrue(casos.size() >= 25, "fixture carregada");
        for (JsonNode c : casos) {
            String nome = c.get("nome").asText();
            JsonNode pl = c.get("plano");
            Foto foto = new Foto(pl.get("nome").asText(), new BigDecimal(pl.get("preco").asText()), pl.get("cortes").asInt(), List.of(UUID.randomUUID()), pl.get("adianta").asInt(),
                    pl.get("acumuloMeses").asInt(), pl.get("intervaloDias").asInt());
            String status = c.get("status").asText();
            String inicioMes = c.get("inicioMes").asText();
            List<String> pagos = new ArrayList<>();
            c.get("pagos").forEach(p -> pagos.add(p.asText()));
            List<Instant> usos = new ArrayList<>();
            for (JsonNode u : c.get("usos")) {
                String mot = u.hasNonNull("motivoCancelamento") ? u.get("motivoCancelamento").asText() : null;
                String origem = u.hasNonNull("origem") ? u.get("origem").asText() : "painel";
                if (PlanoRegras.consomeCorte(u.get("status").asText(), mot, origem)) usos.add(ts(u.get("inicio").asText()));
            }
            Instant agora = ts(c.get("agora").asText());
            JsonNode esp = c.get("esperado");

            Extrato ex = PlanoRegras.extrato(foto, inicioMes, pagos, usos, PlanoRegras.mesDe(agora), List.of());
            JsonNode linhas = esp.get("extrato");
            assertEquals(linhas.size(), ex.linhas().size(), nome + ": meses do extrato");
            for (int i = 0; i < linhas.size(); i++) {
                JsonNode e = linhas.get(i);
                Linha l = ex.linhas().get(i);
                String q = nome + " [" + e.get("mes").asText() + "]";
                assertEquals(e.get("mes").asText(), l.mes(), q);
                assertEquals(e.get("pago").asBoolean(), l.pago(), q + " pago");
                assertEquals(e.get("concedidos").asInt(), l.concedidos(), q + " concedidos");
                assertEquals(e.get("usados").asInt(), l.usados(), q + " usados");
                assertEquals(e.get("saldoFim").asInt(), l.saldoFim(), q + " saldoFim");
                assertEquals(e.get("limite").asInt(), l.limite(), q + " limite");
                assertEquals(e.get("estourou").asBoolean(), l.estourou(), q + " estourou");
                assertEquals(e.get("zerou").asBoolean(), l.zerou(), q + " zerou");
            }
            assertEquals(esp.get("divida").asInt(), PlanoRegras.dividaAoEncerrar(ex), nome + ": dívida");

            Saldo sd = PlanoRegras.saldoAtual(foto, status, inicioMes, pagos, usos, agora);
            JsonNode s = esp.get("saldo");
            assertEquals(s.get("restantes").asInt(), sd.restantes(), nome + ": restantes");
            assertEquals(s.get("usadosNoMes").asInt(), sd.usadosNoMes(), nome + ": usados no mês");
            assertEquals(s.get("maisPermitidos").asInt(), sd.maisPermitidos(), nome + ": mais permitidos");
            assertEquals(s.get("pagoMes").asBoolean(), sd.pagoMes(), nome + ": pago no mês");
            assertEquals(s.get("pagoAte").isNull() ? null : s.get("pagoAte").asText(), sd.pagoAte(), nome + ": pago até");
            assertEquals(s.get("atrasado").asBoolean(), sd.atrasado(), nome + ": atrasado");

            if (esp.has("pode")) {
                Pode p = PlanoRegras.podeUsar(foto, status, inicioMes, pagos, usos, ts(c.get("extra").asText()), agora);
                JsonNode e = esp.get("pode");
                assertEquals(e.get("ok").asBoolean(), p.ok(), nome + ": pode usar");
                if (p.ok()) {
                    assertEquals(e.get("adiantado").asBoolean(), p.adiantado(), nome + ": adiantado");
                    assertEquals(e.get("aviso").asText(), p.aviso(), nome + ": aviso");
                } else {
                    assertEquals(e.get("erro").asText(), p.erro(), nome + ": erro");
                }
            }
        }
    }

    @Test
    void quemGastaCorteEQuemDevolve() throws Exception {
        for (JsonNode c : raiz().get("consomem")) {
            String mot = c.hasNonNull("motivoCancelamento") ? c.get("motivoCancelamento").asText() : null;
            String origem = c.hasNonNull("origem") ? c.get("origem").asText() : "painel";
            assertEquals(c.get("esperado").asBoolean(), PlanoRegras.consomeCorte(c.get("status").asText(), mot, origem), c.toString());
        }
    }

    @Test
    void mesesSomamERotulamComoNoSimulador() throws Exception {
        for (JsonNode c : raiz().get("meses")) {
            assertEquals(c.get("esperado").get("soma").asText(), PlanoRegras.somaMeses(c.get("mes").asText(), c.get("n").asInt()), c.toString());
            assertEquals(c.get("esperado").get("rotulo").asText(), PlanoRegras.rotuloMes(c.get("mes").asText()), c.toString());
        }
    }

    @Test
    void soOQueOPlanoIncluiSaiDeGratis() throws Exception {
        for (JsonNode c : raiz().get("descontos")) {
            // os ids do JSON são rótulos; o servidor trabalha com UUID, então cada rótulo ganha o seu
            Map<String, UUID> ids = new java.util.HashMap<>();
            List<UUID> incluidos = new ArrayList<>();
            c.get("incluidos").forEach(x -> incluidos.add(ids.computeIfAbsent(x.asText(), k -> UUID.randomUUID())));
            List<Item> itens = new ArrayList<>();
            c.get("itens").forEach(i -> itens.add(new Item(ids.computeIfAbsent(i.get("id").asText(), k -> UUID.randomUUID()), new BigDecimal(i.get("valor").asText()))));
            Map<UUID, BigDecimal> obtido = PlanoRegras.descontos(incluidos, itens);
            JsonNode esp = c.get("esperado");
            assertEquals(esp.size(), obtido.size(), c.get("nome").asText());
            esp.fields().forEachRemaining(e -> {
                BigDecimal v = obtido.get(ids.get(e.getKey()));
                assertTrue(v != null && v.compareTo(new BigDecimal(e.getValue().asText())) == 0, c.get("nome").asText() + ": " + e.getKey() + " veio " + v);
            });
        }
    }
}
