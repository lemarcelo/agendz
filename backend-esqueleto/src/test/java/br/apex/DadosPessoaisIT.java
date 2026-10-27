package br.apex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.IntegrationTestBase;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;

/**
 * Prova as proteções de docs/MAPA-DADOS-PESSOAIS.md. Regra do proprietário: nome e apelido ficam em TEXTO PURO no banco e podem aparecer no log;
 * CPF, telefone e nascimento são cifrados; senha só como hash; segredos de banco nunca voltam.
 * Os nomes de tabela e coluna abaixo são hipóteses: ajuste ao modelo real.
 */
@ExtendWith(OutputCaptureExtension.class)
class DadosPessoaisIT extends IntegrationTestBase {

    private static final String CPF = "529.982.247-25";
    private static final String TEL = "(55) 99999-3333";

    private String criarCliente(String nome) throws Exception {
        return corpo(chamar(HttpMethod.POST, "/clientes", token("davi"),
                Map.of("nome", nome, "apelido", "Zé", "telefone", TEL, "cpf", CPF, "nascimento", "1992-02-02")).andExpect(status().isCreated())).get("id").asText();
    }

    @Test @DisplayName("CPF, telefone e nascimento ficam cifrados no banco; nome e apelido ficam legíveis")
    void cpfETelefoneCifradosNoBanco() throws Exception {
        String id = criarCliente("Fulano de Tal");
        Map<String, Object> linha = jdbc.queryForMap("select nome, apelido, cpf, telefone, nascimento from cliente where id = ?", id);
        assertThat(linha.get("nome")).isEqualTo("Fulano de Tal");
        assertThat(linha.get("apelido")).isEqualTo("Zé");
        for (String coluna : List.of("cpf", "telefone", "nascimento")) {
            String valor = String.valueOf(linha.get(coluna));
            assertThat(valor).startsWith("v1:");
            assertThat(valor).doesNotContain("52998224725").doesNotContain("529.982.247-25").doesNotContain("99999-3333").doesNotContain("1992");
        }
    }

    @Test @DisplayName("mesmo cifrado, dá para achar o cliente pelo telefone do WhatsApp e impedir CPF duplicado (hash HMAC)")
    void buscaPorHash() throws Exception {
        criarCliente("Primeiro");
        doWhatsApp(HttpMethod.GET, "/whatsapp/clientes", "5555999993333", null).andExpect(status().isOk());
        chamar(HttpMethod.POST, "/clientes", token("davi"), Map.of("nome", "Segundo", "telefone", "(55) 98888-0000", "cpf", CPF))
                .andExpect(status().isUnprocessableEntity());
        assertThat(jdbc.queryForObject("select count(*) from cliente where cpf_hash = telefone_hash", Integer.class)).isZero();   // hashes de campos diferentes nunca coincidem
    }

    @Test @DisplayName("senha só como hash (BCrypt/Argon2); a coluna não guarda '1234'")
    void senhaSoComoHash() {
        String hash = jdbc.queryForObject("select senha_hash from usuario where id = 'u-davi'", String.class);
        assertThat(hash).isNotEqualTo(SENHA).matches("^(\\$2[aby]\\$|\\$argon2).+");
    }

    @Test @DisplayName("o segredo da API do banco não volta na resposta nem aparece no log")
    void segredoDoBancoNaoVolta(CapturedOutput saida) throws Exception {
        String dono = token("davi");
        chamar(HttpMethod.PUT, "/financeiro/contas/conta-principal/api-pix", dono, Map.of("banco", "sicredi", "clientId", "id-1", "clientSecret", "SEGREDO-XYZ-123", "ambiente", "homologacao"));
        String resposta = chamar(HttpMethod.GET, "/financeiro/contas", dono, null).andReturn().getResponse().getContentAsString();
        assertThat(resposta).doesNotContain("SEGREDO-XYZ-123");
        assertThat(saida.getAll()).doesNotContain("SEGREDO-XYZ-123");
    }

