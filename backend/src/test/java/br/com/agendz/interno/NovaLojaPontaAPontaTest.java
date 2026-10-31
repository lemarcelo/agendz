package br.com.agendz.interno;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Cliente novo de ponta a ponta, como o Admin faz (`POST /interno/plataforma/lojas`): endereço, pergunta do Caddy, login do dono com a senha temporária,
 * troca escolhendo o usuário, assistente de primeiro acesso (catálogo do tipo, produtos, equipe, expediente), Agenda/Clientes/Serviços, regras do Admin e 402.
 * Usa lojas próprias (slugs `novabarb`, `novaesteti`, `novaoutra`), apagadas no começo e no fim. Roda no CI (Testcontainers); não compila neste ambiente.
 */
class NovaLojaPontaAPontaTest extends BaseApi {

    private static final String CHAVE = "chave-interna-so-para-teste-0123456789";
    private static final String BASE = "/interno/plataforma/lojas";
    private static final String BARB = "novabarb";
    private static final String ESTET = "novaesteti";
    private static final String OUTRA = "novaoutra";
    private static final String DEFINITIVA = "SenhaDefinitiva#2026";
    private static final String PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper om;

    @BeforeEach
    @AfterEach
    void limpar() {
        for (String slug : List.of(BARB, ESTET, OUTRA)) apagar(slug);
    }

    /** Apaga a loja e tudo que tem `loja_id`, repetindo até as chaves estrangeiras deixarem (a ordem das tabelas não importa). */
    private void apagar(String slug) {
        List<String> ids = jdbc.queryForList("select id::text from loja where slug = ?", String.class, slug);
        if (ids.isEmpty()) return;
        List<String> tabelas = jdbc.queryForList("select table_name from information_schema.columns where table_schema = 'public' and column_name = 'loja_id' and table_name <> 'loja'", String.class);
        List<String> restantes = new java.util.ArrayList<>(tabelas);
        for (int volta = 0; volta < 6 && !restantes.isEmpty(); volta++) {
            for (String t : List.copyOf(restantes)) {
                try {
                    jdbc.update("delete from " + t + " where loja_id = ?::uuid", ids.get(0));
                    restantes.remove(t);
                } catch (DataAccessException e) {
                    // tabela que ainda é referenciada por outra: tenta de novo na próxima volta
                }
            }
        }
        jdbc.update("delete from loja where id = ?::uuid", ids.get(0));
    }

    // ---------------------------------------------------------------- ajudantes

    private static String campo(String json, String nome) {
        Matcher m = Pattern.compile("\"" + nome + "\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem " + nome + ": " + json);
        return m.group(1);
    }

    private static String h(String slug) {
        return slug + ".agendz.io";
    }

