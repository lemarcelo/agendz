package br.com.agendz.publico;

import br.com.agendz.clientes.ClienteService;
import br.com.agendz.comissao.ComissaoService;
import br.com.agendz.configuracao.LinkAgendamento;
import br.com.agendz.configuracao.LocalDaLoja;
import br.com.agendz.cupom.CupomService;
import br.com.agendz.agenda.Ocupacao;
import br.com.agendz.aviso.AvisosPainel;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.escala.EscalaService.Faixa;
import br.com.agendz.escala.Fuso;
import br.com.agendz.tenant.Capacidades;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Documentos;
import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Link de agendamento do cliente final, SEM login (espelho de `src/domain/publico.js` na API simulada; docs/MAPA-API-SPRING.md, seção 10b).
 * A loja vem do Host. O cliente vê só horários livres (nunca quem ocupa os outros), pede um horário, vê e cancela o que é dele.
 * O acesso ao próprio horário é um token que vale para UM agendamento (só o hash fica no banco); sem o token nada se enxerga.
 * Remarcar o próprio horário (24 h ou mais) e o aviso no painel (`aviso_painel`) entram na 5e-2. Ficam para a 5e-3: código por telefone, lembretes, WhatsApp, estética.
 */
@Service
public class LinkPublicoService {

    public static final int PASSO_MIN = 30;
    public static final int MAX_ABERTOS = 3;
    public static final int MAX_SERVICOS = 5;
    public static final int TOKEN_DIAS = 90;
    public static final int MAX_DIAS_CONSULTA = 31;
    private static final UUID NINGUEM = new UUID(0L, 0L);
    public static final String ERRO_DESLIGADO = "O agendamento pelo link não está disponível agora. Fale com a loja.";
    public static final String ERRO_HORARIO = "Esse horário acabou de ser ocupado. Escolha outro.";
    public static final String ERRO_NAO_ACHEI = "Agendamento não encontrado.";
    public static final String ERRO_MUITOS = "Muitos pedidos em pouco tempo. Tente de novo em alguns minutos.";
    private static final Pattern TOKEN = Pattern.compile("^[0-9a-f]{48}$");
    private static final DateTimeFormatter DIA_HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm");
    private static final SecureRandom ALEATORIO = new SecureRandom();

    /** `precos` e `duracoes` (por porte) só vêm no tipo que cobra por porte; os campos simples são os do porte médio/padrão do serviço. */
    public record ServicoPublico(UUID id, String nome, int duracao, BigDecimal preco, int antecedenciaH, Map<String, BigDecimal> precos, Map<String, Integer> duracoes) {
    }

    public record PortePublico(String id, String nome) {
    }

    public record ProfissionalPublico(UUID id, String nome, String foto) {
    }

    /** `endereco` e `mapaUrl` só vêm quando o proprietário ligou "mostrar o endereço no link" e há endereço gravado. */
    public record Pagina(boolean ativo, String aviso, int diasMax, List<ServicoPublico> servicos, List<ProfissionalPublico> profissionais, String endereco, String mapaUrl,
                         String tipo, List<PortePublico> portes) {
    }

    public record Horario(Instant inicio, UUID profissionalId) {
    }

    /** Veículo do pedido (estética): vira a "foto" do agendamento; não entra no cadastro de quem já é cliente. */
    public record VeiculoEntrada(@Size(max = 20) String placa, @Size(max = 60) String marca, @Size(max = 60) String modelo, @Size(max = 40) String cor, @Size(max = 20) String porte) {
    }

    public record VeiculoResumo(String placa, String modelo, String porte) {
    }

    public record Pedido(
            @Size(max = 100) String nome,
            @Size(max = 30) String telefone,
            @Size(max = 10) List<UUID> servicoIds,
            @NotNull Instant inicio,
            UUID profissionalId,
            @Size(max = 40) String cupomChave,
            @Size(max = 100) String site,
            @Valid VeiculoEntrada veiculo) {
    }

    public record Resumo(UUID id, Instant inicio, Instant fim, String status, String rotulo, List<String> servicos, int duracao, BigDecimal total, BigDecimal desconto,
                         String cupom, String profissional, boolean ativo, boolean podeCancelar, VeiculoResumo veiculo) {
    }

    public record Criado(Resumo agendamento, String token) {
    }

    private record Svc(UUID id, String nome, BigDecimal preco, int duracaoMin, int intervaloMin, int antecedenciaH) {
    }

    private record Prof(UUID id, String nome) {
    }

    private record Ocupado(Instant inicio, Instant fimOcupado) {
    }

    /** Escalas lidas uma vez por consulta (cada dia testa dezenas de horários sem reler o banco). */
    private record Base(Map<Integer, List<Faixa>> loja, List<Prof> profissionais, Map<UUID, Map<Integer, List<Faixa>>> escalas, List<UUID> boxes) {
    }

    private record BoxOcupado(UUID boxId, Instant inicio, Instant fimOcupado) {
    }

    private final LojaJdbc banco;
    private final Clock relogio;
    private final EscalaService escalas;
    private final ClienteService clientes;
    private final CupomService cupons;
    private final ComissaoService comissoes;
    private final LimitePublico limite;
    private final Ocupacao ocupacao;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> PORTES = List.of("pequeno", "medio", "grande", "suv", "pickup");
    private static final Map<String, String> ROTULO_PORTE = Map.of("pequeno", "Pequeno", "medio", "Médio", "grande", "Grande", "suv", "SUV", "pickup", "Pickup");

