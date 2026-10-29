package br.com.agendz.produtos;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Produtos à venda (espelho de `estoque.salvarMaterial` e `estoque.removerMaterial` com `tipo: 'produto'` em src/services/api.js, com as mesmas mensagens).
 * O nome é único na loja; o código é automático (próximo número) e editável, único entre os produtos. Comissão do produto: só o proprietário define.
 * O estoque inicial só entra na criação; a baixa pela venda e o histórico de movimentos chegam com o Atender (5d-4) e o módulo de estoque.
 */
@Service
public class ProdutoService {

    private static final BigDecimal TETO_PRECO = new BigDecimal("100000");
    private static final BigDecimal CEM = new BigDecimal("100");
    private static final BigDecimal TETO_ESTOQUE = new BigDecimal("1000000000");
    private static final String COLUNAS = "id, codigo, nome, unidade, preco, comissao_pct, estoque, minimo, custo, ativo";

    /** Visão completa (proprietário). Quem só vende recebe `Produto.paraVendedor()`: sem comissão, custo, mínimo nem estoque exato. */
    public record Produto(UUID id, String codigo, String nome, String unidade, BigDecimal preco, BigDecimal comissaoPct, BigDecimal estoque, BigDecimal minimo,
                          BigDecimal custo, boolean ativo) {
        public Produto paraVendedor() {
            return new Produto(id, codigo, nome, unidade, preco, null, estoque, null, null, ativo);
        }
    }

    /** Corpo de POST/PUT. Os limites daqui só barram corpo gigante; as mensagens de cada regra saem de {@link #validar}. */
    public record Dados(@Size(max = 500) String nome, @Size(max = 60) String codigo, @Size(max = 100) String unidade, BigDecimal preco, BigDecimal comissaoPct,
                        BigDecimal estoque, BigDecimal minimo, BigDecimal custo, Boolean ativo) {
    }

    public record Remocao(boolean desativado) {
    }

    /** Uma linha do histórico de estoque. `delta` positivo entrou, negativo saiu; `saldo` é o estoque depois do movimento. `autor` é o nome de quem fez (nulo = o sistema). */
    public record Movimento(UUID id, Instant em, String tipo, BigDecimal delta, BigDecimal saldo, String obs, String autor, UUID agendamentoId) {
    }

    /** Corpo de POST /api/produtos/{id}/movimentos: `entrada` e `saida` somam ou tiram `qtd`; `ajuste` diz o estoque certo (contagem) e o servidor calcula a diferença. */
    public record MovimentoDados(@Size(max = 20) String tipo, BigDecimal qtd, @Size(max = 500) String obs) {
    }

    private static final class Validado {
        String nome, codigo, unidade;
        BigDecimal preco, comissao, estoque, minimo, custo;
        boolean comissaoVeio;
        Boolean ativo;
    }

    private final LojaJdbc banco;

    public ProdutoService(LojaJdbc banco) {
        this.banco = banco;
    }

    // ---------- leitura ----------

    public List<Produto> listar(boolean gerente) {
        return banco.naLoja(jdbc -> jdbc.query("select " + COLUNAS + " from material where tipo = 'produto'" + (gerente ? "" : " and ativo") + " order by lower(nome), id limit 500",
                (rs, i) -> linha(rs)));
    }

    public Produto obter(UUID id, boolean gerente) {
        Produto p = banco.naLoja(jdbc -> buscar(jdbc, id));
        if (p == null || (!p.ativo() && !gerente)) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Material não encontrado.");
        return p;
    }

    // ---------- escrita ----------

    public Produto criar(Dados d, boolean donoDefine) {
        Loja loja = LojaContext.exigir();
        Validado v = validar(d, true);
        try {
            return banco.naLoja(jdbc -> {
                conferirNome(jdbc, v.nome, null);
                String codigo = codigoFinal(jdbc, v.codigo, null);
                BigDecimal comissao = donoDefine ? v.comissao : null;
                UUID id = jdbc.queryForObject(
                        "insert into material (loja_id, tipo, codigo, nome, unidade, preco, comissao_pct, estoque, minimo, custo, ativo) "
                                + "values (?::uuid, 'produto', ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                        UUID.class, loja.id().toString(), codigo, v.nome, v.unidade, v.preco, comissao, v.estoque, v.minimo, v.custo, v.ativo == null || v.ativo);
                return buscar(jdbc, id);
            });
        } catch (DuplicateKeyException ex) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe um material com esse nome ou código. Tente de novo.");
        }
    }