    private ResultActions criar(String slug, String tipo, String dono, String logo) throws Exception {
        String corpoLogo = logo == null ? "" : ",\"logo\":\"" + logo + "\"";
        return mvc.perform(post(BASE).header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"slug\":\"" + slug + "\",\"nome\":\"Loja Nova " + slug + "\",\"tipo\":\"" + tipo + "\",\"donoUsuario\":\"" + dono + "\",\"donoNome\":\"Dona Nova\"" + corpoLogo + "}"));
    }

    private ResultActions pegar(String slug, String token, String rota) throws Exception {
        return mvc.perform(get(rota).with(host(h(slug))).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions enviar(String slug, String token, String rota, String corpo) throws Exception {
        return mvc.perform(post(rota).with(host(h(slug))).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private void mudarStatus(String slug, String status, int esperado) throws Exception {
        mvc.perform(put(BASE + "/" + slug + "/status").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + status + "\"}"))
                .andExpect(status().is(esperado));
    }

    /** Cria, entra com a temporária, troca escolhendo o usuário e devolve {token, usuarioEscolhido}. */
    private String[] criarEEntrar(String slug, String tipo, String donoProvisorio) throws Exception {
        String json = criar(slug, tipo, donoProvisorio, null).andExpect(status().isCreated()).andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.slug").value(slug)).andExpect(jsonPath("$.tipo").value(tipo)).andExpect(jsonPath("$.donoUsuario").value(donoProvisorio))
                .andReturn().getResponse().getContentAsString();
        String temporaria = campo(json, "senhaTemporaria");
        assertTrue(temporaria.length() >= 12, "senha temporária forte");
        assertTrue(campo(json, "suporteSenhaTemporaria").length() >= 12);
        // o endereço da loja nova já responde pelo Host, com o tipo certo (nunca outra loja)
        mvc.perform(get("/api/publico/loja").with(host(h(slug)))).andExpect(status().isOk()).andExpect(jsonPath("$.slug").value(slug)).andExpect(jsonPath("$.tipo").value(tipo));
        // entrar com a temporária: obrigada a trocar, e o token só serve para trocar a senha
        String login = mvc.perform(post("/api/auth/login").with(host(h(slug))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(donoProvisorio, temporaria)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true)).andExpect(jsonPath("$.papel").value("dono"))
                .andReturn().getResponse().getContentAsString();
        String tokenTemp = campo(login, "token");
        pegar(slug, tokenTemp, "/api/servicos").andExpect(status().isForbidden()).andExpect(jsonPath("$.codigo").value("trocar_senha"));
        // troca escolhendo o usuário definitivo: já abre o assistente (sem nova entrada)
        String usuario = "dona." + slug;
        String troca = mvc.perform(put("/api/usuarios/me/senha").with(host(h(slug))).header(HttpHeaders.AUTHORIZATION, bearer(tokenTemp)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"senhaAtual\":\"" + temporaria + "\",\"nova\":\"" + DEFINITIVA + "\",\"usuario\":\"" + usuario + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(false)).andExpect(jsonPath("$.onboardingPendente").value(true))
                .andReturn().getResponse().getContentAsString();
        // a temporária e o usuário provisório deixam de valer
        mvc.perform(post("/api/auth/login").with(host(h(slug))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(usuario, temporaria))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(host(h(slug))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(donoProvisorio, DEFINITIVA))).andExpect(status().isUnauthorized());
        return new String[] {campo(troca, "token"), usuario};
    }

    /** Percorre o assistente (serviços do catálogo, produto, equipe, expediente sugerido) e conclui. Devolve o login e a temporária da pessoa criada. */
    private String[] percorrerAssistente(String slug, String tipo, String token, String chaveServico, String nomeServico) throws Exception {
        pegar(slug, token, "/api/onboarding").andExpect(status().isOk()).andExpect(jsonPath("$.tipo").value(tipo)).andExpect(jsonPath("$.concluido").value(false))
                .andExpect(jsonPath("$.passo").value("servicos")).andExpect(jsonPath("$.servicos[*].chave").value(hasItem(chaveServico)))
                .andExpect(jsonPath("$.expedienteSugerido.semana").exists());
        // loja nova ainda sem serviço, sem produto e sem cliente (e nenhuma linha de configuração faltando derruba as telas)
        pegar(slug, token, "/api/servicos").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        pegar(slug, token, "/api/clientes").andExpect(status().isOk());
        pegar(slug, token, "/api/estabelecimento/regras-atendimento").andExpect(status().isOk());
        pegar(slug, token, "/api/estabelecimento/link-agendamento").andExpect(status().isOk());
        pegar(slug, token, "/api/estabelecimento/comissao").andExpect(status().isOk());
        pegar(slug, token, "/api/estabelecimento/marca").andExpect(status().isOk());

        enviar(slug, token, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"" + chaveServico + "\"}]}").andExpect(status().isOk()).andExpect(jsonPath("$.criados").value(1));
        enviar(slug, token, "/api/onboarding/produtos", "{\"itens\":[{\"nome\":\"Produto Inicial\",\"preco\":25.5,\"estoque\":10}]}").andExpect(status().isOk());
        String equipe = enviar(slug, token, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Bruno Cabral\",\"comissaoPct\":30}]}").andExpect(status().isOk())
                .andExpect(jsonPath("$.pessoas[0].nome").value("Bruno Cabral")).andReturn().getResponse().getContentAsString();
        String sugerido = om.readTree(pegar(slug, token, "/api/onboarding").andReturn().getResponse().getContentAsString()).get("expedienteSugerido").toString();
        enviar(slug, token, "/api/onboarding/expediente", sugerido).andExpect(status().isOk()).andExpect(jsonPath("$.criados").value(1));
        enviar(slug, token, "/api/onboarding/concluir", "{}").andExpect(status().isOk()).andExpect(jsonPath("$.concluido").value(true));
        pegar(slug, token, "/api/onboarding").andExpect(jsonPath("$.concluido").value(true)).andExpect(jsonPath("$.passo").value("pronto"));

        // Agenda, Clientes, Serviços e Equipe acessíveis, com os dados do catálogo do tipo
        pegar(slug, token, "/api/servicos").andExpect(status().isOk()).andExpect(jsonPath("$[*].nome").value(hasItem(nomeServico)));
        pegar(slug, token, "/api/estabelecimento/escala").andExpect(status().isOk()).andExpect(jsonPath("$.semana['1'].aberto").value(true));
        pegar(slug, token, "/api/profissionais").andExpect(status().isOk()).andExpect(jsonPath("$[*].nome").value(hasItem("Bruno Cabral")));
        pegar(slug, token, "/api/agendamentos?de=2026-01-01T00:00:00Z&ate=2026-12-31T00:00:00Z").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        pegar(slug, token, "/api/produtos").andExpect(status().isOk()).andExpect(jsonPath("$[*].nome").value(hasItem("Produto Inicial")));
        pegar(slug, token, "/api/clientes").andExpect(status().isOk());
        return new String[] {campo(equipe, "login"), campo(equipe, "senhaTemporaria")};
    }

    private void situacaoDaLoja(String slug, String token) throws Exception {
        // suspensa e encerrada: 402 na agenda, mas a identidade da loja, entrar e a pergunta do Caddy continuam; reativar devolve a loja
        for (String fechado : new String[] {"suspenso", "encerrado"}) {
            mudarStatus(slug, fechado, 200);
            pegar(slug, token, "/api/agendamentos?de=2026-01-01T00:00:00Z&ate=2026-12-31T00:00:00Z").andExpect(status().isPaymentRequired());
            pegar(slug, token, "/api/servicos").andExpect(status().isPaymentRequired());
            mvc.perform(get("/api/publico/agendar").with(host(h(slug)))).andExpect(status().isPaymentRequired());
            mvc.perform(get("/api/publico/loja").with(host(h(slug)))).andExpect(status().isOk());
            mvc.perform(get("/interno/dominio-permitido").param("domain", h(slug))).andExpect(status().isOk());
        }
        mudarStatus(slug, "em_teste", 200);
        pegar(slug, token, "/api/servicos").andExpect(status().isOk());
    }

    // ---------------------------------------------------------------- testes

    @Test
    void barbeariaNovaDoEnderecoAteAAgenda() throws Exception {
        String[] sessao = criarEEntrar(BARB, "barbearia", "provisorio1");
        String token = sessao[0];
        String[] pessoa = percorrerAssistente(BARB, "barbearia", token, "s-barba", "Barba");
        // a pessoa da equipe entra com a temporária dela e é obrigada a trocar; barbearia não cria box
        mvc.perform(post("/api/auth/login").with(host(h(BARB))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(pessoa[0], pessoa[1])))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(true)).andExpect(jsonPath("$.papel").value("profissional"));
        assertEquals(0, jdbc.queryForObject("select count(*) from box where loja_id = (select id from loja where slug = ?)", Integer.class, BARB));
        // o novo login do dono entra direto, sem assistente pendente
        mvc.perform(post("/api/auth/login").with(host(h(BARB))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin(sessao[1], DEFINITIVA)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deveTrocarSenha").value(false)).andExpect(jsonPath("$.onboardingPendente").value(false));
        situacaoDaLoja(BARB, token);
    }

    @Test
    void esteticaNovaTemBoxesEOCatalogoDeLavagem() throws Exception {
        String[] sessao = criarEEntrar(ESTET, "estetica_automotiva", "provisorio2");
        String token = sessao[0];
        percorrerAssistente(ESTET, "estetica_automotiva", token, "s-lav-simples", "Lavagem simples");
        // concluir cria um box por quem atende (o dono e Bruno): sem box a agenda não aceita carro
        pegar(ESTET, token, "/api/boxes").andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(greaterThanOrEqualTo(1)));
        // o catálogo da estética traz preço por porte
        pegar(ESTET, token, "/api/servicos").andExpect(jsonPath("$[?(@.nome=='Lavagem simples')].precos.suv").exists());
        // catálogo de outro tipo não vale aqui
        enviar(ESTET, token, "/api/onboarding/servicos", "{\"itens\":[{\"chave\":\"s-barba\"}]}").andExpect(status().isBadRequest());
        situacaoDaLoja(ESTET, token);
    }

    @Test
    void enderecoInvalidoReservadoOuRepetidoERecusadoENadaFicaNoBanco() throws Exception {
        criar(BARB, "barbearia", "dona1", null).andExpect(status().isCreated());
        // repetido (também com maiúsculas) e loja que já existe em produção
        criar(BARB, "barbearia", "dona2", null).andExpect(status().isConflict());
        criar(BARB.toUpperCase(), "barbearia", "dona2", null).andExpect(status().isConflict());
        criar("apex", "barbearia", "dona2", null).andExpect(status().isConflict());
        // reservados (também com maiúsculas), formato ruim, hífen nas pontas, longo demais, vazio
        for (String ruim : new String[] {"www", "ADMIN", "api", "suporte", "status", "ruim_slug", "-abc", "abc-", "a.b", "com espaco", "x".repeat(41), "", "   "}) {
            criar(ruim, "barbearia", "dona3", null).andExpect(status().isBadRequest());
        }
        // tipo desconhecido, dono reservado ou inválido
        criar(OUTRA, "academia", "dona3", null).andExpect(status().isBadRequest());
        criar(OUTRA, "barbearia", "suporte", null).andExpect(status().isBadRequest());
        criar(OUTRA, "barbearia", "fumaca-abc", null).andExpect(status().isBadRequest());
        criar(OUTRA, "barbearia", "d", null).andExpect(status().isBadRequest());
        criar(OUTRA, "barbearia", "com espaco", null).andExpect(status().isBadRequest());
        criar(OUTRA, "barbearia", "dona3", "data:text/html;base64,PHNjcmlwdD4=").andExpect(status().isBadRequest());
        criar(OUTRA, "barbearia", "dona3", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=").andExpect(status().isBadRequest());
        assertEquals(0, jdbc.queryForObject("select count(*) from loja where slug in (?, 'www', 'admin', 'api', 'suporte', 'status')", Integer.class, OUTRA));
        assertEquals(1, jdbc.queryForObject("select count(*) from loja where slug = ?", Integer.class, BARB));
        // endereço com espaços nas pontas é aceito já limpo
        criar(" " + OUTRA + " ", "barbearia", "dona3", null).andExpect(status().isCreated()).andExpect(jsonPath("$.slug").value(OUTRA));
    }

    @Test
    void logoValidaApareceNaIdentidadeDaLojaENaoVazaParaOutra() throws Exception {
        criar(BARB, "barbearia", "dona1", PNG).andExpect(status().isCreated());
        criar(ESTET, "estetica_automotiva", "dona1", null).andExpect(status().isCreated());
        mvc.perform(get("/api/publico/loja").with(host(h(BARB)))).andExpect(status().isOk()).andExpect(jsonPath("$.logo").value(startsWith("data:image/png;base64,")));
        // a outra loja nova não herda logo (cai no ícone do tipo, nunca na marca de outra)
        String json = mvc.perform(get("/api/publico/loja").with(host(h(ESTET)))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(!json.contains("data:image"), "loja sem logo não pode trazer a logo de outra");
    }

    @Test
    void mesmoLoginDeDonoEmDuasLojasNovasNaoSeCruza() throws Exception {
        String a = campo(criar(BARB, "barbearia", "dona", null).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "senhaTemporaria");
        String b = campo(criar(ESTET, "estetica_automotiva", "dona", null).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "senhaTemporaria");
        mvc.perform(post("/api/auth/login").with(host(h(BARB))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", a))).andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").with(host(h(ESTET))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", b))).andExpect(status().isOk());
        // a senha de uma não abre a outra
        mvc.perform(post("/api/auth/login").with(host(h(BARB))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", b))).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(host(h(ESTET))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona", a))).andExpect(status().isUnauthorized());
        // e nenhuma loja existente é tocada: a lista do Admin mostra as duas novas como ativas, com 1 usuário (o suporte não conta)
        mvc.perform(get(BASE).header("X-Interno-Chave", CHAVE)).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.slug=='" + BARB + "')].usuarios").value(hasItem(1))).andExpect(jsonPath("$[?(@.slug=='" + ESTET + "')].tipo").value(hasItem("estetica_automotiva")));
    }

    @Test
    void perguntaDoCaddySoLiberaLojaQueExiste() throws Exception {
        mvc.perform(get("/interno/dominio-permitido").param("domain", h(BARB))).andExpect(status().isNotFound());
        criar(BARB, "barbearia", "dona1", null).andExpect(status().isCreated());
        mvc.perform(get("/interno/dominio-permitido").param("domain", h(BARB))).andExpect(status().isOk());
        mvc.perform(get("/interno/dominio-permitido").param("domain", h(BARB).toUpperCase())).andExpect(status().isOk());
        // irmãos, níveis a mais, reservados, domínio de fora e o domínio base: nada de certificado
        for (String nome : new String[] {h(OUTRA), "x." + h(BARB), h(BARB) + ".evil.com", "www.agendz.io", "admin.agendz.io", "agendz.io", "outro.com"}) {
            mvc.perform(get("/interno/dominio-permitido").param("domain", nome)).andExpect(status().isNotFound());
        }
        // endereço de loja que não existe nunca vira loja padrão
        mvc.perform(get("/api/publico/loja").with(host(h(OUTRA)))).andExpect(status().isNotFound());
        mvc.perform(post("/api/auth/login").with(host(h(OUTRA))).contentType(MediaType.APPLICATION_JSON).content(corpoLogin("dona1", "qualquer"))).andExpect(status().isNotFound());
    }

    @Test
    void regrasDoAdminValemNoAssistenteDeLojaNova() throws Exception {
        String[] sessao = criarEEntrar(ESTET, "estetica_automotiva", "provisorio3");
        String token = sessao[0];
        // limite de 2 usuários (o dono ocupa 1; o suporte não conta): o assistente cria 1 pessoa e recusa a segunda
        mvc.perform(put(BASE + "/" + ESTET + "/regras").header("X-Interno-Chave", CHAVE).contentType(MediaType.APPLICATION_JSON).content("{\"limiteUsuarios\":2,\"limiteAgendas\":1}")).andExpect(status().isOk());
        enviar(ESTET, token, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Bruno Cabral\"},{\"nome\":\"Caio Lima\"}]}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value(containsString("limite")));
        assertEquals(1, jdbc.queryForObject("select count(*) from usuario where ativo and identificador <> 'suporte' and loja_id = (select id from loja where slug = ?)", Integer.class, ESTET));
        enviar(ESTET, token, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Bruno Cabral\"}]}").andExpect(status().isOk());
        enviar(ESTET, token, "/api/onboarding/equipe", "{\"pessoas\":[{\"nome\":\"Caio Lima\"}]}").andExpect(status().isConflict());
        // limite de 1 agenda: concluir cria 1 box só (mesmo com dois profissionais que atendem)
        enviar(ESTET, token, "/api/onboarding/concluir", "{}").andExpect(status().isOk());
        assertEquals(1, jdbc.queryForObject("select count(*) from box where loja_id = (select id from loja where slug = ?)", Integer.class, ESTET));
    }
}
