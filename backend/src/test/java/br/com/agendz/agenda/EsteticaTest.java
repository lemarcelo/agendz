package br.com.agendz.agenda;

import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.agendz.BaseApi;
import br.com.agendz.escala.Fuso;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
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

/** Estética no servidor (F2 5a-estética): veículo e porte definem preço e duração, o box nunca duplica, serviço de vários dias ocupa blocos e mantém o carro no box. */
class EsteticaTest extends BaseApi {

    private static final String SUV = ",\"veiculo\":{\"placa\":\"BRA2E19\",\"modelo\":\"Creta\",\"porte\":\"suv\"}";
    private static final String PEQUENO = ",\"veiculo\":{\"placa\":\"ABC-1234\",\"modelo\":\"Mobi\",\"porte\":\"pequeno\"}";

    @Autowired
    JdbcTemplate jdbc;

    String davi;
    UUID pabloId, marceloId, clienteA, clienteB;
    String lavagem;
    Instant t;

    @BeforeEach
    void preparar() throws Exception {
        limpar();
        davi = token(APEX, "davi");
        pabloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'pablo'", UUID.class, EsteticaDeTeste.LOJA_APEX);
        marceloId = jdbc.queryForObject("select id from usuario where loja_id = ?::uuid and identificador = 'marcelo'", UUID.class, EsteticaDeTeste.LOJA_APEX);
        clienteA = novoCliente("Ana Souza", "(53) 99900-1001");
        clienteB = novoCliente("Bruno Lima", "(53) 99900-1002");
        lavagem = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Lavagem\",\"precos\":{\"pequeno\":60,\"medio\":80,\"grande\":100,\"suv\":120,\"pickup\":140},\"duracoes\":{\"pequeno\":40,\"medio\":60,\"grande\":80,\"suv\":90,\"pickup\":100},\"intervaloMin\":0}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        t = Instant.now().plus(10, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
    }

    @AfterEach
    void limpar() {
        jdbc.update("delete from idempotencia");
        jdbc.update("delete from agendamento_servico");
        jdbc.update("delete from agendamento_produto");
        EsteticaDeTeste.restaurarBoxes(jdbc);
        jdbc.update("delete from servico_componente");
        jdbc.update("delete from servico");
        jdbc.update("delete from cliente");
        jdbc.update("delete from escala_faixa");
    }

    private static String id(String json) {
        Matcher m = Pattern.compile("\"id\":\"([^\"]+)\"").matcher(json);
        if (!m.find()) throw new IllegalStateException("sem id: " + json);
        return m.group(1);
    }

