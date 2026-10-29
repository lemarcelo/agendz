package br.com.agendz.agenda;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

/** Boxes da estética (GET /api/boxes e PUT /api/estabelecimento/boxes): só o dono grava, lista substitui por id, histórico e carro agendado protegem o box. */
class BoxTest extends BaseApi {

    @Autowired
    JdbcTemplate jdbc;

    String davi, pablo;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pablo = token(APEX, "pablo");
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from agendamento_servico");
        EsteticaDeTeste.restaurarBoxes(jdbc);
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
    }

    private ResultActions gravar(String token, String corpo) throws Exception {
        return mvc.perform(put("/api/estabelecimento/boxes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(token)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private static String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private UUID box(String nome) {
        return jdbc.queryForObject("select id from box where nome = ?", UUID.class, nome);
    }

    @Test
    void qualquerUmDaAgendaLeMasSoODonoGrava() throws Exception {
        mvc.perform(get("/api/boxes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(pablo))).andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3))).andExpect(jsonPath("$[0].nome").value("Box 1")).andExpect(jsonPath("$[2].ativo").value(true));
        mvc.perform(get("/api/boxes").with(host(APEX))).andExpect(status().isUnauthorized());
        gravar(pablo, "{\"boxes\":[{\"nome\":\"Meu box\"}]}").andExpect(status().isForbidden());
        gravar(davi, "{\"boxes\":[{\"nome\":\"Meu box\"}]}").andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1))).andExpect(jsonPath("$[0].nome").value("Meu box"));
        // a barbearia não usa box: a lista é vazia e gravar é recusado
        String alan = token(DALFORNO, "alan");
        mvc.perform(get("/api/boxes").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan))).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(put("/api/estabelecimento/boxes").with(host(DALFORNO)).header(HttpHeaders.AUTHORIZATION, bearer(alan)).contentType(MediaType.APPLICATION_JSON).content("{\"boxes\":[{\"nome\":\"X\"}]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Este tipo de estabelecimento não usa box."));
    }

    @Test
    void renomearTrocarNomesEDesativarPorId() throws Exception {
        UUID b1 = box("Box 1"), b2 = box("Box 2"), b3 = box("Box 3");
        // trocar os nomes de dois boxes entre si e desativar o terceiro
        gravar(davi, "{\"boxes\":[{\"id\":\"" + b1 + "\",\"nome\":\"Box 2\"},{\"id\":\"" + b2 + "\",\"nome\":\"Box 1\"},{\"id\":\"" + b3 + "\",\"nome\":\"Box 3\",\"ativo\":false}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(b1.toString())).andExpect(jsonPath("$[0].nome").value("Box 2")).andExpect(jsonPath("$[1].nome").value("Box 1"))
                .andExpect(jsonPath("$[2].ativo").value(false));
        assertEquals("Box 2", jdbc.queryForObject("select nome from box where id = ?", String.class, b1));
        // id desconhecido ou repetido vira box novo
        gravar(davi, "{\"boxes\":[{\"id\":\"" + b1 + "\",\"nome\":\"A\"},{\"id\":\"" + b1 + "\",\"nome\":\"B\"},{\"id\":\"" + UUID.randomUUID() + "\",\"nome\":\"C\"}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(3)));
        assertEquals(3, jdbc.queryForObject("select count(*) from box", Integer.class));
        assertEquals("A", jdbc.queryForObject("select nome from box where id = ?", String.class, b1));
    }

    @Test
    void validacaoDaLista() throws Exception {
        String[][] ruins = {
                {"{\"boxes\":[]}", "Boxes inválidos: de 1 a 20, cada um com nome de até 30 letras."},
                {"{}", "Boxes inválidos: de 1 a 20, cada um com nome de até 30 letras."},
                {"{\"boxes\":[{\"nome\":\"   \"}]}", "Boxes inválidos: de 1 a 20, cada um com nome de até 30 letras."},
                {"{\"boxes\":[{\"nome\":\"" + "x".repeat(31) + "\"}]}", "Boxes inválidos: de 1 a 20, cada um com nome de até 30 letras."},
                {"{\"boxes\":[{\"nome\":\"Box 1\"},{\"nome\":\" box 1 \"}]}", "Dois boxes têm o mesmo nome."},
                {"{\"boxes\":[{\"nome\":\"A\",\"ativo\":false}]}", "Deixe ao menos um box ativo."},
        };
        for (String[] r : ruins) gravar(davi, r[0]).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value(r[1]));
        StringBuilder muitos = new StringBuilder("{\"boxes\":[");
        for (int i = 1; i <= 21; i++) muitos.append(i > 1 ? "," : "").append("{\"nome\":\"B").append(i).append("\"}");
        gravar(davi, muitos + "]}").andExpect(status().isBadRequest());
        assertEquals(3, jdbc.queryForObject("select count(*) from box", Integer.class)); // nada mudou
    }

    @Test
    void boxComHistoricoNaoSaiEBoxComCarroAgendadoNaoDesativa() throws Exception {
        UUID cliente = jdbc.queryForObject("insert into cliente (loja_id, nome, telefone_cif, telefone_hash) values (?::uuid, 'Ana', 'v1:teste', md5('5553999000040')) returning id", UUID.class, EsteticaDeTeste.LOJA_APEX);
        UUID pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, EsteticaDeTeste.LOJA_APEX);
        String servico = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"preco\":80,\"duracaoMin\":60}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        Instant futuro = Instant.now().plus(5, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
        String ag = id(mvc.perform(post("/api/agendamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"clienteId\":\"" + cliente + "\",\"profissionalId\":\"" + pabloId + "\",\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\",\"porte\":\"medio\"},\"servicoIds\":[\"" + servico + "\"],\"inicio\":\"" + futuro + "\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.estetica.box").value("Box 1")).andReturn().getResponse().getContentAsString());
        UUID b1 = box("Box 1"), b2 = box("Box 2"), b3 = box("Box 3");
        String sem1 = "{\"boxes\":[{\"id\":\"" + b2 + "\",\"nome\":\"Box 2\"},{\"id\":\"" + b3 + "\",\"nome\":\"Box 3\"}]}";
        gravar(davi, sem1).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("Box 1 tem histórico de atendimentos: desative em vez de remover."));
        String desativado = "{\"boxes\":[{\"id\":\"" + b1 + "\",\"nome\":\"Box 1\",\"ativo\":false},{\"id\":\"" + b2 + "\",\"nome\":\"Box 2\"},{\"id\":\"" + b3 + "\",\"nome\":\"Box 3\"}]}";
        gravar(davi, desativado).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("Box 1 tem carro agendado. Remarque antes de desativar."));
        // cancelado, o box pode ser desativado (continua com histórico)
        mvc.perform(put("/api/agendamentos/" + ag + "/status").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"cancelado\"}")).andExpect(status().isOk());
        gravar(davi, desativado).andExpect(status().isOk()).andExpect(jsonPath("$[0].ativo").value(false));
    }
}
