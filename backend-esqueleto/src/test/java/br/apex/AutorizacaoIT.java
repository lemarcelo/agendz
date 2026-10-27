package br.apex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.IntegrationTestBase;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Espelha tests/security.test.mjs: autorização na API (não só na tela), IDOR e mass assignment. */
class AutorizacaoIT extends IntegrationTestBase {

    @Test @DisplayName("esteticista não vê, remarca, cancela nem cobra agendamento de outro esteticista (404, não 403)")
    void esteticistaSoMexeNoProprio() throws Exception {
        String dono = token("davi"), pablo = token("pablo"), marcelo = token("marcelo");
        String id = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(5, "10:00"));

        chamar(HttpMethod.POST, "/agendamentos/" + id + "/cancelar", marcelo, null).andExpect(status().isNotFound());
        chamar(HttpMethod.PUT, "/agendamentos/" + id + "/status", marcelo, Map.of("status", "confirmado")).andExpect(status().isNotFound());
        chamar(HttpMethod.POST, "/agendamentos/" + id + "/cobrancas", marcelo, Map.of("cpf", "391.847.260-40")).andExpect(status().isNotFound());
        chamar(HttpMethod.GET, "/agendamentos?esteticistaId=u-pablo", marcelo, null).andExpect(jsonPath("$.length()").value(0));
        chamar(HttpMethod.GET, "/agendamentos?esteticistaId=u-pablo", pablo, null).andExpect(status().isOk());
    }

    @Test @DisplayName("esteticista não passa o agendamento para outro esteticista nem agenda na agenda alheia")
    void esteticistaNaoRepassa() throws Exception {
        String pablo = token("pablo");
        chamar(HttpMethod.POST, "/agendamentos", pablo, Map.of("clienteId", "c-marcelo", "esteticistaId", "u-marcelo",
                "servicoIds", List.of("s-lav-detalhada"), "inicio", diaUtil(5, "10:00").toString())).andExpect(status().isForbidden());
        String id = criarAgendamento(pablo, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(5, "11:00"));
        chamar(HttpMethod.PUT, "/agendamentos/" + id + "/remarcar", pablo, Map.of("esteticistaId", "u-marcelo",
                "inicio", diaUtil(5, "11:00").toString())).andExpect(status().isForbidden());
    }

    @Test @DisplayName("seções restritas: esteticista e admin sem permissão recebem 403 no financeiro, estoque, serviços e estabelecimento")
    void secoesRestritas() throws Exception {
        String pablo = token("pablo");
        chamar(HttpMethod.GET, "/financeiro/lancamentos", pablo, null).andExpect(status().isForbidden());
        chamar(HttpMethod.POST, "/materiais", pablo, Map.of("nome", "Pomada", "unidade", "g")).andExpect(status().isForbidden());
        chamar(HttpMethod.POST, "/servicos", pablo, Map.of("nome", "Teste", "duracao", 30, "preco", 10)).andExpect(status().isForbidden());
        chamar(HttpMethod.PUT, "/estabelecimento", pablo, Map.of("nome", "Hackeada")).andExpect(status().isForbidden());
        // TODO: criar um admin SEM a seção financeiro no seed de teste e provar o mesmo para ele.
    }

    @Test @DisplayName("acerto do valor pago como despesa exige a seção Financeiro; crédito só exige o agendamento")
    void acertoComoDespesaExigeFinanceiro() throws Exception {
        String pablo = token("pablo");
        String id = criarAgendamento(pablo, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(6, "10:00"));
        chamar(HttpMethod.POST, "/agendamentos/" + id + "/valor-pago", pablo, Map.of("destino", "despesa")).andExpect(status().isForbidden());
        // com pagamento registrado, "credito" e "fora" passam pela regra do agendamento (aqui ainda não há valor pago: 422, não 403)
        chamar(HttpMethod.POST, "/agendamentos/" + id + "/valor-pago", pablo, Map.of("destino", "credito")).andExpect(status().isUnprocessableEntity());
    }

    @Test @DisplayName("mass assignment: campo desconhecido é 400; id, papel e permissões nunca vêm do corpo")
    void massAssignment() throws Exception {
        String dono = token("davi");
        chamar(HttpMethod.POST, "/clientes", dono, Map.of("nome", "Novo", "telefone", "(55) 99999-0000", "papel", "dono")).andExpect(status().isBadRequest());
        chamar(HttpMethod.POST, "/usuarios", dono, Map.of("nome", "X", "apelido", "x", "cpf", "529.982.247-25", "email", "x@x.com",
                "senha", "1234", "papel", "superadmin")).andExpect(status().isBadRequest());
        chamar(HttpMethod.POST, "/servicos", dono, Map.of("nome", "Corte", "duracao", 30, "preco", 40, "id", "s-lav-detalhada")).andExpect(status().isBadRequest());
    }

    @Test @DisplayName("só o dono gerencia a equipe; ninguém remove a si mesmo nem o último dono")
    void equipe() throws Exception {
        String pablo = token("pablo"), dono = token("davi");
        chamar(HttpMethod.DELETE, "/usuarios/u-marcelo", pablo, null).andExpect(status().isForbidden());
        chamar(HttpMethod.DELETE, "/usuarios/u-davi", dono, null).andExpect(status().isUnprocessableEntity());
    }

    @Test @DisplayName("respostas nunca trazem senha, hash nem CPF completo de pedido de vínculo")
    void semSegredosNasRespostas() throws Exception {
        String dono = token("davi");
        String usuarios = chamar(HttpMethod.GET, "/usuarios", dono, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(usuarios).doesNotContainIgnoringCase("senha").doesNotContain("$2a$");
        String vinculos = chamar(HttpMethod.GET, "/clientes/vinculos", dono, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(vinculos).doesNotContainPattern("\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}");
    }
}