    /**
     * Cria dentro de uma transação já aberta (assistente de início, 5d-3). Mesmas regras de {@link #criar}, com o dono definindo a comissão.
     * Nome que já existe na loja (sem diferenciar maiúsculas) não é erro: devolve {@code null} e nada é criado.
     */
    public Produto criarSeNovo(JdbcTemplate jdbc, Dados d) {
        Loja loja = LojaContext.exigir();
        Validado v = validar(d, true);
        Integer repetidos = jdbc.queryForObject("select count(*) from material where lower(nome) = lower(?)", Integer.class, v.nome);
        if (repetidos != null && repetidos > 0) return null;
        String codigo = codigoFinal(jdbc, v.codigo, null);
        UUID id = jdbc.queryForObject(
                "insert into material (loja_id, tipo, codigo, nome, unidade, preco, comissao_pct, estoque, minimo, custo, ativo) "
                        + "values (?::uuid, 'produto', ?, ?, ?, ?, ?, ?, ?, ?, true) returning id",
                UUID.class, loja.id().toString(), codigo, v.nome, v.unidade, v.preco, v.comissao, v.estoque, v.minimo, v.custo);
        return buscar(jdbc, id);
    }

    public Produto alterar(UUID id, Dados d, boolean donoDefine) {
        Validado v = validar(d, false);
        try {
            return banco.naLoja(jdbc -> {
                Produto atual = buscar(jdbc, id);
                if (atual == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Material não encontrado.");
                conferirNome(jdbc, v.nome, id);
                String codigo = codigoFinal(jdbc, v.codigo, id);
                // Comissão: só o proprietário muda; quem não é dono mantém o que já existe. Vazio ou 0 do dono = sem comissão.
                boolean trocaComissao = donoDefine && v.comissaoVeio;
                jdbc.update("update material set codigo = ?, nome = ?, unidade = ?, preco = ?, comissao_pct = case when ? then ? else comissao_pct end, "
                                + "minimo = coalesce(?, minimo), custo = coalesce(?, custo), ativo = coalesce(?, ativo) where id = ? and tipo = 'produto'",
                        codigo, v.nome, v.unidade, v.preco, trocaComissao, v.comissao, v.minimo, v.custo, v.ativo, id);
                return buscar(jdbc, id);
            });
        } catch (DuplicateKeyException ex) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe um material com esse nome ou código. Tente de novo.");
        }
    }