    private UUID novoCliente(String nome, String telefone) throws Exception {
        return UUID.fromString(id(mvc.perform(post("/api/clientes").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"" + nome + "\",\"telefone\":\"" + telefone + "\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()));
    }

    private ResultActions agendar(UUID cliente, UUID prof, String servico, Instant inicio, String extra) throws Exception {
        return mvc.perform(post("/api/agendamentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"clienteId\":\"" + cliente + "\",\"profissionalId\":\"" + prof + "\",\"servicoIds\":[\"" + servico + "\"],\"inicio\":\"" + inicio + "\"" + extra + "}"));
    }

    private String agendarOk(UUID cliente, UUID prof, Instant inicio, String extra) throws Exception {
        return id(agendar(cliente, prof, lavagem, inicio, extra).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private ResultActions remarcar(String ag, String corpo) throws Exception {
        return mvc.perform(put("/api/agendamentos/" + ag + "/remarcar").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(corpo));
    }

    private ResultActions mudarStatus(String ag, String status) throws Exception {
        return mvc.perform(put("/api/agendamentos/" + ag + "/status").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + status + "\"}"));
    }

    private void soUmBox() {
        jdbc.update("delete from box where nome <> 'Box 1'");
    }

    private UUID box(String nome) {
        return jdbc.queryForObject("select id from box where nome = ?", UUID.class, nome);
    }

    @Test
    void precoEDuracaoSaemDoPorteDoVeiculoEOVeiculoEntraNoCadastroDoCliente() throws Exception {
        agendar(clienteA, pabloId, lavagem, t, SUV).andExpect(status().isCreated())
                .andExpect(jsonPath("$.total").value(120)).andExpect(jsonPath("$.servicos[0].preco").value(120)).andExpect(jsonPath("$.servicos[0].duracaoMin").value(90))
                .andExpect(jsonPath("$.estetica.porte").value("suv")).andExpect(jsonPath("$.estetica.placa").value("BRA2E19")).andExpect(jsonPath("$.estetica.modelo").value("Creta"))
                .andExpect(jsonPath("$.estetica.box").value("Box 1")).andExpect(jsonPath("$.estetica.veiculoId").isNotEmpty());
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente_veiculo where cliente_id = ?", Integer.class, clienteA));
        assertEquals(t.plus(90, ChronoUnit.MINUTES), jdbc.queryForObject("select fim_servico from agendamento", OffsetDateTime.class).toInstant());
        // a placa antiga com hífen vira o formato de exibição e o preço é o do porte pequeno
        agendar(clienteB, marceloId, lavagem, t, PEQUENO).andExpect(status().isCreated()).andExpect(jsonPath("$.total").value(60)).andExpect(jsonPath("$.estetica.placa").value("ABC-1234"));
        // o mesmo veículo de novo (mesma placa) não duplica o cadastro
        agendar(clienteA, pabloId, lavagem, t.plus(5, ChronoUnit.HOURS), SUV).andExpect(status().isCreated());
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente_veiculo where cliente_id = ?", Integer.class, clienteA));
    }

    @Test
    void servicoDaEsteticaExigeOVeiculoEOVeiculoSoValeDoProprioCliente() throws Exception {
        agendar(clienteB, pabloId, lavagem, t, "").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Escolha o veículo do atendimento."));
        agendar(clienteB, pabloId, lavagem, t, ",\"veiculo\":{\"placa\":\"XXX\",\"modelo\":\"Onix\",\"porte\":\"medio\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23)."));
        agendar(clienteB, pabloId, lavagem, t, ",\"veiculo\":{\"placa\":\"ABC1D23\",\"modelo\":\"Onix\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.mensagem").value("Escolha o porte do veículo."));
        assertEquals(0, jdbc.queryForObject("select count(*) from agendamento", Integer.class)); // nada ficou gravado
        assertEquals(0, jdbc.queryForObject("select count(*) from cliente_veiculo", Integer.class));
        // cliente com um só veículo cadastrado: é esse, mesmo sem o campo
        UUID veiculoA = jdbc.queryForObject("insert into cliente_veiculo (loja_id, cliente_id, placa, placa_chave, modelo, porte) values (?::uuid, ?, 'JKL-9876', 'JKL9876', 'Kwid', 'pequeno') returning id",
                UUID.class, EsteticaDeTeste.LOJA_APEX, clienteA);
        agendar(clienteA, pabloId, lavagem, t, "").andExpect(status().isCreated()).andExpect(jsonPath("$.estetica.porte").value("pequeno")).andExpect(jsonPath("$.total").value(60));
        // veículo de outro cliente é recusado
        agendar(clienteB, marceloId, lavagem, t, ",\"veiculoId\":\"" + veiculoA + "\"").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Veículo não encontrado."));
        agendar(clienteA, marceloId, lavagem, t, ",\"veiculoId\":\"" + veiculoA + "\"").andExpect(status().isCreated());
    }

    @Test
    void oBoxNuncaDuplicaEOCancelamentoLibera() throws Exception {
        soUmBox();
        String primeiro = agendarOk(clienteA, pabloId, t, SUV);
        agendar(clienteB, marceloId, lavagem, t.plus(30, ChronoUnit.MINUTES), PEQUENO).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("O box está ocupado nesse horário."));
        // fim do serviço = 90 min: a partir daí o box está livre
        agendar(clienteB, marceloId, lavagem, t.plus(90, ChronoUnit.MINUTES), PEQUENO).andExpect(status().isCreated());
        jdbc.update("insert into box (loja_id, nome, ordem) values (?::uuid, 'Box 2', 1)", EsteticaDeTeste.LOJA_APEX);
        // com dois boxes o segundo carro vai para o livre; pedir o ocupado dá erro com o nome dele
        agendar(clienteB, marceloId, lavagem, t.plus(30, ChronoUnit.MINUTES), PEQUENO + ",\"boxId\":\"" + box("Box 1") + "\"").andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Box 1 está ocupado nesse horário."));
        agendar(clienteB, marceloId, lavagem, t.plus(30, ChronoUnit.MINUTES), PEQUENO).andExpect(status().isCreated()).andExpect(jsonPath("$.estetica.box").value("Box 2"));
        // box inexistente / de outra loja
        agendar(clienteA, pabloId, lavagem, t.plus(24, ChronoUnit.HOURS), SUV + ",\"boxId\":\"" + UUID.randomUUID() + "\"").andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Box não encontrado."));
        // cancelar libera o box
        mudarStatus(primeiro, "cancelado").andExpect(status().isOk());
        agendar(clienteA, pabloId, lavagem, t, SUV).andExpect(status().isCreated()).andExpect(jsonPath("$.estetica.box").value("Box 1"));
        // reativar o cancelado volta a conferir o box (e o profissional): agora o horário está tomado
        mudarStatus(primeiro, "confirmado").andExpect(status().isConflict());
    }

    @Test
    void semBoxCadastradoAAgendaNaoAceitaCarro() throws Exception {
        jdbc.update("delete from box");
        agendar(clienteA, pabloId, lavagem, t, SUV).andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Cadastre ao menos um box em Estabelecimento > Boxes."));
        assertEquals(0, jdbc.queryForObject("select count(*) from cliente_veiculo", Integer.class)); // o veículo novo voltou atrás junto
    }

    @Test
    void remarcarMantemOBoxSeEstiverLivreEPodeTrocar() throws Exception {
        String ag = agendarOk(clienteA, pabloId, t, SUV);
        remarcar(ag, "{\"inicio\":\"" + t.plus(1, ChronoUnit.DAYS) + "\"}").andExpect(status().isOk()).andExpect(jsonPath("$.estetica.box").value("Box 1"));
        // Box 1 ocupado por outro carro no novo horário: vai para o primeiro livre
        agendarOk(clienteB, marceloId, t.plus(2, ChronoUnit.DAYS), PEQUENO);
        remarcar(ag, "{\"inicio\":\"" + t.plus(2, ChronoUnit.DAYS) + "\"}").andExpect(status().isOk()).andExpect(jsonPath("$.estetica.box").value("Box 2"));
        // pedir um box específico
        remarcar(ag, "{\"inicio\":\"" + t.plus(3, ChronoUnit.DAYS) + "\",\"boxId\":\"" + box("Box 3") + "\"}").andExpect(status().isOk()).andExpect(jsonPath("$.estetica.box").value("Box 3"));
        mvc.perform(get("/api/agendamentos/" + ag).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi))).andExpect(status().isOk())
                .andExpect(jsonPath("$.historico[?(@.campo=='box')]", hasSize(2)));  // Box 1 → Box 2 → Box 3 (a 1ª remarcação manteve o Box 1: sem evento)
    }

    @Test
    void servicoDeVariosDiasOcupaBlocosMasMantemOCarroNoBoxEntreOsDias() throws Exception {
        LocalDate segunda = LocalDate.now(Fuso.BRASIL).plusDays(14).with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY));
        String semana = "{\"semana\":{" + String.join(",", java.util.stream.IntStream.range(0, 7).mapToObj(d -> "\"" + d + "\":{\"aberto\":true,\"faixas\":[[\"09:00\",\"18:00\"]]}").toList()) + "}}";
        mvc.perform(put("/api/estabelecimento/escala").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(semana)).andExpect(status().isOk());
        soUmBox();
        String vitrificacao = id(mvc.perform(post("/api/servicos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Vitrificação\",\"preco\":900,\"duracaoMin\":600,\"multiDia\":true,\"intervaloMin\":0}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        // 10 h de trabalho: segunda 09h-18h (9 h) + terça 09h-10h
        String ag = id(agendar(clienteA, pabloId, vitrificacao, local(segunda, 9, 0), SUV + ",\"status\":\"confirmado\"").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(local(segunda.plusDays(1), 10, 0), jdbc.queryForObject("select fim_servico from agendamento where id = ?::uuid", OffsetDateTime.class, ag).toInstant());
        assertEquals(2, jdbc.queryForObject("select count(*) from agendamento_bloco where agendamento_id = ?::uuid", Integer.class, ag));
        // o carro continua no único box até a retirada: outro profissional livre não consegue box na segunda à tarde nem na terça às 9h30
        agendar(clienteB, marceloId, lavagem, local(segunda, 12, 0), PEQUENO).andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value("O box está ocupado nesse horário."));
        agendar(clienteB, marceloId, lavagem, local(segunda.plusDays(1), 9, 30), PEQUENO).andExpect(status().isConflict());
        // a partir das 10h da terça o box e o Pablo estão livres
        agendar(clienteB, pabloId, lavagem, local(segunda.plusDays(1), 10, 0), PEQUENO).andExpect(status().isCreated());
        // o Pablo está ocupado na terça das 9h às 10h (bloco), mesmo que o box de outro carro estivesse livre
        jdbc.update("insert into box (loja_id, nome, ordem) values (?::uuid, 'Box 2', 1)", EsteticaDeTeste.LOJA_APEX);
        agendar(clienteB, pabloId, lavagem, local(segunda.plusDays(1), 9, 0), PEQUENO).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("Esse horário já está confirmado para outro cliente. Para forçar, marque como encaixe."));
        // e livre entre os blocos: na segunda depois do expediente não há bloco, mas a escala impede; dentro do expediente o Pablo está ocupado o dia todo
        agendar(clienteB, pabloId, lavagem, local(segunda, 14, 0), PEQUENO).andExpect(status().isConflict());
        // remarcar o serviço de vários dias recalcula os blocos
        remarcar(ag, "{\"inicio\":\"" + local(segunda.plusDays(7), 15, 0) + "\"}").andExpect(status().isOk());
        assertEquals(local(segunda.plusDays(8), 16, 0), jdbc.queryForObject("select fim_servico from agendamento where id = ?::uuid", OffsetDateTime.class, ag).toInstant()); // 3 h na segunda + 7 h na terça
    }

    @Test
    void veiculoComAgendamentoAtivoNaoSaiDoCadastroDoCliente() throws Exception {
        agendarOk(clienteA, pabloId, t, SUV);
        mvc.perform(put("/api/clientes/" + clienteA).with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nome\":\"Ana Souza\",\"telefone\":\"(53) 99900-1001\",\"veiculos\":[]}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.mensagem").value("O veículo BRA2E19 tem agendamento ativo. Cancele ou remarque antes de removê-lo."));
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente_veiculo where cliente_id = ?", Integer.class, clienteA));
    }

    @Test
    void semBoxAtivoNaoSeAtendeNemSeAbreOLinkDoCliente() throws Exception {
        jdbc.update("update box set ativo = false");
        String corpo = "{\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[\"" + lavagem + "\"],\"nome\":\"Caio\",\"telefone\":\"(53) 99900-1003\"" + SUV + "}";
        mvc.perform(post("/api/atendimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.mensagem").value(AgendaController.SEM_BOX));
        assertEquals(0, jdbc.queryForObject("select count(*) from agendamento", Integer.class));
        jdbc.update("insert into configuracao_loja (loja_id, link_ativo, link_dias_max, link_telefone_obrigatorio) values (?::uuid, true, 30, true) on conflict (loja_id) do update set link_ativo = true", EsteticaDeTeste.LOJA_APEX);
        try {
            mvc.perform(get("/api/publico/agendar").with(host(APEX))).andExpect(status().isOk()).andExpect(jsonPath("$.ativo").value(false))
                    .andExpect(jsonPath("$.aviso").value(br.com.agendz.publico.LinkPublicoService.ERRO_SEM_BOX)).andExpect(jsonPath("$.servicos.length()").value(0));
        } finally {
            jdbc.update("delete from configuracao_loja where loja_id = ?::uuid", EsteticaDeTeste.LOJA_APEX);
        }
        // com um box ativo de novo, tudo volta
        jdbc.update("update box set ativo = true where nome = 'Box 1'");
        mvc.perform(post("/api/atendimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON).content(corpo))
                .andExpect(status().isCreated());
    }

    @Test
    void atendimentoLocalDaEsteticaUsaOPorteEFicaSemBox() throws Exception {
        mvc.perform(post("/api/atendimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[\"" + lavagem + "\"],\"nome\":\"Caio\",\"telefone\":\"(53) 99900-1003\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.mensagem").value("Escolha o veículo do atendimento."));
        mvc.perform(post("/api/atendimentos").with(host(APEX)).header(HttpHeaders.AUTHORIZATION, bearer(davi)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"profissionalId\":\"" + pabloId + "\",\"servicoIds\":[\"" + lavagem + "\"],\"nome\":\"Caio\",\"telefone\":\"(53) 99900-1003\"" + SUV + "}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("concluido")).andExpect(jsonPath("$.total").value(120))
                .andExpect(jsonPath("$.estetica.porte").value("suv")).andExpect(jsonPath("$.estetica.box").doesNotExist());
        assertEquals(1, jdbc.queryForObject("select count(*) from cliente_veiculo", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from agendamento_bloco", Integer.class));
    }

    private static Instant local(LocalDate dia, int hora, int minuto) {
        return ZonedDateTime.of(dia, LocalTime.of(hora, minuto), Fuso.BRASIL).toInstant();
    }
}
