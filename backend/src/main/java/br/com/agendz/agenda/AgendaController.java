package br.com.agendz.agenda;

import br.com.agendz.clientes.ClienteService;
import br.com.agendz.comissao.ComissaoService;
import br.com.agendz.configuracao.PorteController;
import br.com.agendz.configuracao.RegrasAtendimento;
import br.com.agendz.cupom.CupomService;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.planos.PlanoService;
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
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
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

    public record Item(UUID servicoId, String nome, BigDecimal preco, int duracaoMin, BigDecimal desconto) {
    }

    /** Uma linha do histórico do agendamento (quem, quando, o quê). `autor` "Sistema" = feito automaticamente. */
    public record Evento(Instant em, String autor, String campo, String de, String para) {
    }

    /** Só nos tipos com veículo e box (estética): o box e a "foto" do veículo e do porte, congelados no agendamento (o cadastro pode mudar depois; o combinado não). */
    public record Estetica(UUID boxId, String box, UUID veiculoId, String porte, String placa, String marca, String modelo, String cor) {
    }

    /** Produto vendido no atendimento (preço congelado). O percentual de comissão do produto nunca sai nesta resposta (quem vê a agenda não vê percentuais). */
    public record ProdutoLinha(UUID materialId, String nome, int qtd, BigDecimal preco, UUID vendedorId) {
    }

    /** Plano de serviço usado neste horário (v111): o corte gasto é o do mês do início; os serviços do plano saem de graça (desconto = preço). */
    public record PlanoUso(UUID assinaturaId, String nome) {
    }

    /** `total` é o dos serviços; `totalProdutos` é a soma dos produtos (quantidade × preço); o "total com produtos" é a soma dos dois. */
    public record Agendamento(UUID id, UUID clienteId, UUID profissionalId, Instant inicio, Instant fim, Instant fimOcupado,
                              String status, boolean encaixe, BigDecimal total, List<Item> servicos, List<UUID> conflitosPendentes,
                              String origem, boolean reagendado, String motivoCancelamento, boolean statusManual, String nomeAvulso, String motivoRetroativo,
                              List<Evento> historico, List<ProdutoLinha> produtos, BigDecimal totalProdutos, String formaPagamento, CupomService.Foto cupom, BigDecimal desconto,
                              Estetica estetica, PlanoUso plano) {
        /** Construtor sem os dados de estética (tipos sem veículo e box). */
        Agendamento(UUID id, UUID clienteId, UUID profissionalId, Instant inicio, Instant fim, Instant fimOcupado,
                    String status, boolean encaixe, BigDecimal total, List<Item> servicos, List<UUID> conflitosPendentes,
                    String origem, boolean reagendado, String motivoCancelamento, boolean statusManual, String nomeAvulso, String motivoRetroativo,
                    List<Evento> historico, List<ProdutoLinha> produtos, BigDecimal totalProdutos, String formaPagamento, CupomService.Foto cupom, BigDecimal desconto) {
            this(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, conflitosPendentes, origem, reagendado, motivoCancelamento, statusManual,
                    nomeAvulso, motivoRetroativo, historico, produtos, totalProdutos, formaPagamento, cupom, desconto, null, null);
        }

        Agendamento comAvisos(List<UUID> pendentes) {
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, pendentes, origem, reagendado, motivoCancelamento, statusManual, nomeAvulso, motivoRetroativo, historico, produtos, totalProdutos, formaPagamento, cupom, desconto, estetica, plano);
        }

        Agendamento comHistorico(List<Evento> eventos) {
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, conflitosPendentes, origem, reagendado, motivoCancelamento, statusManual, nomeAvulso, motivoRetroativo, eventos, produtos, totalProdutos, formaPagamento, cupom, desconto, estetica, plano);
        }

        Agendamento comProdutos(List<ProdutoLinha> linhas) {
            BigDecimal soma = BigDecimal.ZERO;
            for (ProdutoLinha l : linhas) soma = soma.add(l.preco().multiply(BigDecimal.valueOf(l.qtd())));
            return new Agendamento(id, clienteId, profissionalId, inicio, fim, fimOcupado, status, encaixe, total, servicos, conflitosPendentes, origem, reagendado, motivoCancelamento, statusManual, nomeAvulso, motivoRetroativo, historico, linhas, soma, formaPagamento, cupom, desconto, estetica, plano);
        }
    }

    private static final Map<String, String> ROTULO_CAMPO = Map.of("nome", "nome", "telefone", "telefone", "profissional", "profissional", "vendedor", "vendedor", "formaPagamento", "forma de pagamento",
            "veiculo", "veículo", "placa", "placa", "modelo", "modelo do veículo", "porte", "porte do veículo");

    /** Produto pedido no Atender: material do tipo produto e quantidade inteira de 1 a 999 (a regra é conferida em {@link #lancarProdutos}, com a mensagem do simulador). */
    public record ProdutoPedido(UUID materialId, Integer qtd) {
    }

    public record NovoAgendamento(
            UUID clienteId,
            @NotNull UUID profissionalId,
            @Size(max = 50) List<UUID> servicoIds,
            @NotNull Instant inicio,
            @Size(max = 30) String status,
            Boolean encaixe,
            UUID veiculoId,
            ClienteService.EntradaVeiculo veiculo,
            UUID boxId,
            UUID assinaturaId) {
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
            UUID vendedorId,
            @Size(max = 20) String formaPagamento,
            @Size(max = 40) String cupomChave,
            UUID veiculoId,
            ClienteService.EntradaVeiculo veiculo,
            UUID boxId,
            UUID assinaturaId) {
    }

    public record ChaveCupom(@jakarta.validation.constraints.NotBlank @Size(max = 40) String chave) {
    }

    public record Remarcacao(@NotNull Instant inicio, UUID profissionalId, Boolean encaixe, @Size(max = 30) String status, UUID boxId) {
    }

    public record NovoStatus(@NotNull @Size(max = 30) String status) {
    }

    public record NovaForma(@NotNull @Size(max = 20) String formaPagamento) {
    }

    private static final Map<String, String> ROTULO_FORMA = Map.of("pix", "Pix", "dinheiro", "Dinheiro", "cartao", "Cartão");

    private record ServicoLinha(UUID id, String nome, BigDecimal preco, int duracaoMin, int intervaloMin, boolean multiDia, boolean ativo) {
    }

    private record Atual(UUID profissionalId, Instant inicio, Instant fimServico, Instant fimOcupado, String status, boolean encaixe, UUID boxId) {
    }

    private final LojaJdbc banco;
    private final Clock relogio;
    private final EscalaService escalas;
    private final ClienteService clientes;
    private final Idempotencia idempotencia;
    private final EstoqueDaVenda estoque;
    private final ComissaoService comissoes;
    private final CupomService cupons;
    private final Ocupacao ocupacao;
    private final PlanoService planos;
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    public AgendaController(LojaJdbc banco, Clock relogio, EscalaService escalas, ClienteService clientes, Idempotencia idempotencia, EstoqueDaVenda estoque, ComissaoService comissoes, CupomService cupons, Ocupacao ocupacao, PlanoService planos) {
        this.planos = planos;
        this.cupons = cupons;
        this.estoque = estoque;
        this.comissoes = comissoes;
        this.banco = banco;
        this.relogio = relogio;
        this.escalas = escalas;
        this.clientes = clientes;
        this.idempotencia = idempotencia;
        this.ocupacao = ocupacao;
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
                    "select a.id, a.cliente_id, a.profissional_id, a.inicio, a.fim_servico, a.fim_ocupado, a.status, a.encaixe, a.total, a.origem, a.reagendado, a.motivo_cancelamento, a.nome_avulso, a.motivo_retroativo, a.forma_pagamento, a.cupom_foto::text as cupom_foto, a.plano_assinatura_id, a.plano_nome, "
                            + "a.box_id, (select b.nome from box b where b.id = a.box_id) as box_nome, a.veiculo_id, a.porte, a.veiculo_placa, a.veiculo_marca, a.veiculo_modelo, a.veiculo_cor, "
                            + "(a.status_manual_inicio is not null and a.status_manual_inicio = a.inicio) as status_manual from agendamento a "
                            + "where a.inicio < ? and a.fim_ocupado > ?" + filtro + " order by a.inicio limit 1000",
                    (rs, i) -> linha(rs), args.toArray());
            Map<UUID, List<Item>> itens = new LinkedHashMap<>();
            jdbc.query("select s.agendamento_id, s.servico_id, s.nome, s.preco, s.duracao_min, s.desconto from agendamento_servico s "
                            + "join agendamento a on a.id = s.agendamento_id where a.inicio < ? and a.fim_ocupado > ?" + filtro + " order by s.ordem",
                    rs -> {
                        itens.computeIfAbsent(rs.getObject("agendamento_id", UUID.class), k -> new ArrayList<>())
                                .add(new Item(rs.getObject("servico_id", UUID.class), rs.getString("nome"), rs.getBigDecimal("preco"), rs.getInt("duracao_min"), rs.getBigDecimal("desconto")));
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
            return inserirAgendamento(jdbc, loja, jwt, d.clienteId(), null, d.profissionalId(), servicoIds, d.inicio(), status, encaixe, d.veiculoId(), d.veiculo(), d.boxId(), d.assinaturaId(), ClienteService.EXIGE_TUDO_DO_VEICULO);
        }));
        return ResponseEntity.status(HttpStatus.CREATED).body(criado);
    }

    /**
     * Agendamento futuro (usado por criar e por atender). Dentro da transação da loja; a mesma ordem de validações do simulador:
     * serviços, cliente, veículo (estética), profissional/expediente, conflito do profissional, box.
     */
    private Agendamento inserirAgendamento(JdbcTemplate jdbc, Loja loja, Jwt jwt, UUID clienteId, String nomeAvulsoPedido, UUID profissionalId, List<UUID> servicoIds, Instant inicioBruto, String status, boolean encaixe,
                                           UUID veiculoId, ClienteService.EntradaVeiculo veiculoNovo, UUID boxPedido, UUID assinaturaId, Set<String> exigirVeiculo) {
        carregarServicos(jdbc, servicoIds, null); // só confere que existem e estão ativos; o preço do porte vem depois do veículo
        // Pelo botão Atender o horário futuro pode ficar sem cadastro (só o nome, ou nem isso): nasce confirmado e sem aviso ao cliente. Pela tela de agendar o cliente é obrigatório.
        boolean semCadastro = clienteId == null && nomeAvulsoPedido != null;
        if (clienteId == null && !semCadastro) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o cliente.");
        if (clienteId != null) {
            Integer clientesAchados = jdbc.queryForObject("select count(*) from cliente where id = ?", Integer.class, clienteId);
            if (clientesAchados == null || clientesAchados == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Escolha o cliente.");
        }
        if (semCadastro) status = CONFIRMADO;
        String avulso = semCadastro && !nomeAvulsoPedido.isEmpty() ? nomeAvulsoPedido : null;
        ClienteService.VeiculoDoAgendamento vei = clientes.resolverVeiculo(jdbc, loja, clienteId, veiculoId, veiculoNovo, exigirVeiculo);
        List<ServicoLinha> servicos = carregarServicos(jdbc, servicoIds, vei == null ? null : vei.porte());
        travarProfissional(jdbc, profissionalId);
        Instant inicio = conferirInicio(inicioBruto);
        int minutos = 0;
        BigDecimal total = BigDecimal.ZERO;
        for (ServicoLinha s : servicos) {
            minutos += s.duracaoMin();
            total = total.add(s.preco());
        }
        Ocupacao.Plano plano = ocupacao.planejar(jdbc, profissionalId, inicio, minutos, servicos.get(servicos.size() - 1).intervaloMin(), servicos.stream().anyMatch(ServicoLinha::multiDia));
        List<UUID> pendentes = conferirConflitos(ocupacao.conflitos(jdbc, profissionalId, new UUID(0, 0), plano), encaixe);
        if (!encaixe) conferirFixoReservado(jdbc, loja, profissionalId, clienteId, plano); // horário fixo de assinante (v128): ninguém mais toma, só encaixe da equipe passa por cima
        UUID boxId = ocupacao.escolherBox(jdbc, loja, plano, boxPedido, null, new UUID(0, 0));
        UUID id = jdbc.queryForObject(
                "insert into agendamento (loja_id, cliente_id, nome_avulso, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total, box_id, veiculo_id, porte, veiculo_placa, veiculo_marca, veiculo_modelo, veiculo_cor) "
                        + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                UUID.class, loja.id().toString(), clienteId, avulso, profissionalId, utc(inicio), utc(plano.fimServico()), utc(plano.fimOcupado()), status, encaixe, total, boxId,
                vei == null ? null : vei.veiculoId(), vei == null ? null : vei.porte(), vei == null ? null : vei.placa(), vei == null ? null : vei.marca(), vei == null ? null : vei.modelo(), vei == null ? null : vei.cor());
        ocupacao.gravarBlocos(jdbc, loja.id(), id, plano);
        gravarServicos(jdbc, loja, id, servicos);
        usarPlano(jdbc, loja, id, jwt, assinaturaId, clienteId, servicoIds, inicio);
        registrar(jdbc, loja.id(), id, jwt, "criação", null, servicos.stream().map(ServicoLinha::nome).collect(java.util.stream.Collectors.joining(" + "))
                + (vei == null ? "" : " (" + vei.modelo() + " " + vei.placa() + ")") + " em " + dataHora(inicio));
        if (CONFIRMADO.equals(status)) cancelarPendentesQueCobrem(jdbc, loja.id(), profissionalId, id, plano);
        return buscar(jdbc, id, null).comAvisos(CONFIRMADO.equals(status) || pendentes.isEmpty() ? null : pendentes);
    }

    // ---------------------------------------------------------------- horários fixos de assinante (v128; src/domain/rules.js `fixoReservado`, assinaturas.js)

    /**
     * Ocupação de um horário fixo numa data (porte do veículo do assinante nos tipos com veículo). `null` = o profissional não atende nesse horário ou os serviços não existem.
     * Usada pela confirmação do fixo (HorariosFixos) e pela reserva abaixo.
     */
    @PreAuthorize("permitAll()") // chamado pela automação (sem login) e por HorariosFixos; não tem rota HTTP, então a trava da classe não se aplica a ele
    public Ocupacao.Plano planoDoFixo(JdbcTemplate jdbc, Loja loja, UUID profissionalId, Instant inicio, List<UUID> servicoIds, UUID clienteId, UUID veiculoId) {
        try {
            ClienteService.VeiculoDoAgendamento vei = clientes.resolverVeiculo(jdbc, loja, clienteId, veiculoId, null, Set.of());
            List<ServicoLinha> servicos = carregarServicos(jdbc, servicoIds, vei == null ? null : vei.porte());
            int minutos = 0;
            for (ServicoLinha s : servicos) minutos += s.duracaoMin();
            return ocupacao.planejar(jdbc, profissionalId, inicio, minutos, servicos.get(servicos.size() - 1).intervaloMin(), servicos.stream().anyMatch(ServicoLinha::multiDia));
        } catch (ErroDeNegocio e) {
            return null;
        }
    }

    /**
     * Quem não é o assinante nunca toma um horário fixo, nem antes de ele virar agendamento (só nasce 14 dias à frente). Fixo que já virou agendamento vale pelo próprio
     * agendamento (conflito normal); dia em que o fixo foi cancelado fica livre. Só a equipe, marcando encaixe, passa por cima (quem chama só confere com `encaixe` falso).
     */
    private void conferirFixoReservado(JdbcTemplate jdbc, Loja loja, UUID profissionalId, UUID clienteId, Ocupacao.Plano plano) {
        List<Map<String, Object>> fixos = jdbc.queryForList(
                "select f.id, f.dia, f.hm, f.servicos, f.veiculo_id, a.cliente_id from assinatura_fixo f join assinatura a on a.id = f.assinatura_id "
                        + "where a.status = 'ativa' and f.profissional_id = ? and a.cliente_id is distinct from ?::uuid", profissionalId, clienteId);
        if (fixos.isEmpty()) return;
        Instant agora = relogio.instant();
        Set<java.time.LocalDate> dias = new HashSet<>();
        for (Instant[] b : plano.doProfissional()) {
            dias.add(b[0].atZone(br.com.agendz.escala.Fuso.BRASIL).toLocalDate());
            dias.add(b[1].atZone(br.com.agendz.escala.Fuso.BRASIL).toLocalDate());
        }
        for (Map<String, Object> f : fixos) {
            int diaSemana = ((Number) f.get("dia")).intValue();
            for (java.time.LocalDate dia : dias) {
                if (dia.getDayOfWeek().getValue() % 7 != diaSemana) continue; // domingo = 0
                Instant t = dia.atTime(java.time.LocalTime.parse((String) f.get("hm"))).atZone(br.com.agendz.escala.Fuso.BRASIL).toInstant();
                if (!t.isAfter(agora)) continue;
                Integer feito = jdbc.queryForObject("select count(*) from agendamento where fixo_id = ? and fixo_data = ?", Integer.class, f.get("id"), java.sql.Date.valueOf(dia));
                if (feito != null && feito > 0) continue;
                List<UUID> servicoIds = new ArrayList<>();
                for (String x : ((String) f.get("servicos")).split(",")) servicoIds.add(UUID.fromString(x.trim()));
                Ocupacao.Plano dele = planoDoFixo(jdbc, loja, profissionalId, t, servicoIds, (UUID) f.get("cliente_id"), (UUID) f.get("veiculo_id"));
                if (dele == null) continue;
                for (Instant[] x : dele.doProfissional()) {
                    for (Instant[] y : plano.doProfissional()) {
                        if (x[0].isBefore(y[1]) && y[0].isBefore(x[1])) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse horário é fixo de um cliente com plano. Escolha outro horário.");
                    }
                }
            }
        }
    }

    /** O agendamento de um horário fixo (confirmado, em nome do assinante, gastando 1 atendimento do plano), feito pelo próprio sistema. Recusa = ErroDeNegocio com o motivo. */
    @PreAuthorize("permitAll()") // idem: só a automação e HorariosFixos chamam, nunca uma rota
    public Agendamento criarDoFixo(JdbcTemplate jdbc, Loja loja, UUID clienteId, UUID profissionalId, List<UUID> servicoIds, Instant inicio, UUID veiculoId, UUID assinaturaId, UUID fixoId, java.time.LocalDate dia) {
        Agendamento a = inserirAgendamento(jdbc, loja, null, clienteId, null, profissionalId, servicoIds, inicio, CONFIRMADO, false, veiculoId, null, null, assinaturaId, Set.of());
        jdbc.update("update agendamento set fixo_id = ?, fixo_data = ? where id = ?", fixoId, java.sql.Date.valueOf(dia), a.id());
        registrar(jdbc, loja.id(), a.id(), null, "horário fixo", null, "Criado pelo horário fixo do plano");
        return a;
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
     * - data futura (mais de 1 min à frente) = agendamento a confirmar ou confirmado, com o cliente achado/criado por nome+telefone (sem telefone nem cliente escolhido: só o nome, confirmado e sem aviso);
     * - sem data, agora ou passado = atendimento local, já CONCLUÍDO, sem conflito de horário (já aconteceu), sem mensagem ao cliente;
     * - dia anterior a hoje exige o motivo (5 a 300 letras) e é só da recepção/dono; o profissional atende e lança sempre como ele mesmo.
     * Campos obrigatórios e forma de pagamento padrão: de Estabelecimento > Regras (`RegrasAtendimento`; de fábrica nada é obrigatório, nem no futuro nem no local, forma Pix). Produtos (5d-4a): venda com serviço ou só de produto (só no atendimento de agora), estoque sai ao concluir. A forma de pagamento do atendimento local é só registrada (5d-4c).
     */
    @PostMapping("/api/atendimentos")
    public ResponseEntity<Agendamento> atender(@Valid @RequestBody NovoAtendimento d, @RequestHeader(value = "Idempotency-Key", required = false) String chave, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        boolean veTudo = ehDono(jwt);
        Instant agora = relogio.instant();
        Instant agoraMinuto = agora.truncatedTo(ChronoUnit.MINUTES);
        // profissional atende e lança sempre como ele mesmo; dia anterior é com o dono ou a recepção (senão poderia inventar comissão)
        UUID profissionalPedido = veTudo ? d.profissionalId() : UUID.fromString(jwt.getSubject());
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
            // estética: sem nenhum box ativo não se atende nem se agenda (v120); o front leva o proprietário ao cadastro
            if (usaBox(loja) && Integer.valueOf(0).equals(jdbc.queryForObject("select count(*) from box where ativo", Integer.class))) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, SEM_BOX);
            }
            // campos obrigatórios do tipo (Estabelecimento > Regras): o que o formulário já traz por padrão (profissional, vendedor, forma padrão) conta como preenchido
            RegrasAtendimento.Regras regras = RegrasAtendimento.ler(jdbc);
            // B9c: a loja tirou o campo "quem faz o serviço" e ninguém escolheu → o servidor escolhe quem está com a agenda mais livre (quem tem o campo preenchido manda)
            UUID profissionalId = profissionalPedido;
            if (profissionalId == null && regras.profissionalAutomatico() && veTudo) profissionalId = escolherAutomatico(jdbc, servicoIds, futuro, d.inicio(), agora);
            Map<String, Boolean> tem = new LinkedHashMap<>();
            tem.put("nome", !nomeInf.isEmpty() || (semNome != null && !semNome));
            tem.put("telefone", br.com.agendz.validacao.Documentos.telefone(d.telefone()) != null || semNome != null);
            tem.put("profissional", profissionalId != null);
            tem.put("vendedor", produtos.isEmpty() || vendedorPedido != null);
            String formaEf = RegrasAtendimento.formaEfetiva(regras, d.formaPagamento());
            tem.put("formaPagamento", futuro || (formaEf != null && !formaEf.isEmpty()));
            List<String> faltam = new ArrayList<>();
            for (String k : futuro ? regras.futuro() : regras.local()) if (Boolean.FALSE.equals(tem.get(k))) faltam.add(ROTULO_CAMPO.get(k));
            if (!faltam.isEmpty()) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Preencha " + (faltam.size() == 1 ? "o campo obrigatório" : "os campos obrigatórios") + ": " + String.join(", ", faltam) + ".");
            }
            boolean comCupom = d.cupomChave() != null && !d.cupomChave().isBlank();
            if (comCupom && !futuro) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Cupom só vale em agendamento (data futura).");
            if (futuro) {
                String status = d.status() == null || d.status().isBlank() ? A_CONFIRMAR : d.status();
                if (!A_CONFIRMAR.equals(status) && !CONFIRMADO.equals(status)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Agendamento futuro nasce a confirmar ou confirmado.");
                if (profissionalId == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o profissional.");
                UUID vendedor = produtos.isEmpty() ? null : vendedorPedido != null ? vendedorPedido : profissionalId;
                if (vendedor != null) exigirVendedor(jdbc, vendedor);
                ClienteService.DoAtendimento quem = clientes.resolverDoAtendimento(jdbc, d.nome(), d.telefone(), d.clienteId());
                Agendamento criado = inserirAgendamento(jdbc, loja, jwt, quem.clienteId(), quem.clienteId() == null ? (quem.nomeAvulso() == null ? "" : quem.nomeAvulso()) : null, profissionalId, servicoIds, d.inicio(), status, Boolean.TRUE.equals(d.encaixe()), d.veiculoId(), d.veiculo(), d.boxId(), d.assinaturaId(), exigirVeiculo(futuro ? regras.futuro() : regras.local()));
                if (!produtos.isEmpty()) lancarProdutos(jdbc, loja, criado.id(), produtos, vendedor, jwt);
                if (comCupom) {
                    // cupom recusado: o agendamento também não é criado (a transação volta atrás; só a tentativa errada fica gravada)
                    CupomService.Aplicado ap = cupons.aplicar(jdbc, loja.id(), criado.id(), null, jwt.getSubject(), d.cupomChave(), relogio.instant());
                    registrar(jdbc, loja.id(), criado.id(), jwt, "cupom", null, ap.nome() + ": desconto de " + CupomService.reais(ap.desconto()));
                }
                if (produtos.isEmpty() && !comCupom) return criado;
                return buscar(jdbc, criado.id(), null).comAvisos(criado.conflitosPendentes());
            }
            return inserirLocal(jdbc, loja, jwt, d, profissionalId, servicoIds, produtos, vendedorPedido, agoraMinuto, regras);
        }));
        return ResponseEntity.status(HttpStatus.CREATED).body(feito);
    }

    /**
     * B9c (espelho de `escolherProfissionalAuto` em engine.js): quem está com a agenda mais livre (`Folga`). Atendimento de agora ou passado: o primeiro da ordem (já aconteceu, não disputa
     * horário). Agendamento futuro: o primeiro da ordem que cabe no horário (expediente dele e sem conflito); ninguém livre = 409. A duração usa o porte médio; a conferência final
     * (porte, box) continua em `inserirAgendamento`.
     */
    private UUID escolherAutomatico(JdbcTemplate jdbc, List<UUID> servicoIds, boolean futuro, Instant inicio, Instant agora) {
        List<UUID> equipe = jdbc.queryForList("select id from usuario where ativo and atende order by criado_em, id", UUID.class);
        if (equipe.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Nenhum profissional da equipe atende. Marque quem atende em Equipe.");
        Instant quando = futuro ? inicio : agora;
        List<UUID> ordem = Folga.ordem(jdbc, equipe, quando.atZone(br.com.agendz.escala.Fuso.BRASIL).toLocalDate());
        if (!futuro) return ordem.get(0);
        List<ServicoLinha> servicos = carregarServicos(jdbc, servicoIds, null);
        int minutos = servicos.stream().mapToInt(ServicoLinha::duracaoMin).sum();
        int intervalo = servicos.get(servicos.size() - 1).intervaloMin();
        boolean multiDia = servicos.stream().anyMatch(ServicoLinha::multiDia);
        Instant ini = conferirInicio(inicio);
        for (UUID id : ordem) {
            try {
                Ocupacao.Plano plano = ocupacao.planejar(jdbc, id, ini, minutos, intervalo, multiDia);
                if (ocupacao.conflitos(jdbc, id, new UUID(0, 0), plano).isEmpty()) return id;
            } catch (ErroDeNegocio e) {
                // fora do expediente dele: tenta o próximo
            }
        }
        throw new ErroDeNegocio(HttpStatus.CONFLICT, "Nenhum profissional está livre neste horário. Escolha outro horário.");
    }

    /** Só os campos de veículo da lista de campos obrigatórios (Estabelecimento > Regras). */
    private static Set<String> exigirVeiculo(List<String> campos) {
        Set<String> r = new HashSet<>();
        for (String k : campos) if (ClienteService.CAMPOS_DO_VEICULO.contains(k)) r.add(k);
        return r;
    }

    private Agendamento inserirLocal(JdbcTemplate jdbc, Loja loja, Jwt jwt, NovoAtendimento d, UUID profissionalId, List<UUID> servicoIds, List<ProdutoPedido> produtos, UUID vendedorPedido, Instant agoraMinuto, RegrasAtendimento.Regras regras) {
        // forma de pagamento: a escolhida ou o padrão da loja (só registro; o financeiro do servidor vem depois)
        String forma = RegrasAtendimento.formaEfetiva(regras, d.formaPagamento());
        if (forma == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Forma de pagamento inválida.");
        if (forma.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha a forma de pagamento.");
        List<ServicoLinha> servicos = carregarServicos(jdbc, servicoIds, null);
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
        // estética: o atendimento de serviço precisa do veículo (o porte define preço e duração); venda só de produto não
        ClienteService.VeiculoDoAgendamento vei = servicoIds.isEmpty() ? null : clientes.resolverVeiculo(jdbc, loja, quem.clienteId(), d.veiculoId(), d.veiculo(), exigirVeiculo(regras.local()));
        if (vei != null) servicos = carregarServicos(jdbc, servicoIds, vei.porte());
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
                "insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total, origem, nome_avulso, motivo_retroativo, forma_pagamento, veiculo_id, porte, veiculo_placa, veiculo_marca, veiculo_modelo, veiculo_cor) "
                        + "values (?::uuid, ?, ?, ?, ?, ?, 'concluido', false, ?, 'atendimento', ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                UUID.class, loja.id().toString(), quem.clienteId(), profissionalId, utc(inicio), utc(fimServico), utc(fimOcupado), total, avulso, motivo, forma,
                vei == null ? null : vei.veiculoId(), vei == null ? null : vei.porte(), vei == null ? null : vei.placa(), vei == null ? null : vei.marca(), vei == null ? null : vei.modelo(), vei == null ? null : vei.cor());
        // atendimento já feito: um bloco só (sem box nem conflito; já aconteceu)
        ocupacao.gravarBlocos(jdbc, loja.id(), id, new Ocupacao.Plano(List.<Instant[]>of(new Instant[]{inicio, fimServico}), fimServico, fimOcupado));
        gravarServicos(jdbc, loja, id, servicos);
        usarPlano(jdbc, loja, id, jwt, d.assinaturaId(), quem.clienteId(), servicoIds, inicio);
        String vendidos = produtos.isEmpty() ? "" : lancarProdutos(jdbc, loja, id, produtos, vendedor, jwt);
        String nomes = java.util.stream.Stream.of(servicos.stream().map(ServicoLinha::nome).collect(java.util.stream.Collectors.joining(" + ")), vendidos.isEmpty() ? "" : "venda de " + vendidos)
                .filter(x -> !x.isEmpty()).collect(java.util.stream.Collectors.joining(" + "));
        String de = quem.clienteId() != null
                ? " (cliente " + jdbc.queryForObject("select coalesce(nullif(apelido, ''), nome) from cliente where id = ?", String.class, quem.clienteId()) + ")"
                : avulso != null ? " (" + avulso + ")" : "";
        registrar(jdbc, loja.id(), id, jwt, "criação", null, "Atendimento local: " + nomes + (vei == null ? "" : " (" + vei.modelo() + " " + vei.placa() + ")") + de);
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

    /** Plano do cliente (v111): gasta 1 corte e dá de graça o que o plano cobre; o aviso de corte adiantado vai ao histórico (e a tela o lê de lá, depois de salvar). Sem plano: nada. */
    private void usarPlano(JdbcTemplate jdbc, Loja loja, UUID agendamentoId, Jwt jwt, UUID assinaturaId, UUID clienteId, List<UUID> servicoIds, Instant inicio) {
        if (assinaturaId == null) return;
        PlanoService.Uso uso = planos.usar(jdbc, agendamentoId, assinaturaId, clienteId, servicoIds, inicio, relogio.instant());
        registrar(jdbc, loja.id(), agendamentoId, jwt, "plano", null, "Usa 1 corte do plano " + uso.planoNome() + (uso.aviso().isEmpty() ? "" : " (" + uso.aviso() + ")"));
    }

    /** 00:00 de hoje no fuso da loja (como `startOfDay` do simulador). */
    private static Instant inicioDoDia(Instant quando) {
        return quando.atZone(br.com.agendz.escala.Fuso.BRASIL).toLocalDate().atStartOfDay(br.com.agendz.escala.Fuso.BRASIL).toInstant();
    }

    // ---------------------------------------------------------------- cupom

    /** Aplica um cupom ao horário (só a confirmar ou confirmado; um por horário). O profissional só age no dele. A chave errada responde sempre a mesma mensagem. */
    @PostMapping("/api/agendamentos/{id}/cupom")
    public Agendamento aplicarCupom(@PathVariable UUID id, @Valid @RequestBody ChaveCupom d, @AuthenticationPrincipal Jwt jwt) {
        UUID so = somenteDe(jwt);
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            CupomService.Aplicado ap = cupons.aplicar(jdbc, loja.id(), id, so, jwt.getSubject(), d.chave(), relogio.instant());
            registrar(jdbc, loja.id(), id, jwt, "cupom", null, ap.nome() + ": desconto de " + CupomService.reais(ap.desconto()));
            return buscar(jdbc, id, so);
        });
    }

    @DeleteMapping("/api/agendamentos/{id}/cupom")
    public Agendamento retirarCupom(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        UUID so = somenteDe(jwt);
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            String nome = cupons.retirar(jdbc, id, so);
            registrar(jdbc, loja.id(), id, jwt, "cupom", nome, "retirado");
            return buscar(jdbc, id, so);
        });
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
            Ocupacao.Plano plano = ocupacao.lerPlano(jdbc, id, a.fimServico(), a.fimOcupado());
            if (CANCELADO.equals(a.status())) {
                // reativação: o horário pode ter sido tomado enquanto estava cancelado (ou o expediente mudou); o box também
                Ocupacao.Plano novoPlano = ocupacao.planejar(jdbc, a.profissionalId(), a.inicio(), minutosDeServico(jdbc, id), a.fimOcupado().isAfter(a.fimServico()) ? (int) Duration.between(a.fimServico(), a.fimOcupado()).toMinutes() : 0, multiDia(jdbc, id));
                pendentes = conferirConflitos(ocupacao.conflitos(jdbc, a.profissionalId(), id, novoPlano), a.encaixe());
                planos.conferirNovoHorario(jdbc, id, a.inicio(), relogio.instant()); // plano: o corte volta a gastar a cota do mês
                UUID box = a.boxId() == null && !usaBox(loja) ? null : ocupacao.escolherBox(jdbc, loja, novoPlano, null, a.boxId(), id);
                jdbc.update("update agendamento set box_id = ? where id = ?", box, id);
                ocupacao.gravarBlocos(jdbc, loja.id(), id, novoPlano);
                plano = novoPlano;
            }
            if (CONFIRMADO.equals(novo) || CONCLUIDO.equals(novo)) cancelarPendentesQueCobrem(jdbc, loja.id(), a.profissionalId(), id, plano);
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

    // ---------------------------------------------------------------- forma de pagamento

    /** Troca a forma de pagamento (segurar o cartão): futuro ou concluído, nunca cancelado. O profissional só age no dele. Só registra a escolha (o servidor ainda não tem financeiro). */
    @PutMapping("/api/agendamentos/{id}/forma-pagamento")
    public Agendamento mudarFormaPagamento(@PathVariable UUID id, @Valid @RequestBody NovaForma d, @AuthenticationPrincipal Jwt jwt) {
        if (!RegrasAtendimento.FORMAS.contains(d.formaPagamento())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Forma de pagamento inválida.");
        UUID so = somenteDe(jwt);
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            Atual a = ler(jdbc, id, so, true);
            if (CANCELADO.equals(a.status())) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Agendamento cancelado não tem forma de pagamento.");
            String antes = jdbc.queryForObject("select forma_pagamento from agendamento where id = ?", String.class, id);
            if (d.formaPagamento().equals(antes)) return buscar(jdbc, id, so);
            jdbc.update("update agendamento set forma_pagamento = ?, atualizado_em = now() where id = ?", d.formaPagamento(), id);
            registrar(jdbc, loja.id(), id, jwt, "forma de pagamento", antes == null || antes.isEmpty() ? "(padrão da loja)" : ROTULO_FORMA.getOrDefault(antes, antes), ROTULO_FORMA.get(d.formaPagamento()));
            return buscar(jdbc, id, so);
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
            int folga = (int) Duration.between(a.fimServico(), a.fimOcupado()).toMinutes();
            boolean encaixe = d.encaixe() == null ? a.encaixe() : d.encaixe();
            Ocupacao.Plano plano = ocupacao.planejar(jdbc, alvo, novoInicio, minutosDeServico(jdbc, id), folga, multiDia(jdbc, id));
            Instant fimServico = plano.fimServico();
            Instant fimOcupado = plano.fimOcupado();
            List<UUID> pendentes = conferirConflitos(ocupacao.conflitos(jdbc, alvo, id, plano), encaixe);
            if (!encaixe) conferirFixoReservado(jdbc, loja, alvo, jdbc.queryForObject("select cliente_id from agendamento where id = ?", UUID.class, id), plano); // remarcar o próprio fixo não esbarra nele mesmo
            if (!CANCELADO.equals(novoStatus)) planos.conferirNovoHorario(jdbc, id, novoInicio, relogio.instant()); // plano: o mês novo também precisa ter corte
            // sem box pedido o carro continua no mesmo box se estiver livre (senão vai para o primeiro livre)
            UUID box = a.boxId() == null && d.boxId() == null && !usaBox(loja) ? null : ocupacao.escolherBox(jdbc, loja, plano, d.boxId(), a.boxId(), id);
            registrar(jdbc, loja.id(), id, jwt, "data e hora", dataHora(a.inicio()), dataHora(novoInicio));
            if (!novoStatus.equals(a.status())) registrar(jdbc, loja.id(), id, jwt, "status", ROTULOS.get(a.status()), ROTULOS.get(novoStatus));
            if (!alvo.equals(a.profissionalId())) registrar(jdbc, loja.id(), id, jwt, "profissional", nomeDe(jdbc, a.profissionalId()), nomeDe(jdbc, alvo));
            // reagendado: etiqueta fixa (a data ou a hora mudou); o motivo do cancelamento, se havia, não vale mais
            if (box != null && !box.equals(a.boxId())) registrar(jdbc, loja.id(), id, jwt, "box", a.boxId() == null ? null : nomeDoBox(jdbc, a.boxId()), nomeDoBox(jdbc, box));
            jdbc.update("update agendamento set profissional_id = ?, inicio = ?, fim_servico = ?, fim_ocupado = ?, encaixe = ?, status = ?, box_id = ?, reagendado = true, motivo_cancelamento = null, atualizado_em = now() where id = ?",
                    alvo, utc(novoInicio), utc(fimServico), utc(fimOcupado), encaixe, novoStatus, box, id);
            ocupacao.gravarBlocos(jdbc, loja.id(), id, plano);
            if (CONFIRMADO.equals(novoStatus) || CONCLUIDO.equals(novoStatus)) cancelarPendentesQueCobrem(jdbc, loja.id(), alvo, id, plano);
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

    /** Minutos de trabalho do atendimento (soma das durações congeladas dos serviços). Venda só de produto ocupa 1 minuto. */
    private int minutosDeServico(JdbcTemplate jdbc, UUID agendamentoId) {
        Integer m = jdbc.queryForObject("select coalesce(sum(duracao_min), 0) from agendamento_servico where agendamento_id = ?", Integer.class, agendamentoId);
        return m == null || m <= 0 ? 1 : m;
    }

    public static final String SEM_BOX = "Cadastre ao menos um box (Estabelecimento > Boxes) antes de atender.";

    private static boolean usaBox(Loja loja) {
        return br.com.agendz.tenant.Capacidades.usaRecursoFisico(loja);
    }

    private String nomeDoBox(JdbcTemplate jdbc, UUID boxId) {
        return jdbc.queryForObject("select nome from box where id = ?", String.class, boxId);
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

    /** Serviços na ordem pedida. Com `porte` (estética), o preço e a duração são os desse porte; sem ele, os do serviço (no tipo com porte, os do médio). */
    private List<ServicoLinha> carregarServicos(JdbcTemplate jdbc, List<UUID> ids, String porte) {
        if (ids.isEmpty()) return List.of(); // venda só de produto
        String marcas = String.join(",", ids.stream().map(x -> "?").toList());
        List<PorteController.Porte> portesDaLoja = porte == null ? List.of() : PorteController.ler(jdbc);
        List<ServicoLinha> achados = jdbc.query(
                "select id, nome, preco, duracao_min, intervalo_min, multi_dia, ativo, precos::text as precos, duracoes::text as duracoes from servico where id in (" + marcas + ")",
                (rs, i) -> {
                    BigDecimal preco = rs.getBigDecimal("preco");
                    int duracao = rs.getInt("duracao_min");
                    if (porte != null) {
                        BigDecimal dur = valorDoPorte(rs.getString("duracoes"), porte);
                        preco = PorteController.precoNoPorte(preco, valorDoPorte(rs.getString("precos"), porte), portesDaLoja, porte); // v124: específico ou base × fator
                        if (dur != null && dur.signum() > 0) duracao = dur.intValue();
                    }
                    return new ServicoLinha(rs.getObject("id", UUID.class), rs.getString("nome"), preco, duracao, rs.getInt("intervalo_min"), rs.getBoolean("multi_dia"), rs.getBoolean("ativo"));
                },
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

    private static BigDecimal valorDoPorte(String json, String porte) {
        if (json == null || json.isBlank()) return null;
        try {
            com.fasterxml.jackson.databind.JsonNode n = JSON.readTree(json).get(porte);
            return n == null || !n.isNumber() ? null : n.decimalValue();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return null;
        }
    }

    /**
     * Confere os conflitos do profissional. Confirmado/concluído no caminho bloqueia, salvo `encaixe`; "a confirmar" só avisa.
     * Devolve os ids dos "a confirmar" que se sobrepõem.
     */
    private List<UUID> conferirConflitos(List<Ocupacao.Conflito> cs, boolean encaixe) {
        List<UUID> pendentes = new ArrayList<>();
        boolean confirmados = false;
        for (Ocupacao.Conflito c : cs) {
            if (A_CONFIRMAR.equals(c.status())) pendentes.add(c.id());
            else confirmados = true;
        }
        if (confirmados && !encaixe) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse horário já está confirmado para outro cliente. Para forçar, marque como encaixe.");
        }
        return pendentes;
    }

    /** Quem confirma primeiro fica com o horário: os "a confirmar" sobrepostos são cancelados (motivo "conflito"), menos os marcados como encaixe. */
    private void cancelarPendentesQueCobrem(JdbcTemplate jdbc, UUID lojaId, UUID profissionalId, UUID mantido, Ocupacao.Plano plano) {
        for (UUID p : ocupacao.cancelarPendentes(jdbc, profissionalId, mantido, plano)) {
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

    /** Percentual de comissão sobre produtos da pessoa que vendeu (definido na equipe); vazio ou 0 = nenhum. */
    private static BigDecimal comissaoDeProdutoDe(JdbcTemplate jdbc, UUID vendedor) {
        if (vendedor == null) return BigDecimal.ZERO;
        List<BigDecimal> achado = jdbc.query("select coalesce(comissao_produto_pct, 0) from usuario where id = ?", (rs, i) -> rs.getBigDecimal(1), vendedor); // coalesce: findFirst() não aceita null
        return achado.isEmpty() || achado.get(0).signum() <= 0 ? BigDecimal.ZERO : achado.get(0);
    }

    /**
     * Confere e grava os produtos do atendimento (espelho de `incluirProduto` em src/domain/engine.js): material do tipo produto e ativo, quantidade inteira de
     * 1 a 999 (a mesma linha repetida soma), estoque suficiente (a linha do material fica travada até o fim da transação: duas vendas ao mesmo tempo não passam
     * do estoque). Preço e percentual de comissão ficam congelados na linha (o do produto, se tem; senão o da pessoa que vendeu). Se o atendimento já está concluído (atendimento local), o estoque sai na hora.
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
            // percentual do produto (se tem) e, senão, o da pessoa que vendeu (usuario.comissao_produto_pct, definido na equipe); nenhum dos dois = sem comissão
            BigDecimal pct = m.comissaoPct() != null && m.comissaoPct().signum() > 0 ? m.comissaoPct() : comissaoDeProdutoDe(jdbc, vendedor);
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
        String sql = "select profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, box_id from agendamento where id = ?"
                + (so == null ? "" : " and profissional_id = ?") + (travar ? " for update" : "");
        Object[] args = so == null ? new Object[]{id} : new Object[]{id, so};
        List<Atual> achados = jdbc.query(sql, (rs, i) -> new Atual(rs.getObject("profissional_id", UUID.class),
                rs.getObject("inicio", OffsetDateTime.class).toInstant(), rs.getObject("fim_servico", OffsetDateTime.class).toInstant(),
                rs.getObject("fim_ocupado", OffsetDateTime.class).toInstant(), rs.getString("status"), rs.getBoolean("encaixe"), rs.getObject("box_id", UUID.class)), args);
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        return achados.get(0);
    }

    private Agendamento buscar(JdbcTemplate jdbc, UUID id, UUID so) {
        String sql = "select id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total, origem, reagendado, motivo_cancelamento, nome_avulso, motivo_retroativo, forma_pagamento, cupom_foto::text as cupom_foto, plano_assinatura_id, plano_nome, "
                + "box_id, (select b.nome from box b where b.id = agendamento.box_id) as box_nome, veiculo_id, porte, veiculo_placa, veiculo_marca, veiculo_modelo, veiculo_cor, "
                + "(status_manual_inicio is not null and status_manual_inicio = inicio) as status_manual from agendamento where id = ?"
                + (so == null ? "" : " and profissional_id = ?");
        Object[] args = so == null ? new Object[]{id} : new Object[]{id, so};
        List<Agendamento> achados = jdbc.query(sql, (rs, i) -> linha(rs), args);
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        List<Item> itens = jdbc.query("select servico_id, nome, preco, duracao_min, desconto from agendamento_servico where agendamento_id = ? order by ordem",
                (rs, i) -> new Item(rs.getObject("servico_id", UUID.class), rs.getString("nome"), rs.getBigDecimal("preco"), rs.getInt("duracao_min"), rs.getBigDecimal("desconto")), id);
        return comItens(achados.get(0), itens).comProdutos(carregarProdutos(jdbc, id));
    }

    private static Agendamento linha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Agendamento(rs.getObject("id", UUID.class), rs.getObject("cliente_id", UUID.class), rs.getObject("profissional_id", UUID.class),
                rs.getObject("inicio", OffsetDateTime.class).toInstant(), rs.getObject("fim_servico", OffsetDateTime.class).toInstant(),
                rs.getObject("fim_ocupado", OffsetDateTime.class).toInstant(), rs.getString("status"), rs.getBoolean("encaixe"),
                rs.getBigDecimal("total"), List.of(), null,
                rs.getString("origem"), rs.getBoolean("reagendado"), rs.getString("motivo_cancelamento"), rs.getBoolean("status_manual"),
                rs.getString("nome_avulso"), rs.getString("motivo_retroativo"), null, List.of(), BigDecimal.ZERO, rs.getString("forma_pagamento"), fotoDoCupom(rs.getString("cupom_foto")), BigDecimal.ZERO,
                esteticaDe(rs), planoDe(rs));
    }

    private static PlanoUso planoDe(java.sql.ResultSet rs) throws java.sql.SQLException {
        UUID id = rs.getObject("plano_assinatura_id", UUID.class);
        return id == null ? null : new PlanoUso(id, rs.getString("plano_nome"));
    }

    private static Estetica esteticaDe(java.sql.ResultSet rs) throws java.sql.SQLException {
        UUID boxId = rs.getObject("box_id", UUID.class);
        String porte = rs.getString("porte");
        if (boxId == null && porte == null && rs.getString("veiculo_placa") == null) return null;
        return new Estetica(boxId, rs.getString("box_nome"), rs.getObject("veiculo_id", UUID.class), porte, rs.getString("veiculo_placa"), rs.getString("veiculo_marca"), rs.getString("veiculo_modelo"), rs.getString("veiculo_cor"));
    }

    private static Agendamento comItens(Agendamento a, List<Item> itens) {
        return new Agendamento(a.id(), a.clienteId(), a.profissionalId(), a.inicio(), a.fim(), a.fimOcupado(), a.status(), a.encaixe(), a.total(), itens, a.conflitosPendentes(),
                a.origem(), a.reagendado(), a.motivoCancelamento(), a.statusManual(), a.nomeAvulso(), a.motivoRetroativo(), a.historico(), a.produtos(), a.totalProdutos(), a.formaPagamento(), a.cupom(),
                itens.stream().map(Item::desconto).reduce(BigDecimal.ZERO, BigDecimal::add), a.estetica(), a.plano());
    }

    /** A cópia do cupom guardada no agendamento (sem a chave). Texto inválido ou ausente = sem cupom. */
    private static CupomService.Foto fotoDoCupom(String texto) {
        if (texto == null || texto.isBlank()) return null;
        try {
            return JSON.readValue(texto, CupomService.Foto.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return null;
        }
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
