package br.com.agendz.configuracao;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Link de agendamento do cliente (espelho de `estabelecimento.linkAgendamento` na API simulada): a loja liga/desliga o link e escolhe até quantos dias à frente
 * ele oferece horário (1 a 60, padrão 30). GET/PUT /api/estabelecimento/link-agendamento, só o proprietário. Sem linha gravada vale o padrão (ligado).
 * `disponivel` é falso para o tipo que ainda não agenda pelo link (estética precisa de veículo e porte: fatia seguinte); o link fica fora do ar mesmo ligado.
 */
@RestController
public class LinkAgendamento {

    public static final int DIAS_PADRAO = 30;
    public static final int DIAS_MAXIMO = 60;

    public record Config(boolean ativo, int diasMax) {
    }

    public record Resposta(boolean ativo, int diasMax, boolean disponivel) {
    }

    public record Corpo(Boolean ativo, Integer diasMax) {
    }

    private final LojaJdbc banco;

    public LinkAgendamento(LojaJdbc banco) {
        this.banco = banco;
    }

    /** O tipo agenda pelo link nesta fatia? (estética automotiva precisa de veículo e porte, que o link real ainda não pede.) */
    public static boolean tipoSuportado(Loja loja) {
        return !"estetica_automotiva".equals(loja.tipo());
    }

    /** Configuração gravada da loja atual (dentro de uma transação já aberta). */
    public static Config ler(JdbcTemplate jdbc) {
        List<Config> l = jdbc.query("select link_ativo, link_dias_max from configuracao_loja", (rs, i) -> new Config(rs.getBoolean(1), rs.getInt(2)));
        return l.isEmpty() ? new Config(true, DIAS_PADRAO) : l.get(0);
    }

    @GetMapping("/api/estabelecimento/link-agendamento")
    @PreAuthorize("hasRole('DONO')")
    public Resposta obter() {
        Loja loja = LojaContext.exigir();
        Config c = banco.naLoja(LinkAgendamento::ler);
        return new Resposta(c.ativo(), c.diasMax(), tipoSuportado(loja));
    }

    @PutMapping("/api/estabelecimento/link-agendamento")
    @PreAuthorize("hasRole('DONO')")
    public Resposta gravar(@RequestBody Corpo c) {
        Loja loja = LojaContext.exigir();
        if (c == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe a configuração do link.");
        if (c.diasMax() != null && (c.diasMax() < 1 || c.diasMax() > DIAS_MAXIMO)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe de 1 a " + DIAS_MAXIMO + " dias.");
        Config nova = banco.naLoja(jdbc -> {
            Config atual = ler(jdbc);
            Config n = new Config(c.ativo() == null ? atual.ativo() : c.ativo(), c.diasMax() == null ? atual.diasMax() : c.diasMax());
            jdbc.update("insert into configuracao_loja (loja_id, link_ativo, link_dias_max) values (?::uuid, ?, ?) "
                            + "on conflict (loja_id) do update set link_ativo = excluded.link_ativo, link_dias_max = excluded.link_dias_max, atualizado_em = now()",
                    loja.id().toString(), n.ativo(), n.diasMax());
            return n;
        });
        return new Resposta(nova.ativo(), nova.diasMax(), tipoSuportado(loja));
    }
}
