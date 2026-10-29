package br.com.agendz.aviso;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.seguranca.Permissoes;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Avisos do painel (espelho de `avisosPainel` na API simulada): o que o cliente fez pelo link. Quem tem acesso à agenda lê; o profissional vê só os do
 * próprio horário, dono e equipe veem todos. GET /api/avisos (os 50 mais novos, não lidos primeiro), PUT /api/avisos/{id}/lido.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'agenda')")
public class AvisosPainel {

    public static final int MAX_LISTA = 50;

    public record Aviso(UUID id, Instant em, UUID agendamentoId, String tipo, String texto, boolean lido) {
    }

    private final LojaJdbc banco;

    public AvisosPainel(LojaJdbc banco) {
        this.banco = banco;
    }

    /** Grava um aviso dentro da transação do fato (se o fato volta atrás, o aviso também). Texto curto, só o nome do cliente. */
    public static void criar(JdbcTemplate jdbc, UUID lojaId, UUID agendamentoId, UUID profissionalId, String tipo, String texto) {
        String t = texto.length() > 300 ? texto.substring(0, 300) : texto;
        jdbc.update("insert into aviso_painel (loja_id, agendamento_id, profissional_id, tipo, texto) values (?::uuid, ?, ?, ?, ?)",
                lojaId.toString(), agendamentoId, profissionalId, tipo, t);
    }

    @GetMapping("/api/avisos")
    public List<Aviso> listar(@AuthenticationPrincipal Jwt jwt) {
        UUID so = somenteDe(jwt);
        return banco.naLoja(jdbc -> {
            List<Object> args = new ArrayList<>();
            String filtro = "";
            if (so != null) {
                filtro = " where profissional_id = ?";
                args.add(so);
            }
            return jdbc.query("select id, criado_em, agendamento_id, tipo, texto, lido from aviso_painel" + filtro + " order by lido, criado_em desc, id limit " + MAX_LISTA,
                    (rs, i) -> new Aviso(rs.getObject("id", UUID.class), rs.getObject("criado_em", OffsetDateTime.class).toInstant(), rs.getObject("agendamento_id", UUID.class),
                            rs.getString("tipo"), rs.getString("texto"), rs.getBoolean("lido")), args.toArray());
        });
    }

    @PutMapping("/api/avisos/{id}/lido")
    public Aviso lido(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        LojaContext.exigir();
        UUID so = somenteDe(jwt);
        return banco.naLoja(jdbc -> {
            int n = so == null
                    ? jdbc.update("update aviso_painel set lido = true where id = ?", id)
                    : jdbc.update("update aviso_painel set lido = true where id = ? and profissional_id = ?", id, so);
            if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Aviso não encontrado.");
            return jdbc.queryForObject("select id, criado_em, agendamento_id, tipo, texto, lido from aviso_painel where id = ?",
                    (rs, i) -> new Aviso(rs.getObject("id", UUID.class), rs.getObject("criado_em", OffsetDateTime.class).toInstant(), rs.getObject("agendamento_id", UUID.class),
                            rs.getString("tipo"), rs.getString("texto"), rs.getBoolean("lido")), id);
        });
    }

    private static UUID somenteDe(Jwt jwt) {
        return Permissoes.veTudo(jwt.getClaimAsString("papel")) ? null : UUID.fromString(jwt.getSubject());
    }
}
