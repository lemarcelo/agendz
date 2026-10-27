package br.apex;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.IntegrationTestBase;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;

/** O que se faz no modo desenvolvedor do navegador: editar o corpo da requisição. Espelha security.test.mjs (entrada) e coerencia.test.mjs (finito, ddds, logo). */
class EntradaMaliciosaIT extends IntegrationTestBase {

    @ParameterizedTest(name = "preço {0} é recusado")
    @ValueSource(strings = {"\"0x10\"", "\"1e3\"", "\"12,5\"", "\" \"", "\"Infinity\"", "[5]", "true", "-1", "100001", "null"})
    void precoInvalido(String preco) throws Exception {
        String corpo = "{\"nome\":\"Corte\",\"duracao\":30,\"preco\":" + preco + "}";
        chamar(HttpMethod.POST, "/servicos", token("davi"), corpo).andExpect(status().isBadRequest());
    }

    @Test @DisplayName("duração zero, negativa ou acima de 24 h; lista de serviços vazia, repetida ou com mais de 10")
    void limitesNumericosEListas() throws Exception {
        String dono = token("davi");
        for (int duracao : new int[]{0, -5, 1441}) {
            chamar(HttpMethod.POST, "/servicos", dono, Map.of("nome", "X", "duracao", duracao, "preco", 10)).andExpect(status().isBadRequest());
        }
        for (List<String> ids : List.of(List.<String>of(), List.of("s-lav-detalhada", "s-lav-detalhada"), manyIds(11), List.of("nao-existe"))) {
            chamar(HttpMethod.POST, "/agendamentos", dono, Map.of("clienteId", "c-marcelo", "esteticistaId", "u-pablo", "servicoIds", ids,
                    "inicio", diaUtil(5, "10:00").toString())).andExpect(status().is4xxClientError());
        }
    }

    private static List<String> manyIds(int n) {
        List<String> l = new ArrayList<>();
        for (int i = 0; i < n; i++) l.add("s-" + i);
        return l;
    }

    @Test @DisplayName("DDDs: texto vira número, repetido some; 0, 100, fracionário e texto qualquer são recusados")
    void ddds() throws Exception {
        String dono = token("davi");
        chamar(HttpMethod.PUT, "/estabelecimento", dono, "{\"ddds\":[\"51\",55,\"51\"]}").andExpect(status().isOk());
        for (String ruim : new String[]{"[\"5\"]", "[\"abc\"]", "[0]", "[100]", "[\"01\"]", "[51.5]", "\"x\""}) {
            chamar(HttpMethod.PUT, "/estabelecimento", dono, "{\"ddds\":" + ruim + "}").andExpect(status().isBadRequest());
        }
    }

    @Test @DisplayName("logo: SVG (executa script), arquivo que não é imagem e imagem acima de 100 KB são recusados")
    void logo() throws Exception {
        String dono = token("davi");
        String svg = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=";
        String falsa = "data:image/png;base64," + java.util.Base64.getEncoder().encodeToString("isto nao e um png".getBytes());
        String grande = "data:image/png;base64,iVBORw0KGgo" + "A".repeat(150_000);
        for (String logo : new String[]{svg, falsa, grande}) {
            chamar(HttpMethod.PUT, "/estabelecimento", dono, Map.of("logo", logo)).andExpect(status().is4xxClientError());
        }
        chamar(HttpMethod.PUT, "/estabelecimento", dono, Map.of("corTema", "red;} body{display:none")).andExpect(status().isBadRequest());
    }

    @Test @DisplayName("texto com HTML e script é guardado como texto: a resposta traz o conteúdo sem executar nada (o front escapa)")
    void xssArmazenado() throws Exception {
        String dono = token("davi");
        String nome = "<img src=x onerror=alert(1)>";
        var r = chamar(HttpMethod.POST, "/clientes", dono, Map.of("nome", nome, "telefone", "(55) 99999-1111", "cpf", "529.982.247-25"));
        r.andExpect(status().isCreated());
        // a API devolve application/json (nunca text/html) e com nosniff
        r.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("X-Content-Type-Options", "nosniff"));
        r.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentTypeCompatibleWith("application/json"));
    }

    @Test @DisplayName("texto zalgo (marcas combinantes empilhadas) e caracteres de controle ou de direção invisíveis são normalizados")
    void textoZalgo() throws Exception {
        String dono = token("davi");
        String zalgo = "N" + "́".repeat(40) + "ome‮\u0000";
        var corpo = corpo(chamar(HttpMethod.POST, "/clientes", dono, Map.of("nome", zalgo, "telefone", "(55) 99999-2222", "cpf", "111.444.777-35")).andExpect(status().isCreated()));
        String gravado = corpo.get("nome").asText();
        org.assertj.core.api.Assertions.assertThat(gravado).doesNotContain("‮").doesNotContain("\u0000");
        org.assertj.core.api.Assertions.assertThat(gravado.length()).isLessThan(10);
    }

    @Test @DisplayName("corpo gigante é recusado antes de virar estado (413)")
    void corpoGigante() throws Exception {
        String enorme = "{\"nome\":\"" + "A".repeat(2_000_000) + "\"}";
        chamar(HttpMethod.POST, "/clientes", token("davi"), enorme).andExpect(status().isPayloadTooLarge());
    }

    @Test @DisplayName("data inválida, período maior que 1 ano e faixa de horário invertida em exceções de escala")
    void excecoesDeEscala() throws Exception {
        String dono = token("davi");
        for (Map<String, Object> ex : List.of(
                Map.<String, Object>of("tipo", "folga", "inicio", "2026-13-40", "fim", "2026-13-41"),
                Map.<String, Object>of("tipo", "folga", "inicio", "2026-01-01", "fim", "2028-01-01"),
                Map.<String, Object>of("tipo", "horario", "inicio", "2026-11-02", "fim", "2026-11-02", "faixas", List.of(List.of("18:00", "08:00"))))) {
            chamar(HttpMethod.POST, "/excecoes", dono, Map.of("escopo", "estab", "excecao", ex)).andExpect(status().isBadRequest());
        }
    }

    @Test @DisplayName("ids de agendamentos afetados que não são afetados pela exceção são ignorados (o servidor recalcula)")
    void idsDeAfetadosSaoRecalculados() throws Exception {
        String dono = token("davi");
        String fora = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(10, "10:00"));
        chamar(HttpMethod.POST, "/excecoes", dono, Map.of("escopo", "estab", "destino", "cancelar", "ids", List.of(fora),
                "excecao", Map.of("tipo", "folga", "inicio", diaUtil(3, "10:00").toString().substring(0, 10), "fim", diaUtil(3, "10:00").toString().substring(0, 10))))
                .andExpect(status().isCreated());
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("select status from agendamento where id = ?", String.class, fora)).isNotEqualTo("cancelado");
    }
}
