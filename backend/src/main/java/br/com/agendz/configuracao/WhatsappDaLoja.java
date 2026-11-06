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
 * WhatsApp do estabelecimento (V60, `configuracao_loja.whatsapp_loja`): 55 + DDD + número, só dígitos, opcional.
 * É o destino do botão "Combinar agendamento" quando o serviço não tem ninguém com telefone para combinar, e o da troca de plano quando o dela está vazio.
 * GET/PUT /api/estabelecimento/whatsapp. Quem edita: o proprietário ou quem tem a seção `estabelecimento`. A página pública só recebe o número já escolhido por serviço.
 */
@RestController
public class WhatsappDaLoja {

    public record Corpo(String whatsapp) {
    }

    public record Resposta(String whatsapp) {
    }

    private final LojaJdbc banco;

    public WhatsappDaLoja(LojaJdbc banco) {
        this.banco = banco;
    }

    /** Número gravado (null = não informado), dentro de uma transação já aberta. */
    public static String ler(JdbcTemplate jdbc) {
        List<String> l = jdbc.query("select whatsapp_loja from configuracao_loja", (rs, i) -> rs.getString(1));
        return l.isEmpty() ? null : l.get(0);
    }

    /** Só dígitos; vazio = sem número. Aceita com ou sem o 55 (10 ou 11 dígitos ganham o 55). */
    public static String normalizar(String bruto) {
        if (bruto == null) return null;
        String d = bruto.replaceAll("[^0-9]", "");
        if (d.isEmpty()) return null;
        if (d.length() == 10 || d.length() == 11) d = "55" + d;
        if (!d.matches("^55[0-9]{10,11}$")) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o WhatsApp com DDD (ex.: 53 99999-9999).");
        return d;
    }

    @GetMapping("/api/estabelecimento/whatsapp")
    @PreAuthorize("hasRole('DONO') or @perm.pode(authentication, 'estabelecimento')")
    public Resposta obter() {
        return new Resposta(banco.naLoja(WhatsappDaLoja::ler));
    }

    @PutMapping("/api/estabelecimento/whatsapp")
    @PreAuthorize("hasRole('DONO') or @perm.pode(authentication, 'estabelecimento')")
    public Resposta gravar(@RequestBody Corpo c) {
        Loja loja = LojaContext.exigir();
        String numero = normalizar(c == null ? null : c.whatsapp());
        banco.naLoja(jdbc -> jdbc.update("insert into configuracao_loja (loja_id, whatsapp_loja) values (?::uuid, ?) "
                + "on conflict (loja_id) do update set whatsapp_loja = excluded.whatsapp_loja, atualizado_em = now()", loja.id().toString(), numero));
        return new Resposta(numero);
    }
}