    /** Nunca usado: apaga. Com histórico de venda ou de estoque: só desativa (o Atender real e o estoque contam desde a V19). */
    public Remocao remover(UUID id) {
        return banco.naLoja(jdbc -> {
            if (buscar(jdbc, id) == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Material não encontrado.");
            if (emUso(jdbc, id)) {
                jdbc.update("update material set ativo = false where id = ?", id);
                return new Remocao(true);
            }
            jdbc.update("delete from material where id = ?", id);
            return new Remocao(false);
        });
    }

    // ---------- regras ----------

    /** Produto que já foi vendido ou movimentou o estoque não se apaga (só se desativa): o histórico e a comissão dependem dele. */
    private boolean emUso(JdbcTemplate jdbc, UUID id) {
        Boolean usado = jdbc.queryForObject("select exists (select 1 from agendamento_produto where material_id = ?) or exists (select 1 from movimento_estoque where material_id = ?)", Boolean.class, id, id);
        return Boolean.TRUE.equals(usado);
    }

    private Validado validar(Dados d, boolean criacao) {
        Validado v = new Validado();
        String bruto = d.nome() == null ? "" : d.nome();
        String nome = Texto.limpar(bruto);
        if (nome.isEmpty()) throw ruim("Informe o nome do material.");
        // (a conferência de nome repetido acontece em conferirNome, depois desta)
        if (bruto.length() > 100 || (d.unidade() != null && d.unidade().length() > 20)) throw ruim("Nome ou unidade inválidos.");
        v.nome = nome;
        String un = d.unidade() == null ? "" : Texto.limpar(d.unidade());
        v.unidade = un.isEmpty() ? "un" : un;
        if (d.preco() == null || d.preco().signum() < 0 || d.preco().compareTo(TETO_PRECO) > 0) throw ruim("Informe o preço de venda do produto.");
        v.preco = d.preco().setScale(2, RoundingMode.HALF_UP);
        if (d.comissaoPct() != null) {
            if (d.comissaoPct().signum() < 0 || d.comissaoPct().compareTo(CEM) > 0) throw ruim("A comissão vai de 0 a 100%.");
            BigDecimal c = d.comissaoPct().setScale(2, RoundingMode.HALF_UP);
            v.comissao = c.signum() > 0 ? c : null;
        }
        v.comissaoVeio = true; // o campo "vazio" também é uma escolha do dono (tirar a comissão); quem decide se vale é o papel
        for (BigDecimal n : new BigDecimal[]{d.estoque(), d.minimo(), d.custo()}) {
            if (n != null && (n.signum() < 0 || n.compareTo(TETO_ESTOQUE) > 0)) throw ruim("Valores de estoque e custo não podem ser negativos nem inválidos.");
        }
        v.estoque = criacao && d.estoque() != null ? d.estoque() : BigDecimal.ZERO;
        v.minimo = d.minimo();
        v.custo = d.custo() == null ? null : d.custo().setScale(2, RoundingMode.HALF_UP);
        if (criacao) {
            if (v.minimo == null) v.minimo = BigDecimal.ZERO;
            if (v.custo == null) v.custo = BigDecimal.ZERO;
        }
        v.ativo = d.ativo();
        if (d.codigo() != null && !d.codigo().isBlank()) {
            String c = Texto.limpar(d.codigo());
            if (!c.matches("^[A-Za-z0-9._-]{1,20}$")) throw ruim("Código inválido: use até 20 letras, números, ponto, hífen ou sublinhado.");
            v.codigo = c;
        }
        return v;
    }

    private void conferirNome(JdbcTemplate jdbc, String nome, UUID id) {
        Integer repetidos = id == null
                ? jdbc.queryForObject("select count(*) from material where lower(nome) = lower(?)", Integer.class, nome)
                : jdbc.queryForObject("select count(*) from material where lower(nome) = lower(?) and id <> ?", Integer.class, nome, id);
        if (repetidos != null && repetidos > 0) throw ruim("Já existe um material com esse nome.");
    }

    /** Código vazio = o próximo número (criando) ou o que já tinha (editando); informado = único entre os produtos da loja. */
    private String codigoFinal(JdbcTemplate jdbc, String informado, UUID id) {
        if (informado == null) {
            if (id != null) {
                String atual = jdbc.queryForObject("select codigo from material where id = ?", String.class, id);
                if (atual != null && !atual.isBlank()) return atual;
            }
            return jdbc.queryForObject("select (coalesce(max(case when codigo ~ '^[0-9]{1,9}$' then codigo::int end), 0) + 1)::text from material where tipo = 'produto'", String.class);
        }
        Integer repetidos = id == null
                ? jdbc.queryForObject("select count(*) from material where tipo = 'produto' and lower(codigo) = lower(?)", Integer.class, informado)
                : jdbc.queryForObject("select count(*) from material where tipo = 'produto' and lower(codigo) = lower(?) and id <> ?", Integer.class, informado, id);
        if (repetidos != null && repetidos > 0) throw ruim("Já existe produto com o código " + informado + ".");
        return informado;
    }

    private Produto buscar(JdbcTemplate jdbc, UUID id) {
        List<Produto> achados = jdbc.query("select " + COLUNAS + " from material where id = ? and tipo = 'produto'", (rs, i) -> linha(rs), id);
        return achados.isEmpty() ? null : achados.get(0);
    }

    private static Produto linha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Produto(rs.getObject("id", UUID.class), rs.getString("codigo"), rs.getString("nome"), rs.getString("unidade"), rs.getBigDecimal("preco"),
                rs.getBigDecimal("comissao_pct"), rs.getBigDecimal("estoque"), rs.getBigDecimal("minimo"), rs.getBigDecimal("custo"), rs.getBoolean("ativo"));
    }

