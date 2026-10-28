package br.com.agendz.agenda;

import br.com.agendz.clientes.ClienteService;
import br.com.agendz.comissao.ComissaoService;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.Idempotencia;
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
import org.springframework.web.bind.annotation.RequestHeader;
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

    /** Produto vendido no atendimento (preço congelado). O percentual de comissão do produto nunca sai nesta resposta (quem vê a agenda não vê percentuais). */
    public record ProdutoLinha(UUID materialId, String nome, int qtd, BigDecimal preco, UUID vendedorId) {
    }

    /** `total` é o dos serviços; `totalProdutos` é a soma dos produtos (quantidade × preço); o "total com produtos" é a soma dos dois. */
    public record Agendamento(UUID id, UUID clienteId, UUID profissionalId, Instant inicio, Instant fim, Instant fimOcupado,
                              String status, boolean encaixe, BigDecimal total, List<Item> servicos, List<UUID> conflitosPendentes,
                              String origem, boolean reagendado, String motivoCancelamento, boolean statusManual, String nomeAvulso, String motivoRetroativo,
                              List<Evento> historico, List<ProdutoLinha> produtos, BigDecimal totalProdutos) {
        Agendamento comAvisos(List<UUID> pendentes) {
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, pendentes, origem, reagendado, motivoCancelamento, statusManual, nomeAvulso, motivoRetroativo, historico, produtos, totalProdutos);
        }

        Agendamento comHistorico(List<Evento> eventos) {
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, conflitosPendentes, origem, reagendado, motivoCancelamento, statusManual, nomeAvulso, motivoRetroativo, eventos, produtos, totalProdutos);
        }

        Agendamento comProdutos(List<ProdutoLinha> linhas) {
            BigDecimal soma = BigDecimal.ZERO;
            for (ProdutoLinha l : linhas) soma = soma.add(l.preco().multiply(BigDecimal.valueOf(l.qtd())));
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, conflitosPendentes, origem, reagendado, motivoCancelamento, statusManual, nomeAvulso, motivoRetroativo, historico, linhas, soma);
        }
    }

    /** Produto pedido no Atender: material do tipo produto e quantidade inteira de 1 a 999 (a regra é conferida em {@link #lancarProdutos}, com a mensagem do simulador). */
    public record ProdutoPedido(UUID materialId, Integer qtd) {
    }

    public record NovoAgendamento(
            UUID clienteId,
            @NotNull UUID profissionalId,
            @Size(max = 50) List<UUID> servicoIds,
            @NotNull Instant inicio,
            @Size(max = 30) String status,
            Boolean encaixe) {
    }

    /** Atender (POST /api/atendimentos): data futura = agendamento; sem data ou agora/passado = atendimento local, já concluído. */
    public record NovoAtendimento(
            UUID clienteId,
            UUID profissionalId,
            @Size(max = 50) List<UUID> servicoIds,
            @Size(max = 100) String nome,
            @Size(max = 30) String telefone,
            Instant inicio,
            @Size(max = 30) String status,
            Boolean encaixe,
            @Size(max = 300) String motivoRetroativo,
            @Size(max = 50) List<@Valid ProdutoPedido> produtos,
            UUID vendedorId) {
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
    private final ClienteService clientes;
    private final Idempotencia idempotencia;
    private final EstoqueDaVenda estoque;
    private final ComissaoService comissoes;

    public AgendaController(LojaJdbc banco, Clock relogio, EscalaService escalas, ClienteService clientes, Idempotencia idempotencia, EstoqueDaVenda estoque, ComissaoService comissoes) {
        this.estoque = estoque;
        this.comissoes = comissoes;
        this.banco = banco;
        this.relogio = relogio;
        this.escalas = escalas;
        this.clientes = clientes;
        this.idempotencia = idempotencia;
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
                    "select a.id, a.cliente_id, a.profissional_id, a.inicio, a.fim_servico, a.fim_ocupado, a.status, a.encaixe, a.total, a.origem, a.reagendado, a.motivo_cancelamento, a.nome_avulso, a.motivo_retroativo, "
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
            Map<UUID, List<ProdutoLinha>> produtos = new LinkedHashMap<>();
            jdbc.query("select p.agendamento_id, p.material_id, p.nome, p.qtd, p.preco, p.vendedor_id from agendamento_produto p "
                            + "join agendamento a on a.id = p.agendamento_id where a.inicio < ? and a.fim_ocupado > ?" + filtro + " order by lower(p.nome)",
                    rs -> {
                        produtos.computeIfAbsent(rs.getObject("agendamento_id", UUID.class), k -> new ArrayList<>())
                                .add(new ProdutoLinha(rs.getObject("material_id", UUID.class), rs.getString("nome"), rs.getInt("qtd"), rs.getBigDecimal("preco"), rs.getObject("vendedor_id", UUID.class)));
                    }, args.toArray());
            List<Agendamento> saida = new ArrayList<>();
            for (Agendamento a : base) saida.add(comItens(a, itens.getOrDefault(a.id(), List.of())).comProdutos(produtos.getOrDefault(a.id(), List.of())));
            return saida;
        });
    }

    @GetMapping("/api/agendamentos/{id}")
    public Agendamento obter(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return banco.naLoja(jdbc -> buscar(jdbc, id, somenteDe(jwt)).comHistorico(historico(jdbc, id)));
    }

    // ---------------------------------------------------------------- criar

    @PostMapping("/api/agendamentos")
    public ResponseEntity<Agendamento> criar(@Valid @RequestBody NovoAgendamento d, @RequestHeader(value = "Idempotency-Key", required = false) String chave, @AuthenticationPrincipal Jwt jwt) {
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
        Agendamento criado = idempotencia.executar(chave, UUID.fromString(jwt.getSubject()), "POST /api/agendamentos", d, Agendamento.class, () -> banco.naLoja(jdbc -> {
            return inserirAgendamento(jdbc, loja, jwt, d.clienteId(), d.profissionalId(), servicoIds, d.inicio(), status, encaixe);
        }));
        return ResponseEntity.status(HttpStatus.CREATED).body(criado);
    }

    /** Agendamento futuro (usado por criar e por atender). Dentro da transação da loja; a mesma ordem de validações do simulador. */
    private Agendamento inserirAgendamento(JdbcTemplate jdbc, Loja loja, Jwt jwt, UUID clienteId, UUID profissionalId, List<UUID> servicoIds, Instant inicioBruto, String status, boolean encaixe) {
        List<ServicoLinha> servicos = carregarServicos(jdbc, servicoIds);
        if (clienteId == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o cliente.");
        Integer clientesAchados = jdbc.queryForObject("select count(*) from cliente where id = ?", Integer.class, clienteId);
        if (clientesAchados == null || clientesAchados == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Escolha o cliente.");
        travarProfissional(jdbc, profissionalId);
        Instant inicio = conferirInicio(inicioBruto);
        int minutos = 0;
        BigDecimal total = BigDecimal.ZERO;
        for (ServicoLinha s : servicos) {
            minutos += s.duracaoMin();
            total = total.add(s.preco());
        }
        Instant fimServico = inicio.plus(minutos, ChronoUnit.MINUTES);
        Instant fimOcupado = fimServico.plus(servicos.get(servicos.size() - 1).intervaloMin(), ChronoUnit.MINUTES);
        conferirExpediente(jdbc, profissionalId, inicio, fimServico, servicos.stream().anyMatch(ServicoLinha::multiDia));
        List<UUID> pendentes = conferirConflitos(jdbc, profissionalId, new UUID(0, 0), inicio, fimOcupado, encaixe);
        UUID id = jdbc.queryForObject(
                "insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total) "
                        + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                UUID.class, loja.id().toString(), clienteId, profissionalId, utc(inicio), utc(fimServico), utc(fimOcupado), status, encaixe, total);
        gravarServicos(jdbc, loja, id, servicos);
        registrar(jdbc, loja.id(), id, jwt, "criação", null, servicos.stream().map(ServicoLinha::nome).collect(java.util.stream.Collectors.joining(" + ")) + " em " + dataHora(inicio));
        if (CONFIRMADO.equals(status)) cancelarPendentesQueCobrem(jdbc, loja.id(), profissionalId, id, inicio, fimOcupado);
        return buscar(jdbc, id, null).comAvisos(CONFIRMADO.equals(status) || pendentes.isEmpty() ? null : pendentes);
    }

    private void gravarServicos(JdbcTemplate jdbc, Loja loja, UUID agendamentoId, List<ServicoLinha> servicos) {
        short ordem = 0;
        for (ServicoLinha s : servicos) {
            jdbc.update("insert into agendamento_servico (loja_id, agendamento_id, servico_id, ordem, nome, preco, duracao_min, intervalo_min) "
                            + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?)",
                    loja.id().toString(), agendamentoId, s.id(), ordem++, s.nome(), s.preco(), s.duracaoMin(), s.intervaloMin());
        }
        comissoes.congelar(jdbc, agendamentoId); // o percentual de cada serviço fica gravado agora (mudar a regra depois não mexe neste atendimento)
    }

    // ---------------------------------------------------------------- atender

    /**
     * Botão Atender (espelho de `atender`/`registrarAtendimentoLocal` em src/domain/engine.js):
     * - data futura (mais de 1 min à frente) = agendamento a confirmar ou confirmado, com o cliente achado/criado por nome+telefone;
     * - sem data, agora ou passado = atendimento local, já CONCLUÍDO, sem conflito de horário (já aconteceu), sem mensagem ao cliente;
     * - dia anterior a hoje exige o motivo (5 a 300 letras) e é só da recepção/dono; o profissional atende e lança sempre como ele mesmo.
     * Campos obrigatórios: os padrões (futuro: nome e telefone; local: nenhum). Produtos (5d-4a): venda com serviço ou só de produto (só no atendimento de agora), estoque sai ao concluir. Forma de pagamento e comissão entram nas próximas fatias da 5d.
     */
    @PostMapping("/api/atendimentos")
    public ResponseEntity<Agendamento> atender(@Valid @RequestBody NovoAtendimento d, @RequestHeader(value = "Idempotency-Key", required = false) String chave, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        boolean veTudo = ehDono(jwt);
        Instant agora = relogio.instant();
        Instant agoraMinuto = agora.truncatedTo(ChronoUnit.MINUTES);
        // profissional atende e lança sempre como ele mesmo; dia anterior é com o dono ou a recepção (senão poderia inventar comissão)
        UUID profissionalId = veTudo ? d.profissionalId() : UUID.fromString(jwt.getSubject());
        if (!veTudo && d.inicio() != null && d.inicio().isBefore(inicioDoDia(agora))) {
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Lançar um dia anterior é com o proprietário ou a recepção. Peça a eles para registrar.");
        }
        List<UUID> servicoIds = d.servicoIds() == null ? List.of() : d.servicoIds();
        List<ProdutoPedido> produtos = d.produtos() == null ? List.of() : d.produtos();
        if (servicoIds.isEmpty() && produtos.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha ao menos um serviço ou um produto.");
        if (servicoIds.size() > 10) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "No máximo 10 serviços por agendamento.");
        if (new HashSet<>(servicoIds).size() != servicoIds.size()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O mesmo serviço aparece duas vezes.");
        if (produtos.size() > 10) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "No máximo 10 produtos.");
        boolean futuro = d.inicio() != null && d.inicio().isAfter(agora.plusSeconds(60));
        if (futuro && servicoIds.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Para agendar um horário futuro, escolha ao menos um serviço. Produto sozinho só no atendimento de agora.");
        // quem vende os produtos: o profissional vende sempre como ele mesmo; o dono e a recepção escolhem (sem escolha, vale quem atende; venda só de produto exige a escolha)
        UUID vendedorPedido = produtos.isEmpty() ? null : veTudo ? d.vendedorId() : UUID.fromString(jwt.getSubject());
        String nomeInf = d.nome() == null ? "" : br.com.agendz.validacao.Texto.limpar(d.nome());
        Agendamento feito = idempotencia.executar(chave, UUID.fromString(jwt.getSubject()), "POST /api/atendimentos", d, Agendamento.class, () -> banco.naLoja(jdbc -> {
            Boolean semNome = null;
            if (d.clienteId() != null) {
                List<Boolean> achado = jdbc.query("select sem_nome from cliente where id = ?", (rs, i) -> rs.getBoolean(1), d.clienteId());
                if (achado.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Cliente não encontrado.");
                semNome = achado.get(0);
            }
            if (futuro) {
                List<String> faltam = new ArrayList<>();
                if (nomeInf.isEmpty() && (semNome == null || semNome)) faltam.add("nome");
                if (br.com.agendz.validacao.Documentos.telefone(d.telefone()) == null && semNome == null) faltam.add("telefone");
                if (!faltam.isEmpty()) {
                    throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Preencha " + (faltam.size() == 1 ? "o campo obrigatório" : "os campos obrigatórios") + ": " + String.join(", ", faltam) + ".");
                }
                String status = d.status() == null || d.status().isBlank() ? A_CONFIRMAR : d.status();
                if (!A_CONFIRMAR.equals(status) && !CONFIRMADO.equals(status)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Agendamento futuro nasce a confirmar ou confirmado.");
                if (profissionalId == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o profissional.");
                UUID vendedor = produtos.isEmpty() ? null : vendedorPedido != null ? vendedorPedido : profissionalId;
                if (vendedor != null) exigirVendedor(jdbc, vendedor);
                ClienteService.DoAtendimento quem = clientes.resolverDoAtendimento(jdbc, d.nome(), d.telefone(), d.clienteId());
                Agendamento criado = inserirAgendamento(jdbc, loja, jwt, quem.clienteId(), profissionalId, servicoIds, d.inicio(), status, Boolean.TRUE.equals(d.encaixe()));
                if (produtos.isEmpty()) return criado;
                lancarProdutos(jdbc, loja, criado.id(), produtos, vendedor, jwt);
                return criado.comProdutos(carregarProdutos(jdbc, criado.id()));
            }
            return inserirLocal(jdbc, loja, jwt, d, profissionalId, servicoIds, produtos, vendedorPedido, agoraMinuto);
        }));
        return ResponseEntity.status(HttpStatus.CREATED).body(feito);
    }

    private Agendamento inserirLocal(JdbcTemplate jdbc, Loja loja, Jwt jwt, NovoAtendimento d, UUID profissionalId, List<UUID> servicoIds, List<ProdutoPedido> produtos, UUID vendedorPedido, Instant agoraMinuto) {
        List<ServicoLinha> servicos = carregarServicos(jdbc, servicoIds);
        // vendedor dos produtos: quem vendeu (ganha a comissão do produto); sem escolha vale quem atendeu; venda só de produto exige a escolha
        UUID vendedor = null;
        if (!produtos.isEmpty()) {
            vendedor = vendedorPedido != null ? vendedorPedido : servicoIds.isEmpty() ? null : profissionalId;
            if (vendedor == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o vendedor.");
            exigirVendedor(jdbc, vendedor);
        }
        // o atendimento fica na coluna de um profissional da agenda; venda só de produto sem profissional que atende vai para o vendedor (se atende) ou para o primeiro que atende
        if (servicoIds.isEmpty() && !atende(jdbc, profissionalId)) {
            profissionalId = atende(jdbc, vendedor) ? vendedor : primeiroQueAtende(jdbc);
        }
        if (!atende(jdbc, profissionalId)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o profissional que atendeu.");
        Instant quando = d.inicio() == null ? agoraMinuto : d.inicio().truncatedTo(ChronoUnit.MINUTES);
        if (quando.isBefore(agoraMinuto.minus(400, ChronoUnit.DAYS))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A data do atendimento é antiga demais (máximo de 400 dias atrás).");
        // lançamento de um dia anterior ("esqueci de registrar"): exige o motivo, que fica no histórico; hoje, mesmo em hora anterior, é atendimento comum
        boolean retro = quando.isBefore(inicioDoDia(agoraMinuto));
        String motivo = retro ? br.com.agendz.validacao.Texto.limpar(d.motivoRetroativo() == null ? "" : d.motivoRetroativo()) : null;
        if (retro && motivo.length() < 5) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o motivo do lançamento de um dia anterior (por que não foi registrado na hora).");
        }
        ClienteService.DoAtendimento quem = clientes.resolverDoAtendimento(jdbc, d.nome(), d.telefone(), d.clienteId());
        Instant inicio = quando.isAfter(agoraMinuto) ? agoraMinuto : quando;
        int minutos = 0;
        BigDecimal total = BigDecimal.ZERO;
        for (ServicoLinha s : servicos) {
            minutos += s.duracaoMin();
            total = total.add(s.preco());
        }
        if (servicos.isEmpty()) minutos = 1; // venda só de produto: ocupa 1 minuto (o banco exige início < fim)
        Instant fimServico = inicio.plus(minutos, ChronoUnit.MINUTES);
        Instant fimOcupado = fimServico.plus(servicos.isEmpty() ? 0 : servicos.get(servicos.size() - 1).intervaloMin(), ChronoUnit.MINUTES);
        String avulso = quem.clienteId() == null && quem.nomeAvulso() != null && !quem.nomeAvulso().isEmpty() ? quem.nomeAvulso() : null;
        UUID id = jdbc.queryForObject(
                "insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total, origem, nome_avulso, motivo_retroativo) "
                        + "values (?::uuid, ?, ?, ?, ?, ?, 'concluido', false, ?, 'atendimento', ?, ?) returning id",
                UUID.class, loja.id().toString(), quem.clienteId(), profissionalId, utc(inicio), utc(fimServico), utc(fimOcupado), total, avulso, motivo);
        gravarServicos(jdbc, loja, id, servicos);
        String vendidos = produtos.isEmpty() ? "" : lancarProdutos(jdbc, loja, id, produtos, vendedor, jwt);
        String nomes = java.util.stream.Stream.of(servicos.stream().map(ServicoLinha::nome).collect(java.util.stream.Collectors.joining(" + ")), vendidos.isEmpty() ? "" : "venda de " + vendidos)
                .filter(x -> !x.isEmpty()).collect(java.util.stream.Collectors.joining(" + "));
        String de = quem.clienteId() != null
                ? " (cliente " + jdbc.queryForObject("select coalesce(nullif(apelido, ''), nome) from cliente where id = ?", String.class, quem.clienteId()) + ")"
                : avulso != null ? " (" + avulso + ")" : "";
        registrar(jdbc, loja.id(), id, jwt, "criação", null, "Atendimento local: " + nomes + de);
        if (retro) {
            // se o período já foi pago a alguém que participa do atendimento, a comissão entra no PRÓXIMO pagamento (não reabre o mês fechado)
            List<UUID> participantes = new ArrayList<>();
            if (!servicos.isEmpty()) participantes.add(profissionalId);
            if (vendedor != null && !participantes.contains(vendedor)) participantes.add(vendedor);
            boolean fechado = comissoes.periodoJaPago(jdbc, participantes, inicio);
            if (fechado) jdbc.update("update agendamento set comissao_em = ? where id = ?", utc(relogio.instant()), id);
            registrar(jdbc, loja.id(), id, jwt, "lançamento retroativo", null, motivo + (fechado ? " · comissão entra no próximo pagamento (o período já foi pago)" : ""));
        }
        return buscar(jdbc, id, null);
    }

    /** 00:00 de hoje no fuso da loja (como `startOfDay` do simulador). */
    private static Instant inicioDoDia(Instant quando) {
        return quando.atZone(br.com.agendz.escala.Fuso.BRASIL).toLocalDate().atStartOfDay(br.com.agendz.escala.Fuso.BRASIL).toInstant();
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
            estoque.sincronizar(jdbc, loja.id(), id, UUID.fromString(jwt.getSubject()), relogio.instant()); // concluir baixa os produtos; sair de concluído devolve
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
            estoque.sincronizar(jdbc, loja.id(), id, UUID.fromString(jwt.getSubject()), relogio.instant());
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
        if (ids.isEmpty()) return List.of(); // venda só de produto
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

    // ---------------------------------------------------------------- produtos vendidos

    private record MaterialLinha(UUID id, String nome, BigDecimal preco, BigDecimal comissaoPct, BigDecimal estoque) {
    }

    /** Quem pode vender: ativo, não é a conta técnica e tem a marca "Pode vender produtos" (Equipe). */
    private void exigirVendedor(JdbcTemplate jdbc, UUID vendedor) {
        List<Boolean> ok = jdbc.query("select (ativo and papel <> 'master' and pode_vender) from usuario where id = ?", (rs, i) -> rs.getBoolean(1), vendedor);
        if (ok.isEmpty() || !ok.get(0)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Essa pessoa não pode vender produtos (Equipe > Pode vender produtos).");
    }

    private boolean atende(JdbcTemplate jdbc, UUID usuarioId) {
        if (usuarioId == null) return false;
        List<Boolean> a = jdbc.query("select atende from usuario where id = ? and ativo", (rs, i) -> rs.getBoolean(1), usuarioId);
        return !a.isEmpty() && a.get(0);
    }

    private UUID primeiroQueAtende(JdbcTemplate jdbc) {
        List<UUID> ids = jdbc.queryForList("select id from usuario where atende and ativo order by lower(nome), id limit 1", UUID.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * Confere e grava os produtos do atendimento (espelho de `incluirProduto` em src/domain/engine.js): material do tipo produto e ativo, quantidade inteira de
     * 1 a 999 (a mesma linha repetida soma), estoque suficiente (a linha do material fica travada até o fim da transação: duas vendas ao mesmo tempo não passam
     * do estoque). Preço e percentual de comissão do produto ficam congelados na linha. Se o atendimento já está concluído (atendimento local), o estoque sai na hora.
     * Devolve o texto "2× Pomada, 1× Óleo" para o histórico.
     */
    private String lancarProdutos(JdbcTemplate jdbc, Loja loja, UUID agendamentoId, List<ProdutoPedido> pedidos, UUID vendedor, Jwt jwt) {
        Map<UUID, Integer> quantidades = new LinkedHashMap<>();
        Map<UUID, MaterialLinha> materiais = new LinkedHashMap<>();
        for (ProdutoPedido p : pedidos) {
            MaterialLinha m = p == null || p.materialId() == null ? null : jdbc.query(
                    "select id, nome, preco, comissao_pct, estoque from material where id = ? and tipo = 'produto' and ativo for update",
                    (rs, i) -> new MaterialLinha(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getBigDecimal("preco"), rs.getBigDecimal("comissao_pct"), rs.getBigDecimal("estoque")),
                    p.materialId()).stream().findFirst().orElse(null);
            if (m == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Produto não encontrado.");
            Integer n = p.qtd();
            if (n == null || n < 1 || n > 999) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A quantidade vai de 1 a 999.");
            int total = quantidades.getOrDefault(m.id(), 0) + n;
            if (total > 999) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A quantidade vai de 1 a 999.");
            if (m.estoque().compareTo(BigDecimal.valueOf(total)) < 0) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Estoque insuficiente de " + m.nome() + " (restam " + m.estoque().stripTrailingZeros().toPlainString() + ").");
            }
            quantidades.put(m.id(), total);
            materiais.putIfAbsent(m.id(), m);
        }
        List<String> textos = new ArrayList<>();
        for (Map.Entry<UUID, Integer> e : quantidades.entrySet()) {
            MaterialLinha m = materiais.get(e.getKey());
            BigDecimal pct = m.comissaoPct() != null && m.comissaoPct().signum() > 0 ? m.comissaoPct() : BigDecimal.ZERO;
            jdbc.update("insert into agendamento_produto (loja_id, agendamento_id, material_id, nome, qtd, preco, comissao_pct, vendedor_id) values (?::uuid, ?, ?, ?, ?, ?, ?, ?)",
                    loja.id().toString(), agendamentoId, m.id(), m.nome(), e.getValue(), m.preco(), pct, vendedor);
            textos.add(e.getValue() + "× " + m.nome());
        }
        String texto = String.join(", ", textos);
        UUID autor = jwt == null ? null : UUID.fromString(jwt.getSubject());
        estoque.sincronizar(jdbc, loja.id(), agendamentoId, autor, relogio.instant());
        return texto;
    }

    private List<ProdutoLinha> carregarProdutos(JdbcTemplate jdbc, UUID agendamentoId) {
        return jdbc.query("select material_id, nome, qtd, preco, vendedor_id from agendamento_produto where agendamento_id = ? order by lower(nome)",
                (rs, i) -> new ProdutoLinha(rs.getObject("material_id", UUID.class), rs.getString("nome"), rs.getInt("qtd"), rs.getBigDecimal("preco"), rs.getObject("vendedor_id", UUID.class)), agendamentoId);
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
        String sql = "select id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total, origem, reagendado, motivo_cancelamento, nome_avulso, motivo_retroativo, "
                + "(status_manual_inicio is not null and status_manual_inicio = inicio) as status_manual from agendamento where id = ?"
                + (so == null ? "" : " and profissional_id = ?");
        Object[] args = so == null ? new Object[]{id} : new Object[]{id, so};
        List<Agendamento> achados = jdbc.query(sql, (rs, i) -> linha(rs), args);
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        List<Item> itens = jdbc.query("select servico_id, nome, preco, duracao_min from agendamento_servico where agendamento_id = ? order by ordem",
                (rs, i) -> new Item(rs.getObject("servico_id", UUID.class), rs.getString("nome"), rs.getBigDecimal("preco"), rs.getInt("duracao_min")), id);
        return comItens(achados.get(0), itens).comProdutos(carregarProdutos(jdbc, id));
    }

    private static Agendamento linha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Agendamento(rs.getObject("id", UUID.class), rs.getObject("cliente_id", UUID.class), rs.getObject("profissional_id", UUID.class),
                rs.getObject("inicio", OffsetDateTime.class).toInstant(), rs.getObject("fim_servico", OffsetDateTime.class).toInstant(),
                rs.getObject("fim_ocupado", OffsetDateTime.class).toInstant(), rs.getString("status"), rs.getBoolean("encaixe"),
                rs.getBigDecimal("total"), List.of(), null,
                rs.getString("origem"), rs.getBoolean("reagendado"), rs.getString("motivo_cancelamento"), rs.getBoolean("status_manual"),
                rs.getString("nome_avulso"), rs.getString("motivo_retroativo"), null, List.of(), BigDecimal.ZERO);
    }

    private static Agendamento comItens(Agendamento a, List<Item> itens) {
        return new Agendamento(a.id(), a.clienteId(), a.profissionalId(), a.inicio(), a.fim(), a.fimOcupado(), a.status(), a.encaixe(), a.total(), itens, a.conflitosPendentes(),
                a.origem(), a.reagendado(), a.motivoCancelamento(), a.statusManual(), a.nomeAvulso(), a.motivoRetroativo(), a.historico(), a.produtos(), a.totalProdutos());
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
