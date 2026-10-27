package br.apex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.Assinaturas;
import br.apex.support.IntegrationTestBase;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Espelha tests/conflitos.test.mjs (Pix pago duas vezes gera um só crédito) e o item "webhook do banco" da segurança. */
class PixWebhookIT extends IntegrationTestBase {

    private String corpoPix(String txid, String e2eid, String cpf, String valor) throws Exception {
        return json.writeValueAsString(Map.of("pix", List.of(Map.of("txid", txid, "endToEndId", e2eid, "valor", valor, "pagador", Map.of("cpf", cpf)))));
    }

    private org.springframework.test.web.servlet.ResultActions webhook(String corpo, String segredo) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/webhooks/pix").contentType(MediaType.APPLICATION_JSON).content(corpo)
                .header("X-Assinatura-Pix", Assinaturas.hmacSha256(segredo, corpo)));
    }

    private String cobrancaPendente() throws Exception {
        String dono = token("davi");
        String ag = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(5, "10:00"));
        return corpo(chamar(HttpMethod.POST, "/agendamentos/" + ag + "/cobrancas", dono, Map.of("cpf", "529.982.247-25"))).get("txid").asText();
    }

    @Test @DisplayName("webhook sem assinatura ou com assinatura errada é recusado e não confirma nada")
    void assinaturaObrigatoria() throws Exception {
        String txid = cobrancaPendente();
        String corpo = corpoPix(txid, "E2E-1", "52998224725", "40.00");
        mvc.perform(MockMvcRequestBuilders.post("/webhooks/pix").contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isUnauthorized());
        webhook(corpo, "segredo-errado").andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("select count(*) from cobranca where status = 'paga'", Integer.class)).isZero();
    }

    @Test @DisplayName("o mesmo Pix avisado duas vezes (mesmo e2eid) gera um só pagamento e um só crédito de receita")
    void idempotenciaPorE2eid() throws Exception {
        String txid = cobrancaPendente();
        String corpo = corpoPix(txid, "E2E-DUP", "52998224725", "40.00");
        webhook(corpo, "segredo-pix-de-teste").andExpect(status().isOk());
        webhook(corpo, "segredo-pix-de-teste").andExpect(status().isOk());          // repetição é aceita, mas não duplica
        assertThat(jdbc.queryForObject("select count(*) from lancamento where origem = 'pix'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from cobranca where status = 'paga'", Integer.class)).isEqualTo(1);
    }

    @Test @DisplayName("Pix com CPF ou valor diferente não confirma sozinho: vai para 'Precisa de autorização'")
    void divergenciaPrecisaDeAutorizacao() throws Exception {
        String txid = cobrancaPendente();
        webhook(corpoPix(txid, "E2E-CPF", "11144477735", "40.00"), "segredo-pix-de-teste").andExpect(status().isOk());
        webhook(corpoPix(txid, "E2E-VAL", "52998224725", "10.00"), "segredo-pix-de-teste").andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from cobranca where status = 'paga'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from extrato where situacao = 'precisa_autorizacao'", Integer.class)).isEqualTo(2);
    }

    @Test @DisplayName("cobrança cancelada não vira paga por um webhook atrasado")
    void canceladaNaoViraPaga() throws Exception {
        String dono = token("davi");
        String ag = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(5, "11:00"));
        var cob = corpo(chamar(HttpMethod.POST, "/agendamentos/" + ag + "/cobrancas", dono, Map.of("cpf", "529.982.247-25")));
        chamar(HttpMethod.DELETE, "/cobrancas/" + cob.get("id").asText(), dono, null).andExpect(status().isOk());
        webhook(corpoPix(cob.get("txid").asText(), "E2E-LATE", "52998224725", "40.00"), "segredo-pix-de-teste").andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select status from cobranca where id = ?", String.class, cob.get("id").asText())).isEqualTo("cancelada");
    }

    @Test @DisplayName("a rota do banco simulado não existe em produção")
    void bancoSimuladoNaoExiste() throws Exception {
        chamar(HttpMethod.POST, "/banco/pix/pagar", token("davi"), Map.of("valor", 40)).andExpect(status().isNotFound());
        chamar(HttpMethod.POST, "/banco/movimentos", token("davi"), Map.of("valor", 40)).andExpect(status().isNotFound());
    }

    @Test @DisplayName("as credenciais da API Pix nunca voltam na resposta")
    void segredoNaoVolta() throws Exception {
        String dono = token("davi");
        chamar(HttpMethod.PUT, "/financeiro/contas/conta-principal/api-pix", dono, Map.of("banco", "sicredi", "clientId", "id-123", "clientSecret", "SEGREDO-DO-BANCO", "ambiente", "homologacao"));
        String resposta = chamar(HttpMethod.GET, "/financeiro/contas", dono, null).andReturn().getResponse().getContentAsString();
        assertThat(resposta).doesNotContain("SEGREDO-DO-BANCO");
    }
}
