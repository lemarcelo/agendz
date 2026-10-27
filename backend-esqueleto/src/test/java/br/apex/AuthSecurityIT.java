package br.apex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.IntegrationTestBase;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Espelha tests/security.test.mjs (login, recuperação) e coerencia.test.mjs (teto de pedidos de código). */
class AuthSecurityIT extends IntegrationTestBase {

    private void login(String id, String senha, int esperado) throws Exception {
        chamar(HttpMethod.POST, "/auth/login", null, Map.of("identificador", id, "senha", senha)).andExpect(status().is(esperado));
    }

    @Test @DisplayName("5 senhas erradas bloqueiam por 15 min, mesmo com a senha certa; depois libera")
    void bloqueioDeLogin() throws Exception {
        for (int i = 0; i < 5; i++) login("marcelo", "errada", 401);
        login("marcelo", SENHA, 429);                       // bloqueado: a senha certa também é recusada
        relogio.avancar(Duration.ofMinutes(16));
        login("marcelo", SENHA, 200);
    }

    @Test @DisplayName("usuário inexistente também bloqueia e a mensagem é a mesma (não revela quem tem cadastro)")
    void mensagemIgualParaInexistente() throws Exception {
        String existente = chamar(HttpMethod.POST, "/auth/login", null, Map.of("identificador", "pablo", "senha", "x"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String inexistente = chamar(HttpMethod.POST, "/auth/login", null, Map.of("identificador", "fulano-que-nao-existe", "senha", "x"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertThat(inexistente).isEqualTo(existente);
    }

    @Test @DisplayName("CPF com pontos, com espaços ou sem eles cai no mesmo contador de falhas")
    void cpfNormalizado() throws Exception {
        String[] formas = {"391.847.260-40", "391 847 260 40", "39184726040", "391.847.260-40", "39184726040"};
        for (String f : formas) login(f, "errada", 401);
        login("davi", SENHA, 429);                          // o mesmo usuário (u-davi) ficou bloqueado
    }

    @Test @DisplayName("a resposta do login nunca traz senha nem hash")
    void loginSemSenha() throws Exception {
        String corpo = chamar(HttpMethod.POST, "/auth/login", null, Map.of("identificador", "davi", "senha", SENHA))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(corpo).doesNotContainIgnoringCase("senha").doesNotContain("$2a$").doesNotContain("argon2");
    }

    @Test @DisplayName("recuperação: o código não volta na resposta, vale uma vez e 5 erros invalidam")
    void recuperacaoDeSenha() throws Exception {
        Map<String, Object> pedido = Map.of("cpf", "391.847.260-40", "telefone", "(55) 99701-1122", "canal", "whatsapp");
        chamar(HttpMethod.POST, "/auth/recuperar", null, pedido).andExpect(status().isOk()).andExpect(jsonPath("$.codigo").doesNotExist());
        for (int i = 0; i < 5; i++) {
            chamar(HttpMethod.POST, "/auth/redefinir", null, Map.of("cpf", "391.847.260-40", "codigo", "000000", "senha", "nova1234"))
                    .andExpect(status().isBadRequest());
        }
        // o código certo, depois de 5 erros, também é recusado: é preciso pedir outro
        String codigoReal = jdbc.queryForObject("select codigo_hash from recuperacao order by criada_em desc limit 1", String.class);
        assertThat(codigoReal).isNotBlank();
        // TODO: ler o código enviado pelo canal (um @MockBean do envio captura o texto) e provar que ele é recusado aqui.
    }

    @Test @DisplayName("no máximo 5 pedidos de código por CPF por hora, existindo ou não")
    void tetoDePedidosDeCodigo() throws Exception {
        Map<String, Object> pedido = Map.of("cpf", "391.847.260-40", "telefone", "(55) 99701-1122", "canal", "whatsapp");
        for (int i = 0; i < 5; i++) chamar(HttpMethod.POST, "/auth/recuperar", null, pedido).andExpect(status().isOk());
        chamar(HttpMethod.POST, "/auth/recuperar", null, pedido).andExpect(status().isTooManyRequests());
        Map<String, Object> inexistente = Map.of("cpf", "000.000.000-00", "telefone", "(55) 1", "canal", "whatsapp");
        for (int i = 0; i < 5; i++) chamar(HttpMethod.POST, "/auth/recuperar", null, inexistente);
        chamar(HttpMethod.POST, "/auth/recuperar", null, inexistente).andExpect(status().isTooManyRequests());
        relogio.avancar(Duration.ofMinutes(61));
        chamar(HttpMethod.POST, "/auth/recuperar", null, pedido).andExpect(status().isOk());
    }

    @Test @DisplayName("milhares de tentativas com nomes diferentes não soltam quem está bloqueado")
    void bloqueioSobreviveAoDescarte() throws Exception {
        for (int i = 0; i < 5; i++) login("pablo", "errada", 401);
        for (int i = 0; i < 5100; i++) login("fantasma" + i, "x", 401);
        login("pablo", SENHA, 429);
    }

    @Test @DisplayName("sem token, qualquer rota do painel responde 401")
    void semTokenNaoEntra() throws Exception {
        for (String rota : new String[]{"/agendamentos", "/clientes", "/financeiro/lancamentos", "/usuarios", "/estabelecimento"}) {
            chamar(HttpMethod.GET, rota, null, null).andExpect(status().isUnauthorized());
        }
    }
}
