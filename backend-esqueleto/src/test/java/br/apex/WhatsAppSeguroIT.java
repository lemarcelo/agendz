package br.apex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.Assinaturas;
import br.apex.support.IntegrationTestBase;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Espelha tests/cancelar.test.mjs, security.test.mjs (porta do WhatsApp) e coerencia.test.mjs (remetente estrangeiro, remarcar+cancelar). */
class WhatsAppSeguroIT extends IntegrationTestBase {

    private String agendamentoDoMarcelo(int dias) throws Exception {
        return criarAgendamento(token("davi"), "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(dias, "10:00"));
    }

    @Test @DisplayName("webhook sem assinatura ou com assinatura errada é recusado (401)")
    void assinaturaDoWebhook() throws Exception {
        String id = agendamentoDoMarcelo(5);
        mvc.perform(MockMvcRequestBuilders.post("/whatsapp/agendamentos/" + id + "/cancelar").contentType(MediaType.APPLICATION_JSON)
                .header("X-Remetente-WhatsApp", TEL_MARCELO)).andExpect(status().isUnauthorized());
        mvc.perform(MockMvcRequestBuilders.post("/whatsapp/agendamentos/" + id + "/cancelar").contentType(MediaType.APPLICATION_JSON)
                .header("X-Remetente-WhatsApp", TEL_MARCELO)
                .header("X-Hub-Signature-256", Assinaturas.hmacSha256("segredo-errado", ""))).andExpect(status().isUnauthorized());
    }

    @Test @DisplayName("só o dono do número age: outro número, vazio ou id inexistente recebem 404 e nada muda")
    void soODonoDoNumero() throws Exception {
        String id = agendamentoDoMarcelo(5);
        for (String outro : new String[]{"5551987654321", "", "123"}) {
            doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/cancelar", outro, null).andExpect(status().isNotFound());
            doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/confirmar", outro, null).andExpect(status().isNotFound());
        }
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/zzz/cancelar", TEL_MARCELO, null).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select status from agendamento where id = ?", String.class, id)).isNotEqualTo("cancelado");
    }

    @Test @DisplayName("número de outro país (11 dígitos sem o 55, ex.: +51 Peru) não vira o DDD do RS nem acha cadastro")
    void remetenteEstrangeiro() throws Exception {
        String id = agendamentoDoMarcelo(5);
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/cancelar", TEL_ESTRANGEIRO, null).andExpect(status().isNotFound());
        doWhatsApp(HttpMethod.GET, "/whatsapp/agendamentos", TEL_ESTRANGEIRO, null).andExpect(jsonPath("$.length()").value(0));
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes", "51995883374", null).andExpect(status().isNotFound());
        // e cai na resposta de DDD fora da área, que fica registrada
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos", "5199588337", Map.of("nome", "Turista", "servicoIds", List.of("s-lav-detalhada"),
                "inicio", diaUtil(5, "11:00").toString())).andExpect(status().isUnprocessableEntity());
    }

    @Test @DisplayName("o número vem do canal, nunca do corpo: telefone enviado no JSON é ignorado")
    void telefoneDoCorpoEhIgnorado() throws Exception {
        String id = agendamentoDoMarcelo(5);
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/cancelar", "5551987654321", Map.of("telefone", TEL_MARCELO))
                .andExpect(status().isNotFound());
    }

    @Test @DisplayName("cancelar: com 24 h ou mais cancela (exatamente 24 h vale); com menos é recusado na hora do clique")
    void prazoDe24Horas() throws Exception {
        String id = agendamentoDoMarcelo(5);
        Instant inicio = jdbc.queryForObject("select inicio from agendamento where id = ?", java.sql.Timestamp.class, id).toInstant();
        relogio.definir(inicio.minus(Duration.ofHours(20)));
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/cancelar", TEL_MARCELO, null)
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("menos de 24 horas")));
        relogio.definir(inicio.minus(Duration.ofHours(24)));
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/cancelar", TEL_MARCELO, null).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select motivo_cancelamento from agendamento where id = ?", String.class, id)).isEqualTo("cliente");
    }

    @Test @DisplayName("remarcar dentro das 24 h e cancelar em seguida não contorna a regra")
    void remarcarNaoContornaOPrazo() throws Exception {
        String id = agendamentoDoMarcelo(5);
        Instant inicio = jdbc.queryForObject("select inicio from agendamento where id = ?", java.sql.Timestamp.class, id).toInstant();
        relogio.definir(inicio.minus(Duration.ofHours(10)));
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/remarcar", TEL_MARCELO, Map.of("inicio", diaUtil(8, "11:00").toString()))
                .andExpect(status().isOk());
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + id + "/cancelar", TEL_MARCELO, null).andExpect(status().isUnprocessableEntity());
    }

    @Test @DisplayName("editar CPF para o de outro cliente é recusado sem dizer de quem é; trocar telefone pelo WhatsApp não existe")
    void editarMeusDados() throws Exception {
        doWhatsApp(HttpMethod.PUT, "/whatsapp/clientes/c-marcelo", TEL_MARCELO, Map.of("cpf", "COPIAR-O-CPF-DO-IGOR"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("Igor"))));
        doWhatsApp(HttpMethod.PUT, "/whatsapp/clientes/c-marcelo", TEL_MARCELO, Map.of("telefone", "(55) 90000-0000")).andExpect(status().isBadRequest());
    }

    @Test @DisplayName("cliente novo com CPF de cadastro existente NÃO é criado: vira pedido de vínculo, com a mesma resposta em qualquer caso")
    void vinculoDeNumeroNovo() throws Exception {
        String cpfDoMarcelo = jdbc.queryForObject("select cpf from cliente where id = 'c-marcelo'", String.class);
        var r = doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos", "5555981230000", Map.of("nome", "Alguém", "cpf", cpfDoMarcelo,
                "servicoIds", List.of("s-lav-detalhada"), "inicio", diaUtil(5, "16:00").toString())).andExpect(status().isAccepted());
        assertThat(r.andReturn().getResponse().getContentAsString()).doesNotContain("Marcelo");
        assertThat(jdbc.queryForObject("select count(*) from pedido_vinculo where status = 'pendente'", Integer.class)).isEqualTo(1);
    }
}