    private static ErroDeNegocio ruim(String mensagem) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, mensagem);
    }

    // ---------- movimentos de estoque (entrada, saída e contagem feitas à mão; a venda baixa sozinha em EstoqueDaVenda) ----------

    /** Últimos 100 movimentos do produto, do mais novo ao mais antigo. */
    public List<Movimento> movimentos(UUID id) {
        return banco.naLoja(jdbc -> {
            if (buscar(jdbc, id) == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Material não encontrado.");
            return jdbc.query("select m.id, m.em, m.tipo, m.delta, m.saldo, m.obs, m.agendamento_id, u.nome as autor from movimento_estoque m left join usuario u on u.id = m.autor_id "
                            + "where m.material_id = ? order by m.em desc, m.id desc limit 100",
                    (rs, i) -> new Movimento(rs.getObject("id", UUID.class), rs.getTimestamp("em").toInstant(), rs.getString("tipo"), rs.getBigDecimal("delta"), rs.getBigDecimal("saldo"),
                            rs.getString("obs"), rs.getString("autor"), rs.getObject("agendamento_id", UUID.class)), id);
        });
    }

    /**
     * Entrada, saída ou contagem. Quantidade positiva e finita (contagem pode ser 0); saída e contagem pedem o motivo (3 a 200 letras); saída nunca deixa o
     * estoque negativo. A linha do movimento e a mudança do saldo gravam na mesma transação, com a linha do produto travada (duas saídas ao mesmo tempo não furam o saldo).
     */
    public Movimento movimentar(UUID id, MovimentoDados d, UUID autorId, Instant agora) {
        Loja loja = LojaContext.exigir();
        String tipo = d.tipo() == null ? "" : d.tipo().trim();
        if (!List.of("entrada", "saida", "ajuste").contains(tipo)) throw ruim("Escolha entrada, saída ou contagem.");
        BigDecimal qtd = d.qtd();
        if (qtd == null || qtd.signum() < 0 || qtd.compareTo(TETO_ESTOQUE) > 0 || (qtd.signum() == 0 && !tipo.equals("ajuste"))) throw ruim("Informe uma quantidade válida.");
        qtd = qtd.setScale(3, RoundingMode.HALF_UP);
        String obs = d.obs() == null ? "" : Texto.limpar(d.obs());
        if (obs.length() > 200) throw ruim("O motivo pode ter até 200 letras.");
        if (!tipo.equals("entrada") && obs.length() < 3) throw ruim("Informe o motivo (pelo menos 3 letras).");
        final BigDecimal quantidade = qtd;
        return banco.naLoja(jdbc -> {
            List<BigDecimal> atual = jdbc.query("select estoque from material where id = ? and tipo = 'produto' for update", (rs, i) -> rs.getBigDecimal(1), id);
            if (atual.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Material não encontrado.");
            BigDecimal antes = atual.get(0);
            BigDecimal delta = switch (tipo) {
                case "entrada" -> quantidade;
                case "saida" -> quantidade.negate();
                default -> quantidade.subtract(antes);
            };
            BigDecimal saldo = antes.add(delta);
            if (saldo.signum() < 0) throw ruim("Estoque insuficiente: há " + antes.stripTrailingZeros().toPlainString() + " em estoque.");
            if (delta.signum() == 0) throw ruim("O estoque já está com essa quantidade.");
            jdbc.update("update material set estoque = ? where id = ?", saldo, id);
            UUID mov = jdbc.queryForObject("insert into movimento_estoque (loja_id, material_id, em, tipo, delta, saldo, obs, autor_id) values (?::uuid, ?, ?, ?, ?, ?, ?, ?) returning id",
                    UUID.class, loja.id().toString(), id, OffsetDateTime.ofInstant(agora, ZoneOffset.UTC), tipo, delta, saldo, obs.isEmpty() ? null : obs, autorId);
            String autor = autorId == null ? null : jdbc.query("select nome from usuario where id = ?", (rs, i) -> rs.getString(1), autorId).stream().findFirst().orElse(null);
            return new Movimento(mov, agora, tipo, delta, saldo, obs.isEmpty() ? null : obs, autor, null);
        });
    }
}
