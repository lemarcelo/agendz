package br.com.agendz.avaliacoes;

import br.com.agendz.cifra.Cifra;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.Fuso;
import br.com.agendz.interno.RegrasDaLoja;
import br.com.agendz.publico.LimitePublico;
import br.com.agendz.seguranca.Permissoes.EscopoAvaliacoes;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Avaliações do atendimento (espelho de `avaliacoes.*` e `publico.*Avaliacao` na API simulada; docs/MAPA-API-SPRING.md, seção 10p; spec docs/F5-avaliacoes.md).
 * Só atendimento concluído com serviço é avaliado; uma avaliação por agendamento; ninguém edita nem apaga (o dono OCULTA, com motivo: sai da média).
 * O cliente chega por um token pessoal por agendamento (48 hex; só o SHA-256 fica no banco; 90 dias; uso único; um vivo por agendamento).
 * ANÔNIMO: sem a regra da plataforma (`avaliacao_mostra_anonimo`, só o Admin liga) o DTO do painel sai SEM nome, cliente nem agendamento.
 * Nada aqui escreve log: token, nome e texto de cliente nunca saem por mensagem de erro.
 */
@Service
public class AvaliacaoService {

    public static final String ERRO_MUITOS = "Muitos pedidos em pouco tempo. Tente de novo em alguns minutos.";
    private static final Pattern TOKEN = Pattern.compile("^[0-9a-f]{48}$");
    private static final SecureRandom ALEATORIO = new SecureRandom();
    private static final int MAX_LISTA = 500;

    /** Quem pergunta pelo agendamento: o profissional só enxerga os próprios (dono e recepção, todos). */
    public record Ator(UUID id, boolean veTudo, boolean dono) {
    }

    public record Situacao(String motivo, String aviso, boolean jaAvaliou, Instant pedidaEm) {
    }

    public record Pedido(String token, String numero, String nome, String loja) {
    }

