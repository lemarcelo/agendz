package br.com.agendz.comissao;

import java.math.BigDecimal;

/**
 * Percentual da comissão de um atendimento (v91). Ordem, do mais geral ao mais específico (o específico vence): estabelecimento → funcionário → serviço.
 * Vazio (null) = herdar do nível de cima; 0 = sem comissão. Proprietário e master que atendem ficam com 100% a menos que tenham percentual próprio.
 * Espelho de {@code pctComissao} em src/domain/rules.js; os dois rodam os mesmos casos de equivalencia/comissao.json.
 */
public final class Comissao {

    public static final BigDecimal PADRAO = new BigDecimal("50");
    private static final BigDecimal CEM = new BigDecimal("100");

    private Comissao() {
    }

    /** Percentual válido = de 0 a 100; qualquer outro valor (ou nulo) é ignorado. */
    public static boolean valido(BigDecimal pct) {
        return pct != null && pct.signum() >= 0 && pct.compareTo(CEM) <= 0;
    }

    /**
     * @param padraoDoEstabelecimento comissão geral da loja (nula = 50)
     * @param papelDoProfissional     papel de quem atende (dono, master, profissional, atendente...)
     * @param pctDoFuncionario        percentual próprio do funcionário (nulo = usar o geral)
     * @param pctDoServico            percentual próprio do serviço (nulo = herdar)
     */
    public static BigDecimal percentual(BigDecimal padraoDoEstabelecimento, String papelDoProfissional, BigDecimal pctDoFuncionario, BigDecimal pctDoServico) {
        boolean proprio = valido(pctDoFuncionario);
        boolean proprietario = "dono".equals(papelDoProfissional) || "master".equals(papelDoProfissional);
        if (proprietario && !proprio) return CEM;
        if (valido(pctDoServico)) return pctDoServico;
        if (proprio) return pctDoFuncionario;
        return valido(padraoDoEstabelecimento) ? padraoDoEstabelecimento : PADRAO;
    }
}
