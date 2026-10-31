package br.com.agendz.configuracao;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.servicos.OrdemDosServicos;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Regras do Atender (espelho de `estabelecimento.formaPagamentoPadrao` e `camposObrigatorios` na API simulada, mesmas mensagens):
 * a forma de pagamento padrão do atendimento local e os campos obrigatórios do agendamento futuro e do atendimento local.
 * GET /api/estabelecimento/regras-atendimento (quem usa a agenda), PUT (só o proprietário). Sem valor gravado valem os de fábrica.
 */
@RestController
public class RegrasAtendimento {

    public static final Set<String> FORMAS = Set.of("pix", "dinheiro", "cartao");
    public static final String FORMA_DE_FABRICA = "pix";
    /** Campos que o Atender pode exigir. A forma de pagamento só existe no atendimento local (o futuro ainda não foi pago). */
    public static final List<String> CAMPOS = List.of("nome", "telefone", "profissional", "vendedor", "formaPagamento", "veiculo", "placa", "modelo", "porte");
    public static final List<String> FUTURO_DE_FABRICA = List.of();
    public static final List<String> LOCAL_DE_FABRICA = List.of();

    public record Regras(String formaPagamentoPadrao, List<String> futuro, List<String> local, String ordemServicos, boolean profissionalAutomatico) {
    }

    public record Corpo(String formaPagamentoPadrao, Campos camposObrigatorios, String ordemServicos, Boolean profissionalAutomatico) {
    }

    public record Campos(List<String> futuro, List<String> local) {
    }

    private final LojaJdbc banco;

    public RegrasAtendimento(LojaJdbc banco) {
        this.banco = banco;
    }

    /** Regras efetivas da loja atual (dentro de uma transação já aberta). */
    public static Regras ler(JdbcTemplate jdbc) {
        List<String[]> linhas = jdbc.query("select forma_pagamento_padrao, campos_futuro, campos_local, ordem_servicos, profissional_automatico::text from configuracao_loja",
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)});
        if (linhas.isEmpty()) return new Regras(FORMA_DE_FABRICA, FUTURO_DE_FABRICA, LOCAL_DE_FABRICA, "uso", false);
        String[] l = linhas.get(0);
        return new Regras(l[0] == null ? FORMA_DE_FABRICA : l[0], l[1] == null ? FUTURO_DE_FABRICA : lista(l[1]), l[2] == null ? LOCAL_DE_FABRICA : lista(l[2]), OrdemDosServicos.MODOS.contains(l[3]) ? l[3] : "uso", "true".equals(l[4]));
    }

    private static List<String> lista(String s) {
        List<String> r = new ArrayList<>();
        for (String x : s.split(",")) if (CAMPOS.contains(x.trim())) r.add(x.trim());
        return r;
    }

    /** Forma que vale para um atendimento local: a escolhida ou o padrão. null = inválida; "" = sem padrão e nada escolhido. */
    public static String formaEfetiva(Regras r, String informada) {
        if (informada != null && !informada.isEmpty()) return FORMAS.contains(informada) ? informada : null;
        return FORMAS.contains(r.formaPagamentoPadrao()) ? r.formaPagamentoPadrao() : "";
    }

    @GetMapping("/api/estabelecimento/regras-atendimento")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'agenda')")
    public Regras obter() {
        return banco.naLoja(RegrasAtendimento::ler);
    }

    @PutMapping("/api/estabelecimento/regras-atendimento")
    @PreAuthorize("hasRole('DONO')")
    public Regras gravar(@RequestBody Corpo c) {
        Loja loja = LojaContext.exigir();
        if (c == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe as regras.");
        String forma = c.formaPagamentoPadrao();
        if (forma != null && !forma.isEmpty() && !FORMAS.contains(forma)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Forma de pagamento padrão inválida.");
        String ordem = c.ordemServicos();
        if (ordem != null && !OrdemDosServicos.MODOS.contains(ordem)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Ordem dos serviços inválida.");
        return banco.naLoja(jdbc -> {
            Regras atual = ler(jdbc);
            String novaOrdem = ordem == null ? atual.ordemServicos() : ordem;
            boolean novoAuto = c.profissionalAutomatico() == null ? atual.profissionalAutomatico() : c.profissionalAutomatico();
            String novaForma = forma == null ? atual.formaPagamentoPadrao() : forma;
            List<String> futuro = atual.futuro();
            List<String> local = atual.local();
            if (c.camposObrigatorios() != null) {
                futuro = conferir(c.camposObrigatorios().futuro(), true);
                local = conferir(c.camposObrigatorios().local(), false);
            }
            jdbc.update("insert into configuracao_loja (loja_id, forma_pagamento_padrao, campos_futuro, campos_local, ordem_servicos, profissional_automatico) values (?::uuid, ?, ?, ?, ?, ?) "
                            + "on conflict (loja_id) do update set forma_pagamento_padrao = excluded.forma_pagamento_padrao, campos_futuro = excluded.campos_futuro, "
                            + "campos_local = excluded.campos_local, ordem_servicos = excluded.ordem_servicos, profissional_automatico = excluded.profissional_automatico, atualizado_em = now()",
                    loja.id().toString(), novaForma, String.join(",", futuro), String.join(",", local), novaOrdem, novoAuto);
            return new Regras(novaForma, futuro, local, novaOrdem, novoAuto);
        });
    }

    private static List<String> conferir(List<String> campos, boolean futuro) {
        boolean ok = campos != null && campos.size() <= 9 && new LinkedHashSet<>(campos).size() == campos.size()
                && campos.stream().allMatch(x -> x != null && CAMPOS.contains(x) && !(futuro && x.equals("formaPagamento")));
        if (!ok) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Campos obrigatórios inválidos.");
        return List.copyOf(campos);
    }
}
