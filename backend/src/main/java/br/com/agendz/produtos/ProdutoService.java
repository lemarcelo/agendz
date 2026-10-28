package br.com.agendz.produtos;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
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
}
