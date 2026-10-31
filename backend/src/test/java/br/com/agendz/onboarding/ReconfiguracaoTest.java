package br.com.agendz.onboarding;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.auth.LimiteDeLogin;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Reconfigurar com senha e desfazer (pedido do Marcelo, 28/10): concluído exige a senha do dono; desfazer devolve só a CONFIGURAÇÃO (expediente) e
 * desativa o que a sessão criou, sem excluir nada nem tocar dado lançado; só a mais recente se desfaz; refazer volta; outra loja não alcança.
 */
class ReconfiguracaoTest extends BaseApi {

    private static final String LOJA_DALFORNO = "00000000-0000-0000-0000-0000000000b1";
    private static final String SEMANA_A = "{\"semana\":{\"1\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"18:00\"]]}}}";
    private static final String SEMANA_B = "{\"semana\":{\"2\":{\"aberto\":true,\"faixas\":[[\"10:00\",\"12:00\"]]}}}";
    private static final String SENHA = "{\"senha\":\"1234\"}";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    LimiteDeLogin limite;

    @BeforeEach
    void antes() {
        limpar();
        destravar();
        jdbc.update("insert into onboarding (loja_id) values (?::uuid)", LOJA_DALFORNO);
    }

    @AfterEach
    void depois() {
        limpar();
        destravar();
    }

    /** O limitador de tentativas é da aplicação (vive entre os testes): zera o do dono do Dalforno. */
    private void destravar() {
        for (String id : jdbc.queryForList("select id::text from usuario where identificador = 'alan'", String.class)) limite.limpar("reconf|" + LOJA_DALFORNO + "|" + id);
    }

    private void limpar() {
        jdbc.update("delete from reconfiguracao");
        jdbc.update("delete from material");
        jdbc.update("delete from configuracao_loja");
        jdbc.update("delete from onboarding");
        jdbc.update("delete from escala_faixa");
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from usuario where identificador like 'zeferino%' or identificador like 'zulmira%'");
    }

