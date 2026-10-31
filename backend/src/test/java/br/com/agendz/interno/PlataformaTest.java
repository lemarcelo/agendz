package br.com.agendz.interno;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** A3: rotas internas do Admin da plataforma (chave, criar loja, equipe, regras aplicadas pela loja, suspensão = 402). Usa uma loja própria, apagada no fim. */
class PlataformaTest extends BaseApi {

    private static final String CHAVE = "chave-interna-so-para-teste-0123456789";
    private static final String SLUG = "lojateste";
    private static final String HOST = SLUG + ".agendz.io";
    private static final String BASE = "/interno/plataforma/lojas";

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void limpar() {
        jdbc.update("delete from loja_regra_plataforma where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from cliente where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from box where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from onboarding where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from usuario where loja_id in (select id from loja where slug = ?)", SLUG);
        jdbc.update("delete from loja where slug = ?", SLUG);
    }

    private static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem " + nome + ": " + json);
        return m.group(1);
    }

    private String criarLoja(String tipo) throws Exception {
        return mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"" + SLUG + "\",\"nome\":\"Loja de Teste\",\"tipo\":\"" + tipo + "\",\"donoUsuario\":\"dona\",\"donoNome\":\"Dona Teste\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    private static final String SENHA_DEFINITIVA = "SenhaDefinitiva2026";

    /** Entra com a senha temporária, troca por uma definitiva (a temporária só serve para isso) e devolve o token já liberado. */
    private String tokenDaDona(String senha) throws Exception {
        String json = mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senha)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String troca = mvc.perform(put("/api/usuarios/me/senha").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(campo(json, "token")))
                .contentType(MediaType.APPLICATION_JSON).content("{\"senhaAtual\":\"" + senha + "\",\"nova\":\"" + SENHA_DEFINITIVA + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return campo(troca, "token");
    }

    @Test
    void semChaveOuComChaveErradaNadaFunciona() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isForbidden());
        mvc.perform(get(BASE).header("X-Interno-Chave", "errada-errada-errada")).andExpect(status().isForbidden());
        mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/offbox/usuarios")).andExpect(status().isForbidden());
        mvc.perform(put(BASE + "/offbox/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"suspenso\"}")).andExpect(status().isForbidden());
        assertEquals(0, jdbc.queryForObject("select count(*) from loja where slug = ?", Integer.class, SLUG));
    }

    @Test
    void listaAsLojasSoComContagens() throws Exception {
        mvc.perform(get(BASE).header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='offbox')].status").value(hasItem("ativo")))
                .andExpect(jsonPath("$[?(@.slug=='offbox')].usuarios").value(hasItem(greaterThan(0))))
                .andExpect(jsonPath("$[0].nome").exists()).andExpect(jsonPath("$[0].cpf").doesNotExist()).andExpect(jsonPath("$[0].clientes").doesNotExist());
    }

    @Test
    void criaLojaComDonoESuporteESenhaTemporariaEntraETroca() throws Exception {
        String json = criarLoja("barbearia");
        String senha = campo(json, "senhaTemporaria");
        assertNotNull(campo(json, "suporteSenhaTemporaria"));
        // dono entra com a temporária e é obrigado a trocar
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senha)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true)).andExpect(jsonPath("$.papel").value("dono"));
        // a lista não mostra o suporte; mostra o dono
        mvc.perform(get(BASE + "/" + SLUG + "/usuarios").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].usuario").value(hasItem("dona"))).andExpect(jsonPath("$[*].usuario").value(not(hasItem("suporte"))))
                .andExpect(jsonPath("$[0].senha").doesNotExist()).andExpect(jsonPath("$[0].senhaHash").doesNotExist());
        // o endereço já existe, nome reservado, slug ruim e tipo desconhecido são recusados
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"" + SLUG + "\",\"nome\":\"Outra\",\"tipo\":\"barbearia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isConflict());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"admin\",\"nome\":\"A\",\"tipo\":\"barbearia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"Ruim_Slug\",\"nome\":\"A\",\"tipo\":\"barbearia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"outra-loja\",\"nome\":\"A\",\"tipo\":\"academia\",\"donoUsuario\":\"x1\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"outra-loja\",\"nome\":\"A\",\"tipo\":\"barbearia\",\"donoUsuario\":\"suporte\",\"donoNome\":\"X\"}")).andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from loja where slug = 'outra-loja'", Integer.class));
    }

    @Test
    void redefinirSenhaEAtivarDesativarComProtecaoDoUltimoDono() throws Exception {
        String senha = campo(criarLoja("barbearia"), "senhaTemporaria");
        String dono = tokenDaDona(senha);
        String lista = mvc.perform(get(BASE + "/" + SLUG + "/usuarios").header("X-Interno-Chave", CHAVE)).andReturn().getResponse().getContentAsString();
        String idDona = campo(lista, "id");
        // a loja não consegue ficar sem proprietário ativo
        mvc.perform(put(BASE + "/" + SLUG + "/usuarios/" + idDona + "/ativo").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"ativo\":false}"))
                .andExpect(status().isConflict());
        // nova senha: aparece uma vez, a antiga deixa de valer e a troca volta a ser obrigatória
        String nova = mvc.perform(post(BASE + "/" + SLUG + "/usuarios/" + idDona + "/senha").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario").value("dona")).andReturn().getResponse().getContentAsString();
        String senhaNova = campo(nova, "senhaTemporaria");
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senha))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", senhaNova)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true));
        // usuário de outra loja ou id que não existe = 404; suporte nunca é mexido aqui
        mvc.perform(post(BASE + "/offbox/usuarios/" + idDona + "/senha").header("X-Interno-Chave", CHAVE)).andExpect(status().isNotFound());
        String idSuporte = jdbc.queryForObject("select id::text from usuario where identificador = 'suporte' and loja_id = (select id from loja where slug = ?)", String.class, SLUG);
        mvc.perform(post(BASE + "/" + SLUG + "/usuarios/" + idSuporte + "/senha").header("X-Interno-Chave", CHAVE)).andExpect(status().isNotFound());
        mvc.perform(put(BASE + "/" + SLUG + "/usuarios/" + idSuporte + "/ativo").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"ativo\":false}")).andExpect(status().isNotFound());
        assertNotNull(dono);
    }

    @Test
    void limiteDeUsuariosECamposObrigatoriosSaoAplicadosPelaLoja() throws Exception {
        String senha = campo(criarLoja("barbearia"), "senhaTemporaria");
        String dono = tokenDaDona(senha);
        mvc.perform(get(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk()).andExpect(jsonPath("$.mensagensAtivas").value(true))
                .andExpect(jsonPath("$.limiteUsuarios").doesNotExist());
        // entrada ruim
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":0}")).andExpect(status().isBadRequest());
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"cadastroObrigatorios\":[\"senha\"]}")).andExpect(status().isBadRequest());
        // 1 usuário: o dono já ocupa a vaga (o suporte não conta)
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":1,\"cadastroObrigatorios\":[\"cpf\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.limiteUsuarios").value(1)).andExpect(jsonPath("$.cadastroObrigatorios[0]").value("cpf"));
        mvc.perform(post("/api/usuarios").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Fulano Dois\",\"apelido\":\"Fulano\",\"papel\":\"profissional\"}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("limite")));
        // CPF obrigatório no cadastro de cliente; com CPF válido passa
        mvc.perform(post("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Maria Silva\",\"telefone\":\"(53) 99900-0001\"}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("CPF")));
        mvc.perform(post("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Maria Silva\",\"telefone\":\"(53) 99900-0001\",\"cpf\":\"529.982.247-25\"}")).andExpect(status().isCreated());
        // ampliar o limite libera
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":5}")).andExpect(status().isOk());
        mvc.perform(post("/api/usuarios").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Fulano Dois\",\"apelido\":\"Fulano\",\"papel\":\"profissional\"}")).andExpect(status().isCreated());
    }

    @Test
    void regraDoAnonimoComecaDesligadaSoOAdminLigaEUmaGravacaoSemACaveNaoADesliga() throws Exception {
        criarLoja("barbearia");
        mvc.perform(get(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE)).andExpect(status().isOk()).andExpect(jsonPath("$.avaliacaoMostraAnonimo").value(false));
        // sem a chave interna nada muda
        mvc.perform(put(BASE + "/" + SLUG + "/regras").contentType(MediaType.APPLICATION_JSON).content("{\"avaliacaoMostraAnonimo\":true}")).andExpect(status().isForbidden());
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"avaliacaoMostraAnonimo\":\"sim\"}")).andExpect(status().isBadRequest());
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"avaliacaoMostraAnonimo\":true,\"limiteUsuarios\":4}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avaliacaoMostraAnonimo").value(true)).andExpect(jsonPath("$.limiteUsuarios").value(4));
        // um Admin que ainda não conhece a chave grava os limites sem desligar a regra
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":5}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avaliacaoMostraAnonimo").value(true)).andExpect(jsonPath("$.limiteUsuarios").value(5));
        mvc.perform(get(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE)).andExpect(jsonPath("$.avaliacaoMostraAnonimo").value(true));
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"avaliacaoMostraAnonimo\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.avaliacaoMostraAnonimo").value(false));
    }

    @Test
    void lojaSuspensaDa402MasDeixaEntrarEAbrirAPaginaDaLoja() throws Exception {
        String senha = campo(criarLoja("barbearia"), "senhaTemporaria");
        String dono = tokenDaDona(senha);
        mvc.perform(get("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk());
        mvc.perform(put(BASE + "/" + SLUG + "/status").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"inventado\"}")).andExpect(status().isBadRequest());
        mvc.perform(put(BASE + "/" + SLUG + "/status").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"suspenso\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("suspenso"));
        mvc.perform(get("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.mensagem").value(org.hamcrest.Matchers.containsString("suspenso")));
        mvc.perform(get("/api/publico/agendar").with(host(HOST))).andExpect(status().isPaymentRequired());
        // entrar e a identidade da loja continuam (a tela de pagamento e o suporte precisam)
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", SENHA_DEFINITIVA))).andExpect(status().isOk());
        mvc.perform(get("/api/publico/loja").with(host(HOST))).andExpect(status().isOk());
        // a lista do Admin mostra a situação; reativar devolve a loja
        mvc.perform(get(BASE).header("X-Interno-Chave", CHAVE)).andExpect(jsonPath("$[?(@.slug=='" + SLUG + "')].status").value(hasItem("suspenso")));
        mvc.perform(put(BASE + "/" + SLUG + "/status").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ativo\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/clientes").with(host(HOST)).header(HttpHeaders.AUTHORIZATION, bearer(dono))).andExpect(status().isOk());
    }

    private String criarUsuarioNaLoja(String corpo, int status) throws Exception {
        return mvc.perform(post(BASE + "/" + SLUG + "/usuarios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().is(status)).andReturn().getResponse().getContentAsString();
    }

    private String idDe(String login) {
        return jdbc.queryForObject("select id::text from usuario where identificador = ? and loja_id = (select id from loja where slug = ?)", String.class, login, SLUG);
    }

    @Test
    void adminCriaUsuarioDaEquipeComSenhaTemporariaUmaVezSo() throws Exception {
        criarLoja("barbearia");
        String url = BASE + "/" + SLUG + "/usuarios";
        // sem chave ou com chave errada nada acontece
        mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Ana Souza\",\"usuario\":\"ana\",\"papel\":\"atendente\"}")).andExpect(status().isForbidden());
        mvc.perform(post(url).header("X-Interno-Chave", "errada-errada-errada").contentType(MediaType.APPLICATION_JSON).content("{\"nome\":\"Ana Souza\",\"usuario\":\"ana\",\"papel\":\"atendente\"}"))
                .andExpect(status().isForbidden());
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador = 'ana'", Integer.class));
        // cria: 201, a senha vem uma vez e a pessoa entra com ela, obrigada a trocar
        String json = criarUsuarioNaLoja("{\"nome\":\"Ana Souza\",\"usuario\":\"Ana\",\"papel\":\"atendente\"}", 201);
        String temporaria = campo(json, "senhaTemporaria");
        assertEquals(12, temporaria.length());
        mvc.perform(post("/api/auth/login").with(host(HOST)).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("ana", temporaria)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true)).andExpect(jsonPath("$.papel").value("atendente"));
        // a lista da equipe mostra a pessoa, sem senha nem hash
        mvc.perform(get(url).header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.usuario=='ana')].papel").value(hasItem("atendente")))
                .andExpect(jsonPath("$[?(@.usuario=='ana')].nome").value(hasItem("Ana Souza")))
                .andExpect(jsonPath("$[0].senhaTemporaria").doesNotExist()).andExpect(jsonPath("$[0].senha").doesNotExist()).andExpect(jsonPath("$[0].senhaHash").doesNotExist());
        // a senha nunca fica em claro no banco
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where senha_hash = ?", Integer.class, temporaria));
        // apelido padrão = primeiro nome; outra Ana ganha número (não estoura 409)
        assertEquals("Ana", jdbc.queryForObject("select apelido from usuario where identificador = 'ana' and loja_id = (select id from loja where slug = ?)", String.class, SLUG));
        criarUsuarioNaLoja("{\"nome\":\"Ana Lima\",\"usuario\":\"ana2\",\"papel\":\"profissional\"}", 201);
        assertEquals("Ana 2", jdbc.queryForObject("select apelido from usuario where identificador = 'ana2' and loja_id = (select id from loja where slug = ?)", String.class, SLUG));
        // usuário repetido (sem diferenciar maiúsculas), reservado, perfil e entrada inválidos
        criarUsuarioNaLoja("{\"nome\":\"Outra\",\"usuario\":\"ANA\",\"papel\":\"atendente\"}", 409);
        criarUsuarioNaLoja("{\"nome\":\"Suporte\",\"usuario\":\"bia\",\"papel\":\"atendente\"}", 400);
        criarUsuarioNaLoja("{\"nome\":\"Bia\",\"usuario\":\"suporte\",\"papel\":\"atendente\"}", 400);
        criarUsuarioNaLoja("{\"nome\":\"Bia\",\"usuario\":\"fumaca-x\",\"papel\":\"atendente\"}", 400);
        criarUsuarioNaLoja("{\"nome\":\"Bia\",\"usuario\":\"bia\",\"papel\":\"gerente\"}", 400);
        criarUsuarioNaLoja("{\"nome\":\"Bia\",\"usuario\":\"bia\"}", 400);
        criarUsuarioNaLoja("{\"nome\":\"   \",\"usuario\":\"bia\",\"papel\":\"atendente\"}", 400);
        criarUsuarioNaLoja("{\"nome\":\"Bia\",\"usuario\":\"b\",\"papel\":\"atendente\"}", 400);
        criarUsuarioNaLoja("{\"nome\":\"Bia\",\"usuario\":\"b i a\",\"papel\":\"atendente\"}", 400);
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador = 'bia'", Integer.class));
        // loja que não existe = 404
        mvc.perform(post(BASE + "/nao-existe/usuarios").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Bia\",\"usuario\":\"bia\",\"papel\":\"atendente\"}")).andExpect(status().isNotFound());
    }

    @Test
    void adminRespeitaOLimiteDeUsuariosDaLojaAoCriar() throws Exception {
        criarLoja("barbearia");
        // o dono já ocupa 1 vaga (o suporte não conta): limite 2 deixa entrar um e recusa o seguinte
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":2}")).andExpect(status().isOk());
        criarUsuarioNaLoja("{\"nome\":\"Ana\",\"usuario\":\"ana\",\"papel\":\"profissional\"}", 201);
        String recusa = criarUsuarioNaLoja("{\"nome\":\"Caio\",\"usuario\":\"caio\",\"papel\":\"profissional\"}", 409);
        assertEquals(true, recusa.contains("limite"));
        assertEquals(0, jdbc.queryForObject("select count(*) from usuario where identificador = 'caio'", Integer.class));
        mvc.perform(put(BASE + "/" + SLUG + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":3}")).andExpect(status().isOk());
        criarUsuarioNaLoja("{\"nome\":\"Caio\",\"usuario\":\"caio\",\"papel\":\"profissional\"}", 201);
    }

    @Test
    void adminMudaOPerfilSemDeixarALojaSemDonoNemTocarEmOutraLoja() throws Exception {
        criarLoja("barbearia");
        String url = BASE + "/" + SLUG + "/usuarios/";
        criarUsuarioNaLoja("{\"nome\":\"Bia Rocha\",\"usuario\":\"bia\",\"papel\":\"profissional\"}", 201);
        String bia = idDe("bia");
        String dona = idDe("dona");
        String corpo = "{\"papel\":\"admin\"}";
        // sem chave = 403, e nada muda
        mvc.perform(put(url + bia + "/papel").contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isForbidden());
        assertEquals("profissional", jdbc.queryForObject("select papel from usuario where id = ?::uuid", String.class, bia));
        // muda: 200 e a lista reflete
        mvc.perform(put(url + bia + "/papel").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isOk()).andExpect(jsonPath("$.papel").value("admin")).andExpect(jsonPath("$.anterior").value("profissional"))
                .andExpect(jsonPath("$.mudou").value(true)).andExpect(jsonPath("$.usuario").value("bia"));
        mvc.perform(get(BASE + "/" + SLUG + "/usuarios").header("X-Interno-Chave", CHAVE)).andExpect(jsonPath("$[?(@.usuario=='bia')].papel").value(hasItem("admin")));
        // mesmo perfil de novo = sem mudança, sem erro
        mvc.perform(put(url + bia + "/papel").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mudou").value(false));
        // perfil inválido ou ausente = 400
        for (String ruim : new String[] {"{\"papel\":\"gerente\"}", "{\"papel\":\"\"}", "{}", "{\"papel\":\"suporte\"}"}) {
            mvc.perform(put(url + bia + "/papel").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content(ruim)).andExpect(status().isBadRequest());
        }
        assertEquals("admin", jdbc.queryForObject("select papel from usuario where id = ?::uuid", String.class, bia));
        // o proprietário não vira outro perfil por aqui (a loja nunca fica sem dono)
        mvc.perform(put(url + dona + "/papel").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"papel\":\"atendente\"}")).andExpect(status().isConflict());
        assertEquals("dono", jdbc.queryForObject("select papel from usuario where id = ?::uuid", String.class, dona));
        // usuário de outra loja, id que não existe e o suporte = 404
        mvc.perform(put(BASE + "/offbox/usuarios/" + bia + "/papel").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"papel\":\"atendente\"}")).andExpect(status().isNotFound());
        mvc.perform(put(url + "00000000-0000-0000-0000-000000000000/papel").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content(corpo)).andExpect(status().isNotFound());
        String suporte = jdbc.queryForObject("select id::text from usuario where identificador = 'suporte' and loja_id = (select id from loja where slug = ?)", String.class, SLUG);
        mvc.perform(put(url + suporte + "/papel").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"papel\":\"atendente\"}")).andExpect(status().isNotFound());
        assertEquals("admin", jdbc.queryForObject("select papel from usuario where id = ?::uuid", String.class, suporte));
    }
}
