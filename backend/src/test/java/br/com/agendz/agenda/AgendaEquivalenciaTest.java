package br.com.agendz.agenda;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import br.com.agendz.BaseApi;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Equivalência simulada × real da agenda (F2 parte 5a): os MESMOS casos de equivalencia/agenda.json que a API simulada executa em
 * tests/agenda-equivalencia.test.mjs. Cenário na barbearia Dalforno (sem veículo nem box). Só o último passo é conferido.
 */
class AgendaEquivalenciaTest extends BaseApi {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");

    @Autowired
    JdbcTemplate jdbc;

    private final ObjectMapper om = new ObjectMapper();

    @AfterEach
    void limpar() {
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento");
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
        jdbc.update("delete from usuario where lower(apelido) like 'eqag%'");
        jdbc.update("delete from escala_faixa");
    }

    private MvcResult enviar(MockHttpServletRequestBuilder req, String token, String corpo) throws Exception {
        return mvc.perform(req.with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo)).andReturn();
    }

    private String idDe(MvcResult r, String onde) throws Exception {
        String s = r.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertTrue(r.getResponse().getStatus() < 300, onde + ": " + s);
        JsonNode n = om.readTree(s);
        return n.has("usuario") && n.get("usuario").isObject() ? n.get("usuario").get("id").asText() : n.get("id").asText();
    }

    /** "quando" = semanas à frente, dia da semana (0 domingo) e hora no fuso de São Paulo. */
    private String quando(JsonNode q) {
        LocalDate hoje = LocalDate.now(SP).plusWeeks(q.get("semanas").asInt());
        int dow = q.get("dow").asInt();
        DayOfWeek alvo = dow == 0 ? DayOfWeek.SUNDAY : DayOfWeek.of(dow);
        LocalDate dia = hoje.with(TemporalAdjusters.nextOrSame(alvo));
        Instant i = dia.atTime(LocalTime.parse(q.get("hora").asText())).atZone(SP).toInstant();
        return i.toString();
    }

    @Test
    void osMesmosCasosDaApiSimuladaDaoOMesmoResultadoNoServidor() throws Exception {
        JsonNode raiz;
        try (InputStream in = getClass().getResourceAsStream("/equivalencia/agenda.json")) {
            raiz = om.readTree(in);
        }
        JsonNode cenario = raiz.get("cenario");
        JsonNode casos = raiz.get("casos");
        assertTrue(casos.size() >= 30, "fixture carregada");
        String alanToken = token(DALFORNO, "alan");
        String alanId = jdbc.queryForObject("select id::text from usuario where identificador = 'alan' and loja_id = '00000000-0000-0000-0000-0000000000b1'::uuid", String.class);
        StringBuilder falhas = new StringBuilder();
        for (JsonNode caso : casos) {
            String nome = caso.get("nome").asText();
            limpar();
            // cenário: expediente da loja, clientes, serviços e o segundo profissional
            ObjectNode semana = om.createObjectNode();
            cenario.get("escala").fields().forEachRemaining(e -> {
                ObjectNode dia = semana.putObject(e.getKey());
                dia.put("aberto", true);
                dia.set("faixas", e.getValue());
            });
            ObjectNode escala = om.createObjectNode();
            escala.set("semana", semana);
            assertTrue(enviar(put("/api/estabelecimento/escala"), alanToken, escala.toString()).getResponse().getStatus() < 300, "escala");
            Map<String, String> clientes = new HashMap<>();
            cenario.get("clientes").fields().forEachRemaining(e -> {
                try {
                    clientes.put(e.getKey(), idDe(enviar(post("/api/clientes"), alanToken, e.getValue().toString()), "cliente " + e.getKey()));
                } catch (Exception ex) {
                    throw new IllegalStateException(ex);
                }
            });
            Map<String, String> servicos = new HashMap<>();
            cenario.get("servicos").fields().forEachRemaining(e -> {
                try {
                    servicos.put(e.getKey(), idDe(enviar(post("/api/servicos"), alanToken, e.getValue().toString()), "serviço " + e.getKey()));
                } catch (Exception ex) {
                    throw new IllegalStateException(ex);
                }
            });
            ObjectNode pessoa = cenario.get("profissional").deepCopy();
            pessoa.put("papel", "profissional");
            Map<String, String> profs = new HashMap<>();
            profs.put("alan", alanId);
            profs.put("pro", idDe(enviar(post("/api/usuarios"), alanToken, pessoa.toString()), "profissional"));

            List<String> ids = new ArrayList<>();
            JsonNode passos = caso.get("passos");
            MvcResult ultimo = null;
            for (int i = 0; i < passos.size(); i++) {
                JsonNode p = passos.get(i);
                String op = p.get("op").asText();
                String id = null;
                if (op.equals("criar")) {
                    ObjectNode c = om.createObjectNode();
                    c.put("clienteId", p.get("cliente").asText().equals("@nenhum") ? "00000000-0000-0000-0000-000000000999" : clientes.get(p.get("cliente").asText()));
                    c.put("profissionalId", profs.get(p.get("prof").asText()));
                    var lista = c.putArray("servicoIds");
                    for (JsonNode s : p.get("servicos")) lista.add(s.asText().equals("@nenhum") ? "00000000-0000-0000-0000-000000000998" : servicos.get(s.asText()));
                    c.put("inicio", quando(p.get("quando")));
                    if (p.has("status")) c.put("status", p.get("status").asText());
                    if (p.has("encaixe")) c.put("encaixe", true);
                    ultimo = enviar(post("/api/agendamentos"), alanToken, c.toString());
                    if (ultimo.getResponse().getStatus() < 300) id = om.readTree(ultimo.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("id").asText();
                } else if (op.equals("remarcar")) {
                    ObjectNode c = om.createObjectNode();
                    c.put("inicio", quando(p.get("quando")));
                    if (p.has("prof")) c.put("profissionalId", profs.get(p.get("prof").asText()));
                    ultimo = enviar(put("/api/agendamentos/" + alvo(p.get("alvo").asText(), ids) + "/remarcar"), alanToken, c.toString());
                } else if (op.equals("status")) {
                    ultimo = enviar(put("/api/agendamentos/" + alvo(p.get("alvo").asText(), ids) + "/status"), alanToken, "{\"status\":\"" + p.get("status").asText() + "\"}");
                } else if (op.equals("desativarServico")) {
                    JsonNode s = cenario.get("servicos").get(p.get("servico").asText());
                    ObjectNode c = s.deepCopy();
                    c.put("ativo", false);
                    ultimo = enviar(put("/api/servicos/" + servicos.get(p.get("servico").asText())), alanToken, c.toString());
                } else if (op.equals("desativarProf")) {
                    ultimo = enviar(put("/api/usuarios/" + profs.get(p.get("prof").asText()) + "/atendimento"), alanToken, "{\"atende\":false}");
                } else {
                    throw new IllegalStateException("passo desconhecido: " + op);
                }
                ids.add(id);
                if (i < passos.size() - 1 && ultimo.getResponse().getStatus() >= 300) {
                    falhas.append("\n- ").append(nome).append(": passo ").append(i + 1).append(" falhou: ").append(ultimo.getResponse().getContentAsString(StandardCharsets.UTF_8));
                }
            }
            JsonNode esperado = caso.get("esperado");
            int status = ultimo.getResponse().getStatus();
            String corpo = ultimo.getResponse().getContentAsString(StandardCharsets.UTF_8);
            if (esperado.get("ok").asBoolean()) {
                if (status >= 300) falhas.append("\n- ").append(nome).append(": esperava dar certo e veio ").append(status).append(" ").append(corpo);
                else if (esperado.has("estado")) conferirEstado(nome, esperado.get("estado"), ids, alanToken, falhas);
            } else {
                String msg = esperado.get("erro").asText();
                if (status < 400 || status >= 500 || !corpo.contains("\"mensagem\":" + om.writeValueAsString(msg))) {
                    falhas.append("\n- ").append(nome).append(": esperava recusar com \"").append(msg).append("\" e veio ").append(status).append(" ").append(corpo);
                }
            }
        }
        assertEquals("", falhas.toString(), "casos que divergem da API simulada");
    }

    /** Estado do agendamento "@n" depois do último passo: status, motivo, reagendado e os eventos de status/profissional. */
    private void conferirEstado(String nome, JsonNode est, List<String> ids, String token, StringBuilder falhas) throws Exception {
        MvcResult r = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/agendamentos/" + alvo(est.get("alvo").asText(), ids))
                .with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(token))).andReturn();
        JsonNode a = om.readTree(r.getResponse().getContentAsString(StandardCharsets.UTF_8));
        if (!est.get("status").asText().equals(a.path("status").asText())) falhas.append("\n- ").append(nome).append(": status ").append(a.path("status").asText());
        String motivo = est.get("motivo").isNull() ? null : est.get("motivo").asText();
        String veio = a.hasNonNull("motivoCancelamento") ? a.get("motivoCancelamento").asText() : null;
        if (motivo == null ? veio != null : !motivo.equals(veio)) falhas.append("\n- ").append(nome).append(": motivo ").append(veio);
        if (est.get("reagendado").asBoolean() != a.path("reagendado").asBoolean()) falhas.append("\n- ").append(nome).append(": reagendado ").append(a.path("reagendado").asBoolean());
        List<String> esperados = new ArrayList<>();
        for (JsonNode e : est.get("eventos")) esperados.add(e.get(0).asText() + "|" + e.get(1).asText() + "|" + e.get(2).asText());
        List<String> reais = new ArrayList<>();
        for (JsonNode e : a.path("historico")) {
            String campo = e.path("campo").asText();
            if (campo.equals("status") || campo.equals("profissional")) reais.add(campo + "|" + e.path("de").asText() + "|" + e.path("para").asText());
        }
        if (!esperados.equals(reais)) falhas.append("\n- ").append(nome).append(": eventos ").append(reais).append(" em vez de ").append(esperados);
    }

    private String alvo(String ref, List<String> ids) {
        if (ref.equals("@nenhum")) return "00000000-0000-0000-0000-000000000997";
        return ids.get(Integer.parseInt(ref.substring(1)) - 1);
    }
}
