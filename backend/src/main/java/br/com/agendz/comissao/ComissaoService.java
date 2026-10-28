package br.com.agendz.comissao;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.Fuso;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Comissão do que foi atendido e vendido (5d-4b; espelho de src/domain/comissao.js).
 * Cada linha tem um beneficiário: o serviço é do profissional do atendimento; o produto, do vendedor. O percentual do serviço é congelado na linha ao criar o
 * atendimento ({@link #congelar}); o do produto já nasce congelado. Quem é dono ou master não recebe comissão (o que atende já é dele): conta 100% para ele.
 * Comissão cancelada vale zero e a parte vira do estabelecimento; comissão paga nunca se cancela. Tudo roda em {@code LojaJdbc.naLoja} (RLS).
 */
@Service
public class ComissaoService {

    public static final int MAX_DIAS = 366;
    private static final BigDecimal CEM = new BigDecimal("100");

    private final LojaJdbc banco;

    public ComissaoService(LojaJdbc banco) {
        this.banco = banco;
    }

    // ---------------------------------------------------------------- período

    /** [ini, fim) em instantes; {@code de} e {@code ate} são os dias (inclusive) no fuso da loja. */
    public record Periodo(Instant ini, Instant fim, LocalDate de, LocalDate ate) {
    }

    /** De/Até (dias inclusive, no máximo 366) ou, sem datas, o mês {@code AAAA-MM}. */
    public static Periodo periodo(String mes, String de, String ate) {
        LocalDate d, a;
        try {
            if (de != null && !de.isBlank() && ate != null && !ate.isBlank()) {
                d = LocalDate.parse(de.trim());
                a = LocalDate.parse(ate.trim());
            } else if (mes != null && !mes.isBlank() && (de == null || de.isBlank()) && (ate == null || ate.isBlank())) {
                YearMonth m = YearMonth.parse(mes.trim());
                d = m.atDay(1);
                a = m.atEndOfMonth();
            } else {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o período.");
            }
        } catch (java.time.format.DateTimeParseException e) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Período inválido.");
        }
        if (a.isBefore(d)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A data final não pode ser antes da inicial.");
        if (ChronoUnit.DAYS.between(d, a) + 1 > MAX_DIAS) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O período pode ter no máximo " + MAX_DIAS + " dias.");
        return new Periodo(d.atStartOfDay(Fuso.BRASIL).toInstant(), a.plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant(), d, a);
    }

    // ---------------------------------------------------------------- cálculo

    static BigDecimal r2(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    /** Proprietário e master não recebem comissão. */
    static boolean semComissao(String papel) {
        return "dono".equals(papel) || "master".equals(papel);
    }

    /** Comissão de uma linha: {@code base × pct ÷ 100}, arredondada em centavos. */
    public static BigDecimal comissaoDa(BigDecimal base, BigDecimal pct) {
        return r2(base.multiply(pct).divide(CEM, 6, RoundingMode.HALF_UP));
    }

    record Linha(String nome, int qtd, BigDecimal base, BigDecimal pct, UUID pagamentoId, Instant pagaEm, String canceladaMotivo, boolean produto) {
        BigDecimal comissao() {
            return comissaoDa(base, pct);
        }
    }

    /** Tudo que um beneficiário recebe (ou deixa para a casa) num atendimento. */
    static final class Parte {
        final UUID quem;
        final List<Linha> linhas = new ArrayList<>();
        BigDecimal base = BigDecimal.ZERO, comissao = BigDecimal.ZERO, casa = BigDecimal.ZERO, original = BigDecimal.ZERO;
        boolean paga, cancelada;
        String motivo = "";
        Instant pagaEm;

        Parte(UUID quem) {
            this.quem = quem;
        }

        void fechar() {
            for (Linha l : linhas) {
                base = base.add(l.base());
                comissao = comissao.add(l.comissao());
            }
            base = r2(base);
            comissao = r2(comissao);
            paga = linhas.stream().allMatch(l -> l.pagamentoId() != null);
            cancelada = linhas.stream().allMatch(l -> l.canceladaMotivo() != null);
            pagaEm = paga ? linhas.stream().map(Linha::pagaEm).filter(java.util.Objects::nonNull).max(Comparator.naturalOrder()).orElse(null) : null;
            if (cancelada) {
                motivo = linhas.get(0).canceladaMotivo();
                original = comissao;
                comissao = BigDecimal.ZERO.setScale(2);
                casa = base;
            } else {
                casa = r2(base.subtract(comissao));
            }
        }

        List<String> nomes() {
            return linhas.stream().map(l -> l.produto() ? l.qtd() + "× " + l.nome() : l.nome()).toList();
        }
    }

    record Atendimento(UUID id, Instant inicio, Instant comissaoEm, String status, UUID clienteId, String nomeAvulso, UUID profissionalId, String origem, Map<UUID, Parte> partes) {
        Instant dataComissao() {
            return comissaoEm != null ? comissaoEm : inicio;
        }
    }

    record Pessoa(String nome, String papel) {
    }

    private Map<UUID, Pessoa> pessoas(JdbcTemplate jdbc) {
        Map<UUID, Pessoa> m = new HashMap<>();
        jdbc.query("select id, coalesce(nullif(apelido, ''), nome) as nome, papel from usuario",
                rs -> { m.put(rs.getObject("id", UUID.class), new Pessoa(rs.getString("nome"), rs.getString("papel"))); });
        return m;
    }

    private static Instant inst(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        OffsetDateTime o = rs.getObject(col, OffsetDateTime.class);
        return o == null ? null : o.toInstant();
    }

    /** Carrega os atendimentos que cumprem {@code onde} (condição sobre o alias {@code a} de agendamento) com as partes de cada beneficiário. */
    private List<Atendimento> carregar(JdbcTemplate jdbc, Map<UUID, Pessoa> quem, String onde, Object... args) {
        congelarPendentes(jdbc);
        Map<UUID, Atendimento> porId = new LinkedHashMap<>();
        String cab = "a.id, a.inicio, a.comissao_em, a.status, a.cliente_id, a.nome_avulso, a.profissional_id, a.origem";
        jdbc.query("select " + cab + ", s.nome, 1 as qtd, s.preco as base, s.comissao_pct as pct, s.comissao_pagamento_id, cp.em as paga_em, s.comissao_cancelada_motivo as canc, "
                        + "a.profissional_id as beneficiario, false as produto from agendamento_servico s join agendamento a on a.id = s.agendamento_id "
                        + "left join comissao_pagamento cp on cp.id = s.comissao_pagamento_id where " + onde + " order by a.inicio, a.id, s.ordem",
                rs -> { guardar(rs, porId, quem); }, args);
        jdbc.query("select " + cab + ", p.nome, p.qtd, round(p.preco * p.qtd, 2) as base, p.comissao_pct as pct, p.comissao_pagamento_id, cp.em as paga_em, p.comissao_cancelada_motivo as canc, "
                        + "p.vendedor_id as beneficiario, true as produto from agendamento_produto p join agendamento a on a.id = p.agendamento_id "
                        + "left join comissao_pagamento cp on cp.id = p.comissao_pagamento_id where " + onde + " order by a.inicio, a.id, lower(p.nome)",
                rs -> { guardar(rs, porId, quem); }, args);
        for (Atendimento a : porId.values()) a.partes().values().forEach(Parte::fechar);
        return new ArrayList<>(porId.values());
    }

    private void guardar(java.sql.ResultSet rs, Map<UUID, Atendimento> porId, Map<UUID, Pessoa> quem) throws java.sql.SQLException {
        UUID id = rs.getObject("id", UUID.class);
        Atendimento a = porId.computeIfAbsent(id, k -> {
            try {
                return new Atendimento(id, inst(rs, "inicio"), inst(rs, "comissao_em"), rs.getString("status"), rs.getObject("cliente_id", UUID.class), rs.getString("nome_avulso"),
                        rs.getObject("profissional_id", UUID.class), rs.getString("origem"), new LinkedHashMap<>());
            } catch (java.sql.SQLException e) {
                throw new IllegalStateException(e);
            }
        });
        UUID ben = rs.getObject("beneficiario", UUID.class);
        boolean produto = rs.getBoolean("produto");
        Pessoa p = quem.get(ben);
        BigDecimal pct = p != null && semComissao(p.papel()) ? CEM : rs.getBigDecimal("pct");
        if (pct == null) pct = BigDecimal.ZERO;
        a.partes().computeIfAbsent(ben, Parte::new).linhas.add(new Linha(rs.getString("nome"), rs.getInt("qtd"), rs.getBigDecimal("base"), pct,
                rs.getObject("comissao_pagamento_id", UUID.class), inst(rs, "paga_em"), rs.getString("canc"), produto));
    }

    // ---------------------------------------------------------------- congelar

    private BigDecimal geral(JdbcTemplate jdbc) {
        List<BigDecimal> v = jdbc.query("select comissao_padrao from configuracao_loja", (rs, i) -> rs.getBigDecimal(1));
        return v.isEmpty() ? null : v.get(0);
    }

    /** Grava o percentual das linhas de serviço que ainda não têm (atendimento novo ou anterior à V20), pelas regras de agora. */
    public void congelar(JdbcTemplate jdbc, UUID agendamentoId) {
        congelarLinhas(jdbc, agendamentoId);
    }

    private void congelarPendentes(JdbcTemplate jdbc) {
        congelarLinhas(jdbc, null);
    }

    private void congelarLinhas(JdbcTemplate jdbc, UUID agendamentoId) {
        record Pend(UUID ag, UUID servico, String papel, BigDecimal doFuncionario, BigDecimal doServico) {
        }
        List<Pend> pend = jdbc.query("select s.agendamento_id, s.servico_id, u.papel, u.comissao_pct as pf, sv.comissao_pct as ps from agendamento_servico s "
                        + "join agendamento a on a.id = s.agendamento_id join usuario u on u.id = a.profissional_id join servico sv on sv.id = s.servico_id "
                        + "where s.comissao_pct is null" + (agendamentoId == null ? "" : " and s.agendamento_id = ?"),
                (rs, i) -> new Pend(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getBigDecimal(4), rs.getBigDecimal(5)),
                agendamentoId == null ? new Object[0] : new Object[]{agendamentoId});
        if (pend.isEmpty()) return;
        BigDecimal geral = geral(jdbc);
        for (Pend p : pend) {
            jdbc.update("update agendamento_servico set comissao_pct = ? where agendamento_id = ? and servico_id = ?",
                    Comissao.percentual(geral, p.papel(), p.doFuncionario(), p.doServico()), p.ag(), p.servico());
        }
    }

    /** O atendimento é de um período em que alguém que participa dele já foi pago? Então a comissão entra no próximo pagamento. */
    public boolean periodoJaPago(JdbcTemplate jdbc, List<UUID> beneficiarios, Instant inicio) {
        for (UUID b : beneficiarios) {
            Boolean ja = jdbc.queryForObject("select exists (select 1 from comissao_pagamento where beneficiario_id = ? and de <= ? and ? < ate)",
                    Boolean.class, b, Timestamp.from(inicio), Timestamp.from(inicio));
            if (Boolean.TRUE.equals(ja)) return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- relatório do proprietário

    public record LinhaDono(UUID agendamentoId, Instant inicio, UUID clienteId, String nomeAvulso, List<String> servicos, BigDecimal base, BigDecimal comissao, BigDecimal casa,
                            boolean paga, Instant pagaEm, boolean cancelada, String motivoCancelada, BigDecimal comissaoOriginal) {
    }

    public record PessoaDono(UUID id, String nome, boolean semComissao, int atendimentos, BigDecimal base, BigDecimal comissao, BigDecimal casa, BigDecimal pago, BigDecimal aPagar,
                             List<LinhaDono> linhas) {
    }

    public record Totais(BigDecimal comissao, BigDecimal aPagar, BigDecimal pago, BigDecimal casa) {
    }

    public record RelatorioDono(LocalDate de, LocalDate ate, List<PessoaDono> profissionais, Totais totais) {
    }

    private static final String NO_PERIODO = "a.status = 'concluido' and coalesce(a.comissao_em, a.inicio) >= ? and coalesce(a.comissao_em, a.inicio) < ?";

    public RelatorioDono relatorio(Periodo per) {
        return banco.naLoja(jdbc -> {
            Map<UUID, Pessoa> quem = pessoas(jdbc);
            List<Atendimento> ags = carregar(jdbc, quem, NO_PERIODO, Timestamp.from(per.ini()), Timestamp.from(per.fim()));
            Map<UUID, List<LinhaDono>> linhas = new LinkedHashMap<>();
            Map<UUID, BigDecimal[]> soma = new LinkedHashMap<>(); // base, comissao, casa, pago, aPagar
            for (Atendimento a : ags) {
                for (Parte p : a.partes().values()) {
                    Pessoa u = quem.get(p.quem);
                    BigDecimal[] s = soma.computeIfAbsent(p.quem, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
                    s[0] = s[0].add(p.base);
                    s[1] = s[1].add(p.comissao);
                    s[2] = s[2].add(p.casa);
                    if (p.paga) s[3] = s[3].add(p.comissao);
                    else if (u == null || !semComissao(u.papel())) s[4] = s[4].add(p.comissao);
                    linhas.computeIfAbsent(p.quem, k -> new ArrayList<>()).add(new LinhaDono(a.id(), a.inicio(), a.clienteId(), a.nomeAvulso(), p.nomes(), p.base, p.comissao, p.casa, p.paga, p.pagaEm,
                            p.cancelada, p.cancelada ? p.motivo : null, p.cancelada ? p.original : null));
                }
            }
            List<PessoaDono> pessoasDono = new ArrayList<>();
            for (Map.Entry<UUID, BigDecimal[]> e : soma.entrySet()) {
                Pessoa u = quem.get(e.getKey());
                BigDecimal[] s = e.getValue();
                List<LinhaDono> l = linhas.get(e.getKey());
                pessoasDono.add(new PessoaDono(e.getKey(), u == null ? "—" : u.nome(), u != null && semComissao(u.papel()), l.size(), r2(s[0]), r2(s[1]), r2(s[2]), r2(s[3]), r2(s[4]), l));
            }
            pessoasDono.sort(Comparator.comparing(PessoaDono::comissao).reversed());
            BigDecimal comissao = BigDecimal.ZERO, aPagar = BigDecimal.ZERO, pago = BigDecimal.ZERO, casa = BigDecimal.ZERO;
            for (PessoaDono p : pessoasDono) {
                casa = casa.add(p.casa());
                if (!p.semComissao()) {
                    comissao = comissao.add(p.comissao());
                    aPagar = aPagar.add(p.aPagar());
                    pago = pago.add(p.pago());
                }
            }
            return new RelatorioDono(per.de(), per.ate(), pessoasDono, new Totais(r2(comissao), r2(aPagar), r2(pago), r2(casa)));
        });
    }

    // ---------------------------------------------------------------- "Meus ganhos": só o que a pessoa recebe

    public record LinhaMeu(UUID agendamentoId, Instant inicio, boolean local, UUID clienteId, String nomeAvulso, List<String> servicos, BigDecimal receber, boolean paga, Instant pagaEm,
                           boolean cancelada, String motivoCancelada) {
    }

    public record TotaisMeu(int atendimentos, BigDecimal receber, BigDecimal jaPago, BigDecimal aReceber) {
    }

    public record Previsto(int atendimentos, BigDecimal receber) {
    }

    public record RelatorioMeu(LocalDate de, LocalDate ate, List<LinhaMeu> linhas, TotaisMeu totais, Previsto previsto) {
    }

    public RelatorioMeu meu(Periodo per, UUID eu) {
        return banco.naLoja(jdbc -> {
            Map<UUID, Pessoa> quem = pessoas(jdbc);
            Timestamp ini = Timestamp.from(per.ini()), fim = Timestamp.from(per.fim());
            List<Atendimento> ags = carregar(jdbc, quem, "((" + NO_PERIODO + ") or (a.status in ('a_confirmar', 'confirmado') and a.inicio >= ? and a.inicio < ?))", ini, fim, ini, fim);
            List<LinhaMeu> linhas = new ArrayList<>();
            int previstos = 0;
            BigDecimal previsto = BigDecimal.ZERO;
            for (Atendimento a : ags) {
                Parte p = a.partes().get(eu);
                if (p == null) continue;
                if ("concluido".equals(a.status())) {
                    linhas.add(new LinhaMeu(a.id(), a.inicio(), "atendimento".equals(a.origem()), a.clienteId(), a.nomeAvulso(), p.nomes(), p.comissao, p.paga, p.pagaEm, p.cancelada,
                            p.cancelada ? p.motivo : null));
                } else {
                    previstos++;
                    previsto = previsto.add(p.comissao);
                }
            }
            linhas.sort(Comparator.comparing(LinhaMeu::inicio));
            BigDecimal receber = BigDecimal.ZERO, jaPago = BigDecimal.ZERO, aReceber = BigDecimal.ZERO;
            for (LinhaMeu l : linhas) {
                receber = receber.add(l.receber());
                if (l.paga()) jaPago = jaPago.add(l.receber());
                else aReceber = aReceber.add(l.receber());
            }
            return new RelatorioMeu(per.de(), per.ate(), linhas, new TotaisMeu(linhas.size(), r2(receber), r2(jaPago), r2(aReceber)), new Previsto(previstos, r2(previsto)));
        });
    }

    // ---------------------------------------------------------------- pagar

    public record Pagamento(UUID id, UUID profissionalId, LocalDate de, LocalDate ate, BigDecimal valor, int atendimentos, Instant em) {
    }

    /** Paga a comissão em aberto de uma pessoa no período: marca as linhas como pagas e guarda o pagamento (um por vez por pessoa: a linha do usuário fica travada). */
    public Pagamento pagar(UUID beneficiario, Periodo per, UUID autor, Instant agora) {
        Loja loja = LojaContext.exigir();
        return banco.naLoja(jdbc -> {
            List<String> papel = jdbc.query("select papel from usuario where id = ? and ativo for update", (rs, i) -> rs.getString(1), beneficiario);
            if (papel.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado.");
            if (semComissao(papel.get(0))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O proprietário não recebe comissão: o que ele atende já é dele.");
            Map<UUID, Pessoa> quem = pessoas(jdbc);
            List<Atendimento> ags = carregar(jdbc, quem, NO_PERIODO, Timestamp.from(per.ini()), Timestamp.from(per.fim()));
            List<UUID> abertos = new ArrayList<>();
            BigDecimal valor = BigDecimal.ZERO;
            for (Atendimento a : ags) {
                Parte p = a.partes().get(beneficiario);
                if (p == null || p.paga || p.cancelada) continue;
                abertos.add(a.id());
                valor = valor.add(p.comissao);
            }
            valor = r2(valor);
            if (abertos.isEmpty() || valor.signum() <= 0) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Não há comissão a pagar neste período para esse profissional.");
            UUID id = jdbc.queryForObject("insert into comissao_pagamento (loja_id, beneficiario_id, de, ate, valor, atendimentos, em, autor_id) values (?::uuid, ?, ?, ?, ?, ?, ?, ?) returning id",
                    UUID.class, loja.id().toString(), beneficiario, Timestamp.from(per.ini()), Timestamp.from(per.fim()), valor, abertos.size(), Timestamp.from(agora), autor);
            for (UUID ag : abertos) {
                jdbc.update("update agendamento_servico set comissao_pagamento_id = ? where agendamento_id = ? and comissao_pagamento_id is null and comissao_cancelada_motivo is null "
                        + "and exists (select 1 from agendamento a where a.id = agendamento_id and a.profissional_id = ?)", id, ag, beneficiario);
                jdbc.update("update agendamento_produto set comissao_pagamento_id = ? where agendamento_id = ? and vendedor_id = ? and comissao_pagamento_id is null and comissao_cancelada_motivo is null",
                        id, ag, beneficiario);
            }
            return new Pagamento(id, beneficiario, per.de(), per.ate(), valor, abertos.size(), agora);
        });
    }

    // ---------------------------------------------------------------- cancelar e restaurar

    private record Alvo(Atendimento atendimento, Parte parte) {
    }

    private Alvo alvo(JdbcTemplate jdbc, UUID agendamentoId, UUID quem) {
        Map<UUID, Pessoa> pessoas = pessoas(jdbc);
        List<Atendimento> achados = carregar(jdbc, pessoas, "a.id = ? and a.status <> 'cancelado'", agendamentoId);
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Agendamento não encontrado.");
        Atendimento a = achados.get(0);
        UUID alvo = quem != null ? quem : a.profissionalId();
        Parte p = a.partes().get(alvo);
        if (p == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Esse atendimento não tem comissão para essa pessoa.");
        Pessoa u = pessoas.get(alvo);
        if (u != null && semComissao(u.papel())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O proprietário não recebe comissão: o que ele atende já é dele.");
        return new Alvo(a, p);
    }

    private void marcar(JdbcTemplate jdbc, UUID agendamentoId, UUID alvo, String motivo, Instant agora, UUID autor) {
        Timestamp em = motivo == null ? null : Timestamp.from(agora);
        jdbc.update("update agendamento_servico set comissao_cancelada_motivo = ?, comissao_cancelada_em = ?, comissao_cancelada_por = ? where agendamento_id = ? "
                + "and exists (select 1 from agendamento a where a.id = agendamento_id and a.profissional_id = ?)", motivo, em, motivo == null ? null : autor, agendamentoId, alvo);
        jdbc.update("update agendamento_produto set comissao_cancelada_motivo = ?, comissao_cancelada_em = ?, comissao_cancelada_por = ? where agendamento_id = ? and vendedor_id = ?",
                motivo, em, motivo == null ? null : autor, agendamentoId, alvo);
    }

    private void historico(JdbcTemplate jdbc, UUID agendamentoId, UUID autor, String autorNome, String de, String para, Instant agora) {
        jdbc.update("insert into agendamento_evento (loja_id, agendamento_id, em, autor_id, autor_nome, campo, de, para) values (?::uuid, ?, ?, ?, ?, 'comissão', ?, ?)",
                LojaContext.exigir().id().toString(), agendamentoId, Timestamp.from(agora), autor, autorNome, de, para);
    }

    /** Só o proprietário. Motivo de 5 a 300 letras, no histórico. Comissão paga não se cancela. A parte da pessoa vira do estabelecimento. */
    public void cancelar(UUID agendamentoId, UUID quem, String motivo, UUID autor, String autorNome, Instant agora) {
        String m = br.com.agendz.validacao.Texto.limpar(motivo == null ? "" : motivo);
        banco.naLoja(jdbc -> {
            Alvo x = alvo(jdbc, agendamentoId, quem);
            if (x.parte().paga) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Comissão já paga: não dá para cancelar.");
            if (x.parte().cancelada) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A comissão já está cancelada.");
            if (m.length() < 5) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o motivo do cancelamento da comissão (pelo menos 5 letras).");
            if (m.length() > 300) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O motivo pode ter até 300 letras.");
            UUID alvo = quem != null ? quem : x.atendimento().profissionalId();
            marcar(jdbc, agendamentoId, alvo, m, agora, autor);
            historico(jdbc, agendamentoId, autor, autorNome, nomeDe(jdbc, alvo), "Cancelada: " + m, agora);
            return null;
        });
    }

    public void restaurar(UUID agendamentoId, UUID quem, UUID autor, String autorNome, Instant agora) {
        banco.naLoja(jdbc -> {
            Alvo x;
            try {
                x = alvo(jdbc, agendamentoId, quem);
            } catch (ErroDeNegocio e) {
                if (e.getMessage() != null && e.getMessage().startsWith("Esse atendimento não tem comissão")) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Não há comissão cancelada para restaurar.");
                throw e;
            }
            if (!x.parte().cancelada) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Não há comissão cancelada para restaurar.");
            UUID alvo = quem != null ? quem : x.atendimento().profissionalId();
            marcar(jdbc, agendamentoId, alvo, null, agora, autor);
            historico(jdbc, agendamentoId, autor, autorNome, "Cancelada: " + x.parte().motivo, "Restaurada (" + nomeDe(jdbc, alvo) + ")", agora);
            return null;
        });
    }

    private String nomeDe(JdbcTemplate jdbc, UUID id) {
        List<String> n = jdbc.query("select coalesce(nullif(apelido, ''), nome) from usuario where id = ?", (rs, i) -> rs.getString(1), id);
        return n.isEmpty() ? "—" : n.get(0);
    }
}
