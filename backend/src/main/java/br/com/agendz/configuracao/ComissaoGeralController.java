package br.com.agendz.configuracao;

import br.com.agendz.comissao.Comissao;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Comissão geral do estabelecimento (a última da ordem serviço > funcionário > estabelecimento): GET/PUT /api/estabelecimento/comissao, só o proprietário.
 * Sem valor gravado, vale 50% (`Comissao.PADRAO`). Espelho de `estabelecimento.salvar({ comissaoPadrao })` na API simulada (mesma mensagem).
 */
@RestController
@PreAuthorize("hasRole('DONO')")
public class ComissaoGeralController {

    public record Geral(BigDecimal comissaoPadrao, Boolean comissaoParceiro) {
        public Geral(BigDecimal comissaoPadrao) {
            this(comissaoPadrao, false);
        }
    }

    private final LojaJdbc banco;

    public ComissaoGeralController(LojaJdbc banco) {
        this.banco = banco;
    }

    /** Valor efetivo da comissão geral da loja atual (também usado pelo cálculo da comissão nos atendimentos). */
    public static BigDecimal efetiva(LojaJdbc banco) {
        List<BigDecimal> v = banco.naLoja(jdbc -> jdbc.query("select comissao_padrao from configuracao_loja", (rs, i) -> rs.getBigDecimal(1)));
        return v.isEmpty() || !Comissao.valido(v.get(0)) ? Comissao.PADRAO : v.get(0);
    }

    /** Se atendimentos de parceiros geram comissão para os profissionais. */
    public static boolean comissaoParceiro(LojaJdbc banco) {
        List<Boolean> v = banco.naLoja(jdbc -> jdbc.query("select comissao_parceiro from configuracao_loja", (rs, i) -> rs.getBoolean(1)));
        return !v.isEmpty() && Boolean.TRUE.equals(v.get(0));
    }

    @GetMapping("/api/estabelecimento/comissao")
    public Geral ler() {
        return new Geral(efetiva(banco), comissaoParceiro(banco));
    }

    @PutMapping("/api/estabelecimento/comissao")
    public Geral gravar(@RequestBody Geral corpo) {
        Loja loja = LojaContext.exigir();
        BigDecimal v = corpo == null ? null : corpo.comissaoPadrao();
        Boolean cp = corpo == null ? null : corpo.comissaoParceiro();
        if (v != null && !Comissao.valido(v)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A comissão padrão vai de 0 a 100%.");
        BigDecimal arredondado = v != null ? v.setScale(2, RoundingMode.HALF_UP) : null;
        banco.naLoja(jdbc -> jdbc.update("insert into configuracao_loja (loja_id, comissao_padrao, comissao_parceiro) values (?::uuid, coalesce(?, 50), coalesce(?, false)) "
                + "on conflict (loja_id) do update set comissao_padrao = coalesce(?, configuracao_loja.comissao_padrao), "
                + "comissao_parceiro = coalesce(?, configuracao_loja.comissao_parceiro), atualizado_em = now()",
                loja.id().toString(), arredondado, cp, arredondado, cp));
        return new Geral(efetiva(banco), comissaoParceiro(banco));
    }
}
