package br.com.agendz.planos;

import br.com.agendz.cifra.Cifra;
import br.com.agendz.clientes.ClienteService;
import br.com.agendz.configuracao.LinkAgendamento;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.planos.PlanoRegras.Extrato;
import br.com.agendz.planos.PlanoRegras.Foto;
import br.com.agendz.planos.PlanoRegras.Linha;
import br.com.agendz.planos.PlanoRegras.Opcao;
import br.com.agendz.planos.PlanoRegras.Pode;
import br.com.agendz.planos.PlanoRegras.Saldo;
import br.com.agendz.publico.LimitePublico;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Documentos;
import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Planos de serviço (docs/MAPA-API-SPRING.md, seção 10n; espelho de src/domain/assinaturas.js e planos.js). Catálogo, assinatura do cliente, mensalidade por mês,
 * estorno, encerramento com dívida, pedido pelo link e saldo por telefone. O saldo de cortes é DERIVADO dos agendamentos (`agendamento.plano_assinatura_id`): não há contador.
 * A conta de cortes mora em {@link PlanoRegras} (pura, com casos compartilhados em equivalencia/planos.json). O pagamento da mensalidade é direto com o profissional; aqui só se registra
 * (o servidor ainda não tem financeiro, então nada é lançado em conta). Cada método roda numa transação da loja (RLS); a assinatura é travada (`for update`) antes de mexer na cota.
 */
@Component
public class PlanoService {

    public static final String ERRO_MUITOS = "Muitos pedidos em pouco tempo. Tente de novo em alguns minutos.";
    private static final Map<String, String> FORMAS = Map.of("pix", "Pix", "dinheiro", "Dinheiro", "cartao", "Cartão");
    private static final int EVENTOS_POR_ASSINATURA = 30;

    public record Autor(UUID id, String nome) {
    }

    public record ClienteMini(UUID id, String nome, String apelido) {
    }

    public record PlanoDto(UUID id, String nome, String descricao, BigDecimal preco, int cortes, List<UUID> servicoIds, int adianta, int acumuloMeses, int intervaloDias, boolean ativo, Instant criadoEm, boolean restringeServicos) {
    }

    public record PlanoEntrada(@NotNull @Size(max = 60) String nome, @Size(max = 200) String descricao, BigDecimal preco, Integer cortes, @Size(max = 10) List<UUID> servicoIds,
                               Integer adianta, Integer acumuloMeses, Integer intervaloDias, Boolean ativo, Boolean restringeServicos) {
    }

    public record Remocao(boolean desativado) {
    }

    public record PagamentoDto(UUID id, String mes, BigDecimal valor, String forma, Instant em, Autor autor, boolean estornado, Instant estornoEm, String estornoMotivo) {
    }

    public record EventoDto(Instant em, Autor autor, String acao, String detalhe) {
    }

    public record AssinaturaDto(UUID id, UUID clienteId, ClienteMini cliente, UUID planoId, Foto plano, String status, String inicioMes, int diaCobranca, List<PagamentoDto> pagamentos,
                                int divida, boolean dividaQuitada, Instant criadoEm, Instant encerradoEm, List<EventoDto> log, Saldo saldo, List<Linha> extrato, List<FixosDoPlano.Fixo> fixos) {
    }

    /** E3: tipo 'troca' = o cliente pediu mudar de plano (planoAtualNome, valorDiferenca já com o desconto da loja e descontoPct gravados na hora do pedido). */
    public record PedidoDto(UUID id, String nome, String telefone, UUID planoId, String planoNome, String status, Instant criadoEm, String tipo, String planoAtualNome, BigDecimal valorDiferenca, BigDecimal descontoPct) {
    }

    /** E3: descontoTrocaPct (0 a 100, desconto da loja sobre a diferença da troca) e whatsapp (55+DDD+número, ou nulo) valem para a loja toda. */
    public record Listagem(List<PlanoDto> planos, List<AssinaturaDto> assinaturas, List<PedidoDto> pedidos, List<UUID> aReceber, String mes, BigDecimal descontoTrocaPct, String whatsapp) {
    }

    public record ConfigTroca(BigDecimal descontoPct, String whatsapp) {
    }

    public record PedidoTroca(@Size(max = 30) String telefone, UUID planoId, @Size(max = 100) String site) {
    }

    /** Corpo opcional do aceite: na troca, como a diferença foi paga (pix, dinheiro, cartao). */
    public record Aceite(@Size(max = 20) String forma) {
    }

    public record Contrato(@NotNull UUID clienteId, @NotNull UUID planoId, @Size(max = 7) String inicioMes, Integer diaCobranca) {
    }

    public record Mensalidade(@Size(max = 7) String mes, @NotNull @Size(max = 20) String forma) {
    }

    public record Motivo(@NotNull @Size(max = 200) String motivo) {
    }

    /** O plano ativo do cliente, para o Atender (nunca o valor da mensalidade). */
    public record PlanoDoCliente(UUID assinaturaId, String plano, List<UUID> servicoIds, int restantes, int maisPermitidos, boolean pagoMes, boolean atrasado, String mes) {
    }

    public record Envelope(PlanoDoCliente plano) {
    }

    public record PlanoPublico(UUID id, String nome, String descricao, BigDecimal preco, int cortes, List<String> servicos) {
    }

    public record PaginaPlanos(List<PlanoPublico> planos) {
    }

    public record PedidoPublico(@Size(max = 100) String nome, @Size(max = 30) String telefone, UUID planoId, @Size(max = 100) String site) {
    }

    public record Recebido(boolean ok) {
    }

    public record ItemSaldo(String plano, String mes, int restantes, int cortesPorMes, boolean pagoMes) {
    }

    public record SaldoPublico(List<ItemSaldo> planos, String aviso) {
    }

    /** Resultado de usar o plano num agendamento: o texto do histórico, o aviso para a tela e (E2) quantos atendimentos ainda restam no mês do horário. */
    public record Uso(UUID assinaturaId, String planoNome, String aviso, boolean adiantado, int restantes, String mes) {
    }

    private final LojaJdbc banco;
    private final ObjectMapper json;
    private final Cifra cifra;
    private final ClienteService clientes;
    private final LimitePublico limite;

    public PlanoService(LojaJdbc banco, ObjectMapper json, Cifra cifra, ClienteService clientes, LimitePublico limite) {
        this.banco = banco;
        this.json = json;
        this.cifra = cifra;
        this.clientes = clientes;
        this.limite = limite;
    }

