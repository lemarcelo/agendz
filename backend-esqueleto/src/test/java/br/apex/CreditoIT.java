package br.apex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.IntegrationTestBase;
import br.apex.support.RelogioDeTeste;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Espelha tests/credito.test.mjs e acerto.test.mjs. O crédito só nasce da revisão do esteticista; o cliente só gasta. */
class CreditoIT extends IntegrationTestBase {

    /** Agendamento cancelado com Pix pago de R$ 40: o ponto de partida para o esteticista decidir o destino do valor. */
    private String agendamentoCanceladoComPixPago(String tokenDono) throws Exception {
        String id = criarAgendamento(tokenDono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(6, "10:00"));
        String cobranca = corpo(chamar(HttpMethod.POST, "/agendamentos/" + id + "/cobrancas", tokenDono, Map.of("cpf", "529.982.247-25")))
                .get("id").asText();
        chamar(HttpMethod.POST, "/cobrancas/" + cobranca + "/confirmar-pagamento", tokenDono, Map.of("obs", "recebi")).andExpect(status().isOk());
        chamar(HttpMethod.POST, "/agendamentos/" + id + "/cancelar", tokenDono, null).andExpect(status().isOk());
        return id;
    }

    @Test @DisplayName("o cliente não cria nem estorna crédito: não existe rota do WhatsApp para isso e o saldo começa em zero")
    void clienteNaoCriaCredito() throws Exception {
        doWhatsApp(HttpMethod.POST, "/whatsapp/clientes/c-marcelo/credito", TEL_MARCELO, Map.of("valor", 100)).andExpect(status().isNotFound());
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/qualquer/estornar", TEL_MARCELO, null).andExpect(status().isNotFound());
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes/c-marcelo/credito", TEL_MARCELO, null).andExpect(jsonPath("$.total").value(0));
    }

    @Test @DisplayName("crédito só aparece para o cliente DEPOIS de o esteticista revisar e escolher 'manter como crédito'")
    void soAposARevisao() throws Exception {
        String dono = token("davi");
        String id = agendamentoCanceladoComPixPago(dono);
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes/c-marcelo/credito", TEL_MARCELO, null).andExpect(jsonPath("$.total").value(0));  // pendente de análise
        chamar(HttpMethod.POST, "/agendamentos/" + id + "/valor-pago", dono, Map.of("destino", "credito")).andExpect(status().isOk());
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes/c-marcelo/credito", TEL_MARCELO, null).andExpect(jsonPath("$.total").value(40.0));
        // acertar duas vezes não é possível
        chamar(HttpMethod.POST, "/agendamentos/" + id + "/valor-pago", dono, Map.of("destino", "credito")).andExpect(status().isUnprocessableEntity());
    }

    @Test @DisplayName("validade de 2 meses, até 23:59:59 do último dia; depois expira e não pode mais ser usado")
    void validadeAteOFimDoDia() throws Exception {
        String dono = token("davi");
        chamar(HttpMethod.POST, "/agendamentos/" + agendamentoCanceladoComPixPago(dono) + "/valor-pago", dono, Map.of("destino", "credito"));
        Instant criado = relogio.agora();
        LocalDate ultimoDia = criado.atZone(RelogioDeTeste.SAO_PAULO).toLocalDate().plusMonths(2);
        Instant noite = ZonedDateTime.of(ultimoDia, LocalTime.of(23, 59, 0), RelogioDeTeste.SAO_PAULO).toInstant();
        relogio.definir(noite);
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes/c-marcelo/credito", TEL_MARCELO, null).andExpect(jsonPath("$.total").value(org.hamcrest.Matchers.greaterThan(0.0)));
        relogio.definir(noite.plus(Duration.ofMinutes(2)));
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes/c-marcelo/credito", TEL_MARCELO, null).andExpect(jsonPath("$.total").value(0));
    }

    @Test @DisplayName("usar o crédito: só o da mesma conta que falta cobrar; o resto é pago separadamente e o painel é avisado")
    void usoPelaMesmaConta() throws Exception {
        String dono = token("davi");
        String origem = agendamentoCanceladoComPixPago(dono);
        chamar(HttpMethod.POST, "/agendamentos/" + origem + "/valor-pago", dono, Map.of("destino", "credito")).andExpect(status().isOk());
        // novo horário de R$ 75 (máquina + barba): o crédito de R$ 40 cobre parte e faltam R$ 35
        String novo = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada", "s-lav-motor"), diaUtil(7, "11:00"));
        doWhatsApp(HttpMethod.GET, "/whatsapp/agendamentos/" + novo + "/credito-usavel", TEL_MARCELO, null).andExpect(jsonPath("$.valor").value(40.0));
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + novo + "/usar-credito", TEL_MARCELO, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(40.0)).andExpect(jsonPath("$.falta").value(35.0));
        chamar(HttpMethod.GET, "/avisos", dono, null).andExpect(jsonPath("$[?(@.tipo=='credito_usado')]").isNotEmpty());
        // sem gerar lançamento novo: o crédito não é receita nova
        assertThat(jdbc.queryForObject("select count(*) from lancamento where origem = 'credito'", Integer.class)).isZero();
    }

    @Test @DisplayName("outro número não usa o crédito do Marcelo; crédito de outra conta não é oferecido")
    void usoPorOutroNumero() throws Exception {
        String dono = token("davi");
        String origem = agendamentoCanceladoComPixPago(dono);
        chamar(HttpMethod.POST, "/agendamentos/" + origem + "/valor-pago", dono, Map.of("destino", "credito")).andExpect(status().isOk());
        String novo = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(7, "12:00"));
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + novo + "/usar-credito", "5551987654321", null).andExpect(status().isNotFound());
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + novo + "/usar-credito", TEL_ESTRANGEIRO, null).andExpect(status().isNotFound());
        // TODO: configurar um segundo grupo/conta para um serviço e provar que o crédito da conta A não abate a conta B (valor usável = 0).
    }

    @Test @DisplayName("cancelar um horário pago com crédito devolve o crédito inteiro ao cliente")
    void cancelarDevolveOCredito() throws Exception {
        String dono = token("davi");
        String origem = agendamentoCanceladoComPixPago(dono);
        chamar(HttpMethod.POST, "/agendamentos/" + origem + "/valor-pago", dono, Map.of("destino", "credito")).andExpect(status().isOk());
        String novo = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(7, "15:00"));
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + novo + "/usar-credito", TEL_MARCELO, null).andExpect(status().isOk());
        chamar(HttpMethod.POST, "/agendamentos/" + novo + "/cancelar", dono, null).andExpect(status().isOk());
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes/c-marcelo/credito", TEL_MARCELO, null).andExpect(jsonPath("$.total").value(40.0));
    }

    @Test @DisplayName("cliente não altera serviços de horário já pago com crédito (o esteticista acerta)")
    void edicaoBloqueadaSePagoComCredito() throws Exception {
        String dono = token("davi");
        String origem = agendamentoCanceladoComPixPago(dono);
        chamar(HttpMethod.POST, "/agendamentos/" + origem + "/valor-pago", dono, Map.of("destino", "credito")).andExpect(status().isOk());
        String novo = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(7, "16:00"));
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos/" + novo + "/usar-credito", TEL_MARCELO, null).andExpect(status().isOk());
        doWhatsApp(HttpMethod.PUT, "/whatsapp/agendamentos/" + novo + "/servicos", TEL_MARCELO, Map.of("servicoIds", List.of("s-lav-detalhada", "s-lav-motor")))
                .andExpect(status().isUnprocessableEntity());
    }
}
