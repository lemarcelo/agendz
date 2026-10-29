package br.com.agendz.relatorio;

import br.com.agendz.comissao.ComissaoService.Periodo;
import br.com.agendz.escala.Fuso;
import br.com.agendz.tenant.LojaJdbc;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Relatório do período (só o proprietário; espelho de `relatorioMensal` em src/domain/reports.js, sem custo de material). Conta o que foi CONCLUÍDO no
 * período (pelo início do atendimento, no fuso da loja): serviços com o desconto do cupom já abatido + produtos vendidos. Os valores vêm das linhas
 * congeladas (preço e desconto na hora do atendimento), nunca do cadastro de hoje. O previsto soma o que ainda está a confirmar ou confirmado.
 * Tudo roda em {@code LojaJdbc.naLoja} (RLS: só a loja do endereço).
 */
@Service
public class RelatorioService {

    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);

    public record Totais(int atendimentos, BigDecimal servicos, BigDecimal descontos, BigDecimal produtos, BigDecimal total, BigDecimal ticketMedio) {
    }

    public record Previsto(int atendimentos, BigDecimal total) {
    }

    public record PorProfissional(UUID id, String nome, int atendimentos, BigDecimal servicos, BigDecimal produtos, BigDecimal total) {
    }

    public record PorItem(String nome, int qtd, BigDecimal valor) {
    }

    public record PorForma(String forma, int atendimentos, BigDecimal total) {
    }

    public record PorDia(LocalDate dia, int atendimentos, BigDecimal total) {
    }

    public record Relatorio(LocalDate de, LocalDate ate, Totais totais, Previsto previsto, List<PorProfissional> porProfissional, List<PorItem> porServico,
                            List<PorItem> porProduto, List<PorForma> porForma, List<PorDia> porDia) {
    }

    private record Linha(UUID profissional, java.time.Instant inicio, String forma, BigDecimal servicos, BigDecimal descontos, BigDecimal produtos) {
    }

    private final LojaJdbc banco;

    public RelatorioService(LojaJdbc banco) {
        this.banco = banco;
    }

    private static BigDecimal r2(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    public Relatorio gerar(Periodo per) {
        return banco.naLoja(jdbc -> {
            List<Linha> linhas = jdbc.query(
                    "select a.profissional_id, a.inicio, a.forma_pagamento, "
                            + "coalesce((select sum(s.preco - s.desconto) from agendamento_servico s where s.agendamento_id = a.id), 0) as servicos, "
                            + "coalesce((select sum(s.desconto) from agendamento_servico s where s.agendamento_id = a.id), 0) as descontos, "
                            + "coalesce((select sum(round(p.preco * p.qtd, 2)) from agendamento_produto p where p.agendamento_id = a.id), 0) as produtos "
                            + "from agendamento a where a.status = 'concluido' and a.inicio >= ? and a.inicio < ? order by a.inicio",
                    (rs, i) -> new Linha(rs.getObject("profissional_id", UUID.class), rs.getTimestamp("inicio").toInstant(), rs.getString("forma_pagamento"),
                            rs.getBigDecimal("servicos"), rs.getBigDecimal("descontos"), rs.getBigDecimal("produtos")),
                    java.sql.Timestamp.from(per.ini()), java.sql.Timestamp.from(per.fim()));

            Map<UUID, String> nomes = new HashMap<>();
            jdbc.query("select id, coalesce(nullif(apelido, ''), nome) as nome from usuario", rs -> {
                nomes.put(rs.getObject("id", UUID.class), rs.getString("nome"));
            });

            BigDecimal servicos = ZERO, descontos = ZERO, produtos = ZERO;
            Map<UUID, BigDecimal[]> prof = new LinkedHashMap<>(); // [servicos, produtos, atendimentos]
            Map<String, BigDecimal[]> forma = new LinkedHashMap<>(); // [total, atendimentos]
            Map<LocalDate, BigDecimal[]> dia = new LinkedHashMap<>();
            for (Linha l : linhas) {
                BigDecimal total = l.servicos().add(l.produtos());
                servicos = servicos.add(l.servicos());
                descontos = descontos.add(l.descontos());
                produtos = produtos.add(l.produtos());
                BigDecimal[] p = prof.computeIfAbsent(l.profissional(), k -> new BigDecimal[]{ZERO, ZERO, BigDecimal.ZERO});
                p[0] = p[0].add(l.servicos()); p[1] = p[1].add(l.produtos()); p[2] = p[2].add(BigDecimal.ONE);
                BigDecimal[] f = forma.computeIfAbsent(l.forma() == null ? "" : l.forma(), k -> new BigDecimal[]{ZERO, BigDecimal.ZERO});
                f[0] = f[0].add(total); f[1] = f[1].add(BigDecimal.ONE);
                BigDecimal[] d = dia.computeIfAbsent(l.inicio().atZone(Fuso.BRASIL).toLocalDate(), k -> new BigDecimal[]{ZERO, BigDecimal.ZERO});
                d[0] = d[0].add(total); d[1] = d[1].add(BigDecimal.ONE);
            }
            BigDecimal total = servicos.add(produtos);
            int n = linhas.size();
            Totais totais = new Totais(n, r2(servicos), r2(descontos), r2(produtos), r2(total), n == 0 ? ZERO : total.divide(BigDecimal.valueOf(n), 2, RoundingMode.HALF_UP));

            List<PorProfissional> porProf = new ArrayList<>();
            prof.forEach((id, v) -> porProf.add(new PorProfissional(id, nomes.getOrDefault(id, "—"), v[2].intValue(), r2(v[0]), r2(v[1]), r2(v[0].add(v[1])))));
            porProf.sort(Comparator.comparing(PorProfissional::total).reversed());
            List<PorForma> porForma = new ArrayList<>();
            forma.forEach((k, v) -> porForma.add(new PorForma(k.isEmpty() ? "nao_informada" : k, v[1].intValue(), r2(v[0]))));
            porForma.sort(Comparator.comparing(PorForma::total).reversed());
            List<PorDia> porDia = new ArrayList<>();
            dia.forEach((k, v) -> porDia.add(new PorDia(k, v[1].intValue(), r2(v[0]))));

            List<PorItem> porServico = jdbc.query(
                    "select s.nome, count(*) as qtd, coalesce(sum(s.preco - s.desconto), 0) as valor from agendamento_servico s join agendamento a on a.id = s.agendamento_id "
                            + "where a.status = 'concluido' and a.inicio >= ? and a.inicio < ? group by s.nome order by count(*) desc, s.nome limit 200",
                    (rs, i) -> new PorItem(rs.getString("nome"), rs.getInt("qtd"), r2(rs.getBigDecimal("valor"))), java.sql.Timestamp.from(per.ini()), java.sql.Timestamp.from(per.fim()));
            List<PorItem> porProduto = jdbc.query(
                    "select p.nome, coalesce(sum(p.qtd), 0) as qtd, coalesce(sum(round(p.preco * p.qtd, 2)), 0) as valor from agendamento_produto p join agendamento a on a.id = p.agendamento_id "
                            + "where a.status = 'concluido' and a.inicio >= ? and a.inicio < ? group by p.nome order by sum(p.qtd) desc, p.nome limit 200",
                    (rs, i) -> new PorItem(rs.getString("nome"), rs.getInt("qtd"), r2(rs.getBigDecimal("valor"))), java.sql.Timestamp.from(per.ini()), java.sql.Timestamp.from(per.fim()));

            Previsto previsto = jdbc.queryForObject(
                    "select count(*) as n, coalesce(sum(total), 0) as t from agendamento where status in ('a_confirmar', 'confirmado') and inicio >= ? and inicio < ?",
                    (rs, i) -> new Previsto(rs.getInt("n"), r2(rs.getBigDecimal("t"))), java.sql.Timestamp.from(per.ini()), java.sql.Timestamp.from(per.fim()));
            return new Relatorio(per.de(), per.ate(), totais, previsto, porProf, porServico, porProduto, porForma, porDia);
        });
    }
}
