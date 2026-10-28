package br.com.agendz.agenda;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Agenda (núcleo; docs/MAPA-API-SPRING.md, seção 2). Regras portadas de src/domain/rules.js:
 * - o profissional não pode ter dois atendimentos sobrepostos: ocupação = [início, fim do último serviço + intervalo desse serviço);
 * - sobrepor um CONFIRMADO/CONCLUÍDO só com `encaixe`; sobrepor um A CONFIRMAR é permitido (volta em `conflitosPendentes`);
 * - confirmar um horário cancela os "a confirmar" que o cobrem; reativar um cancelado revalida o horário;
 * - a corrida entre duas marcações é impedida travando a linha do profissional (`for update`) na mesma transação;
 * - dono vê e mexe em tudo; profissional só na própria agenda (agendamento de outro = 404, como se não existisse).
 * Fica para as próximas fatias: escala e exceções de expediente, box, serviço de vários dias, plano de mensagens, porte do veículo, cupom e Pix.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'agenda')")
public class AgendaController {

    private static final String A_CONFIRMAR = "a_confirmar";
    private static final String CONFIRMADO = "confirmado";
    private static final String CANCELADO = "cancelado";
    private static final String CONCLUIDO = "concluido";
    private static final Map<String, String> ROTULOS = Map.of(A_CONFIRMAR, "A confirmar", CONFIRMADO, "Confirmado", CONCLUIDO, "Concluído", CANCELADO, "Cancelado");

    public record Item(UUID servicoId, String nome, BigDecimal preco, int duracaoMin) {
    }

    /** Uma linha do histórico do agendamento (quem, quando, o quê). `autor` "Sistema" = feito automaticamente. */
    public record Evento(Instant em, String autor, String campo, String de, String para) {
    }

    public record Agendamento(UUID id, UUID clienteId, UUID profissionalId, Instant inicio, Instant fim, Instant fimOcupado,
                              String status, boolean encaixe, BigDecimal total, List<Item> servicos, List<UUID> conflitosPendentes,
                              String origem, boolean reagendado, String motivoCancelamento, boolean statusManual, List<Evento> historico) {
        Agendamento comAvisos(List<UUID> pendentes) {
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, pendentes, origem, reagendado, motivoCancelamento, statusManual, historico);
        }