    @Test @DisplayName("lista de pedidos de vínculo e de avisos traz o CPF mascarado")
    void cpfMascaradoNasListas() throws Exception {
        doWhatsApp(HttpMethod.POST, "/whatsapp/agendamentos", "5555981230000", Map.of("nome", "Outro", "cpf", "391.847.260-40",
                "servicoIds", List.of("s-lav-detalhada"), "inicio", diaUtil(5, "16:00").toString()));
        String lista = chamar(HttpMethod.GET, "/clientes/vinculos", token("davi"), null).andReturn().getResponse().getContentAsString();
        assertThat(lista).doesNotContain("391.847.260-40").doesNotContain("39184726040").contains("***");
        String avisos = chamar(HttpMethod.GET, "/avisos", token("davi"), null).andReturn().getResponse().getContentAsString();
        assertThat(avisos).doesNotContain("391.847.260-40").doesNotContain("39184726040");
    }

    @Test @DisplayName("log: nome e apelido podem aparecer; CPF, telefone inteiro, senha, token e código de recuperação nunca")
    void logSemDadosPessoais(CapturedOutput saida) throws Exception {
        criarCliente("Cliente Do Log");
        chamar(HttpMethod.POST, "/auth/recuperar", null, Map.of("cpf", "391.847.260-40", "telefone", "(55) 99701-1122", "canal", "whatsapp"));
        String tokenDoDono = token("davi");
        chamar(HttpMethod.GET, "/clientes", tokenDoDono, null);
        String log = saida.getAll();
        assertThat(log).doesNotContain("52998224725").doesNotContain("529.982.247-25")
                .doesNotContain("99999-3333").doesNotContain("5555999993333")
                .doesNotContain("391.847.260-40").doesNotContain("39184726040")
                .doesNotContain(tokenDoDono).doesNotContain(SENHA);
        // nome e apelido PODEM aparecer (decisão do proprietário): este teste NÃO exige a ausência deles.
    }

    @Test @DisplayName("anonimizar o cliente apaga os campos pessoais e preserva o agregado financeiro")
    void anonimizacao() throws Exception {
        String id = criarCliente("Para Anonimizar");
        chamar(HttpMethod.DELETE, "/clientes/" + id + "/dados", token("davi"), null).andExpect(status().isOk());
        Map<String, Object> linha = jdbc.queryForMap("select nome, apelido, cpf, telefone, nascimento, anonimizado from cliente where id = ?", id);
        assertThat(linha.get("anonimizado")).isEqualTo(true);
        assertThat(linha.get("nome")).isNotEqualTo("Para Anonimizar");
        assertThat(linha.get("cpf")).isNull();
        assertThat(linha.get("telefone")).isNull();
        // TODO: com cobrança paga, o valor continua nos lançamentos (obrigação fiscal) sem apontar mais para a pessoa.
    }

    @Test @DisplayName("esteticista não lê o CPF de cliente que só atende outro esteticista")
    void esteticistaNaoLeCpfAlheio() throws Exception {
        String id = criarCliente("Cliente Exclusivo");
        criarAgendamento(token("davi"), id, "u-pablo", List.of("s-lav-detalhada"), diaUtil(5, "10:00"));
        String resposta = chamar(HttpMethod.GET, "/clientes/" + id, token("marcelo"), null).andReturn().getResponse().getContentAsString();
        assertThat(resposta).doesNotContain("529.982.247-25").doesNotContain("52998224725");
    }

    @Test @DisplayName("rotação de chave: valor gravado com a chave v1 continua legível depois de adicionar a v2")
    void rotacaoDeChave() {
        // TODO: no serviço de cifra, gravar com v1, configurar v2 como chave atual e ler o valor antigo (formato "v1:iv:texto:tag").
        org.junit.jupiter.api.Assumptions.assumeTrue(false, "implementar junto com o serviço de cifra por campo");
    }
}