    private static ErroDeNegocio recusa(String mensagem) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, mensagem);
    }

    private static ErroDeNegocio naoAchou(String mensagem) {
        return new ErroDeNegocio(HttpStatus.NOT_FOUND, mensagem);
    }

    private static ErroDeNegocio conflito(String mensagem) {
        return new ErroDeNegocio(HttpStatus.CONFLICT, mensagem);
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, java.time.ZoneOffset.UTC);
    }

    private static Instant instante(java.sql.ResultSet rs, String coluna) throws java.sql.SQLException {
        OffsetDateTime v = rs.getObject(coluna, OffsetDateTime.class);
        return v == null ? null : v.toInstant();
    }

    // ---------------------------------------------------------------- catálogo

    private List<PlanoDto> carregarPlanos(JdbcTemplate jdbc, UUID filtro) {
        Map<UUID, List<UUID>> servicos = new HashMap<>();
        jdbc.query("select plano_id, servico_id from plano_servico order by servico_id",
                rs -> { servicos.computeIfAbsent(rs.getObject(1, UUID.class), k -> new ArrayList<>()).add(rs.getObject(2, UUID.class)); });
        return jdbc.query("select id, nome, descricao, preco, cortes, adianta, acumulo_meses, intervalo_dias, ativo, criado_em, restringe_servicos from plano"
                        + (filtro == null ? "" : " where id = ?") + " order by lower(nome), id",
                (rs, i) -> {
                    UUID id = rs.getObject("id", UUID.class);
                    return new PlanoDto(id, rs.getString("nome"), rs.getString("descricao"), rs.getBigDecimal("preco"), rs.getInt("cortes"), servicos.getOrDefault(id, List.of()),
                            rs.getInt("adianta"), rs.getInt("acumulo_meses"), rs.getInt("intervalo_dias"), rs.getBoolean("ativo"), instante(rs, "criado_em"), rs.getBoolean("restringe_servicos"));
                }, filtro == null ? new Object[0] : new Object[]{filtro});
    }

    /** Cria (id nulo) ou altera o plano. Quem já assina mantém a foto do plano de quando contratou. */
    public PlanoDto salvarPlano(UUID id, PlanoEntrada d, UUID autor) {
        return banco.naLoja(jdbc -> {
            UUID lojaId = LojaContext.exigir().id();
            if (id != null) {
                Integer existe = jdbc.queryForObject("select count(*) from plano where id = ?", Integer.class, id);
                if (existe == null || existe == 0) throw naoAchou("Plano não encontrado.");
            } else {
                Integer total = jdbc.queryForObject("select count(*) from plano", Integer.class);
                if (total != null && total >= PlanoRegras.LIMITE_PLANOS) throw recusa("Limite de " + PlanoRegras.LIMITE_PLANOS + " planos atingido: desative os que não vende mais.");
            }
            List<String> erros = new ArrayList<>();
            String nome = d.nome() == null ? "" : Texto.limpar(d.nome());
            if (nome.length() < 2 || nome.length() > 60) erros.add("Dê um nome ao plano (2 a 60 letras).");
            else {
                Integer repetido = id == null ? jdbc.queryForObject("select count(*) from plano where lower(nome) = lower(?)", Integer.class, nome)
                        : jdbc.queryForObject("select count(*) from plano where lower(nome) = lower(?) and id <> ?", Integer.class, nome, id);
                if (repetido != null && repetido > 0) erros.add("Já existe um plano com esse nome.");
            }
            BigDecimal preco = d.preco();
            if (preco == null || preco.signum() <= 0 || preco.compareTo(BigDecimal.valueOf(99999)) > 0) erros.add("Informe o valor mensal do plano.");
            Integer cortes = d.cortes();
            if (cortes == null || cortes < 1 || cortes > 31) erros.add("Cortes por mês: de 1 a 31.");
            List<UUID> ids = d.servicoIds() == null ? List.of() : d.servicoIds();
            if (ids.isEmpty() || ids.size() > 10 || ids.contains(null) || Set.copyOf(ids).size() != ids.size()) erros.add("Escolha de 1 a 10 serviços que o plano inclui, sem repetir.");
            else {
                for (UUID s : ids) {
                    Integer ok = jdbc.queryForObject("select count(*) from servico where id = ? and not combo", Integer.class, s);
                    if (ok == null || ok == 0) {
                        erros.add("Serviço do plano não encontrado.");
                        break;
                    }
                }
            }
            int adianta = faixa(d.adianta(), 1, 0, 3, "Cortes a mais permitidos", erros);
            int acumulo = faixa(d.acumuloMeses(), 2, 1, 6, "Meses de acúmulo", erros);
            int intervalo = faixa(d.intervaloDias(), 3, 0, 30, "Intervalo entre cortes (dias)", erros);
            String descricao = d.descricao() == null ? "" : Texto.limpar(d.descricao());
            if (descricao.length() > 200) erros.add("A descrição pode ter até 200 letras.");
            if (!erros.isEmpty()) throw recusa(String.join(" ", erros));
            boolean ativo = !Boolean.FALSE.equals(d.ativo());
            boolean restringe = Boolean.TRUE.equals(d.restringeServicos());
            BigDecimal valor = preco.setScale(2, RoundingMode.HALF_UP);
            UUID planoId = id;
            try {
                if (id == null) {
                    planoId = jdbc.queryForObject("insert into plano (loja_id, nome, descricao, preco, cortes, adianta, acumulo_meses, intervalo_dias, ativo, criado_por, restringe_servicos) "
                                    + "values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                            UUID.class, lojaId.toString(), nome, descricao, valor, cortes, adianta, acumulo, intervalo, ativo, autor, restringe);
                } else {
                    jdbc.update("update plano set nome = ?, descricao = ?, preco = ?, cortes = ?, adianta = ?, acumulo_meses = ?, intervalo_dias = ?, ativo = ?, restringe_servicos = ? where id = ?",
                            nome, descricao, valor, cortes, adianta, acumulo, intervalo, ativo, restringe, id);
                    jdbc.update("delete from plano_servico where plano_id = ?", id);
                }
            } catch (DuplicateKeyException e) {
                throw recusa("Já existe um plano com esse nome.");
            }
            for (UUID s : ids) jdbc.update("insert into plano_servico (loja_id, plano_id, servico_id) values (?::uuid, ?, ?)", lojaId.toString(), planoId, s);
            return carregarPlanos(jdbc, planoId).get(0);
        });
    }

    private static int faixa(Integer v, int padrao, int min, int max, String rotulo, List<String> erros) {
        if (v == null) return padrao;
        if (v < min || v > max) {
            erros.add(rotulo + ": de " + min + " a " + max + ".");
            return padrao;
        }
        return v;
    }

    /** Nunca contratado: apaga; já contratado ou pedido: só desativa (o histórico fica ligado ao plano). */
    public Remocao removerPlano(UUID id) {
        return banco.naLoja(jdbc -> {
            Integer existe = jdbc.queryForObject("select count(*) from plano where id = ?", Integer.class, id);
            if (existe == null || existe == 0) throw naoAchou("Plano não encontrado.");
            Integer usos = jdbc.queryForObject("select (select count(*) from assinatura where plano_id = ?) + (select count(*) from pedido_plano where plano_id = ?)", Integer.class, id, id);
            if (usos != null && usos > 0) {
                jdbc.update("update plano set ativo = false where id = ?", id);
                return new Remocao(true);
            }
            jdbc.update("delete from plano where id = ?", id); // leva junto os serviços do plano
            return new Remocao(false);
        });
    }

    // ---------------------------------------------------------------- leitura das assinaturas

    private record Cab(UUID id, UUID clienteId, String clienteNome, String clienteApelido, UUID planoId, Foto foto, String status, String inicioMes, int dia, int divida, boolean quitada,
                       Instant criadoEm, Instant encerradoEm) {
    }

    private Foto foto(String texto) {
        try {
            return json.readValue(texto, Foto.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Foto do plano ilegível", e);
        }
    }

    private List<Cab> cabecalhos(JdbcTemplate jdbc, UUID filtro) {
        return jdbc.query("select a.id, a.cliente_id, c.nome as cnome, c.apelido as capelido, a.plano_id, a.plano_foto::text as foto, a.status, a.inicio_mes, a.dia_cobranca, a.divida, a.divida_quitada, "
                        + "a.criado_em, a.encerrado_em from assinatura a join cliente c on c.id = a.cliente_id" + (filtro == null ? "" : " where a.id = ?") + " order by a.criado_em desc, a.id",
                (rs, i) -> new Cab(rs.getObject("id", UUID.class), rs.getObject("cliente_id", UUID.class), rs.getString("cnome"), rs.getString("capelido"), rs.getObject("plano_id", UUID.class),
                        foto(rs.getString("foto")), rs.getString("status"), rs.getString("inicio_mes"), rs.getInt("dia_cobranca"), rs.getInt("divida"), rs.getBoolean("divida_quitada"),
                        instante(rs, "criado_em"), instante(rs, "encerrado_em")),
                filtro == null ? new Object[0] : new Object[]{filtro});
    }

    private static final String GASTA_CORTE = "(status <> 'cancelado' or (motivo_cancelamento = 'falta_confirmacao' and coalesce(origem, '') <> 'link'))";

    /** Horários que gastam corte da assinatura (opcionalmente sem um agendamento, o que está sendo remarcado). */
    private List<Instant> usos(JdbcTemplate jdbc, UUID assinaturaId, UUID ignorar) {
        return jdbc.query("select inicio from agendamento where plano_assinatura_id = ? and " + GASTA_CORTE + (ignorar == null ? "" : " and id <> ?") + " order by inicio",
                (rs, i) -> instante(rs, "inicio"), ignorar == null ? new Object[]{assinaturaId} : new Object[]{assinaturaId, ignorar});
    }

    private List<String> pagos(JdbcTemplate jdbc, UUID assinaturaId) {
        return jdbc.query("select mes from assinatura_pagamento where assinatura_id = ? and not estornado order by mes", (rs, i) -> rs.getString(1), assinaturaId);
    }

    private List<AssinaturaDto> montar(JdbcTemplate jdbc, UUID filtro, Instant agora) {
        List<Cab> cabs = cabecalhos(jdbc, filtro);
        Map<UUID, List<PagamentoDto>> pagamentos = new HashMap<>();
        jdbc.query("select id, assinatura_id, mes, valor, forma, em, autor_id, autor_nome, estornado, estorno_em, estorno_motivo from assinatura_pagamento"
                        + (filtro == null ? "" : " where assinatura_id = ?") + " order by mes, em",
                rs -> {
                    pagamentos.computeIfAbsent(rs.getObject("assinatura_id", UUID.class), k -> new ArrayList<>()).add(new PagamentoDto(rs.getObject("id", UUID.class), rs.getString("mes"),
                            rs.getBigDecimal("valor"), rs.getString("forma"), instante(rs, "em"), new Autor(rs.getObject("autor_id", UUID.class), rs.getString("autor_nome")),
                            rs.getBoolean("estornado"), instante(rs, "estorno_em"), rs.getString("estorno_motivo")));
                }, filtro == null ? new Object[0] : new Object[]{filtro});
        Map<UUID, List<Instant>> usosPorAssinatura = new HashMap<>();
        jdbc.query("select plano_assinatura_id, inicio from agendamento where plano_assinatura_id is not null and " + GASTA_CORTE
                        + (filtro == null ? "" : " and plano_assinatura_id = ?") + " order by inicio",
                rs -> { usosPorAssinatura.computeIfAbsent(rs.getObject(1, UUID.class), k -> new ArrayList<>()).add(instante(rs, "inicio")); },
                filtro == null ? new Object[0] : new Object[]{filtro});
        Map<UUID, List<EventoDto>> eventos = new HashMap<>();
        jdbc.query("select assinatura_id, em, autor_id, autor_nome, acao, detalhe from (select *, row_number() over (partition by assinatura_id order by id desc) as rn from assinatura_evento"
                        + (filtro == null ? "" : " where assinatura_id = ?") + ") x where rn <= " + EVENTOS_POR_ASSINATURA + " order by assinatura_id, rn",
                rs -> {
                    eventos.computeIfAbsent(rs.getObject("assinatura_id", UUID.class), k -> new ArrayList<>()).add(new EventoDto(instante(rs, "em"),
                            new Autor(rs.getObject("autor_id", UUID.class), rs.getString("autor_nome")), rs.getString("acao"), rs.getString("detalhe")));
                }, filtro == null ? new Object[0] : new Object[]{filtro});
        Map<UUID, List<FixosDoPlano.Fixo>> fixos = FixosDoPlano.todos(jdbc, filtro);
        List<AssinaturaDto> saida = new ArrayList<>();
        String mes = PlanoRegras.mesDe(agora);
        for (Cab c : cabs) {
            List<PagamentoDto> pags = pagamentos.getOrDefault(c.id(), List.of());
            List<String> validos = pags.stream().filter(p -> !p.estornado()).map(PagamentoDto::mes).sorted().toList();
            List<Instant> us = usosPorAssinatura.getOrDefault(c.id(), List.of());
            Saldo saldo = PlanoRegras.saldoAtual(c.foto(), c.status(), c.inicioMes(), validos, us, agora);
            Extrato ex = PlanoRegras.extrato(c.foto(), c.inicioMes(), validos, us, mes, List.of());
            saida.add(new AssinaturaDto(c.id(), c.clienteId(), new ClienteMini(c.clienteId(), c.clienteNome(), c.clienteApelido() == null ? "" : c.clienteApelido()), c.planoId(), c.foto(), c.status(),
                    c.inicioMes(), c.dia(), pags, c.divida(), c.quitada(), c.criadoEm(), c.encerradoEm(), eventos.getOrDefault(c.id(), List.of()), saldo, ex.linhas(), fixos.getOrDefault(c.id(), List.of())));
        }
        return saida;
    }

    /** Catálogo, assinaturas com saldo e extrato, pedidos novos do link e as mensalidades do mês ainda em aberto. */
    public Listagem listar(Instant agora) {
        return banco.naLoja(jdbc -> {
            List<AssinaturaDto> assinaturas = montar(jdbc, null, agora);
            String mes = PlanoRegras.mesDe(agora);
            List<UUID> aReceber = new ArrayList<>();
            for (AssinaturaDto a : assinaturas) {
                boolean pagoNoMes = a.pagamentos().stream().anyMatch(p -> !p.estornado() && p.mes().equals(mes));
                if ("ativa".equals(a.status()) && PlanoRegras.mi(a.inicioMes()) <= PlanoRegras.mi(mes) && !pagoNoMes) aReceber.add(a.id());
            }
            List<PedidoDto> pedidos = jdbc.query("select p.id, p.nome, p.telefone_cif, p.plano_id, p.plano_nome, p.status, p.criado_em, p.tipo, p.valor_diferenca, p.desconto_pct, "
                            + "(select a.plano_foto ->> 'nome' from assinatura a where a.id = p.de_assinatura_id) as atual from pedido_plano p where p.status = 'novo' order by p.criado_em desc, p.id",
                    (rs, i) -> new PedidoDto(rs.getObject("id", UUID.class), rs.getString("nome"), cifra.decifrar(rs.getString("telefone_cif")), rs.getObject("plano_id", UUID.class),
                            rs.getString("plano_nome"), rs.getString("status"), instante(rs, "criado_em"), rs.getString("tipo"), rs.getString("atual"), rs.getBigDecimal("valor_diferenca"), rs.getBigDecimal("desconto_pct")));
            ConfigTroca cfg = lerConfigTroca(jdbc);
            return new Listagem(carregarPlanos(jdbc, null), assinaturas, pedidos, aReceber, mes, cfg.descontoPct(), cfg.whatsapp());
        });
    }

    // ---------------------------------------------------------------- assinatura

    /** A assinatura montada (saldo, extrato e horários fixos) para quem acabou de mudar algo nela. */
    public AssinaturaDto assinatura(UUID assinaturaId, Instant agora) {
        return banco.naLoja(jdbc -> {
            List<AssinaturaDto> l = montar(jdbc, assinaturaId, agora);
            if (l.isEmpty()) throw naoAchou("Assinatura não encontrada.");
            return l.get(0);
        });
    }

    /** Anotação no histórico da assinatura (quem, quando, o quê). `autor` nulo = o sistema. */
    public void anotar(JdbcTemplate jdbc, UUID lojaId, UUID assinaturaId, Autor autor, String acao, String detalhe, Instant agora) {
        nota(jdbc, lojaId, assinaturaId, autor, acao, detalhe, agora);
    }

    private void nota(JdbcTemplate jdbc, UUID lojaId, UUID assinaturaId, Autor autor, String acao, String detalhe, Instant agora) {
        String d = Texto.limpar(detalhe == null ? "" : detalhe);
        jdbc.update("insert into assinatura_evento (loja_id, assinatura_id, em, autor_id, autor_nome, acao, detalhe) values (?::uuid, ?, ?, ?, ?, ?, ?)",
                lojaId.toString(), assinaturaId, utc(agora), autor == null ? null : autor.id(), autor == null ? "Sistema" : autor.nome(), acao, d.length() > 300 ? d.substring(0, 300) : d);
    }

    private UUID contratarNaTransacao(JdbcTemplate jdbc, UUID lojaId, UUID clienteId, UUID planoId, String inicioMesPedido, Integer diaPedido, Autor autor, Instant agora) {
        Integer cli = jdbc.queryForObject("select count(*) from cliente where id = ?", Integer.class, clienteId);
        if (cli == null || cli == 0) throw naoAchou("Cliente não encontrado.");
        List<Object[]> pl = jdbc.query("select ativo, nome, preco, cortes, adianta, acumulo_meses, intervalo_dias, restringe_servicos from plano where id = ?",
                (rs, i) -> new Object[]{rs.getBoolean(1), rs.getString(2), rs.getBigDecimal(3), rs.getInt(4), rs.getInt(5), rs.getInt(6), rs.getInt(7), rs.getBoolean(8)}, planoId);
        if (pl.isEmpty() || !(Boolean) pl.get(0)[0]) throw naoAchou("Plano não encontrado ou desativado.");
        Integer total = jdbc.queryForObject("select count(*) from assinatura", Integer.class);
        if (total != null && total >= PlanoRegras.LIMITE_ASSINATURAS) throw recusa("Limite de assinaturas atingido.");
        Integer abertas = jdbc.queryForObject("select count(*) from assinatura where cliente_id = ? and status in ('pendente', 'ativa')", Integer.class, clienteId);
        if (abertas != null && abertas > 0) throw conflito("Esse cliente já tem um plano em andamento. Encerre o atual para contratar outro.");
        Integer divida = jdbc.queryForObject("select coalesce(sum(divida), 0) from assinatura where cliente_id = ? and status = 'cancelada' and divida > 0 and not divida_quitada", Integer.class, clienteId);
        if (divida != null && divida > 0) throw conflito("Esse cliente encerrou um plano com cortes adiantados e ainda não quitou. Quite antes de contratar outro.");
        String mesAtual = PlanoRegras.mesDe(agora);
        String inicioMes = inicioMesPedido == null || inicioMesPedido.isBlank() ? mesAtual : inicioMesPedido;
        if (!PlanoRegras.mesValido(inicioMes)) throw recusa("Escolha o mês de início.");
        String de = PlanoRegras.somaMeses(mesAtual, -2), ate = PlanoRegras.somaMeses(mesAtual, PlanoRegras.MESES_A_FRENTE);
        if (inicioMes.compareTo(de) < 0 || inicioMes.compareTo(ate) > 0) throw recusa("O mês de início vai de " + PlanoRegras.rotuloMes(de) + " a " + PlanoRegras.rotuloMes(ate) + ".");
        int dia = diaPedido == null ? 5 : diaPedido;
        if (dia < 1 || dia > 28) throw recusa("O dia de cobrança vai de 1 a 28.");
        List<UUID> servicos = jdbc.query("select servico_id from plano_servico where plano_id = ? order by servico_id", (rs, i) -> rs.getObject(1, UUID.class), planoId);
        Foto foto = new Foto((String) pl.get(0)[1], (BigDecimal) pl.get(0)[2], (Integer) pl.get(0)[3], servicos, (Integer) pl.get(0)[4], (Integer) pl.get(0)[5], (Integer) pl.get(0)[6], (Boolean) pl.get(0)[7]);
        String fotoJson;
        try {
            fotoJson = json.writeValueAsString(foto);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        UUID id;
        try {
            id = jdbc.queryForObject("insert into assinatura (loja_id, cliente_id, plano_id, plano_foto, status, inicio_mes, dia_cobranca, criado_por) values (?::uuid, ?, ?, ?::jsonb, 'pendente', ?, ?, ?) returning id",
                    UUID.class, lojaId.toString(), clienteId, planoId, fotoJson, inicioMes, dia, autor == null ? null : autor.id());
        } catch (DuplicateKeyException e) {
            throw conflito("Esse cliente já tem um plano em andamento. Encerre o atual para contratar outro.");
        }
        nota(jdbc, lojaId, id, autor, "contratou", foto.nome() + " a partir de " + PlanoRegras.rotuloMes(inicioMes), agora);
        return id;
    }

    /** Nasce "aguardando pagamento": os cortes só existem depois da mensalidade registrada. */
    public AssinaturaDto contratar(Contrato d, Autor autor, Instant agora) {
        return banco.naLoja(jdbc -> {
            UUID id = contratarNaTransacao(jdbc, LojaContext.exigir().id(), d.clienteId(), d.planoId(), d.inicioMes(), d.diaCobranca(), autor, agora);
            return montar(jdbc, id, agora).get(0);
        });
    }

    private record Trava(String status, String inicioMes, Foto foto) {
    }

    /** Trava a assinatura até o fim da transação: usos e pagamentos dela passam um por vez (sem corrida na cota). */
    private Trava travar(JdbcTemplate jdbc, UUID assinaturaId) {
        return ler(jdbc, assinaturaId, true);
    }

    private Trava ler(JdbcTemplate jdbc, UUID assinaturaId, boolean travar) {
        List<Trava> l = jdbc.query("select status, inicio_mes, plano_foto::text from assinatura where id = ?" + (travar ? " for update" : ""),
                (rs, i) -> new Trava(rs.getString(1), rs.getString(2), foto(rs.getString(3))), assinaturaId);
        if (l.isEmpty()) throw naoAchou("Assinatura não encontrada.");
        return l.get(0);
    }

    /** Registra a mensalidade de um mês. O valor é sempre o do plano contratado; a primeira mensalidade ativa a assinatura. */
    public AssinaturaDto pagar(UUID assinaturaId, Mensalidade d, Autor autor, Instant agora) {
        return banco.naLoja(jdbc -> {
            UUID lojaId = LojaContext.exigir().id();
            Trava t = travar(jdbc, assinaturaId);
            if ("cancelada".equals(t.status())) throw recusa("Essa assinatura foi encerrada.");
            String mes = d.mes() == null || d.mes().isBlank() ? PlanoRegras.mesDe(agora) : d.mes();
            if (!PlanoRegras.mesValido(mes)) throw recusa("Escolha o mês da mensalidade.");
            if (mes.compareTo(t.inicioMes()) < 0) throw recusa("O plano começa em " + PlanoRegras.rotuloMes(t.inicioMes()) + ".");
            if (mes.compareTo(PlanoRegras.somaMeses(PlanoRegras.mesDe(agora), PlanoRegras.MESES_A_FRENTE)) > 0) throw recusa("Só dá para registrar até " + PlanoRegras.MESES_A_FRENTE + " meses à frente.");
            if (pagos(jdbc, assinaturaId).contains(mes)) throw conflito("A mensalidade de " + PlanoRegras.rotuloMes(mes) + " já está registrada.");
            String forma = d.forma() == null ? "" : d.forma();
            if (!FORMAS.containsKey(forma)) throw recusa("Escolha como foi pago: Pix, dinheiro ou cartão.");
            BigDecimal valor = t.foto().preco();
            if (mes.equals(t.inicioMes())) { // E3: o mês da troca vale só a diferença
                List<BigDecimal> primeiro = jdbc.query("select valor_primeiro_mes from assinatura where id = ? and valor_primeiro_mes is not null", (rs, i) -> rs.getBigDecimal(1), assinaturaId);
                if (!primeiro.isEmpty()) valor = primeiro.get(0);
            }
            try {
                jdbc.update("insert into assinatura_pagamento (loja_id, assinatura_id, mes, valor, forma, em, autor_id, autor_nome) values (?::uuid, ?, ?, ?, ?, ?, ?, ?)",
                        lojaId.toString(), assinaturaId, mes, valor, forma, utc(agora), autor.id(), autor.nome());
            } catch (DuplicateKeyException e) {
                throw conflito("A mensalidade de " + PlanoRegras.rotuloMes(mes) + " já está registrada.");
            }
            jdbc.update("update assinatura set status = 'ativa' where id = ?", assinaturaId);
            nota(jdbc, lojaId, assinaturaId, autor, "mensalidade", PlanoRegras.rotuloMes(mes) + " · " + FORMAS.get(forma), agora);
            return montar(jdbc, assinaturaId, agora).get(0);
        });
    }

    /** Estorna uma mensalidade, mas não deixa corte já usado sem cobertura (a mudança volta atrás e o dono cancela esses horários antes). */
    public AssinaturaDto estornar(UUID assinaturaId, UUID pagamentoId, String motivoBruto, Autor autor, Instant agora) {
        return banco.naLoja(jdbc -> {
            UUID lojaId = LojaContext.exigir().id();
            Trava t = travar(jdbc, assinaturaId);
            List<String> mensal = jdbc.query("select mes from assinatura_pagamento where id = ? and assinatura_id = ? and not estornado", (rs, i) -> rs.getString(1), pagamentoId, assinaturaId);
            if (mensal.isEmpty()) throw naoAchou("Mensalidade não encontrada.");
            String motivo = motivoBruto == null ? "" : Texto.limpar(motivoBruto);
            if (motivo.length() < 5 || motivo.length() > 200) throw recusa("Diga o motivo do estorno (5 a 200 letras).");
            String mes = mensal.get(0);
            jdbc.update("update assinatura_pagamento set estornado = true, estorno_em = ?, estorno_motivo = ? where id = ?", utc(agora), motivo, pagamentoId);
            List<String> restantes = pagos(jdbc, assinaturaId);
            Extrato ex = PlanoRegras.extrato(t.foto(), t.inicioMes(), restantes, usos(jdbc, assinaturaId, null), PlanoRegras.mesDe(agora), List.of());
            for (Linha l : ex.linhas()) {
                if (l.estourou()) throw conflito("Há cortes usados que dependem da mensalidade de " + PlanoRegras.rotuloMes(mes) + ". Cancele esses horários antes de estornar.");
            }
            if (restantes.isEmpty() && "ativa".equals(t.status())) jdbc.update("update assinatura set status = 'pendente' where id = ?", assinaturaId);
            nota(jdbc, lojaId, assinaturaId, autor, "estorno", PlanoRegras.rotuloMes(mes) + " · " + motivo, agora);
            return montar(jdbc, assinaturaId, agora).get(0);
        });
    }

    /** Encerra a assinatura. Cortes adiantados que não foram pagos viram dívida, que trava um plano novo até quitar. */
    public AssinaturaDto encerrar(UUID assinaturaId, String motivoBruto, Autor autor, Instant agora) {
        return banco.naLoja(jdbc -> {
            UUID lojaId = LojaContext.exigir().id();
            Trava t = travar(jdbc, assinaturaId);
            if ("cancelada".equals(t.status())) throw conflito("Essa assinatura já foi encerrada.");
            String motivo = motivoBruto == null ? "" : Texto.limpar(motivoBruto);
            if (motivo.length() < 5 || motivo.length() > 200) throw recusa("Diga o motivo (5 a 200 letras).");
            FixosDoPlano.apagarFuturos(jdbc, assinaturaId, null, agora); // os fixos que ainda não aconteceram saem da agenda e devolvem o atendimento, antes da conta da dívida
            Extrato ex = PlanoRegras.extrato(t.foto(), t.inicioMes(), pagos(jdbc, assinaturaId), usos(jdbc, assinaturaId, null), PlanoRegras.mesDe(agora), List.of());
            int divida = PlanoRegras.dividaAoEncerrar(ex);
            jdbc.update("update assinatura set status = 'cancelada', encerrado_em = ?, divida = ?, divida_quitada = ? where id = ?", utc(agora), divida, divida == 0, assinaturaId);
            jdbc.update("delete from assinatura_fixo where assinatura_id = ?", assinaturaId);
            nota(jdbc, lojaId, assinaturaId, autor, "encerrou", motivo + (divida > 0 ? " · " + divida + " corte" + (divida > 1 ? "s" : "") + " adiantado" + (divida > 1 ? "s" : "") + " sem pagar" : ""), agora);
            return montar(jdbc, assinaturaId, agora).get(0);
        });
    }

    /** O dono recebeu por fora o que ficou devendo. */
    public AssinaturaDto quitar(UUID assinaturaId, Autor autor, Instant agora) {
        return banco.naLoja(jdbc -> {
            UUID lojaId = LojaContext.exigir().id();
            List<Object[]> l = jdbc.query("select status, divida, divida_quitada from assinatura where id = ? for update",
                    (rs, i) -> new Object[]{rs.getString(1), rs.getInt(2), rs.getBoolean(3)}, assinaturaId);
            if (l.isEmpty()) throw naoAchou("Assinatura não encontrada.");
            if (!"cancelada".equals(l.get(0)[0]) || (Integer) l.get(0)[1] <= 0 || (Boolean) l.get(0)[2]) throw conflito("Essa assinatura não tem dívida a quitar.");
            jdbc.update("update assinatura set divida_quitada = true where id = ?", assinaturaId);
            nota(jdbc, lojaId, assinaturaId, autor, "quitou", "Dívida de cortes adiantados quitada", agora);
            return montar(jdbc, assinaturaId, agora).get(0);
        });
    }

    // ---------------------------------------------------------------- pedidos do link

    /** Aceitar acha (ou cria, por nome+telefone) o cliente e abre a assinatura "aguardando pagamento". */
    public AssinaturaDto aceitarPedido(UUID pedidoId, Autor autor, Instant agora) {
        return aceitarPedido(pedidoId, null, autor, agora);
    }

    /** E3: pedido de troca de plano é aceito com a forma de pagamento da diferença; o pedido de plano novo ignora `forma`. */
    public AssinaturaDto aceitarPedido(UUID pedidoId, String forma, Autor autor, Instant agora) {
        return banco.naLoja(jdbc -> {
            UUID lojaId = LojaContext.exigir().id();
            List<Object[]> p = jdbc.query("select nome, telefone_cif, plano_id, tipo, de_assinatura_id, valor_diferenca from pedido_plano where id = ? and status = 'novo' for update",
                    (rs, i) -> new Object[]{rs.getString(1), rs.getString(2), rs.getObject(3, UUID.class), rs.getString(4), rs.getObject(5, UUID.class), rs.getBigDecimal(6)}, pedidoId);
            if (p.isEmpty()) throw naoAchou("Pedido não encontrado.");
            UUID planoId = (UUID) p.get(0)[2];
            if ("troca".equals(p.get(0)[3])) return aceitarTroca(jdbc, lojaId, pedidoId, planoId, (UUID) p.get(0)[4], (BigDecimal) p.get(0)[5], forma, autor, agora);
            Integer ativo = jdbc.queryForObject("select count(*) from plano where id = ? and ativo", Integer.class, planoId);
            if (ativo == null || ativo == 0) throw recusa("O plano desse pedido não está mais à venda.");
            ClienteService.DoAtendimento quem = clientes.resolverDoAtendimento(jdbc, (String) p.get(0)[0], cifra.decifrar((String) p.get(0)[1]), null);
            if (quem.clienteId() == null) throw recusa("Não foi possível cadastrar o cliente desse pedido.");
            UUID assinaturaId = contratarNaTransacao(jdbc, lojaId, quem.clienteId(), planoId, null, null, autor, agora);
            jdbc.update("update pedido_plano set status = 'aceito', assinatura_id = ?, resolvido_em = ? where id = ?", assinaturaId, utc(agora), pedidoId);
            return montar(jdbc, assinaturaId, agora).get(0);
        });
    }

    public void recusarPedido(UUID pedidoId, Instant agora) {
        banco.naLoja(jdbc -> {
            int n = jdbc.update("update pedido_plano set status = 'recusado', resolvido_em = ? where id = ? and status = 'novo'", utc(agora), pedidoId);
            if (n == 0) throw naoAchou("Pedido não encontrado.");
            return null;
        });
    }

    /** O plano ativo do cliente, para o Atender: quanto resta e se ainda pode adiantar. Sem plano ativo (ou cliente de outra loja): nulo. */
    public PlanoDoCliente doCliente(UUID clienteId, Instant agora) {
        return banco.naLoja(jdbc -> {
            List<UUID> ids = jdbc.queryForList("select id from assinatura where cliente_id = ? and status = 'ativa'", UUID.class, clienteId);
            if (ids.isEmpty()) return null;
            AssinaturaDto a = montar(jdbc, ids.get(0), agora).get(0);
            return new PlanoDoCliente(a.id(), a.saldo().planoNome(), a.plano().servicoIds(), a.saldo().restantes(), a.saldo().maisPermitidos(), a.saldo().pagoMes(), a.saldo().atrasado(), a.saldo().mes());
        });
    }

    // ---------------------------------------------------------------- uso no agendamento

    /**
     * Gasta 1 corte do plano num agendamento recém-gravado (na transação do chamador): confere cliente, serviços do plano e cota, marca o agendamento e dá de graça
     * os serviços que o plano cobre (desconto = preço; a comissão usa preço − desconto). Produto e serviço fora do plano são cobrados normalmente.
     */
    public Uso usar(JdbcTemplate jdbc, UUID agendamentoId, UUID assinaturaId, UUID clienteId, List<UUID> servicoIds, Instant inicio, Instant agora) {
        if (clienteId == null) throw recusa("O plano é de um cliente cadastrado: informe o telefone dele.");
        List<UUID> dono = jdbc.queryForList("select id from assinatura where id = ? and cliente_id = ?", UUID.class, assinaturaId, clienteId);
        if (dono.isEmpty()) throw naoAchou("Plano não encontrado para esse cliente.");
        Trava t = travar(jdbc, assinaturaId);
        if (!PlanoRegras.cobreAlgum(t.foto(), servicoIds)) throw recusa("Nenhum dos serviços escolhidos faz parte do plano " + t.foto().nome() + ".");
        Pode pode = PlanoRegras.podeUsar(t.foto(), t.status(), t.inicioMes(), pagos(jdbc, assinaturaId), usos(jdbc, assinaturaId, agendamentoId), inicio, agora);
        if (!pode.ok()) throw conflito(pode.erro());
        jdbc.update("update agendamento set plano_assinatura_id = ?, plano_nome = ?, plano_em = ?, atualizado_em = now() where id = ?", assinaturaId, t.foto().nome(), utc(agora), agendamentoId);
        List<PlanoRegras.Item> itens = jdbc.query("select servico_id, preco from agendamento_servico where agendamento_id = ?",
                (rs, i) -> new PlanoRegras.Item(rs.getObject(1, UUID.class), rs.getBigDecimal(2)), agendamentoId);
        for (Map.Entry<UUID, BigDecimal> e : PlanoRegras.descontos(t.foto().servicoIds(), itens).entrySet()) {
            jdbc.update("update agendamento_servico set desconto = ?, plano = true where agendamento_id = ? and servico_id = ?", e.getValue(), agendamentoId, e.getKey());
        }
        // E2: com este horário já gravado, quanto sobra do plano no mês dele (o cliente vê no fim do agendamento)
        PlanoRegras.Extrato ex = PlanoRegras.extrato(t.foto(), t.inicioMes(), pagos(jdbc, assinaturaId), usos(jdbc, assinaturaId, null), PlanoRegras.mesDe(agora), List.of());
        String mesDoHorario = PlanoRegras.mesDe(inicio);
        return new Uso(assinaturaId, t.foto().nome(), pode.aviso(), pode.adiantado(), PlanoRegras.restantesNoMes(ex, mesDoHorario), mesDoHorario);
    }

    /**
     * O próprio cliente agenda (link): se tem plano ativo que cobre algum serviço e as travas deixam (saldo, intervalo, adiantar), o horário gasta 1 corte.
     * E2: se um plano que cobre o serviço NÃO deixa porque os atendimentos do mês acabaram (cota), o link recusa (409) e manda falar com a equipe, que agenda sem a
     * restrição do plano (cobrança normal, como serviço fora do plano). Sem plano, mensalidade em falta, intervalo ou serviço fora do plano: devolve null e segue pelo preço normal.
     */
    public Uso usarSeCouber(JdbcTemplate jdbc, UUID agendamentoId, UUID clienteId, List<UUID> servicoIds, Instant inicio, Instant agora) {
        String restricao = restricaoDoLink(jdbc, clienteId, servicoIds);
        if (restricao != null) throw conflito(restricao);
        Achada a = assinaturaQueCabe(jdbc, clienteId, servicoIds, inicio, agora, true);
        if (a.limite()) throw conflito(MSG_LIMITE_PREFIXO + PlanoRegras.rotuloMes(PlanoRegras.mesDe(inicio)) + MSG_LIMITE_SUFIXO);
        return a.assinatura() == null ? null : usar(jdbc, agendamentoId, a.assinatura(), clienteId, servicoIds, inicio, agora);
    }

    /**
     * E2: plano ativo que RESTRINGE o link aos serviços dele e algum serviço pedido está fora: devolve a mensagem (o link recusa; a equipe agenda qualquer serviço pelo painel).
     * Sem cliente, sem plano ativo ou plano que não restringe: null.
     */
    private String restricaoDoLink(JdbcTemplate jdbc, UUID clienteId, List<UUID> servicoIds) {
        if (clienteId == null) return null;
        for (UUID id : jdbc.queryForList("select id from assinatura where cliente_id = ? and status = 'ativa' order by criado_em, id", UUID.class, clienteId)) {
            Foto f = ler(jdbc, id, false).foto();
            if (!PlanoRegras.foraDaRestricao(f, servicoIds)) continue;
            List<String> nomes = new ArrayList<>();
            for (UUID s : f.servicoIds()) nomes.addAll(jdbc.queryForList("select nome from servico where id = ?", String.class, s));
            java.util.Collections.sort(nomes, String.CASE_INSENSITIVE_ORDER);
            return "Seu plano permite agendar pelo link só: " + String.join(", ", nomes) + ". Para outros serviços, fale com a equipe.";
        }
        return null;
    }

    private static final String MSG_LIMITE_PREFIXO = "Os atendimentos do seu plano em ";
    private static final String MSG_LIMITE_SUFIXO = " acabaram. Para agendar fora do plano, fale com a equipe.";

    /** assinatura: a que dá para usar; limite: nenhuma deu e a causa em algum plano que cobre o serviço foi a cota do mês (E2). */
    private record Achada(UUID assinatura, boolean limite) {
    }

    private Achada assinaturaQueCabe(JdbcTemplate jdbc, UUID clienteId, List<UUID> servicoIds, Instant inicio, Instant agora, boolean travar) {
        if (clienteId == null) return new Achada(null, false);
        List<UUID> ids = jdbc.queryForList("select id from assinatura where cliente_id = ? and status = 'ativa' order by criado_em, id", UUID.class, clienteId);
        boolean limite = false;
        for (UUID id : ids) {
            Trava t = ler(jdbc, id, travar);
            if (!PlanoRegras.cobreAlgum(t.foto(), servicoIds)) continue;
            Pode p = PlanoRegras.podeUsar(t.foto(), t.status(), t.inicioMes(), pagos(jdbc, id), usos(jdbc, id, null), inicio, agora);
            if (p.ok()) return new Achada(id, false);
            if (p.limite()) limite = true;
        }
        return new Achada(null, limite);
    }

    /** esgotado (E2): o telefone tem plano que cobre o serviço, mas os atendimentos do mês acabaram (o link não agenda; a equipe agenda fora do plano). */
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    public record UsoPublico(boolean usaPlano, boolean esgotado, boolean restrito, List<Opcao> trocas, BigDecimal descontoTrocaPct, String whatsapp) {
        public UsoPublico(boolean usaPlano, boolean esgotado, boolean restrito) {
            this(usaPlano, esgotado, restrito, List.of(), null, null);
        }
    }

    /**
     * Prévia para a tela do cliente: "este horário usa um atendimento do seu plano?". Só sim ou não: nunca nome do plano, saldo ou dado de outra pessoa; telefone inválido,
     * sem plano, sem saldo e serviço fora do plano dão a mesma resposta. 10 consultas por telefone a cada 15 minutos.
     */
    public UsoPublico usoPorTelefone(String ip, Instant agora, String telefone, List<UUID> servicoIds, Instant inicio) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, "planos-uso-ip:" + ip, 60, Duration.ofMinutes(15));
        consultaLiberada(loja, "planos-uso-loja", 240, Duration.ofMinutes(1));
        String tel = Documentos.telefone(telefone);
        if (tel == null || inicio == null || servicoIds == null || servicoIds.isEmpty() || servicoIds.size() > 10) return new UsoPublico(false, false, false);
        consultaLiberada(loja, "planos-uso-tel:" + tel, 10, Duration.ofMinutes(15));
        String hash = cifra.hash(loja.id(), "tel", tel);
        return banco.naLoja(jdbc -> {
            boolean esgotado = false;
            boolean restrito = false;
            List<Opcao> trocas = List.of();
            ConfigTroca cfg = lerConfigTroca(jdbc);
            for (UUID cliente : jdbc.queryForList("select id from cliente where telefone_hash = ?", UUID.class, hash)) {
                if (restricaoDoLink(jdbc, cliente, servicoIds) != null) { restrito = true; if (trocas.isEmpty()) trocas = opcoesDoCliente(jdbc, cliente, cfg); continue; }
                Achada a = assinaturaQueCabe(jdbc, cliente, servicoIds, inicio, agora, false);
                if (a.assinatura() != null) return new UsoPublico(true, false, false);
                if (a.limite()) { esgotado = true; if (trocas.isEmpty()) trocas = opcoesDoCliente(jdbc, cliente, cfg); }
            }
            return trocas.isEmpty() ? new UsoPublico(false, esgotado, restrito) : new UsoPublico(false, esgotado, restrito, trocas, cfg.descontoPct(), cfg.whatsapp() != null ? cfg.whatsapp() : br.com.agendz.configuracao.WhatsappDaLoja.ler(jdbc)); // V60: sem o da troca, vale o WhatsApp do estabelecimento
        });
    }

    /** Remarcar ou reativar um agendamento que usa plano também precisa caber na cota do mês novo. Sem plano no agendamento: não faz nada. */
    public void conferirNovoHorario(JdbcTemplate jdbc, UUID agendamentoId, Instant novoInicio, Instant agora) {
        List<UUID> a = jdbc.queryForList("select plano_assinatura_id from agendamento where id = ? and plano_assinatura_id is not null", UUID.class, agendamentoId);
        if (a.isEmpty()) return;
        Trava t = travar(jdbc, a.get(0));
        Pode pode = PlanoRegras.podeUsar(t.foto(), t.status(), t.inicioMes(), pagos(jdbc, a.get(0)), usos(jdbc, a.get(0), agendamentoId), novoInicio, agora);
        if (!pode.ok()) throw conflito(pode.erro());
    }

    // ---------------------------------------------------------------- público (sem login)

    private void consultaLiberada(Loja loja, String chave, int max, Duration janela) {
        if (!limite.liberar(chave + ":" + loja.id(), max, janela)) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
    }

    private static boolean linkLigado(JdbcTemplate jdbc) {
        return LinkAgendamento.ler(jdbc).ativo();
    }

    /** Só o que a página pública mostra: nome, descrição, valor, cortes e nomes dos serviços. Link desligado: nada. */
    public PaginaPlanos paginaPublica(String ip) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, "planos-pagina:" + ip, 120, Duration.ofMinutes(1));
        return banco.naLoja(jdbc -> {
            if (!linkLigado(jdbc)) return new PaginaPlanos(List.of());
            Map<UUID, List<String>> nomes = new HashMap<>();
            jdbc.query("select ps.plano_id, s.nome from plano_servico ps join servico s on s.id = ps.servico_id order by lower(s.nome)",
                    rs -> { nomes.computeIfAbsent(rs.getObject(1, UUID.class), k -> new ArrayList<>()).add(rs.getString(2)); });
            return new PaginaPlanos(jdbc.query("select id, nome, descricao, preco, cortes from plano where ativo order by preco, lower(nome)",
                    (rs, i) -> new PlanoPublico(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("descricao"), rs.getBigDecimal("preco"), rs.getInt("cortes"),
                            nomes.getOrDefault(rs.getObject("id", UUID.class), List.of()))));
        });
    }

    /**
     * Pedido de plano pelo link: nada vira assinatura sozinho, o dono aceita ou recusa. Isca `site` preenchida = robô. Máximo de 30 pedidos abertos na loja;
     * o mesmo telefone pedindo o mesmo plano de novo recebe a mesma resposta, sem duplicar. 3 pedidos por telefone a cada 15 minutos.
     */
    public Recebido pedirPlano(String ip, Instant agora, PedidoPublico d) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, "planos-pedido-ip:" + ip, 30, Duration.ofMinutes(10));
        if (d.site() != null && !d.site().isBlank()) throw recusa("Dados inválidos.");
        String nome = d.nome() == null ? "" : Texto.limpar(d.nome());
        if (nome.length() < 2) throw recusa("Informe o seu nome.");
        if (nome.length() > 60) throw recusa("O nome pode ter até 60 letras.");
        String tel = Documentos.telefone(d.telefone());
        if (tel == null) throw recusa("Informe o telefone com DDD.");
        if (d.planoId() == null) throw recusa("Plano indisponível.");
        consultaLiberada(loja, "planos-pedido-tel:" + tel, 3, Duration.ofMinutes(15));
        consultaLiberada(loja, "planos-pedido-loja", 60, Duration.ofMinutes(1));
        String hash = cifra.hash(loja.id(), "tel", tel);
        return banco.naLoja(jdbc -> {
            if (!linkLigado(jdbc)) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "O pedido de plano não está disponível agora. Fale com a loja.");
            List<String> plano = jdbc.queryForList("select nome from plano where id = ? and ativo", String.class, d.planoId());
            if (plano.isEmpty()) throw recusa("Plano indisponível.");
            Integer abertos = jdbc.queryForObject("select count(*) from pedido_plano where status = 'novo'", Integer.class);
            if (abertos != null && abertos >= PlanoRegras.MAX_PEDIDOS_ABERTOS) throw conflito("Não estamos recebendo novos pedidos agora. Fale com a loja.");
            Integer repetido = jdbc.queryForObject("select count(*) from pedido_plano where status = 'novo' and telefone_hash = ? and plano_id = ?", Integer.class, hash, d.planoId());
            if (repetido != null && repetido > 0) return new Recebido(true); // mesma resposta, sem duplicar
            try {
                jdbc.update("insert into pedido_plano (loja_id, nome, telefone_cif, telefone_hash, plano_id, plano_nome) values (?::uuid, ?, ?, ?, ?, ?)",
                        loja.id().toString(), nome, cifra.cifrar(tel), hash, d.planoId(), plano.get(0));
            } catch (DuplicateKeyException e) {
                // dois cliques ao mesmo tempo: o outro já gravou
            }
            return new Recebido(true);
        });
    }

    // ---------------------------------------------------------------- E3: troca de plano pagando só a diferença

    private ConfigTroca lerConfigTroca(JdbcTemplate jdbc) {
        List<ConfigTroca> l = jdbc.query("select plano_desconto_troca_pct, plano_whatsapp from configuracao_loja", (rs, i) -> new ConfigTroca(rs.getBigDecimal(1), rs.getString(2)));
        return l.isEmpty() ? new ConfigTroca(BigDecimal.ZERO.setScale(2), null) : l.get(0);
    }

    /** Desconto (0 a 100%) sobre a diferença da troca e o WhatsApp da loja para o pedido; vale para a loja toda. Quem tem a seção planos. */
    public ConfigTroca salvarConfigTroca(BigDecimal descontoBruto, String whatsappBruto) {
        BigDecimal pct = descontoBruto == null ? BigDecimal.ZERO : descontoBruto;
        if (pct.compareTo(BigDecimal.ZERO) < 0 || pct.compareTo(new BigDecimal("100")) > 0) throw recusa("O desconto da troca vai de 0 a 100%.");
        pct = pct.setScale(2, RoundingMode.HALF_UP);
        String zap = null;
        if (whatsappBruto != null && !whatsappBruto.isBlank()) {
            zap = Documentos.telefone(whatsappBruto);
            if (zap == null) throw recusa("Informe o WhatsApp da loja com DDD.");
        }
        final BigDecimal pctFinal = pct;
        final String zapFinal = zap;
        return banco.naLoja(jdbc -> {
            jdbc.update("insert into configuracao_loja (loja_id, plano_desconto_troca_pct, plano_whatsapp) values (?::uuid, ?, ?) "
                    + "on conflict (loja_id) do update set plano_desconto_troca_pct = excluded.plano_desconto_troca_pct, plano_whatsapp = excluded.plano_whatsapp, atualizado_em = now()",
                    LojaContext.exigir().id().toString(), pctFinal, zapFinal);
            return new ConfigTroca(pctFinal, zapFinal);
        });
    }

    /** Planos à venda que incluem TODOS os serviços do atual e mais algum (e custam mais), do mais barato ao mais caro, com a diferença já descontada. */
    private List<Opcao> opcoesDeTroca(JdbcTemplate jdbc, Foto atual, ConfigTroca cfg) {
        List<Opcao> saida = new ArrayList<>();
        for (Object[] p : jdbc.query("select id, nome, preco, cortes from plano where ativo order by preco, lower(nome)",
                (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2), rs.getBigDecimal(3), rs.getInt(4)})) {
            UUID id = (UUID) p[0];
            List<UUID> servicos = jdbc.query("select servico_id from plano_servico where plano_id = ?", (rs, i) -> rs.getObject(1, UUID.class), id);
            if (!PlanoRegras.ehUpgrade(atual, (BigDecimal) p[2], servicos)) continue;
            List<String> nomes = jdbc.query("select s.nome from plano_servico ps join servico s on s.id = ps.servico_id where ps.plano_id = ? order by lower(s.nome)", (rs, i) -> rs.getString(1), id);
            saida.add(new Opcao(id, (String) p[1], (BigDecimal) p[2], (Integer) p[3], nomes, PlanoRegras.diferencaDaTroca((BigDecimal) p[2], atual.preco(), cfg.descontoPct())));
        }
        return saida;
    }

    private List<Opcao> opcoesDoCliente(JdbcTemplate jdbc, UUID clienteId, ConfigTroca cfg) {
        List<UUID> ativa = jdbc.queryForList("select id from assinatura where cliente_id = ? and status = 'ativa' order by criado_em, id", UUID.class, clienteId);
        return ativa.isEmpty() ? List.of() : opcoesDeTroca(jdbc, ler(jdbc, ativa.get(0), false).foto(), cfg);
    }

    /**
     * O cliente (esgotado ou restrito, sem login) pede mudar para um plano com mais serviços. Só vale se o plano está entre as opções do plano ativo dele; a diferença e o
     * desconto da hora ficam gravados no pedido. Telefone sem plano, plano fora das opções: mesma resposta, nada gravado. O dono aceita ou recusa.
     */
    public Recebido pedirTroca(String ip, Instant agora, PedidoTroca d) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, "planos-troca-ip:" + ip, 30, Duration.ofMinutes(10));
        if (d.site() != null && !d.site().isBlank()) throw recusa("Dados inválidos.");
        String tel = Documentos.telefone(d.telefone());
        if (tel == null) throw recusa("Informe o telefone com DDD.");
        if (d.planoId() == null) throw recusa("Plano indisponível.");
        consultaLiberada(loja, "planos-troca-tel:" + tel, 3, Duration.ofMinutes(15));
        consultaLiberada(loja, "planos-troca-loja", 60, Duration.ofMinutes(1));
        String hash = cifra.hash(loja.id(), "tel", tel);
        return banco.naLoja(jdbc -> {
            if (!linkLigado(jdbc)) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "O pedido de plano não está disponível agora. Fale com a loja.");
            ConfigTroca cfg = lerConfigTroca(jdbc);
            for (UUID cliente : jdbc.queryForList("select id from cliente where telefone_hash = ?", UUID.class, hash)) {
                List<UUID> ativa = jdbc.queryForList("select id from assinatura where cliente_id = ? and status = 'ativa' order by criado_em, id", UUID.class, cliente);
                if (ativa.isEmpty()) continue;
                Foto atual = ler(jdbc, ativa.get(0), false).foto();
                Opcao alvo = opcoesDeTroca(jdbc, atual, cfg).stream().filter(o -> o.planoId().equals(d.planoId())).findFirst().orElse(null);
                if (alvo == null) continue;
                Integer abertos = jdbc.queryForObject("select count(*) from pedido_plano where status = 'novo'", Integer.class);
                if (abertos != null && abertos >= PlanoRegras.MAX_PEDIDOS_ABERTOS) throw conflito("Não estamos recebendo novos pedidos agora. Fale com a loja.");
                Integer repetido = jdbc.queryForObject("select count(*) from pedido_plano where status = 'novo' and telefone_hash = ? and plano_id = ? and tipo = 'troca'", Integer.class, hash, alvo.planoId());
                if (repetido != null && repetido > 0) return new Recebido(true);
                List<String> nomes = jdbc.query("select coalesce(nullif(apelido, ''), nome) from cliente where id = ?", (rs, i) -> rs.getString(1), cliente);
                String nome = nomes.isEmpty() || nomes.get(0) == null ? "" : Texto.limpar(nomes.get(0));
                if (nome.length() > 60) nome = nome.substring(0, 60);
                if (nome.length() < 2) nome = "Cliente";
                try {
                    jdbc.update("insert into pedido_plano (loja_id, nome, telefone_cif, telefone_hash, plano_id, plano_nome, tipo, de_assinatura_id, valor_diferenca, desconto_pct) values (?::uuid, ?, ?, ?, ?, ?, 'troca', ?, ?, ?)",
                            loja.id().toString(), nome, cifra.cifrar(tel), hash, alvo.planoId(), alvo.nome(), ativa.get(0), alvo.diferenca(), cfg.descontoPct());
                } catch (DuplicateKeyException e) {
                    // dois cliques ao mesmo tempo: o outro já gravou
                }
                return new Recebido(true);
            }
            return new Recebido(true);
        });
    }

    /**
     * O dono aceita o pedido de troca (numa transação só): encerra o plano atual, abre o novo a partir do mês da troca, leva para ele os atendimentos do mês (e dos meses
     * seguintes, se houver adiantados) e registra a mensalidade do mês com a diferença; nos meses seguintes vale o preço cheio do plano novo. Se o cliente já usou mais
     * atendimentos no mês do que o plano novo oferece, recusa (nada muda). Horários fixos do plano antigo saem e precisam ser definidos de novo.
     */
    private AssinaturaDto aceitarTroca(JdbcTemplate jdbc, UUID lojaId, UUID pedidoId, UUID planoId, UUID deId, BigDecimal diferenca, String forma, Autor autor, Instant agora) {
        if (forma == null || !FORMAS.containsKey(forma)) throw recusa("Escolha como a diferença foi paga: Pix, dinheiro ou cartão.");
        if (deId == null) throw recusa("Esse pedido não tem o plano de origem. Recuse e peça de novo.");
        Trava antigo = travar(jdbc, deId);
        if (!"ativa".equals(antigo.status())) throw recusa("O plano atual desse cliente mudou. Recuse este pedido.");
        Integer ativo = jdbc.queryForObject("select count(*) from plano where id = ? and ativo", Integer.class, planoId);
        if (ativo == null || ativo == 0) throw recusa("O plano desse pedido não está mais à venda.");
        List<UUID> servicosNovo = jdbc.query("select servico_id from plano_servico where plano_id = ?", (rs, i) -> rs.getObject(1, UUID.class), planoId);
        if (!servicosNovo.containsAll(antigo.foto().servicoIds())) throw recusa("O plano desse pedido não inclui mais todos os serviços do plano atual. Recuse este pedido.");
        UUID clienteId = jdbc.queryForObject("select cliente_id from assinatura where id = ?", UUID.class, deId);
        Integer dia = jdbc.queryForObject("select dia_cobranca from assinatura where id = ?", Integer.class, deId);
        String mes = PlanoRegras.mesDe(agora);
        if (antigo.inicioMes().compareTo(mes) > 0) mes = antigo.inicioMes(); // plano pago adiantado que ainda não começou: a troca vale desde o primeiro mês dele
        FixosDoPlano.apagarFuturos(jdbc, deId, null, agora);
        jdbc.update("delete from assinatura_fixo where assinatura_id = ?", deId);
        jdbc.update("update assinatura set status = 'cancelada', encerrado_em = ? where id = ?", utc(agora), deId); // libera o "um plano em andamento por cliente"
        UUID novo = contratarNaTransacao(jdbc, lojaId, clienteId, planoId, mes, dia, autor, agora);
        Foto fotoNova = ler(jdbc, novo, false).foto();
        jdbc.update("update assinatura set troca_de_id = ?, valor_primeiro_mes = ?, status = 'ativa' where id = ?", deId, diferenca, novo);
        jdbc.update("update agendamento set plano_assinatura_id = ?, plano_nome = ?, atualizado_em = now() where plano_assinatura_id = ? and to_char(inicio at time zone 'America/Sao_Paulo', 'YYYY-MM') >= ?",
                novo, fotoNova.nome(), deId, mes);
        Extrato exAntigo = PlanoRegras.extrato(antigo.foto(), antigo.inicioMes(), pagos(jdbc, deId), usos(jdbc, deId, null), mes, List.of());
        int divida = PlanoRegras.dividaAoEncerrar(exAntigo);
        jdbc.update("update assinatura set divida = ?, divida_quitada = ? where id = ?", divida, divida == 0, deId);
        jdbc.update("insert into assinatura_pagamento (loja_id, assinatura_id, mes, valor, forma, em, autor_id, autor_nome) values (?::uuid, ?, ?, ?, ?, ?, ?, ?)",
                lojaId.toString(), novo, mes, diferenca, forma, utc(agora), autor.id(), autor.nome());
        Extrato exNovo = PlanoRegras.extrato(fotoNova, mes, List.of(mes), usos(jdbc, novo, null), mes, List.of());
        for (Linha l : exNovo.linhas()) {
            if (l.estourou()) throw conflito("O cliente já usou mais atendimentos neste mês do que o plano novo oferece. Recuse o pedido e combine com ele.");
        }
        nota(jdbc, lojaId, deId, autor, "trocou", "Troca para " + fotoNova.nome() + " a pedido do cliente" + (divida > 0 ? " · " + divida + " atendimento(s) adiantado(s) sem pagar" : ""), agora);
        nota(jdbc, lojaId, novo, autor, "mensalidade", PlanoRegras.rotuloMes(mes) + " · " + FORMAS.get(forma) + " · diferença da troca de " + antigo.foto().nome(), agora);
        jdbc.update("update pedido_plano set status = 'aceito', assinatura_id = ?, resolvido_em = ? where id = ?", novo, utc(agora), pedidoId);
        return montar(jdbc, novo, agora).get(0);
    }

    /**
     * Quantos cortes restam em cada plano ativo do telefone. Só número de cortes: nunca nome, CPF, mensalidade nem horários. Sem plano (ou telefone inválido): sempre
     * a mesma resposta genérica. 5 consultas por telefone a cada 15 minutos.
     */
    public SaldoPublico saldoPorTelefone(String ip, Instant agora, String telefone) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, "planos-saldo-ip:" + ip, 30, Duration.ofMinutes(15));
        consultaLiberada(loja, "planos-saldo-loja", 120, Duration.ofMinutes(1));
        String tel = Documentos.telefone(telefone);
        if (tel == null) return new SaldoPublico(List.of(), PlanoRegras.GENERICO_SALDO);
        consultaLiberada(loja, "planos-saldo-tel:" + tel, 5, Duration.ofMinutes(15));
        String hash = cifra.hash(loja.id(), "tel", tel);
        return banco.naLoja(jdbc -> {
            List<UUID> ids = jdbc.queryForList("select a.id from assinatura a join cliente c on c.id = a.cliente_id where c.telefone_hash = ? and a.status = 'ativa' order by a.criado_em, a.id", UUID.class, hash);
            List<ItemSaldo> lista = new ArrayList<>();
            for (UUID id : ids) {
                Saldo s = montar(jdbc, id, agora).get(0).saldo();
                lista.add(new ItemSaldo(s.planoNome(), s.mes(), s.restantes(), s.cortesPorMes(), s.pagoMes()));
            }
            return lista.isEmpty() ? new SaldoPublico(List.of(), PlanoRegras.GENERICO_SALDO) : new SaldoPublico(lista, null);
        });
    }
}