        Agendamento comHistorico(List<Evento> eventos) {
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, conflitosPendentes, origem, reagendado, motivoCancelamento, statusManual, eventos);
        }
    }

    public record NovoAgendamento(
            UUID clienteId,
            @NotNull UUID profissionalId,
            @Size(max = 50) List<UUID> servicoIds,
            @NotNull Instant inicio,
            @Size(max = 30) String status,
            Boolean encaixe) {
    }

    public record Remarcacao(@NotNull Instant inicio, UUID profissionalId, Boolean encaixe, @Size(max = 30) String status) {
    }

    public record NovoStatus(@NotNull @Size(max = 30) String status) {
    }

    private record ServicoLinha(UUID id, String nome, BigDecimal preco, int duracaoMin, int intervaloMin, boolean multiDia, boolean ativo) {
    }

    private record Conflito(UUID id, String status) {
    }

    private record Atual(UUID profissionalId, Instant inicio, Instant fimServico, Instant fimOcupado, String status, boolean encaixe) {
    }

    private final LojaJdbc banco;
    private final Clock relogio;
    private final EscalaService escalas;

    public AgendaController(LojaJdbc banco, Clock relogio, EscalaService escalas) {
        this.banco = banco;
        this.relogio = relogio;
        this.escalas = escalas;
    }

    // ---------------------------------------------------------------- leitura

    @GetMapping("/api/agendamentos")
    public List<Agendamento> listar(@RequestParam Instant de, @RequestParam Instant ate, @AuthenticationPrincipal Jwt jwt) {
        if (!ate.isAfter(de) || Duration.between(de, ate).toDays() > 366) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe um período válido de até 366 dias.");
        }
        UUID so = somenteDe(jwt);
        return banco.naLoja(jdbc -> {
            List<Object> args = new ArrayList<>(List.of(utc(ate), utc(de)));
            String filtro = "";
            if (so != null) {
                filtro = " and a.profissional_id = ?";
                args.add(so);
            }
            List<Agendamento> base = jdbc.query(
                    "select a.id, a.cliente_id, a.profissional_id, a.inicio, a.fim_servico, a.fim_ocupado, a.status, a.encaixe, a.total, a.origem, a.reagendado, a.motivo_cancelamento, "
                            + "(a.status_manual_inicio is not null and a.status_manual_inicio = a.inicio) as status_manual from agendamento a "
                            + "where a.inicio < ? and a.fim_ocupado > ?" + filtro + " order by a.inicio limit 1000",
                    (rs, i) -> linha(rs), args.toArray());
            Map<UUID, List<Item>> itens = new LinkedHashMap<>();
            jdbc.query("select s.agendamento_id, s.servico_id, s.nome, s.preco, s.duracao_min from agendamento_servico s "
                            + "join agendamento a on a.id = s.agendamento_id where a.inicio < ? and a.fim_ocupado > ?" + filtro + " order by s.ordem",
                    rs -> {
                        itens.computeIfAbsent(rs.getObject("agendamento_id", UUID.class), k -> new ArrayList<>())
                                .add(new Item(rs.getObject("servico_id", UUID.class), rs.getString("nome"), rs.getBigDecimal("preco"), rs.getInt("duracao_min")));
                    }, args.toArray());
            List<Agendamento> saida = new ArrayList<>();
            for (Agendamento a : base) saida.add(comItens(a, itens.getOrDefault(a.id(), List.of())));
            return saida;
        });
    }

    @GetMapping("/api/agendamentos/{id}")
    public Agendamento obter(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return banco.naLoja(jdbc -> buscar(jdbc, id, somenteDe(jwt)).comHistorico(historico(jdbc, id)));
    }

    // ---------------------------------------------------------------- criar

    @PostMapping("/api/agendamentos")
    public ResponseEntity<Agendamento> criar(@Valid @RequestBody NovoAgendamento d, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        if (!ehDono(jwt) && !d.profissionalId().toString().equals(jwt.getSubject())) {
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Você só agenda na sua própria agenda.");
        }
        String status = d.status() == null ? A_CONFIRMAR : d.status();
        if (!A_CONFIRMAR.equals(status) && !CONFIRMADO.equals(status)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Status inválido."); // criar já concluído/cancelado não existe
        List<UUID> servicoIds = d.servicoIds() == null ? List.of() : d.servicoIds();
        if (servicoIds.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha ao menos um serviço.");
        if (servicoIds.size() > 10) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "No máximo 10 serviços por agendamento.");
        if (new HashSet<>(servicoIds).size() != servicoIds.size()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O mesmo serviço aparece duas vezes.");
        boolean encaixe = Boolean.TRUE.equals(d.encaixe());
        Agendamento criado = banco.naLoja(jdbc -> {
            List<ServicoLinha> servicos = carregarServicos(jdbc, servicoIds);
            if (d.clienteId() == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o cliente.");
            Integer clientes = jdbc.queryForObject("select count(*) from cliente where id = ?", Integer.class, d.clienteId());
            if (clientes == null || clientes == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Escolha o cliente.");
            travarProfissional(jdbc, d.profissionalId());
            Instant inicio = conferirInicio(d.inicio());
            int minutos = 0;
            BigDecimal total = BigDecimal.ZERO;
            for (ServicoLinha s : servicos) {
                minutos += s.duracaoMin();
                total = total.add(s.preco());
            }
            Instant fimServico = inicio.plus(minutos, ChronoUnit.MINUTES);
            Instant fimOcupado = fimServico.plus(servicos.get(servicos.size() - 1).intervaloMin(), ChronoUnit.MINUTES);
            conferirExpediente(jdbc, d.profissionalId(), inicio, fimServico, servicos.stream().anyMatch(ServicoLinha::multiDia));
            List<UUID> pendentes = conferirConflitos(jdbc, d.profissionalId(), new UUID(0, 0), inicio, fimOcupado, encaixe);
            UUID id = jdbc.queryForObject(
                    "insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total) "
                            + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                    UUID.class, loja.id().toString(), d.clienteId(), d.profissionalId(), utc(inicio), utc(fimServico), utc(fimOcupado), status, encaixe, total);
            short ordem = 0;
            for (ServicoLinha s : servicos) {
                jdbc.update("insert into agendamento_servico (loja_id, agendamento_id, servico_id, ordem, nome, preco, duracao_min, intervalo_min) "
                                + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?)",
                        loja.id().toString(), id, s.id(), ordem++, s.nome(), s.preco(), s.duracaoMin(), s.intervaloMin());
            }
            registrar(jdbc, loja.id(), id, jwt, "criação", null, servicos.stream().map(ServicoLinha::nome).collect(java.util.stream.Collectors.joining(" + ")) + " em " + dataHora(inicio));
            if (CONFIRMADO.equals(status)) cancelarPendentesQueCobrem(jdbc, loja.id(), d.profissionalId(), id, inicio, fimOcupado);
            return buscar(jdbc, id, null).comAvisos(CONFIRMADO.equals(status) || pendentes.isEmpty() ? null : pendentes);
        });
        return ResponseEntity.status(HttpStatus.CREATED).body(criado);
    }

    // ---------------------------------------------------------------- status

    @PutMapping("/api/agendamentos/{id}/status")
    public Agendamento alterarStatus(@PathVariable UUID id, @Valid @RequestBody NovoStatus d, @AuthenticationPrincipal Jwt jwt) {
        if (!ROTULOS.containsKey(d.status())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Status inválido.");
        UUID so = somenteDe(jwt);
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            Atual a = ler(jdbc, id, so, false);
            travarProfissional(jdbc, a.profissionalId());
            a = ler(jdbc, id, so, true); // relê já com o horário travado: o que valia antes da espera pode ter mudado
            String novo = d.status();
            if (novo.equals(a.status())) return buscar(jdbc, id, so);
            List<UUID> pendentes = List.of();
            if (CANCELADO.equals(a.status())) {
                // reativação: o horário pode ter sido tomado enquanto estava cancelado (ou o expediente mudou)
                conferirExpediente(jdbc, a.profissionalId(), a.inicio(), a.fimServico(), multiDia(jdbc, id));
                pendentes = conferirConflitos(jdbc, a.profissionalId(), id, a.inicio(), a.fimOcupado(), a.encaixe());
            }
            if (CONFIRMADO.equals(novo) || CONCLUIDO.equals(novo)) cancelarPendentesQueCobrem(jdbc, loja.id(), a.profissionalId(), id, a.inicio(), a.fimOcupado());
            registrar(jdbc, loja.id(), id, jwt, "status", ROTULOS.get(a.status()), ROTULOS.get(novo));
            // escolha manual depois do horário começar vale como foi escolhida: o sistema não conclui nem cancela sozinho (remarcar libera de novo)
            Instant manual = relogio.instant().isBefore(a.inicio()) ? null : a.inicio();
            jdbc.update("update agendamento set status = ?, motivo_cancelamento = ?, status_manual_inicio = ?, atualizado_em = now() where id = ?",
                    novo, CANCELADO.equals(novo) ? "profissional" : null, manual == null ? null : utc(manual), id);
            Agendamento r = buscar(jdbc, id, so);
            return CONFIRMADO.equals(novo) ? r : r.comAvisos(pendentes.isEmpty() ? null : pendentes);
        });
    }

    // ---------------------------------------------------------------- remarcar

    @PutMapping("/api/agendamentos/{id}/remarcar")
    public Agendamento remarcar(@PathVariable UUID id, @Valid @RequestBody Remarcacao d, @AuthenticationPrincipal Jwt jwt) {
        UUID so = somenteDe(jwt);
        if (so != null && d.profissionalId() != null && !d.profissionalId().equals(so)) {
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Só o dono repassa o atendimento a outro profissional.");
        }
        Instant novoInicio = conferirInicio(d.inicio());
        if (d.status() != null && !ROTULOS.containsKey(d.status())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Status inválido.");
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            Atual a = ler(jdbc, id, so, false);
            UUID alvo = d.profissionalId() == null ? a.profissionalId() : d.profissionalId();
            travarProfissional(jdbc, alvo);
            a = ler(jdbc, id, so, true);
            // Concluído já aconteceu: reabra (status) antes. Cancelado só se remarca junto com a reativação (`status` não cancelado), validada no horário NOVO.
            if (CONCLUIDO.equals(a.status())) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Agendamento concluído não pode ser remarcado.");
            if (CANCELADO.equals(a.status()) && (d.status() == null || CANCELADO.equals(d.status()))) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Agendamento cancelado não pode ser remarcado. Reative-o antes.");
            }
            String novoStatus = d.status() == null ? a.status() : d.status();
            Duration servico = Duration.between(a.inicio(), a.fimServico());
            Duration folga = Duration.between(a.fimServico(), a.fimOcupado());
            Instant fimServico = novoInicio.plus(servico);
            Instant fimOcupado = fimServico.plus(folga);
            boolean encaixe = d.encaixe() == null ? a.encaixe() : d.encaixe();
            conferirExpediente(jdbc, alvo, novoInicio, fimServico, multiDia(jdbc, id));
            List<UUID> pendentes = conferirConflitos(jdbc, alvo, id, novoInicio, fimOcupado, encaixe);
            registrar(jdbc, loja.id(), id, jwt, "data e hora", dataHora(a.inicio()), dataHora(novoInicio));
            if (!novoStatus.equals(a.status())) registrar(jdbc, loja.id(), id, jwt, "status", ROTULOS.get(a.status()), ROTULOS.get(novoStatus));
            if (!alvo.equals(a.profissionalId())) registrar(jdbc, loja.id(), id, jwt, "profissional", nomeDe(jdbc, a.profissionalId()), nomeDe(jdbc, alvo));
            // reagendado: etiqueta fixa (a data ou a hora mudou); o motivo do cancelamento, se havia, não vale mais
            jdbc.update("update agendamento set profissional_id = ?, inicio = ?, fim_servico = ?, fim_ocupado = ?, encaixe = ?, status = ?, reagendado = true, motivo_cancelamento = null, atualizado_em = now() where id = ?",
                    alvo, utc(novoInicio), utc(fimServico), utc(fimOcupado), encaixe, novoStatus, id);
            if (CONFIRMADO.equals(novoStatus) || CONCLUIDO.equals(novoStatus)) cancelarPendentesQueCobrem(jdbc, loja.id(), alvo, id, novoInicio, fimOcupado);
            Agendamento r = buscar(jdbc, id, so);
            return CONFIRMADO.equals(novoStatus) || pendentes.isEmpty() ? r : r.comAvisos(pendentes);
        });
    }

    // ---------------------------------------------------------------- regras

    /** Minuto exato e dentro de ±400 dias (como `validarHorario`). */
    private Instant conferirInicio(Instant inicio) {
        if (inicio.getNano() != 0 || inicio.getEpochSecond() % 60 != 0) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Data e hora inválidas.");
        }
        Instant agora = relogio.instant();
        if (inicio.isAfter(agora.plus(400, ChronoUnit.DAYS))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Data distante demais.");
        if (inicio.isBefore(agora.minus(400, ChronoUnit.DAYS))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Data inválida.");
        return inicio;
    }

    /** O atendimento inteiro precisa caber no expediente da loja e na escala do profissional (EscalaService); sem expediente cadastrado, não restringe. */
    private void conferirExpediente(JdbcTemplate jdbc, UUID profissionalId, Instant inicio, Instant fimServico, boolean multiDia) {
        if (!escalas.atende(jdbc, profissionalId, inicio, fimServico, multiDia)) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, nomeDe(jdbc, profissionalId) + " não atende nesse horário.");
        }
    }

    private boolean multiDia(JdbcTemplate jdbc, UUID agendamentoId) {
        Boolean v = jdbc.queryForObject("select coalesce(bool_or(sv.multi_dia), false) from agendamento_servico x join servico sv on sv.id = x.servico_id where x.agendamento_id = ?",
                Boolean.class, agendamentoId);
        return Boolean.TRUE.equals(v);
    }

    /** Trava a linha do profissional até o fim da transação: marcações no mesmo profissional passam uma por vez (sem corrida). */
    private void travarProfissional(JdbcTemplate jdbc, UUID profissionalId) {
        List<Object[]> achado = jdbc.query("select atende, coalesce(nullif(apelido, ''), nome) from usuario where id = ? and ativo for update",
                (rs, i) -> new Object[]{rs.getBoolean(1), rs.getString(2)}, profissionalId);
        if (achado.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado.");
        if (!(Boolean) achado.get(0)[0]) throw new ErroDeNegocio(HttpStatus.CONFLICT, achado.get(0)[1] + " está desativado e não recebe novos agendamentos.");
    }

    /** Como o simulador: "<apelido ou nome>" nas mensagens ao usuário. */
    private String nomeDe(JdbcTemplate jdbc, UUID usuarioId) {
        return jdbc.queryForObject("select coalesce(nullif(apelido, ''), nome) from usuario where id = ?", String.class, usuarioId);
    }

    private List<ServicoLinha> carregarServicos(JdbcTemplate jdbc, List<UUID> ids) {
        String marcas = String.join(",", ids.stream().map(x -> "?").toList());
        List<ServicoLinha> achados = jdbc.query(
                "select id, nome, preco, duracao_min, intervalo_min, multi_dia, ativo from servico where id in (" + marcas + ")",
                (rs, i) -> new ServicoLinha(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getBigDecimal("preco"), rs.getInt("duracao_min"), rs.getInt("intervalo_min"), rs.getBoolean("multi_dia"), rs.getBoolean("ativo")),
                ids.toArray());
        Map<UUID, ServicoLinha> porId = new LinkedHashMap<>();
        for (ServicoLinha s : achados) porId.put(s.id(), s);
        List<ServicoLinha> naOrdem = new ArrayList<>();
        for (UUID id : ids) {
            ServicoLinha s = porId.get(id);
            if (s == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Serviço não encontrado.");
            naOrdem.add(s);
        }
        for (ServicoLinha s : naOrdem) {
            if (!s.ativo()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, s.nome() + " está desativado."); // como o simulador: primeiro vê se todos existem
        }
        return naOrdem;
    }

    /**
     * Confere a sobreposição do profissional. Confirmado/concluído no caminho bloqueia, salvo `encaixe`; "a confirmar" só avisa.
     * Devolve os ids dos "a confirmar" que se sobrepõem.
     */
    private List<UUID> conferirConflitos(JdbcTemplate jdbc, UUID profissionalId, UUID ignorar, Instant inicio, Instant fimOcupado, boolean encaixe) {
        List<Conflito> cs = jdbc.query(
                "select id, status from agendamento where profissional_id = ? and id <> ? and status <> 'cancelado' and inicio < ? and fim_ocupado > ?",
                (rs, i) -> new Conflito(rs.getObject("id", UUID.class), rs.getString("status")),
                profissionalId, ignorar, utc(fimOcupado), utc(inicio));
        List<UUID> pendentes = new ArrayList<>();
        boolean confirmados = false;
        for (Conflito c : cs) {
            if (A_CONFIRMAR.equals(c.status())) pendentes.add(c.id());
            else confirmados = true;
        }
        if (confirmados && !encaixe) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse horário já está confirmado para outro cliente. Para forçar, marque como encaixe.");
        }
        return pendentes;
    }

    /** Quem confirma primeiro fica com o horário: os "a confirmar" sobrepostos são cancelados (motivo "conflito"), menos os marcados como encaixe. */
    private void cancelarPendentesQueCobrem(JdbcTemplate jdbc, UUID lojaId, UUID profissionalId, UUID mantido, Instant inicio, Instant fimOcupado) {
        List<UUID> perdedores = jdbc.queryForList(
                "update agendamento set status = 'cancelado', motivo_cancelamento = 'conflito', atualizado_em = now() where profissional_id = ? and id <> ? and status = 'a_confirmar' "
                        + "and not encaixe and inicio < ? and fim_ocupado > ? returning id", UUID.class, profissionalId, mantido, utc(fimOcupado), utc(inicio));
        for (UUID p : perdedores) {
            registrar(jdbc, lojaId, p, null, "status", ROTULOS.get(A_CONFIRMAR), "Cancelado (horário ocupado por outro cliente)");
        }
    }

    // ---------------------------------------------------------------- histórico

    /** Registra uma alteração. `jwt` nulo = o próprio sistema. */
    private void registrar(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId, Jwt jwt, String campo, String de, String para) {
        UUID autorId = jwt == null ? null : UUID.fromString(jwt.getSubject());
        String nome = jwt == null ? "Sistema" : String.valueOf(jwt.getClaimAsString("nome"));
        jdbc.update("insert into agendamento_evento (loja_id, agendamento_id, em, autor_id, autor_nome, campo, de, para) values (?::uuid, ?, ?, ?, ?, ?, ?, ?)",
                lojaId.toString(), agendamentoId, utc(relogio.instant()), autorId, nome, campo, de, para);
    }

    private List<Evento> historico(JdbcTemplate jdbc, UUID agendamentoId) {
        return jdbc.query("select em, autor_nome, campo, de, para from agendamento_evento where agendamento_id = ? order by id",
                (rs, i) -> new Evento(rs.getObject("em", OffsetDateTime.class).toInstant(), rs.getString("autor_nome"), rs.getString("campo"), rs.getString("de"), rs.getString("para")), agendamentoId);
    }

    private static final java.time.format.DateTimeFormatter DIA_HORA = java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm");

    private static String dataHora(Instant i) {
        return DIA_HORA.format(i.atZone(br.com.agendz.escala.Fuso.BRASIL));
    }

    // ---------------------------------------------------------------- acesso a dados

    /** Linha do agendamento (opcionalmente travada). Profissional só enxerga o próprio: o de outro responde 404. */
    private Atual ler(JdbcTemplate jdbc, UUID id, UUID so, boolean travar) {
        String sql = "select profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe from agendamento where id = ?"
                + (so == null ? "" : " and profissional_id = ?") + (travar ? " for update" : "");
        Object[] args = so == null ? new Object[]{id} : new Object[]{id, so};
        List<Atual> achados = jdbc.query(sql, (rs, i) -> new Atual(rs.getObject("profissional_id", UUID.class),
                rs.getObject("inicio", OffsetDateTime.class).toInstant(), rs.getObject("fim_servico", OffsetDateTime.class).toInstant(),
                rs.getObject("fim_ocupado", OffsetDateTime.class).toInstant(), rs.getString("status"), rs.getBoolean("encaixe")), args);
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        return achados.get(0);
    }

    private Agendamento buscar(JdbcTemplate jdbc, UUID id, UUID so) {
        String sql = "select id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total, origem, reagendado, motivo_cancelamento, "
                + "(status_manual_inicio is not null and status_manual_inicio = inicio) as status_manual from agendamento where id = ?"
                + (so == null ? "" : " and profissional_id = ?");
        Object[] args = so == null ? new Object[]{id} : new Object[]{id, so};
        List<Agendamento> achados = jdbc.query(sql, (rs, i) -> linha(rs), args);
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        List<Item> itens = jdbc.query("select servico_id, nome, preco, duracao_min from agendamento_servico where agendamento_id = ? order by ordem",
                (rs, i) -> new Item(rs.getObject("servico_id", UUID.class), rs.getString("nome"), rs.getBigDecimal("preco"), rs.getInt("duracao_min")), id);
        return comItens(achados.get(0), itens);
    }

    private static Agendamento linha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Agendamento(rs.getObject("id", UUID.class), rs.getObject("cliente_id", UUID.class), rs.getObject("profissional_id", UUID.class),
                rs.getObject("inicio", OffsetDateTime.class).toInstant(), rs.getObject("fim_servico", OffsetDateTime.class).toInstant(),
                rs.getObject("fim_ocupado", OffsetDateTime.class).toInstant(), rs.getString("status"), rs.getBoolean("encaixe"),
                rs.getBigDecimal("total"), List.of(), null,
                rs.getString("origem"), rs.getBoolean("reagendado"), rs.getString("motivo_cancelamento"), rs.getBoolean("status_manual"), null);
    }

    private static Agendamento comItens(Agendamento a, List<Item> itens) {
        return new Agendamento(a.id(), a.clienteId(), a.profissionalId(), a.inicio(), a.fim(), a.fimOcupado(), a.status(), a.encaixe(), a.total(), itens, a.conflitosPendentes(),
                a.origem(), a.reagendado(), a.motivoCancelamento(), a.statusManual(), a.historico());
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static boolean ehDono(Jwt jwt) {
        return br.com.agendz.seguranca.Permissoes.veTudo(jwt.getClaimAsString("papel"));
    }

    /** null = vê tudo (dono); senão, só os agendamentos desse profissional (o próprio usuário logado). */
    private static UUID somenteDe(Jwt jwt) {
        return ehDono(jwt) ? null : UUID.fromString(jwt.getSubject());
    }
}
