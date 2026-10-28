package br.com.agendz.equipe;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.seguranca.Permissoes;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
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

/** Cadastro da equipe no servidor: só o dono, senha temporária gerada, dados pessoais cifrados, regras de remover/desativar e permissões por seção. */
class UsuariosTest extends BaseApi {

    private static final String LOJA_APEX = "00000000-0000-0000-0000-0000000000a1";

    @Autowired
    JdbcTemplate jdbc;

    String davi;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from agendamento");
        jdbc.update("delete from cliente");
        jdbc.update("delete from usuario where lower(apelido) like 'ut%'");
        jdbc.update("update usuario set permissoes = '{}'::jsonb, atende = true where identificador in ('pablo', 'marcelo', 'davi')");
    }

    private static String corpo(String apelido, String extra) {
        return "{\"nome\":\"Pessoa " + apelido + "\",\"apelido\":\"" + apelido + "\",\"papel\":\"profissional\"" + extra + "}";
    }

    private ResultActions criar(String token, String corpo) throws Exception {
        return mvc.perform(post("/api/usuarios").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private String idDe(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private String criarOk(String apelido, String extra) throws Exception {
        return idDe(criar(davi, corpo(apelido, extra)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test
    void criarDevolveSenhaTemporariaUmaVezELoginObrigaATroca() throws Exception {
        String json = criar(davi, corpo("UtAna", ",\"cpf\":\"529.982.247-25\",\"email\":\"Ut.Ana@Teste.com\",\"telefone\":\"(53) 99900-0001\",\"nascimento\":\"1990-05-17\""))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.usuario.usuario").value("utana")).andExpect(jsonPath("$.usuario.papel").value("profissional"))
                .andExpect(jsonPath("$.usuario.atende").value(true)).andExpect(jsonPath("$.usuario.deveTrocarSenha").value(true))
                .andExpect(jsonPath("$.usuario.cpfMascarado").value("529.***.***-25")).andExpect(jsonPath("$.usuario.cpf").value(nullValue()))
                .andExpect(jsonPath("$.usuario.telefone").value("5553999000001")).andExpect(jsonPath("$.usuario.corSlot").isNumber())
                .andExpect(jsonPath("$.senhaTemporaria").isString()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        Matcher m = Pattern.compile("\"senhaTemporaria\":\"([^\"]+)\"").matcher(json);
        assertTrue(m.find());
        String senha = m.group(1);
        mvc.perform(post("/api/auth/login").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("utana", senha)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true));
        // a senha temporária não aparece em nenhuma leitura
        String id = idDe(json);
        mvc.perform(get("/api/usuarios/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cpf").value("52998224725")).andExpect(jsonPath("$.nascimento").value("1990-05-17"))
                .andExpect(jsonPath("$.email").value("Ut.Ana@Teste.com")).andExpect(jsonPath("$.senhaTemporaria").doesNotExist());
        mvc.perform(get("/api/usuarios").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$[*].apelido").value(hasItem("UtAna"))).andExpect(jsonPath("$[?(@.apelido=='UtAna')].cpf").value(hasItem(nullValue())))
                .andExpect(jsonPath("$[?(@.apelido=='UtAna')].nascimento").value(hasItem(nullValue())));
    }

    @Test
    void cpfEmailTelefoneENascimentoFicamCifradosNoBanco() throws Exception {
        criarOk("UtBia", ",\"cpf\":\"11144477735\",\"email\":\"bia@teste.com\",\"telefone\":\"53999000002\",\"nascimento\":\"1991-01-02\"");
        Map<String, Object> l = jdbc.queryForMap("select cpf_cif, cpf_hash, email_cif, telefone_cif, nascimento_cif from usuario where lower(apelido) = 'utbia'");
        for (String col : new String[]{"cpf_cif", "email_cif", "telefone_cif", "nascimento_cif"}) {
            String v = (String) l.get(col);
            assertTrue(v.startsWith("v1:"), col + " cifrado");
            assertFalse(v.contains("11144477735") || v.contains("bia@teste.com") || v.contains("5553999000002") || v.contains("1991"), col + " sem texto puro");
        }
        assertFalse(((String) l.get("cpf_hash")).contains("11144477735"));
    }

    @Test
    void soODonoCadastraListaERefazSenha() throws Exception {
        String pablo = token(APEX, "pablo");
        criar(pablo, corpo("UtX", "")).andExpect(status().isForbidden());
        mvc.perform(get("/api/usuarios").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isForbidden());
        String id = criarOk("UtY", "");
        mvc.perform(put("/api/usuarios/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)).contentType(MediaType.APPLICATION_JSON).content(corpo("UtY", "")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/usuarios/" + id + "/senha-temporaria").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/usuarios/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isForbidden());
    }

    @Test
    void regrasSoDoServidorDaoMensagemClara() throws Exception {
        criar(davi, corpo("UtC", ",\"cpf\":\"12345678900\"")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("CPF inválido."));
        criar(davi, corpo("UtC", ",\"telefone\":\"123\"")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Informe o telefone com DDD."));
        criar(davi, corpo("UtC", ",\"nascimento\":\"2999-01-01\"")).andExpect(status().isBadRequest());
        criar(davi, corpo("UtC", ",\"usuario\":\"com espaço\"")).andExpect(status().isBadRequest());
        criar(davi, corpo("UtC", ",\"senha\":\"123456\"")).andExpect(status().isBadRequest()); // senha nunca vem do cliente
        criar(davi, corpo("UtC", ",\"lojaId\":\"outra\"")).andExpect(status().isBadRequest());
        criar(davi, corpo("UtC", ",\"usuario\":\"pablo\"")).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("Esse usuário já existe."));
        mvc.perform(get("/api/usuarios").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(jsonPath("$[*].apelido").value(not(hasItem("UtC"))));
    }

    @Test
    void perfisPermissoesEComissaoSaoGuardados() throws Exception {
        String id = criarOk("UtD", ",\"papel\":\"atendente\",\"permissoes\":{\"clientes\":false,\"relatorios\":true,\"servicos\":true},\"comissaoPct\":12.5,\"podeVender\":false");
        mvc.perform(get("/api/usuarios/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(jsonPath("$.papel").value("atendente")).andExpect(jsonPath("$.atende").value(false)) // recepção não atende por padrão
                .andExpect(jsonPath("$.permissoes.clientes").value(false)).andExpect(jsonPath("$.permissoes.servicos").value(true))
                .andExpect(jsonPath("$.permissoes.relatorios").doesNotExist()).andExpect(jsonPath("$.comissaoPct").value(12.5)).andExpect(jsonPath("$.podeVender").value(false));
    }

    @Test
    void alterarMantemOQueNaoVemEPermiteLimparCpf() throws Exception {
        String id = criarOk("UtE", ",\"cpf\":\"39053344705\",\"email\":\"e@teste.com\",\"comissaoPct\":8");
        mvc.perform(put("/api/usuarios/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Outro Nome\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nome").value("Outro Nome")).andExpect(jsonPath("$.apelido").value("UtE"))
                .andExpect(jsonPath("$.cpfMascarado").value("390.***.***-05")).andExpect(jsonPath("$.email").value("e@teste.com")).andExpect(jsonPath("$.comissaoPct").value(8));
        mvc.perform(put("/api/usuarios/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"cpf\":\"\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cpfMascarado").value(nullValue()));
        // com o CPF livre, outra pessoa pode usar o mesmo número
        criar(davi, corpo("UtF", ",\"cpf\":\"39053344705\"")).andExpect(status().isCreated());
    }

    @Test
    void naoRemoveASiMesmoNemOUnicoDonoNemQuemTemHistorico() throws Exception {
        UUID daviId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'davi'", UUID.class, LOJA_APEX);
        mvc.perform(delete("/api/usuarios/" + daviId).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("Você não pode remover o seu próprio usuário."));
        mvc.perform(put("/api/usuarios/" + daviId).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"papel\":\"profissional\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("É preciso ter pelo menos um dono."));
        // com histórico: não apaga
        String comHistorico = criarOk("UtG", "");
        UUID cliente = jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Cli', 'v1:teste', md5('x')) returning id", UUID.class, LOJA_APEX);
        jdbc.update("insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, total) "
                + "values (?::uuid, ?, ?::uuid, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', now() - interval '3 days' + interval '1 hour', 'concluido', 10)",
                LOJA_APEX, cliente, comHistorico);
        mvc.perform(delete("/api/usuarios/" + comHistorico).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem", containsString("tem histórico de agendamentos")));
        // sem histórico: apaga
        String semHistorico = criarOk("UtH", "");
        mvc.perform(delete("/api/usuarios/" + semHistorico).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isNoContent());
        mvc.perform(get("/api/usuarios/" + semHistorico).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isNotFound());
    }

    @Test
    void desativarAtendimentoComAgendamentoFuturoEhRecusado() throws Exception {
        String id = criarOk("UtI", "");
        UUID cliente = jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Cli', 'v1:teste', md5('y')) returning id", UUID.class, LOJA_APEX);
        jdbc.update("insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, total) "
                + "values (?::uuid, ?, ?::uuid, now() + interval '3 days', now() + interval '3 days' + interval '1 hour', now() + interval '3 days' + interval '1 hour', 'confirmado', 10)",
                LOJA_APEX, cliente, id);
        mvc.perform(put("/api/usuarios/" + id + "/atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"atende\":false}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem", containsString("ainda tem 1 agendamento futuro")));
        jdbc.update("delete from agendamento");
        mvc.perform(put("/api/usuarios/" + id + "/atendimento").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"atende\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.atende").value(false));
    }

    @Test
    void refazerSenhaTrocaATemporariaEExigeNovaTroca() throws Exception {
        String id = criarOk("UtJ", "");
        String json = mvc.perform(post("/api/usuarios/" + id + "/senha-temporaria").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", containsString("no-store"))).andReturn().getResponse().getContentAsString();
        Matcher m = Pattern.compile("\"senhaTemporaria\":\"([^\"]+)\"").matcher(json);
        assertTrue(m.find());
        mvc.perform(post("/api/auth/login").with(host(APEX)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("utj", m.group(1))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true));
        UUID daviId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'davi'", UUID.class, LOJA_APEX);
        mvc.perform(post("/api/usuarios/" + daviId + "/senha-temporaria").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isConflict());
    }

    @Test
    void outraLojaNaoVeNemMexe() throws Exception {
        String id = criarOk("UtK", "");
        String alan = token(DALFORNO, "alan");
        mvc.perform(get("/api/usuarios/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        mvc.perform(put("/api/usuarios/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Roubado\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/usuarios/" + id).with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isNotFound());
        mvc.perform(get("/api/usuarios").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(jsonPath("$[*].apelido").value(not(hasItem("UtK"))));
        // CPF igual em outra loja é permitido
        criar(davi, corpo("UtL", ",\"cpf\":\"86288366757\"")).andExpect(status().isCreated());
        mvc.perform(post("/api/usuarios").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON)
                .content(corpo("UtM", ",\"cpf\":\"86288366757\""))).andExpect(status().isCreated());
        jdbc.update("delete from usuario where lower(apelido) = 'utm'");
    }

    @Test
    void minhaFotoValidaOTipoPelosPrimeirosBytes() throws Exception {
        String pablo = token(APEX, "pablo");
        String png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHvQiDwAAAABJRU5ErkJggg==";
        mvc.perform(put("/api/usuarios/me/foto").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)).contentType(MediaType.APPLICATION_JSON).content("{\"foto\":\"" + png + "\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/usuarios").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(jsonPath("$[?(@.usuario=='pablo')].foto").value(hasItem(png)));
        // diz png mas os bytes são de outra coisa
        mvc.perform(put("/api/usuarios/me/foto").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"foto\":\"data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\"}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/usuarios/me/foto").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)).contentType(MediaType.APPLICATION_JSON).content("{\"foto\":\"\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/usuarios").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(jsonPath("$[?(@.usuario=='pablo')].foto").value(hasItem(nullValue())));
    }

    // ---------- permissões por seção ----------

    @Test
    void regraPuraDePermissao() {
        assertTrue(Permissoes.pode("dono", Map.of("clientes", false), "clientes"));
        assertTrue(Permissoes.pode("profissional", Map.of(), "agenda"));
        assertFalse(Permissoes.pode("profissional", Map.of(), "servicos"));
        assertTrue(Permissoes.pode("atendente", Map.of(), "servicos"));
        assertFalse(Permissoes.pode("admin", Map.of(), "clientes"));
        assertTrue(Permissoes.pode("admin", Map.of("clientes", true), "clientes"));
        assertFalse(Permissoes.pode("profissional", Map.of("agenda", false), "agenda"));
        assertFalse(Permissoes.pode("atendente", Map.of("relatorios", true), "relatorios"), "relatórios não é liberável");
        assertFalse(Permissoes.pode("atendente", Map.of(), "inexistente"));
    }

    @Test
    void permissaoLiberadaOuBloqueadaPeloDonoValeNaHora() throws Exception {
        String pablo = token(APEX, "pablo");
        UUID pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, LOJA_APEX);
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isOk()); // padrão do profissional
        mvc.perform(put("/api/usuarios/" + pabloId).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"permissoes\":{\"clientes\":false,\"servicos\":true}}")).andExpect(status().isOk());
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isForbidden());
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"UtServico\",\"precos\":{\"pequeno\":1,\"medio\":1,\"grande\":1,\"suv\":1,\"pickup\":1},\"duracoes\":{\"pequeno\":10,\"medio\":10,\"grande\":10,\"suv\":10,\"pickup\":10}}"))
                .andExpect(status().isCreated());
        jdbc.update("delete from servico where nome = 'UtServico'");
    }

    @Test
    void recepcaoVeAAgendaDeTodosEOutroPerfilSemPermissaoNao() throws Exception {
        String id = criarOk("UtN", ",\"papel\":\"admin\"");
        String login = jdbc.queryForObject("select identificador from usuario where id = ?::uuid", String.class, id);
        String senha = "senhaDoTeste1";
        jdbc.update("update usuario set senha_hash = (select senha_hash from usuario where identificador = 'davi' and loja_id = ?::uuid), deve_trocar_senha = false where id = ?::uuid", LOJA_APEX, id);
        String admin = token(APEX, login); // senha 1234 copiada do davi
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(admin))).andExpect(status().isForbidden()); // admin começa sem nada
        mvc.perform(get("/api/agendamentos").queryParam("de", "2026-01-01T00:00:00Z").queryParam("ate", "2026-02-01T00:00:00Z").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(admin))).andExpect(status().isForbidden());
        mvc.perform(get("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(admin))).andExpect(status().isOk()); // ler serviços é de todo perfil
        mvc.perform(put("/api/usuarios/" + id).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"permissoes\":{\"clientes\":true,\"agenda\":true}}")).andExpect(status().isOk());
        mvc.perform(get("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(admin))).andExpect(status().isOk());
        mvc.perform(get("/api/agendamentos").queryParam("de", "2026-01-01T00:00:00Z").queryParam("ate", "2026-02-01T00:00:00Z").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(admin))).andExpect(status().isOk());
        // gestor não edita serviço sem a seção
        mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"UtS\",\"precos\":{\"pequeno\":1,\"medio\":1,\"grande\":1,\"suv\":1,\"pickup\":1},\"duracoes\":{\"pequeno\":10,\"medio\":10,\"grande\":10,\"suv\":10,\"pickup\":10}}"))
                .andExpect(status().isForbidden());
    }
}