    private ResultActions enviar(String host, String token, String rota, String corpo) throws Exception {
        return mvc.perform(post(rota).with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions pegar(String host, String token, String rota) throws Exception {
        return mvc.perform(get(rota).with(host(host)).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private String abrir(String token) throws Exception {
        String r = enviar(DALFORNO, token, "/api/onboarding/reconfiguracoes", SENHA).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(r);
        if (!m.find()) throw new IllegalStateException(r);
        return m.group(1);
    }

    /** Dalforno com o assistente concluído e o expediente A. */
    private String lojaConcluida() throws Exception {
        String t = token(DALFORNO, "alan");
        enviar(DALFORNO, t, "/api/onboarding/expediente", SEMANA_A).andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/concluir", "{}").andExpect(status().isOk());
        return t;
    }

    private int contar(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    @Test
    void concluidoSemSenhaConfirmadaDa403EPrimeiroAcessoNaoPedeSenha() throws Exception {
        String t = token(DALFORNO, "alan");
        // primeiro acesso (não concluído): os passos não pedem senha
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"}]}").andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/concluir", "{}").andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-tesoura\"}]}").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.mensagem").value("Confirme sua senha para reconfigurar a loja"));
        enviar(DALFORNO, t, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Zeferino\"}]}").andExpect(status().isForbidden());
        enviar(DALFORNO, t, "/api/onboarding/expediente", SEMANA_B).andExpect(status().isForbidden());
        assertEquals(1, contar("select count(*) from servico"));
        assertEquals(0, contar("select count(*) from usuario where identificador like 'zeferino%'"));
        abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/expediente", SEMANA_B).andExpect(status().isOk());
    }

    @Test
    void senhaErradaDa403ECincoErrosBloqueiam() throws Exception {
        String t = lojaConcluida();
        for (int i = 0; i < 5; i++) {
            enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes", "{\"senha\":\"errada\"}").andExpect(status().isForbidden()).andExpect(jsonPath("$.mensagem").value("Senha incorreta"));
        }
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes", SENHA).andExpect(status().isTooManyRequests());
        assertEquals(0, contar("select count(*) from reconfiguracao"));
    }

    @Test
    void soODonoEAssistenteConcluidoEmOutraLojaNaoAlcanca() throws Exception {
        lojaConcluida();
        enviar(APEX, token(APEX, "pablo"), "/api/onboarding/reconfiguracoes", SENHA).andExpect(status().isForbidden()); // profissional
        mvc.perform(post("/api/onboarding/reconfiguracoes").with(host(DALFORNO)).contentType(MediaType.APPLICATION_JSON).content(SENHA)).andExpect(status().isUnauthorized());
        // o assistente não está concluído em outra loja: 404 (sem assistente) e nada é criado
        enviar(OFFBOX, token(OFFBOX, "proprietario"), "/api/onboarding/reconfiguracoes", SENHA).andExpect(status().isNotFound());
        assertEquals(0, contar("select count(*) from reconfiguracao"));
    }

    @Test
    void desfazerDevolveOExpedienteEDesativaOCriadoSemExcluirNada() throws Exception {
        String t = lojaConcluida();
        int semAntes = contar("select count(*) from escala_faixa");
        assertEquals(1, semAntes);
        int clientes = contar("select count(*) from cliente");
        int agendamentos = contar("select count(*) from agendamento");
        int usuariosAntes = contar("select count(*) from usuario");
        String id = abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"}]}").andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Zeferino\"}]}").andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/expediente", SEMANA_B).andExpect(status().isOk());
        assertEquals(2, jdbc.queryForObject("select dia from escala_faixa", Integer.class));
        pegar(DALFORNO, t, "/api/onboarding/reconfiguracoes").andExpect(jsonPath("$.itens[0].servicosCriados").value(1)).andExpect(jsonPath("$.itens[0].pessoasCriadas").value(1))
                .andExpect(jsonPath("$.itens[0].expedienteTrocado").value(true)).andExpect(jsonPath("$.itens[0].podeDesfazer").value(true));

        // desfazer pede a senha
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", "{\"senha\":\"errada\"}").andExpect(status().isForbidden());
        assertEquals(2, jdbc.queryForObject("select dia from escala_faixa", Integer.class));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", SENHA).andExpect(status().isOk()).andExpect(jsonPath("$.itens[0].podeDesfazer").value(false))
                .andExpect(jsonPath("$.itens[0].podeRefazer").value(true));
        assertEquals(1, jdbc.queryForObject("select dia from escala_faixa", Integer.class), "o expediente volta ao de antes");
        assertEquals(1, contar("select count(*) from servico where ativo = false"), "o serviço criado fica desativado, não é excluído");
        assertEquals(1, contar("select count(*) from usuario where identificador = 'zeferino' and ativo = false"));
        assertEquals(usuariosAntes + 1, contar("select count(*) from usuario"), "ninguém é excluído");
        assertEquals(clientes, contar("select count(*) from cliente"));
        assertEquals(agendamentos, contar("select count(*) from agendamento"));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", SENHA).andExpect(status().isConflict()); // não desfaz duas vezes

        // refazer volta tudo
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/refazer", SENHA).andExpect(status().isOk()).andExpect(jsonPath("$.itens[0].podeDesfazer").value(true));
        assertEquals(2, jdbc.queryForObject("select dia from escala_faixa", Integer.class));
        assertEquals(0, contar("select count(*) from servico where ativo = false"));
        assertEquals(1, contar("select count(*) from usuario where identificador = 'zeferino' and ativo = true"));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/refazer", SENHA).andExpect(status().isConflict());
    }

    @Test
    void comissaoGeralEProdutosDesfazemERefazemSemExcluirNada() throws Exception {
        jdbc.update("insert into configuracao_loja (loja_id, comissao_padrao) values (?::uuid, 60)", LOJA_DALFORNO);
        String t = lojaConcluida();
        // sem a senha confirmada nada muda
        enviar(DALFORNO, t, "/api/onboarding/comissao", "{\"padrao\":40}").andExpect(status().isForbidden());
        enviar(DALFORNO, t, "/api/onboarding/produtos", "{\"itens\":[{\"nome\":\"Pomada\",\"preco\":30}]}").andExpect(status().isForbidden());
        assertEquals(0, contar("select count(*) from material"));
        assertEquals(60, contar("select comissao_padrao::int from configuracao_loja"));

        String id = abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/comissao", "{\"padrao\":40}").andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/comissao", "{\"padrao\":35}").andExpect(status().isOk()); // segunda troca da mesma sessão: o "antes" continua sendo 60
        enviar(DALFORNO, t, "/api/onboarding/produtos", "{\"itens\":[{\"nome\":\"Pomada\",\"preco\":30,\"comissaoPct\":10}]}").andExpect(status().isOk()).andExpect(jsonPath("$.criados").value(1));
        assertEquals(35, contar("select comissao_padrao::int from configuracao_loja"));
        pegar(DALFORNO, t, "/api/onboarding/reconfiguracoes").andExpect(jsonPath("$.itens[0].produtosCriados").value(1)).andExpect(jsonPath("$.itens[0].comissaoTrocada").value(true))
                .andExpect(jsonPath("$.itens[0].servicosCriados").value(0)).andExpect(jsonPath("$.itens[0].podeDesfazer").value(true));

        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", "{\"senha\":\"errada\"}").andExpect(status().isForbidden());
        assertEquals(35, contar("select comissao_padrao::int from configuracao_loja"));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", SENHA).andExpect(status().isOk()).andExpect(jsonPath("$.itens[0].podeRefazer").value(true));
        assertEquals(60, contar("select comissao_padrao::int from configuracao_loja"), "a comissão geral volta ao valor de antes");
        assertEquals(1, contar("select count(*) from material where nome = 'Pomada' and ativo = false"), "o produto fica desativado, não é excluído");

        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/refazer", SENHA).andExpect(status().isOk());
        assertEquals(35, contar("select comissao_padrao::int from configuracao_loja"));
        assertEquals(1, contar("select count(*) from material where nome = 'Pomada' and ativo = true"));
    }

    @Test
    void camposDoLinkDesfazemERefazemEExigemSenha() throws Exception {
        String t = lojaConcluida();
        // concluído e sem a senha confirmada: nada muda
        enviar(DALFORNO, t, "/api/onboarding/link", "{\"nomeObrigatorio\":false}").andExpect(status().isForbidden());
        assertEquals(0, contar("select count(*) from configuracao_loja where link_nome_obrigatorio = false"));

        String id = abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/link", "{\"veiculoObrigatorio\":[\"cor\"]}").andExpect(status().isBadRequest());
        enviar(DALFORNO, t, "/api/onboarding/link", "{\"veiculoObrigatorio\":[\"placa\",\"placa\"]}").andExpect(status().isBadRequest());
        enviar(DALFORNO, t, "/api/onboarding/link", "{\"nomeObrigatorio\":false,\"veiculoObrigatorio\":[\"placa\"]}").andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/link", "{\"telefoneObrigatorio\":false}").andExpect(status().isOk()); // segunda troca da mesma sessão: o "antes" continua sendo o padrão de fábrica
        pegar(DALFORNO, t, "/api/estabelecimento/link-agendamento").andExpect(status().isOk()).andExpect(jsonPath("$.nomeObrigatorio").value(false)).andExpect(jsonPath("$.telefoneObrigatorio").value(false))
                .andExpect(jsonPath("$.veiculoObrigatorio[0]").value("placa")).andExpect(jsonPath("$.veiculoObrigatorio.length()").value(1)).andExpect(jsonPath("$.ativo").value(true));
        pegar(DALFORNO, t, "/api/onboarding/reconfiguracoes").andExpect(jsonPath("$.itens[0].linkTrocado").value(true)).andExpect(jsonPath("$.itens[0].servicosCriados").value(0)).andExpect(jsonPath("$.itens[0].podeDesfazer").value(true));

        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", "{\"senha\":\"errada\"}").andExpect(status().isForbidden());
        pegar(DALFORNO, t, "/api/estabelecimento/link-agendamento").andExpect(jsonPath("$.nomeObrigatorio").value(false));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", SENHA).andExpect(status().isOk()).andExpect(jsonPath("$.itens[0].podeRefazer").value(true));
        pegar(DALFORNO, t, "/api/estabelecimento/link-agendamento").andExpect(jsonPath("$.nomeObrigatorio").value(true)).andExpect(jsonPath("$.telefoneObrigatorio").value(true))
                .andExpect(jsonPath("$.veiculoObrigatorio.length()").value(3));

        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/refazer", SENHA).andExpect(status().isOk());
        pegar(DALFORNO, t, "/api/estabelecimento/link-agendamento").andExpect(jsonPath("$.nomeObrigatorio").value(false)).andExpect(jsonPath("$.telefoneObrigatorio").value(false))
                .andExpect(jsonPath("$.veiculoObrigatorio.length()").value(1));
    }

    @Test
    void camposDoLinkNoPrimeiroAcessoGravamSemSenhaEOutraLojaNaoAlcanca() throws Exception {
        // assistente ainda não concluído: não há o que confirmar (a senha acabou de ser trocada)
        String t = token(DALFORNO, "alan");
        enviar(DALFORNO, t, "/api/onboarding/link", "{\"nomeObrigatorio\":false}").andExpect(status().isOk());
        pegar(DALFORNO, t, "/api/estabelecimento/link-agendamento").andExpect(jsonPath("$.nomeObrigatorio").value(false));
        assertEquals(0, contar("select count(*) from reconfiguracao"), "primeiro acesso não abre reconfiguração");
        // outra loja (sem assistente) não é alcançada
        enviar(OFFBOX, token(OFFBOX, "proprietario"), "/api/onboarding/link", "{\"nomeObrigatorio\":false}").andExpect(status().isNotFound());
        // quem não é o dono não grava
        enviar(APEX, token(APEX, "pablo"), "/api/onboarding/link", "{\"nomeObrigatorio\":false}").andExpect(status().isForbidden());
    }

    @Test
    void desfazerComissaoSemValorAnteriorVoltaAoPadraoDe50() throws Exception {
        String t = lojaConcluida();
        String id = abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/comissao", "{\"padrao\":20}").andExpect(status().isOk());
        pegar(DALFORNO, t, "/api/estabelecimento/comissao").andExpect(jsonPath("$.comissaoPadrao").value(20.0));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", SENHA).andExpect(status().isOk());
        pegar(DALFORNO, t, "/api/estabelecimento/comissao").andExpect(jsonPath("$.comissaoPadrao").value(50.0));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/refazer", SENHA).andExpect(status().isOk());
        pegar(DALFORNO, t, "/api/estabelecimento/comissao").andExpect(jsonPath("$.comissaoPadrao").value(20.0));
    }

    @Test
    void soAMaisRecenteSeDesfazEOutraLojaNaoEnxerga() throws Exception {
        String t = lojaConcluida();
        String primeira = abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"}]}").andExpect(status().isOk());
        jdbc.update("update reconfiguracao set autorizada_ate = now() - interval '1 minute'"); // a autorização da primeira venceu
        String segunda = abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Zulmira\"}]}").andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + primeira + "/desfazer", SENHA).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(containsString("mais recente")));
        // outra loja não vê nem desfaz
        String outro = token(OFFBOX, "proprietario");
        pegar(OFFBOX, outro, "/api/onboarding/reconfiguracoes").andExpect(status().isOk()).andExpect(jsonPath("$.itens.length()").value(0));
        enviar(OFFBOX, outro, "/api/onboarding/reconfiguracoes/" + segunda + "/desfazer", SENHA).andExpect(status().isNotFound());
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + segunda + "/desfazer", SENHA).andExpect(status().isOk());
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + primeira + "/desfazer", SENHA).andExpect(status().isOk());
        assertEquals(1, contar("select count(*) from servico where ativo = false"));
        assertEquals(1, contar("select count(*) from usuario where identificador = 'zulmira' and ativo = false"));
    }

    @Test
    void depoisDeTrintaDiasNaoSeDesfaz() throws Exception {
        String t = lojaConcluida();
        String id = abrir(t);
        enviar(DALFORNO, t, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"}]}").andExpect(status().isOk());
        jdbc.update("update reconfiguracao set criada_em = now() - interval '31 days'");
        pegar(DALFORNO, t, "/api/onboarding/reconfiguracoes").andExpect(jsonPath("$.itens[0].podeDesfazer").value(false));
        enviar(DALFORNO, t, "/api/onboarding/reconfiguracoes/" + id + "/desfazer", SENHA).andExpect(status().isConflict());
        assertEquals(0, contar("select count(*) from servico where ativo = false"));
    }
}