    public LinkPublicoService(LojaJdbc banco, Clock relogio, EscalaService escalas, ClienteService clientes, CupomService cupons, ComissaoService comissoes, LimitePublico limite, Ocupacao ocupacao) {
        this.banco = banco;
        this.relogio = relogio;
        this.escalas = escalas;
        this.clientes = clientes;
        this.cupons = cupons;
        this.comissoes = comissoes;
        this.limite = limite;
        this.ocupacao = ocupacao;
    }

    // ---------------------------------------------------------------- página (o que o cliente vê antes de escolher)

    /** Só o que a página pública precisa: serviços ativos de um dia só (nome, duração, preço, antecedência) e quem atende. Nada de custo, material, comissão ou dado de cliente. */
    public Pagina pagina() {
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            LinkAgendamento.Config cfg = LinkAgendamento.ler(jdbc);
            boolean ativo = cfg.ativo() && LinkAgendamento.tipoSuportado(loja);
            if (!ativo) return new Pagina(false, ERRO_DESLIGADO, cfg.diasMax(), List.of(), List.of(), null, null, loja.tipo(), List.of());
            boolean porPorte = Capacidades.precoPorPorte(loja);
            List<ServicoPublico> servicos = jdbc.query(
                    "select id, nome, preco, duracao_min, antecedencia_h, precos::text as precos, duracoes::text as duracoes from servico where ativo and not multi_dia order by lower(nome), id",
                    (rs, i) -> new ServicoPublico(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getInt("duracao_min"), rs.getBigDecimal("preco"), rs.getInt("antecedencia_h"),
                            porPorte ? tabelaPrecos(rs.getString("precos")) : null, porPorte ? tabelaDuracoes(rs.getString("duracoes")) : null));
            List<ProfissionalPublico> profissionais = jdbc.query(
                    "select id, coalesce(nullif(apelido, ''), nome) as n, foto from usuario where ativo and atende order by lower(coalesce(nullif(apelido, ''), nome)), id",
                    (rs, i) -> new ProfissionalPublico(rs.getObject("id", UUID.class), rs.getString("n"), rs.getString("foto")));
            LocalDaLoja.Local local = LocalDaLoja.ler(jdbc);
            boolean mostra = local.enderecoNoLink() && local.temEndereco();
            List<PortePublico> portes = porPorte ? PORTES.stream().map(x -> new PortePublico(x, ROTULO_PORTE.get(x))).toList() : List.of();
            return new Pagina(true, null, cfg.diasMax(), servicos, profissionais, mostra ? local.enderecoTexto() : null, mostra ? local.mapaUrl() : null, loja.tipo(), portes);
        });
    }

    // ---------------------------------------------------------------- horários livres

    /** Horários livres de um dia (de 30 em 30 min, só dentro do expediente). `profissionalId` vazio = qualquer um (mostra o primeiro livre). */
    public List<Horario> horarios(String ip, LocalDate dia, List<UUID> servicoIds, UUID profissionalId, String porte) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, ip);
        if (dia == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha um dia.");
        return banco.naLoja(jdbc -> {
            LinkAgendamento.Config cfg = config(jdbc, loja);
            if (!cfg.ativo()) return List.<Horario>of();
            List<Svc> servicos = servicosDoLink(jdbc, ids(servicoIds), porteDoPedido(loja, porte));
            Base base = base(jdbc, loja, profissionalId);
            return horariosDoDia(jdbc, cfg, base, dia, servicos, relogio.instant(), false, null);
        });
    }

    /** Dias (a partir de `de`) que têm ao menos um horário livre, para pintar o calendário. Até 31 dias por consulta. */
    public List<LocalDate> dias(String ip, LocalDate de, int quantos, List<UUID> servicoIds, UUID profissionalId, String porte) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, ip);
        if (de == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o primeiro dia.");
        int n = Math.min(Math.max(quantos, 0), MAX_DIAS_CONSULTA);
        return banco.naLoja(jdbc -> {
            LinkAgendamento.Config cfg = config(jdbc, loja);
            if (!cfg.ativo() || n == 0) return List.<LocalDate>of();
            List<Svc> servicos = servicosDoLink(jdbc, ids(servicoIds), porteDoPedido(loja, porte));
            Base base = base(jdbc, loja, profissionalId);
            Instant agora = relogio.instant();
            List<LocalDate> livres = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                LocalDate d = de.plusDays(i);
                if (!horariosDoDia(jdbc, cfg, base, d, servicos, agora, true, null).isEmpty()) livres.add(d);
            }
            return livres;
        });
    }

    private void consultaLiberada(Loja loja, String ip) {
        if (!limite.liberar("consulta:" + loja.id() + ":" + ip, 240, Duration.ofMinutes(1))) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
    }

    private LinkAgendamento.Config config(JdbcTemplate jdbc, Loja loja) {
        LinkAgendamento.Config c = LinkAgendamento.ler(jdbc);
        return new LinkAgendamento.Config(c.ativo() && LinkAgendamento.tipoSuportado(loja), c.diasMax());
    }

    private Base base(JdbcTemplate jdbc, Loja loja, UUID profissionalId) {
        List<Prof> profs = jdbc.query("select id, coalesce(nullif(apelido, ''), nome) as n from usuario where ativo and atende" + (profissionalId == null ? "" : " and id = ?")
                        + " order by lower(coalesce(nullif(apelido, ''), nome)), id",
                (rs, i) -> new Prof(rs.getObject("id", UUID.class), rs.getString("n")), profissionalId == null ? new Object[0] : new Object[]{profissionalId});
        Map<UUID, Map<Integer, List<Faixa>>> porProf = new LinkedHashMap<>();
        for (Prof p : profs) porProf.put(p.id(), escalas.ler(jdbc, p.id()));
        List<UUID> boxes = Capacidades.usaRecursoFisico(loja) ? jdbc.queryForList("select id from box where ativo order by ordem, criado_em, id", UUID.class) : null; // null = tipo sem box
        return new Base(escalas.ler(jdbc, null), profs, porProf, boxes);
    }

    /**
     * Os horários livres de um dia. Livre = dentro do expediente da loja e do profissional, depois da antecedência do serviço e sem NENHUM agendamento ativo na janela
     * (pendente também ocupa: o cliente nunca disputa horário). Loja sem expediente cadastrado não oferece horário. `soUm`: para ao achar o primeiro.
     */
    private List<Horario> horariosDoDia(JdbcTemplate jdbc, LinkAgendamento.Config cfg, Base base, LocalDate dia, List<Svc> servicos, Instant agora, boolean soUm, UUID ignorar) {
        Instant diaIni = dia.atStartOfDay(Fuso.BRASIL).toInstant();
        Instant diaFim = dia.plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant();
        if (!diaFim.isAfter(agora) || diaIni.isAfter(agora.plus(cfg.diasMax(), ChronoUnit.DAYS))) return List.of();
        if (!EscalaService.temFaixa(base.loja())) return List.of();
        if (base.boxes() != null && base.boxes().isEmpty()) return List.of(); // estética sem box cadastrado não oferece horário
        int duracao = servicos.stream().mapToInt(Svc::duracaoMin).sum();
        int folga = servicos.get(servicos.size() - 1).intervaloMin();
        int antecedencia = servicos.stream().mapToInt(Svc::antecedenciaH).max().orElse(0);
        Instant minimo = agora.plus(antecedencia, ChronoUnit.HOURS);
        int dow = dia.getDayOfWeek().getValue() % 7; // domingo = 0
        Map<Instant, UUID> achados = new TreeMap<>();
        // estética: o horário só existe se houver profissional E box livres (o carro nunca divide o box); sem nenhum box cadastrado não há horário
        boolean usaBox = base.boxes() != null;
        List<BoxOcupado> boxesOcupados = usaBox
                ? jdbc.query("select box_id, inicio, fim_ocupado from agendamento where box_id is not null and id <> ? and status <> 'cancelado' and inicio < ? and fim_ocupado > ?",
                        (rs, i) -> new BoxOcupado(rs.getObject(1, UUID.class), rs.getObject(2, OffsetDateTime.class).toInstant(), rs.getObject(3, OffsetDateTime.class).toInstant()),
                        ignorar == null ? NINGUEM : ignorar, utc(diaFim.plus(1, ChronoUnit.DAYS)), utc(diaIni))
                : List.of();
        for (Prof p : base.profissionais()) {
            Map<Integer, List<Faixa>> deleEscala = base.escalas().get(p.id());
            List<Ocupado> ocupados = jdbc.query("select inicio, fim_ocupado from agendamento where profissional_id = ? and id <> ? and status <> 'cancelado' and inicio < ? and fim_ocupado > ?",
                    (rs, i) -> new Ocupado(rs.getObject("inicio", OffsetDateTime.class).toInstant(), rs.getObject("fim_ocupado", OffsetDateTime.class).toInstant()),
                    p.id(), ignorar == null ? NINGUEM : ignorar, utc(diaFim.plus(1, ChronoUnit.DAYS)), utc(diaIni));
            for (Faixa f : EscalaService.faixasDoDia(base.loja(), deleEscala, dow)) {
                for (int t = f.ini(); t + duracao <= f.fim(); t += PASSO_MIN) {
                    if (!EscalaService.cabeNoDia(base.loja(), deleEscala, dow, t, t + duracao)) continue;
                    Instant inicio = dia.atTime(t / 60, t % 60).atZone(Fuso.BRASIL).toInstant();
                    if (!inicio.isAfter(agora) || inicio.isBefore(minimo)) continue;
                    Instant fimOcupado = inicio.plus(duracao + folga, ChronoUnit.MINUTES);
                    if (ocupados.stream().anyMatch(o -> o.inicio().isBefore(fimOcupado) && o.fimOcupado().isAfter(inicio))) continue;
                    if (usaBox && boxesOcupados.stream().filter(o -> o.inicio().isBefore(fimOcupado) && o.fimOcupado().isAfter(inicio)).map(BoxOcupado::boxId).distinct().count() >= base.boxes().size()) continue;
                    achados.putIfAbsent(inicio, p.id());
                    if (soUm) return List.of(new Horario(inicio, p.id()));
                }
            }
        }
        List<Horario> saida = new ArrayList<>();
        achados.forEach((inicio, id) -> saida.add(new Horario(inicio, id)));
        return saida;
    }

    // ---------------------------------------------------------------- pedir um horário

    /**
     * Agendar pelo link. Entra como "a confirmar" (origem `link`) e a loja confirma ou recusa. Telefone existente manda no cadastro (nada do cadastro muda);
     * número novo cria o cliente. Cupom opcional: chave errada derruba o pedido inteiro e conta a tentativa (5 seguidas = 15 min de bloqueio).
     * Devolve o resumo e o token do acesso a ESTE horário (aparece uma vez; no banco só o hash).
     */
    public Criado agendar(String ip, Pedido p) {
        Loja loja = LojaContext.exigir();
        if (p.site() != null && !p.site().isBlank()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Não foi possível agendar. Tente de novo."); // campo isca: robô
        String nome = p.nome() == null ? "" : Texto.limpar(p.nome()).trim();
        if (nome.length() < 2) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o seu nome.");
        if (nome.length() > 60) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O nome pode ter até 60 letras.");
        String tel = Documentos.telefone(p.telefone());
        if (tel == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o telefone com DDD.");
        List<UUID> servicoIds = ids(p.servicoIds());
        if (Capacidades.usaVeiculo(loja) && p.veiculo() == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o veículo (placa, modelo e porte).");
        boolean comCupom = p.cupomChave() != null && !p.cupomChave().isBlank();
        boolean liberado = limite.liberar("agendar-tel:" + loja.id() + ":" + tel, 5, Duration.ofMinutes(1))
                && limite.liberar("agendar-ip:" + loja.id() + ":" + ip, 20, Duration.ofMinutes(10))
                && limite.liberar("agendar-loja:" + loja.id(), 120, Duration.ofMinutes(10))
                && (!comCupom || limite.liberar("cupom-loja:" + loja.id(), 30, Duration.ofMinutes(15)));
        if (!liberado) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
        return banco.naLoja(jdbc -> {
            Instant agora = relogio.instant();
            LinkAgendamento.Config cfg = config(jdbc, loja);
            if (!cfg.ativo()) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, ERRO_DESLIGADO);
            // estética: o veículo vem do pedido (não entra no cadastro de quem já é cliente) e o porte dele define preço e duração
            ClienteService.VeiculoDoAgendamento vei = !Capacidades.usaVeiculo(loja) ? null
                    : clientes.resolverVeiculo(jdbc, loja, null, null, new ClienteService.EntradaVeiculo(null, p.veiculo().placa(), p.veiculo().marca(), p.veiculo().modelo(), p.veiculo().cor(), p.veiculo().porte()));
            List<Svc> servicos = servicosDoLink(jdbc, servicoIds, vei == null ? null : vei.porte());
            Instant inicio = p.inicio();
            if (inicio.getNano() != 0 || inicio.getEpochSecond() % 60 != 0 || !inicio.isAfter(agora) || inicio.isAfter(agora.plus(cfg.diasMax(), ChronoUnit.DAYS))) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha um dia e um horário.");
            }
            int antecedencia = servicos.stream().mapToInt(Svc::antecedenciaH).max().orElse(0);
            if (inicio.isBefore(agora.plus(antecedencia, ChronoUnit.HOURS))) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse serviço exige " + antecedencia + " h de antecedência.");
            }
            int duracao = servicos.stream().mapToInt(Svc::duracaoMin).sum();
            BigDecimal total = servicos.stream().map(Svc::preco).reduce(BigDecimal.ZERO, BigDecimal::add);
            Instant fimServico = inicio.plus(duracao, ChronoUnit.MINUTES);
            Instant fimOcupado = fimServico.plus(servicos.get(servicos.size() - 1).intervaloMin(), ChronoUnit.MINUTES);

            // trava quem pode atender (sempre na mesma ordem de id): dois pedidos para o mesmo horário passam um de cada vez
            List<UUID> candidatos = jdbc.queryForList("select id from usuario where ativo and atende" + (p.profissionalId() == null ? "" : " and id = ?") + " order by id for update",
                    UUID.class, p.profissionalId() == null ? new Object[0] : new Object[]{p.profissionalId()});
            if (candidatos.isEmpty()) throw new ErroDeNegocio(HttpStatus.CONFLICT, ERRO_HORARIO);
            Base base = base(jdbc, loja, p.profissionalId());
            Map<Integer, List<Faixa>> lojaEscala = base.loja();
            if (!EscalaService.temFaixa(lojaEscala)) throw new ErroDeNegocio(HttpStatus.CONFLICT, ERRO_HORARIO);
            var local = inicio.atZone(Fuso.BRASIL);
            int dow = local.getDayOfWeek().getValue() % 7;
            int ini = local.getHour() * 60 + local.getMinute();
            UUID profissional = null;
            for (Prof c : base.profissionais()) {
                if (!EscalaService.cabeNoDia(lojaEscala, base.escalas().get(c.id()), dow, ini, ini + duracao)) continue;
                Integer ocupados = jdbc.queryForObject("select count(*) from agendamento where profissional_id = ? and status <> 'cancelado' and inicio < ? and fim_ocupado > ?",
                        Integer.class, c.id(), utc(fimOcupado), utc(inicio));
                if (ocupados != null && ocupados == 0) { profissional = c.id(); break; }
            }
            if (profissional == null) throw new ErroDeNegocio(HttpStatus.CONFLICT, ERRO_HORARIO);
            UUID boxId = escolherBoxDoLink(jdbc, loja, inicio, fimServico, fimOcupado, null, NINGUEM);

            ClienteService.DoLink cli = clientes.resolverDoLink(jdbc, nome, tel);
            Integer abertos = jdbc.queryForObject("select count(*) from agendamento where cliente_id = ? and status in ('a_confirmar', 'confirmado') and inicio > ?", Integer.class, cli.clienteId(), utc(agora));
            if (abertos != null && abertos >= MAX_ABERTOS) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Você já tem " + MAX_ABERTOS + " horários marcados. Cancele um deles para agendar outro.");
            }
            UUID id = jdbc.queryForObject(
                    "insert into agendamento (loja_id, cliente_id, profissional_id, inicio, fim_servico, fim_ocupado, status, encaixe, total, origem, box_id, porte, veiculo_placa, veiculo_marca, veiculo_modelo, veiculo_cor) "
                            + "values (?::uuid, ?, ?, ?, ?, ?, 'a_confirmar', false, ?, 'link', ?, ?, ?, ?, ?, ?) returning id",
                    UUID.class, loja.id().toString(), cli.clienteId(), profissional, utc(inicio), utc(fimServico), utc(fimOcupado), total, boxId,
                    vei == null ? null : vei.porte(), vei == null ? null : vei.placa(), vei == null ? null : vei.marca(), vei == null ? null : vei.modelo(), vei == null ? null : vei.cor());
            short ordem = 0;
            for (Svc s : servicos) {
                jdbc.update("insert into agendamento_servico (loja_id, agendamento_id, servico_id, ordem, nome, preco, duracao_min, intervalo_min) values (?::uuid, ?, ?, ?, ?, ?, ?, ?)",
                        loja.id().toString(), id, s.id(), ordem++, s.nome(), s.preco(), s.duracaoMin(), s.intervaloMin());
            }
            comissoes.congelar(jdbc, id);
            evento(jdbc, loja.id(), id, "criação", null, servicos.stream().map(Svc::nome).collect(java.util.stream.Collectors.joining(" + "))
                    + (vei == null ? "" : " (" + vei.modelo() + " " + vei.placa() + ")") + " em " + dataHora(inicio));
            if (comCupom) {
                CupomService.Aplicado ap = cupons.aplicar(jdbc, loja.id(), id, null, "link:" + ip, p.cupomChave(), agora);
                evento(jdbc, loja.id(), id, "cupom", null, ap.nome() + ": desconto de " + CupomService.reais(ap.desconto()));
            }
            avisar(jdbc, loja.id(), id, "pedido", nome + " pediu horário pelo link" + (vei == null ? "" : " para o " + vei.modelo() + " " + vei.placa()) + ": " + dataHora(inicio) + " (aguardando a sua confirmação).");
            String token = novoToken();
            jdbc.update("delete from acesso_publico where expira_em < ?", utc(agora));
            jdbc.update("insert into acesso_publico (loja_id, agendamento_id, token_hash, expira_em) values (?::uuid, ?, ?, ?)",
                    loja.id().toString(), id, hash(token), utc(agora.plus(TOKEN_DIAS, ChronoUnit.DAYS)));
            return new Criado(resumo(jdbc, id, agora), token);
        });
    }

    // ---------------------------------------------------------------- os próprios horários

    /** Os horários a que os tokens dão acesso (de 1 a 10 tokens). Token inválido, vencido ou de outra loja some da resposta; nada diz de quem é. */
    public List<Resumo> meus(String ip, List<String> tokens) {
        Loja loja = LojaContext.exigir();
        if (tokens == null || tokens.isEmpty()) return List.of();
        if (!limite.liberar("meus:" + loja.id() + ":" + ip, 60, Duration.ofMinutes(1))) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
        Set<String> unicos = new LinkedHashSet<>(tokens.size() > 10 ? tokens.subList(0, 10) : tokens);
        return banco.naLoja(jdbc -> {
            Instant agora = relogio.instant();
            Set<UUID> vistos = new HashSet<>();
            List<Resumo> saida = new ArrayList<>();
            for (String t : unicos) {
                UUID id = agendamentoDoToken(jdbc, t, agora);
                if (id != null && vistos.add(id)) saida.add(resumo(jdbc, id, agora));
            }
            saida.sort(Comparator.comparing(Resumo::inicio));
            return saida;
        });
    }

    /** Cancelar pelo link: só com 24 h ou mais de antecedência (conferido aqui, não só no botão) e só o horário a que o token dá acesso. */
    public Resumo cancelar(String ip, UUID id, String token) {
        Loja loja = LojaContext.exigir();
        if (!limite.liberar("cancelar:" + loja.id() + ":" + ip, 30, Duration.ofMinutes(10))) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
        return banco.naLoja(jdbc -> {
            Instant agora = relogio.instant();
            UUID doToken = agendamentoDoToken(jdbc, token, agora);
            if (doToken == null || !doToken.equals(id)) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
            List<Object[]> linha = jdbc.query("select status, inicio from agendamento where id = ? for update",
                    (rs, i) -> new Object[]{rs.getString(1), rs.getObject(2, OffsetDateTime.class).toInstant()}, id);
            if (linha.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
            String status = (String) linha.get(0)[0];
            Instant inicio = (Instant) linha.get(0)[1];
            if (!ativo(status, inicio, agora)) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
            if (Duration.between(agora, inicio).compareTo(Duration.ofHours(24)) < 0) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse horário não pode mais ser cancelado por aqui (faltam menos de 24 horas). Fale com a loja.");
            }
            jdbc.update("update agendamento set status = 'cancelado', motivo_cancelamento = 'cliente', atualizado_em = now() where id = ?", id);
            evento(jdbc, loja.id(), id, "status", "confirmado".equals(status) ? "Confirmado" : "A confirmar", "Cancelado pelo cliente");
            avisar(jdbc, loja.id(), id, "cancelou", nomeDoCliente(jdbc, id) + " cancelou o horário de " + dataHora(inicio) + " pelo link.");
            return resumo(jdbc, id, agora);
        });
    }

    // ---------------------------------------------------------------- remarcar o próprio horário

    private record Meu(UUID profissionalId, String status, Instant inicio, Instant fimServico, Instant fimOcupado, List<Svc> servicos, UUID boxId) {
    }

    /** O horário do token, para remarcar: ativo (a confirmar/confirmado e no futuro) e do token. Qualquer outra coisa é "não achei" (nada diz de quem é). */
    private Meu meuParaRemarcar(JdbcTemplate jdbc, UUID id, String token, Instant agora, boolean travar) {
        UUID doToken = agendamentoDoToken(jdbc, token, agora);
        if (doToken == null || !doToken.equals(id)) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
        List<Object[]> l = jdbc.query("select profissional_id, status, inicio, fim_servico, fim_ocupado, box_id from agendamento where id = ?" + (travar ? " for update" : ""),
                (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getString(2), rs.getObject(3, OffsetDateTime.class).toInstant(),
                        rs.getObject(4, OffsetDateTime.class).toInstant(), rs.getObject(5, OffsetDateTime.class).toInstant(), rs.getObject(6, UUID.class)}, id);
        if (l.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
        Object[] a = l.get(0);
        if (!ativo((String) a[1], (Instant) a[2], agora)) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
        // os valores congelados do agendamento (a duração não muda se o serviço foi editado depois); a antecedência vale a de hoje
        List<Svc> servicos = jdbc.query("select x.servico_id, x.nome, x.preco, x.duracao_min, x.intervalo_min, coalesce(sv.antecedencia_h, 0) "
                        + "from agendamento_servico x left join servico sv on sv.id = x.servico_id where x.agendamento_id = ? order by x.ordem",
                (rs, i) -> new Svc(rs.getObject(1, UUID.class), rs.getString(2), rs.getBigDecimal(3), rs.getInt(4), rs.getInt(5), rs.getInt(6)), id);
        if (servicos.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
        return new Meu((UUID) a[0], (String) a[1], (Instant) a[2], (Instant) a[3], (Instant) a[4], servicos, (UUID) a[5]);
    }

    private static void conferir24h(Instant inicio, Instant agora) {
        if (Duration.between(agora, inicio).compareTo(Duration.ofHours(24)) < 0) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse horário não pode mais ser remarcado por aqui (faltam menos de 24 horas). Fale com a loja.");
        }
    }

    /** Horários livres de um dia para REMARCAR: mesmo profissional e mesmos serviços do horário; o próprio horário conta como livre. */
    public List<Horario> horariosParaRemarcar(String ip, UUID id, String token, LocalDate dia) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, ip);
        if (dia == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha um dia.");
        return banco.naLoja(jdbc -> {
            Instant agora = relogio.instant();
            Meu m = meuParaRemarcar(jdbc, id, token, agora, false);
            LinkAgendamento.Config cfg = config(jdbc, loja);
            if (!cfg.ativo()) return List.<Horario>of();
            return horariosDoDia(jdbc, cfg, base(jdbc, loja, m.profissionalId()), dia, m.servicos(), agora, false, id);
        });
    }

    /** Dias com horário livre para remarcar (até 31 por consulta). */
    public List<LocalDate> diasParaRemarcar(String ip, UUID id, String token, LocalDate de, int quantos) {
        Loja loja = LojaContext.exigir();
        consultaLiberada(loja, ip);
        if (de == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o primeiro dia.");
        int n = Math.min(Math.max(quantos, 0), MAX_DIAS_CONSULTA);
        return banco.naLoja(jdbc -> {
            Instant agora = relogio.instant();
            Meu m = meuParaRemarcar(jdbc, id, token, agora, false);
            LinkAgendamento.Config cfg = config(jdbc, loja);
            if (!cfg.ativo() || n == 0) return List.<LocalDate>of();
            Base base = base(jdbc, loja, m.profissionalId());
            List<LocalDate> livres = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                LocalDate d = de.plusDays(i);
                if (!horariosDoDia(jdbc, cfg, base, d, m.servicos(), agora, true, id).isEmpty()) livres.add(d);
            }
            return livres;
        });
    }

    /**
     * Remarcar pelo link: só o horário a que o token dá acesso, ativo, com 24 h ou mais até o horário ATUAL (conferido aqui). Mesmo profissional e mesmos
     * serviços; o novo horário passa pelas mesmas regras do pedido (minuto exato, até `diasMax`, antecedência, expediente, sem conflito). O horário volta a
     * "a confirmar" (a loja confirma de novo), fica marcado como reagendado e a loja é avisada no painel. Link desligado = 403.
     */
    public Resumo remarcar(String ip, UUID id, String token, Instant novoInicio) {
        Loja loja = LojaContext.exigir();
        if (!limite.liberar("remarcar:" + loja.id() + ":" + ip, 30, Duration.ofMinutes(10))) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
        if (novoInicio == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha um dia e um horário.");
        return banco.naLoja(jdbc -> {
            Instant agora = relogio.instant();
            LinkAgendamento.Config cfg = config(jdbc, loja);
            if (!cfg.ativo()) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, ERRO_DESLIGADO);
            UUID doToken = agendamentoDoToken(jdbc, token, agora);
            if (doToken == null || !doToken.equals(id)) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
            // trava o profissional do horário (mesma ordem de sempre: usuário primeiro) para duas remarcações/pedidos no mesmo horário passarem um de cada vez
            UUID prof = jdbc.queryForList("select profissional_id from agendamento where id = ?", UUID.class, id).stream().findFirst().orElseThrow(() -> new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI));
            if (jdbc.queryForList("select id from usuario where id = ? and ativo and atende for update", UUID.class, prof).isEmpty()) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, ERRO_HORARIO);
            }
            Meu m = meuParaRemarcar(jdbc, id, token, agora, true);
            conferir24h(m.inicio(), agora);
            if (novoInicio.getNano() != 0 || novoInicio.getEpochSecond() % 60 != 0 || !novoInicio.isAfter(agora) || novoInicio.isAfter(agora.plus(cfg.diasMax(), ChronoUnit.DAYS))) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha um dia e um horário.");
            }
            if (novoInicio.equals(m.inicio())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Esse já é o seu horário. Escolha outro.");
            int antecedencia = m.servicos().stream().mapToInt(Svc::antecedenciaH).max().orElse(0);
            if (novoInicio.isBefore(agora.plus(antecedencia, ChronoUnit.HOURS))) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse serviço exige " + antecedencia + " h de antecedência.");
            }
            int duracao = m.servicos().stream().mapToInt(Svc::duracaoMin).sum();
            int folga = m.servicos().get(m.servicos().size() - 1).intervaloMin();
            Instant fimServico = novoInicio.plus(duracao, ChronoUnit.MINUTES);
            Instant fimOcupado = fimServico.plus(folga, ChronoUnit.MINUTES);
            Base base = base(jdbc, loja, m.profissionalId());
            var local = novoInicio.atZone(Fuso.BRASIL);
            int ini = local.getHour() * 60 + local.getMinute();
            if (!EscalaService.temFaixa(base.loja())
                    || !EscalaService.cabeNoDia(base.loja(), base.escalas().get(m.profissionalId()), local.getDayOfWeek().getValue() % 7, ini, ini + duracao)) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, ERRO_HORARIO);
            }
            Integer ocupados = jdbc.queryForObject("select count(*) from agendamento where profissional_id = ? and id <> ? and status <> 'cancelado' and inicio < ? and fim_ocupado > ?",
                    Integer.class, m.profissionalId(), id, utc(fimOcupado), utc(novoInicio));
            if (ocupados != null && ocupados > 0) throw new ErroDeNegocio(HttpStatus.CONFLICT, ERRO_HORARIO);
            UUID boxId = escolherBoxDoLink(jdbc, loja, novoInicio, fimServico, fimOcupado, m.boxId(), id); // estética: fica no mesmo box se estiver livre, senão outro; nunca divide

            evento(jdbc, loja.id(), id, "data e hora", dataHora(m.inicio()), dataHora(novoInicio));
            if ("confirmado".equals(m.status())) evento(jdbc, loja.id(), id, "status", "Confirmado", "A confirmar (cliente remarcou pelo link)");
            jdbc.update("update agendamento set inicio = ?, fim_servico = ?, fim_ocupado = ?, status = 'a_confirmar', reagendado = true, motivo_cancelamento = null, box_id = ?, atualizado_em = now() where id = ?",
                    utc(novoInicio), utc(fimServico), utc(fimOcupado), boxId, id);
            jdbc.update("delete from agendamento_bloco where agendamento_id = ?", id);
            jdbc.update("insert into agendamento_bloco (loja_id, agendamento_id, ini, fim) values (?::uuid, ?, ?, ?)", loja.id().toString(), id, utc(novoInicio), utc(fimOcupado));
            avisar(jdbc, loja.id(), id, "remarcou", nomeDoCliente(jdbc, id) + " remarcou pelo link: agora " + dataHora(novoInicio)
                    + ("confirmado".equals(m.status()) ? " (estava confirmado, volta a aguardar a sua confirmação)." : " (aguardando a sua confirmação)."));
            return resumo(jdbc, id, agora);
        });
    }

    // ---------------------------------------------------------------- apoio

    /** Aviso no painel (na mesma transação do fato). O profissional do horário é quem o vê; dono e equipe veem todos. */
    private void avisar(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId, String tipo, String texto) {
        UUID prof = jdbc.queryForList("select profissional_id from agendamento where id = ?", UUID.class, agendamentoId).stream().findFirst().orElse(null);
        AvisosPainel.criar(jdbc, lojaId, agendamentoId, prof, tipo, texto);
    }

    private String nomeDoCliente(JdbcTemplate jdbc, UUID agendamentoId) {
        List<String> n = jdbc.queryForList("select coalesce(nullif(c.apelido, ''), c.nome) from agendamento a join cliente c on c.id = a.cliente_id where a.id = ?", String.class, agendamentoId);
        return n.isEmpty() || n.get(0) == null ? "O cliente" : n.get(0);
    }

    private static boolean ativo(String status, Instant inicio, Instant agora) {
        return ("a_confirmar".equals(status) || "confirmado".equals(status)) && inicio.isAfter(agora);
    }

    private Resumo resumo(JdbcTemplate jdbc, UUID id, Instant agora) {
        List<Object[]> l = jdbc.query("select a.status, a.inicio, a.fim_servico, a.total, coalesce(nullif(u.apelido, ''), u.nome), a.cupom_foto ->> 'nome', a.veiculo_placa, a.veiculo_modelo, a.porte "
                        + "from agendamento a join usuario u on u.id = a.profissional_id where a.id = ?",
                (rs, i) -> new Object[]{rs.getString(1), rs.getObject(2, OffsetDateTime.class).toInstant(), rs.getObject(3, OffsetDateTime.class).toInstant(), rs.getBigDecimal(4), rs.getString(5), rs.getString(6),
                        rs.getString(7), rs.getString(8), rs.getString(9)}, id);
        if (l.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, ERRO_NAO_ACHEI);
        Object[] a = l.get(0);
        String status = (String) a[0];
        Instant inicio = (Instant) a[1];
        List<Object[]> itens = jdbc.query("select nome, duracao_min, desconto from agendamento_servico where agendamento_id = ? order by ordem",
                (rs, i) -> new Object[]{rs.getString(1), rs.getInt(2), rs.getBigDecimal(3)}, id);
        int duracao = 0;
        BigDecimal desconto = BigDecimal.ZERO;
        List<String> nomes = new ArrayList<>();
        for (Object[] it : itens) {
            nomes.add((String) it[0]);
            duracao += (int) it[1];
            desconto = desconto.add((BigDecimal) it[2]);
        }
        boolean ativo = ativo(status, inicio, agora);
        boolean podeCancelar = ativo && Duration.between(agora, inicio).compareTo(Duration.ofHours(24)) >= 0;
        String rotulo = switch (status) {
            case "a_confirmar" -> "Aguardando confirmação";
            case "confirmado" -> "Confirmado";
            case "concluido" -> "Concluído";
            default -> "Cancelado";
        };
        VeiculoResumo veiculo = a[6] == null ? null : new VeiculoResumo((String) a[6], (String) a[7], (String) a[8]);
        return new Resumo(id, inicio, (Instant) a[2], status, rotulo, nomes, duracao, (BigDecimal) a[3], desconto, (String) a[5], (String) a[4], ativo, podeCancelar, veiculo);
    }

    private UUID agendamentoDoToken(JdbcTemplate jdbc, String token, Instant agora) {
        if (token == null || !TOKEN.matcher(token).matches()) return null;
        List<UUID> l = jdbc.queryForList("select agendamento_id from acesso_publico where token_hash = ? and expira_em > ?", UUID.class, hash(token), utc(agora));
        return l.isEmpty() ? null : l.get(0);
    }

    /** Serviços do pedido, na ordem escolhida. Só os que o link oferece: ativos e de um dia só. */
    private List<Svc> servicosDoLink(JdbcTemplate jdbc, List<UUID> ids, String porte) {
        String marcas = String.join(",", ids.stream().map(x -> "?").toList());
        List<Object[]> achados = jdbc.query("select id, nome, preco, duracao_min, intervalo_min, antecedencia_h, ativo, multi_dia, precos::text as precos, duracoes::text as duracoes from servico where id in (" + marcas + ")",
                (rs, i) -> {
                    BigDecimal preco = rs.getBigDecimal("preco");
                    int duracao = rs.getInt("duracao_min");
                    if (porte != null) { // preço e duração do porte do veículo
                        BigDecimal pp = valorDoPorte(rs.getString("precos"), porte);
                        BigDecimal dd = valorDoPorte(rs.getString("duracoes"), porte);
                        if (pp != null && pp.signum() >= 0) preco = pp.setScale(2, java.math.RoundingMode.HALF_UP);
                        if (dd != null && dd.signum() > 0) duracao = dd.intValue();
                    }
                    return new Object[]{rs.getObject("id", UUID.class), rs.getString("nome"), preco, duracao, rs.getInt("intervalo_min"),
                            rs.getInt("antecedencia_h"), rs.getBoolean("ativo"), rs.getBoolean("multi_dia")};
                }, ids.toArray());
        Map<UUID, Object[]> porId = new LinkedHashMap<>();
        for (Object[] s : achados) porId.put((UUID) s[0], s);
        List<Svc> saida = new ArrayList<>();
        for (UUID id : ids) {
            Object[] s = porId.get(id);
            if (s == null || !(boolean) s[6] || (boolean) s[7]) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Serviço indisponível. Escolha outro.");
            saida.add(new Svc(id, (String) s[1], (BigDecimal) s[2], (int) s[3], (int) s[4], (int) s[5]));
        }
        return saida;
    }

    /** Porte pedido nas consultas de horário: no tipo que cobra por porte é obrigatório e válido; nos outros é ignorado. */
    private static String porteDoPedido(Loja loja, String porte) {
        if (!Capacidades.precoPorPorte(loja)) return null;
        String p = porte == null ? "" : porte.trim().toLowerCase(java.util.Locale.ROOT);
        if (!PORTES.contains(p)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o porte do veículo.");
        return p;
    }

    /** Box do pedido (estética): o preferido se estiver livre, senão o primeiro livre. Sem box livre o horário "acabou de ser ocupado". Tipo sem box devolve null. */
    private UUID escolherBoxDoLink(JdbcTemplate jdbc, Loja loja, Instant inicio, Instant fimServico, Instant fimOcupado, UUID preferido, UUID ignorar) {
        if (!Capacidades.usaRecursoFisico(loja)) return null;
        Ocupacao.Plano plano = new Ocupacao.Plano(List.<Instant[]>of(new Instant[]{inicio, fimServico}), fimServico, fimOcupado);
        try {
            return ocupacao.escolherBox(jdbc, loja, plano, null, preferido, ignorar);
        } catch (ErroDeNegocio e) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, ERRO_HORARIO); // a mensagem de box é da equipe; o cliente só vê que o horário acabou
        }
    }

    private static BigDecimal valorDoPorte(String json, String porte) {
        if (json == null || json.isBlank()) return null;
        try {
            JsonNode n = JSON.readTree(json).get(porte);
            return n == null || !n.isNumber() ? null : n.decimalValue();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return null;
        }
    }

    private static Map<String, BigDecimal> tabelaPrecos(String json) {
        Map<String, BigDecimal> m = new LinkedHashMap<>();
        for (String x : PORTES) {
            BigDecimal v = valorDoPorte(json, x);
            if (v != null) m.put(x, v);
        }
        return m;
    }

    private static Map<String, Integer> tabelaDuracoes(String json) {
        Map<String, Integer> m = new LinkedHashMap<>();
        for (String x : PORTES) {
            BigDecimal v = valorDoPorte(json, x);
            if (v != null) m.put(x, v.intValue());
        }
        return m;
    }

    private static List<UUID> ids(List<UUID> bruto) {
        List<UUID> ids = bruto == null ? List.of() : bruto;
        if (ids.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha ao menos um serviço.");
        if (ids.size() > MAX_SERVICOS) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "No máximo " + MAX_SERVICOS + " serviços por pedido.");
        if (new HashSet<>(ids).size() != ids.size()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O mesmo serviço aparece duas vezes.");
        return ids;
    }

    private void evento(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId, String campo, String de, String para) {
        jdbc.update("insert into agendamento_evento (loja_id, agendamento_id, em, autor_id, autor_nome, campo, de, para) values (?::uuid, ?, ?, null, 'Cliente (link)', ?, ?, ?)",
                lojaId.toString(), agendamentoId, utc(relogio.instant()), campo, de, para);
    }

    private static String dataHora(Instant i) {
        return DIA_HORA.format(i.atZone(Fuso.BRASIL));
    }

    private static String novoToken() {
        byte[] b = new byte[24];
        ALEATORIO.nextBytes(b);
        return HexFormat.of().formatHex(b); // 48 caracteres
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
