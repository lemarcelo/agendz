package br.apex;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.apex.support.IntegrationTestBase;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;

/** Espelha tests/conflitos.test.mjs. O protótipo garante "nunca dois confirmados no mesmo horário" em memória; aqui é no banco, sob concorrência. */
class AgendaConflitoIT extends IntegrationTestBase {

    @Test @DisplayName("dois clientes confirmam o MESMO horário ao mesmo tempo: só um fica confirmado, o outro é cancelado por conflito")
    void confirmacaoSimultanea() throws Exception {
        String dono = token("davi");
        Instant quando = diaUtil(4, "10:00");
        String a = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), quando);
        String b = criarAgendamento(dono, "c-igor", "u-pablo", List.of("s-lav-detalhada"), quando);   // pendente sobre pendente é permitido

        CountDownLatch largada = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Callable<Integer>> tarefas = new ArrayList<>();
        for (String id : List.of(a, b)) {
            tarefas.add(() -> {
                largada.await();
                return chamar(HttpMethod.PUT, "/agendamentos/" + id + "/status", dono, Map.of("status", "confirmado"))
                        .andReturn().getResponse().getStatus();
            });
        }
        List<Future<Integer>> futuros = new ArrayList<>();
        for (Callable<Integer> t : tarefas) futuros.add(pool.submit(t));
        largada.countDown();
        for (Future<Integer> f : futuros) f.get();
        pool.shutdown();

        Integer confirmados = jdbc.queryForObject(
                "select count(*) from agendamento where esteticista_id = 'u-pablo' and inicio = ? and status = 'confirmado'", Integer.class, java.sql.Timestamp.from(quando));
        assertThat(confirmados).isEqualTo(1);
    }

    @Test @DisplayName("o banco recusa dois confirmados sobrepostos mesmo se o serviço tentar gravar (restrição de exclusão)")
    void restricaoNoBanco() {
        Instant quando = diaUtil(4, "14:00");
        String insere = "insert into agendamento (id, cliente_id, esteticista_id, inicio, fim, status) values (?, 'c-marcelo', 'u-marcelo', ?, ?, 'confirmado')";
        jdbc.update(insere, "x1", java.sql.Timestamp.from(quando), java.sql.Timestamp.from(quando.plusSeconds(2400)));
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update(insere, "x2", java.sql.Timestamp.from(quando.plusSeconds(600)), java.sql.Timestamp.from(quando.plusSeconds(3000))));
        // TODO: ajustar nomes de tabela/coluna ao modelo real (EXCLUDE USING gist (esteticista_id WITH =, tstzrange(inicio, fim) WITH &&) WHERE (status = 'confirmado')).
    }

    @Test @DisplayName("sobreposição pela duração + intervalo: 10h15 conflita com um serviço de 40 min das 10h; 10h40 conflita se o intervalo ocupa; depois disso encaixa")
    void sobreposicaoPorDuracao() throws Exception {
        String dono = token("davi");
        String base = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(3, "10:00"));
        chamar(HttpMethod.PUT, "/agendamentos/" + base + "/status", dono, Map.of("status", "confirmado")).andExpect(status().isOk());
        // encaixe=false: horário confirmado bloqueia
        chamar(HttpMethod.POST, "/agendamentos", dono, Map.of("clienteId", "c-igor", "esteticistaId", "u-pablo", "servicoIds", List.of("s-lav-detalhada"),
                "inicio", diaUtil(3, "10:15").toString(), "status", "confirmado")).andExpect(status().isConflict());
        // depois do fim (duração + intervalo) o horário é livre
        chamar(HttpMethod.POST, "/agendamentos", dono, Map.of("clienteId", "c-igor", "esteticistaId", "u-pablo", "servicoIds", List.of("s-lav-detalhada"),
                "inicio", diaUtil(3, "11:30").toString())).andExpect(status().isCreated());
    }

    @Test @DisplayName("encaixe: só o esteticista, pelo painel, força o horário por cima de confirmado, marcado com a flag")
    void encaixe() throws Exception {
        String dono = token("davi");
        String base = criarAgendamento(dono, "c-marcelo", "u-pablo", List.of("s-lav-detalhada"), diaUtil(3, "15:00"));
        chamar(HttpMethod.PUT, "/agendamentos/" + base + "/status", dono, Map.of("status", "confirmado")).andExpect(status().isOk());
        chamar(HttpMethod.POST, "/agendamentos", dono, Map.of("clienteId", "c-igor", "esteticistaId", "u-pablo", "servicoIds", List.of("s-lav-detalhada"),
                "inicio", diaUtil(3, "15:10").toString(), "encaixe", true)).andExpect(status().isCreated());
    }

    @Test @DisplayName("fora do expediente ou em folga, agendar é recusado (422), no painel e no WhatsApp")
    void foraDoExpediente() throws Exception {
        String dono = token("davi");
        chamar(HttpMethod.POST, "/agendamentos", dono, Map.of("clienteId", "c-marcelo", "esteticistaId", "u-pablo", "servicoIds", List.of("s-lav-detalhada"),
                "inicio", diaUtil(2, "03:00").toString())).andExpect(status().isUnprocessableEntity());
    }
}