    /** DTO do painel. Anônimo com a regra desligada: SEM `clienteId`, `agendamentoId` e nome (os campos nulos nem saem no JSON). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Painel(UUID id, Instant em, int nota, String texto, List<UUID> servicoIds, List<String> servicos, UUID profissionalId, String profissional,
                         boolean anonimo, boolean oculta, String motivoOculta, Instant ocultaEm, String cliente, UUID clienteId, UUID agendamentoId, boolean revelado) {
    }

    public record Lista(List<Painel> avaliacoes, boolean mostraAnonimo, boolean soMinhas) {
    }

    public record ResumoDto(int total, Double media, Map<String, Integer> distribuicao) {
    }

    public record Dados(String loja, List<String> servicos, String profissional, Instant quando) {
    }

    private final LojaJdbc banco;
    private final Cifra cifra;
    private final RegrasDaLoja regras;
    private final LimitePublico limite;
    private final Clock relogio;

    public AvaliacaoService(LojaJdbc banco, Cifra cifra, RegrasDaLoja regras, LimitePublico limite, Clock relogio) {
        this.banco = banco;
        this.cifra = cifra;
        this.regras = regras;
        this.limite = limite;
        this.relogio = relogio;
    }

    // ---------------------------------------------------------------- a estrela do cartão e o pedido

    public Situacao situacao(Ator ator, UUID agendamentoId) {
        LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            PedidoDeAvaliacao.Situacao s = visivel(jdbc, ator, agendamentoId, false);
            return new Situacao(s.motivo(), s.aviso(), s.jaAvaliou(), s.pedidaEm());
        });
    }

    /** Gera o token pessoal (devolvido UMA vez), troca o anterior ainda não usado e marca "pedida em". Recusa diz o motivo (409). */
    public Pedido pedir(Ator ator, UUID agendamentoId) {
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            PedidoDeAvaliacao.Situacao s = visivel(jdbc, ator, agendamentoId, true);
            if (!s.ok()) throw new ErroDeNegocio(HttpStatus.CONFLICT, s.aviso());
            if (s.jaAvaliou()) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este cliente já avaliou este atendimento.");
            String token = emitirAcesso(jdbc, loja.id(), agendamentoId);
            jdbc.update("update agendamento set avaliacao_pedida_em = ?, avaliacao_pedida_por = ? where id = ?", utc(relogio.instant()), ator.id(), agendamentoId);
            return new Pedido(token, s.numero(), s.nome(), loja.nome());
        });
    }

    /** Pedido novo troca o link anterior (um vivo por agendamento) e limpa os vencidos. Devolve o token em claro, que só aparece aqui. */
    String emitirAcesso(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId) {
        Instant agora = relogio.instant();
        jdbc.update("delete from avaliacao_acesso where expira_em < ? or (agendamento_id = ? and usado_em is null)", utc(agora), agendamentoId);
        String token = novoToken();
        jdbc.update("insert into avaliacao_acesso (loja_id, agendamento_id, token_hash, criado_em, expira_em) values (?::uuid, ?, ?, ?, ?)",
                lojaId.toString(), agendamentoId, hash(token), utc(agora), utc(agora.plus(AvaliacaoRegras.TOKEN_DIAS, ChronoUnit.DAYS)));
        return token;
    }

    private PedidoDeAvaliacao.Situacao visivel(JdbcTemplate jdbc, Ator ator, UUID agendamentoId, boolean travar) {
        PedidoDeAvaliacao.Situacao s = PedidoDeAvaliacao.ler(jdbc, cifra, agendamentoId, travar);
        if (s == null || (!ator.veTudo() && !ator.id().equals(s.profissionalId()))) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Atendimento não encontrado.");
        return s;
    }

    // ---------------------------------------------------------------- lista e resumo do painel

    /** Filtros já validados: o profissional só enxerga as próprias (o filtro de outro é ignorado). */
    public Lista listar(EscopoAvaliacoes esc, String de, String ate, UUID profissionalId, UUID servicoId) {
        Loja loja = LojaContext.exigir();
        AvaliacaoRegras.Periodo p = periodo(de, ate);
        UUID prof = esc.soDe() != null ? esc.soDe() : profissionalId;
        return banco.naLoja(jdbc -> {
            boolean mostra = regras.ler(loja.id()).avaliacaoMostraAnonimo();
            List<Object> args = new ArrayList<>();
            String filtro = filtro(p, prof, servicoId, args) + (esc.dono() ? "" : " and not a.oculta");
            List<Painel> lista = jdbc.query("select a.id, a.em, a.nota, a.texto, a.anonimo, a.oculta, a.motivo_oculta, a.oculta_em, a.agendamento_id, a.cliente_id, a.profissional_id, "
                            + "coalesce(nullif(u.apelido, ''), u.nome) as prof, coalesce(nullif(c.apelido, ''), c.nome) as cli "
                            + "from avaliacao a left join usuario u on u.id = a.profissional_id left join cliente c on c.id = a.cliente_id where true" + filtro
                            + " order by a.em desc, a.id limit " + MAX_LISTA,
                    (rs, i) -> painel(rs, esc.dono(), mostra), args.toArray());
            Map<UUID, List<UUID>> ids = new LinkedHashMap<>();
            Map<UUID, List<String>> nomes = new LinkedHashMap<>();
            if (!lista.isEmpty()) {
                String marcas = String.join(",", lista.stream().map(x -> "?").toList());
                jdbc.query("select s.avaliacao_id, s.servico_id, sv.nome from avaliacao_servico s join servico sv on sv.id = s.servico_id where s.avaliacao_id in (" + marcas
                                + ") order by s.avaliacao_id, s.ordem",
                        rs -> {
                            UUID a = rs.getObject(1, UUID.class);
                            ids.computeIfAbsent(a, k -> new ArrayList<>()).add(rs.getObject(2, UUID.class));
                            nomes.computeIfAbsent(a, k -> new ArrayList<>()).add(rs.getString(3));
                        }, lista.stream().map(Painel::id).toArray());
            }
            List<Painel> saida = new ArrayList<>();
            for (Painel x : lista) {
                saida.add(new Painel(x.id(), x.em(), x.nota(), x.texto(), ids.getOrDefault(x.id(), List.of()), nomes.getOrDefault(x.id(), List.of()), x.profissionalId(), x.profissional(),
                        x.anonimo(), x.oculta(), x.motivoOculta(), x.ocultaEm(), x.cliente(), x.clienteId(), x.agendamentoId(), x.revelado()));
            }
            return new Lista(saida, mostra, esc.soDe() != null);
        });
    }

    private static Painel painel(java.sql.ResultSet rs, boolean verOculta, boolean mostraAnonimo) throws java.sql.SQLException {
        boolean anonimo = rs.getBoolean("anonimo");
        boolean oculta = rs.getBoolean("oculta");
        String prof = rs.getString("prof");
        OffsetDateTime ocultaEm = rs.getObject("oculta_em", OffsetDateTime.class);
        String motivo = verOculta && oculta ? rs.getString("motivo_oculta") : null;
        Instant ocultaInstant = verOculta && oculta && ocultaEm != null ? ocultaEm.toInstant() : null;
        UUID profId = rs.getObject("profissional_id", UUID.class);
        String profNome = prof == null ? "—" : prof;
        Instant em = rs.getObject("em", OffsetDateTime.class).toInstant();
        if (anonimo && !mostraAnonimo) {
            return new Painel(rs.getObject("id", UUID.class), em, rs.getInt("nota"), rs.getString("texto"), null, null, profId, profNome, true, oculta, motivo, ocultaInstant,
                    AvaliacaoRegras.ANONIMO_ROTULO, null, null, false);
        }
        String cli = rs.getString("cli");
        return new Painel(rs.getObject("id", UUID.class), em, rs.getInt("nota"), rs.getString("texto"), null, null, profId, profNome, anonimo, oculta, motivo, ocultaInstant,
                cli == null ? "Cliente" : cli, rs.getObject("cliente_id", UUID.class), rs.getObject("agendamento_id", UUID.class), anonimo);
    }

    public ResumoDto resumo(EscopoAvaliacoes esc, String de, String ate, UUID profissionalId, UUID servicoId) {
        LojaContext.exigir();
        AvaliacaoRegras.Periodo p = periodo(de, ate);
        UUID prof = esc.soDe() != null ? esc.soDe() : profissionalId;
        return banco.naLoja(jdbc -> {
            List<Object> args = new ArrayList<>();
            List<Integer> notas = jdbc.query("select a.nota from avaliacao a where not a.oculta" + filtro(p, prof, servicoId, args), (rs, i) -> rs.getInt(1), args.toArray());
            AvaliacaoRegras.Resumo r = AvaliacaoRegras.resumir(notas);
            Map<String, Integer> dist = new LinkedHashMap<>();
            for (int n = 1; n <= 5; n++) dist.put(String.valueOf(n), r.distribuicao()[n - 1]);
            return new ResumoDto(r.total(), r.media(), dist);
        });
    }

    private static AvaliacaoRegras.Periodo periodo(String de, String ate) {
        AvaliacaoRegras.Periodo p = AvaliacaoRegras.periodo(de, ate);
        if (p.erro() != null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, p.erro());
        return p;
    }

    private static String filtro(AvaliacaoRegras.Periodo p, UUID prof, UUID servicoId, List<Object> args) {
        StringBuilder f = new StringBuilder();
        if (!p.semLimite()) {
            f.append(" and a.em >= ? and a.em < ?");
            args.add(utc(p.de().atStartOfDay(Fuso.BRASIL).toInstant()));
            args.add(utc(p.ate().plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant()));
        }
        if (prof != null) {
            f.append(" and a.profissional_id = ?");
            args.add(prof);
        }
        if (servicoId != null) {
            f.append(" and exists (select 1 from avaliacao_servico s where s.avaliacao_id = a.id and s.servico_id = ?)");
            args.add(servicoId);
        }
        return f.toString();
    }

    // ---------------------------------------------------------------- ocultar e reexibir (só o dono)

    public void mudarOculta(Ator ator, UUID avaliacaoId, String motivoBruto, boolean ocultar) {
        LojaContext.exigir();
        if (!ator.dono()) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Sem permissão");
        String motivo = AvaliacaoRegras.motivo(motivoBruto);
        if (motivo == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, AvaliacaoRegras.ERRO_MOTIVO);
        banco.naLoja(jdbc -> {
            List<Boolean> atual = jdbc.query("select oculta from avaliacao where id = ? for update", (rs, i) -> rs.getBoolean(1), avaliacaoId);
            if (atual.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Avaliação não encontrada.");
            if (atual.get(0) == ocultar) throw new ErroDeNegocio(HttpStatus.CONFLICT, ocultar ? "Esta avaliação já está oculta." : "Esta avaliação já está visível.");
            Instant agora = relogio.instant();
            jdbc.update("update avaliacao set oculta = ?, motivo_oculta = ?, oculta_em = ? where id = ?", ocultar, ocultar ? motivo : null, ocultar ? utc(agora) : null, avaliacaoId);
            jdbc.update("insert into avaliacao_evento (loja_id, avaliacao_id, em, autor_id, acao, motivo) values (?::uuid, ?, ?, ?, ?, ?)",
                    LojaContext.exigir().id().toString(), avaliacaoId, utc(agora), ator.id(), ocultar ? "ocultou" : "reexibiu", motivo);
            return null;
        });
    }

    // ---------------------------------------------------------------- porta pública (sem login; token no cabeçalho X-Acesso)

    /** Só loja, serviços, profissional e data. Nunca o nome do cliente. Qualquer falha de token = a mesma resposta (404). */
    public Dados dados(String ip, String token) {
        Loja loja = LojaContext.exigir();
        liberar(loja, ip);
        Dados d = banco.naLoja(jdbc -> {
            UUID ag = agendamentoDoToken(jdbc, token);
            return ag == null ? null : dadosDe(jdbc, loja, ag);
        });
        if (d == null) throw falhaDeToken(loja, ip);
        return d;
    }

    private Dados dadosDe(JdbcTemplate jdbc, Loja loja, UUID ag) {
        List<Object[]> l = jdbc.query("select a.inicio, a.profissional_id, coalesce(nullif(u.apelido, ''), u.nome) from agendamento a left join usuario u on u.id = a.profissional_id "
                + "where a.id = ? and a.status = 'concluido'", (rs, i) -> new Object[]{rs.getObject(1, OffsetDateTime.class).toInstant(), rs.getString(3)}, ag);
        if (l.isEmpty()) return null;
        List<String> servicos = jdbc.queryForList("select nome from agendamento_servico where agendamento_id = ? order by ordem", String.class, ag);
        if (servicos.isEmpty()) return null;
        return new Dados(loja.nome(), servicos, l.get(0)[1] == null ? "" : (String) l.get(0)[1], (Instant) l.get(0)[0]);
    }

    /**
     * Grava a avaliação. O token vem primeiro: sem token válido nada se aprende sobre os campos. O token é gasto na mesma transação da gravação (uso único,
     * mesmo com dois envios ao mesmo tempo); campo inválido desfaz tudo e o token continua valendo. `site` (isca de robô) preenchida finge sucesso e não grava.
     */
    public void avaliar(String ip, String token, JsonNode corpo) {
        Loja loja = LojaContext.exigir();
        liberar(loja, ip);
        JsonNode isca = corpo != null && corpo.isObject() ? corpo.get("site") : null;
        if (isca != null && !isca.isNull() && !(isca.isTextual() && isca.asText().isEmpty())) return;
        AvaliacaoRegras.Validada v = AvaliacaoRegras.validar(corpo);
        boolean gravou;
        try {
            gravou = banco.naLoja(jdbc -> {
                UUID ag = tokenGasto(jdbc, token);
                if (ag == null) return false;
                if (!v.ok()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, v.erro()); // desfaz: o token não foi gasto
                List<UUID[]> a = jdbc.query("select a.cliente_id, a.profissional_id from agendamento a where a.id = ? and a.status = 'concluido' "
                                + "and exists(select 1 from agendamento_servico s where s.agendamento_id = a.id) for update of a",
                        (rs, i) -> new UUID[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}, ag);
                if (a.isEmpty()) return false;
                UUID id = jdbc.queryForObject("insert into avaliacao (loja_id, agendamento_id, cliente_id, profissional_id, nota, texto, anonimo, em) values (?::uuid, ?, ?, ?, ?, ?, ?, ?) returning id",
                        UUID.class, loja.id().toString(), ag, a.get(0)[0], a.get(0)[1], v.nota(), v.texto(), v.anonimo(), utc(relogio.instant()));
                jdbc.update("insert into avaliacao_servico (loja_id, avaliacao_id, servico_id, ordem) select loja_id, ?, servico_id, ordem from agendamento_servico where agendamento_id = ?", id, ag);
                return true;
            });
        } catch (DuplicateKeyException e) {
            gravou = false; // já avaliado (dois envios ao mesmo tempo): mesma resposta de token usado
        }
        if (!gravou) throw falhaDeToken(loja, ip);
    }

    /** Marca o token como usado se ainda valer e devolve o agendamento; null se errado, vencido ou já usado (sem dizer qual). */
    private UUID tokenGasto(JdbcTemplate jdbc, String token) {
        if (token == null || !TOKEN.matcher(token).matches()) return null;
        Instant agora = relogio.instant();
        List<UUID> l = jdbc.queryForList("update avaliacao_acesso set usado_em = ? where token_hash = ? and usado_em is null and expira_em > ? returning agendamento_id",
                UUID.class, utc(agora), hash(token), utc(agora));
        return l.isEmpty() ? null : l.get(0);
    }

    private UUID agendamentoDoToken(JdbcTemplate jdbc, String token) {
        if (token == null || !TOKEN.matcher(token).matches()) return null;
        List<UUID> l = jdbc.queryForList("select ac.agendamento_id from avaliacao_acesso ac where ac.token_hash = ? and ac.usado_em is null and ac.expira_em > ? "
                + "and not exists (select 1 from avaliacao v where v.agendamento_id = ac.agendamento_id)", UUID.class, hash(token), utc(relogio.instant()));
        return l.isEmpty() ? null : l.get(0);
    }

    private void liberar(Loja loja, String ip) {
        if (!limite.liberar("av:" + loja.id() + ":" + ip, 60, Duration.ofMinutes(1)) || !limite.liberar("av-loja:" + loja.id(), 600, Duration.ofMinutes(10))) {
            throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
        }
    }

    /** Token errado conta contra quem tentou (adivinhar um token de 192 bits é inviável, mas o freio vale mesmo assim). */
    private ErroDeNegocio falhaDeToken(Loja loja, String ip) {
        if (!limite.liberar("av-falha:" + loja.id() + ":" + ip, 15, Duration.ofMinutes(10))) return new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, ERRO_MUITOS);
        return new ErroDeNegocio(HttpStatus.NOT_FOUND, AvaliacaoRegras.ERRO_AVALIACAO);
    }

    // ---------------------------------------------------------------- util

    static String novoToken() {
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

    static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
