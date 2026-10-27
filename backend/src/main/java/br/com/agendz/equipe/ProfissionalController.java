package br.com.agendz.equipe;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Equipe da loja (docs/MAPA-API-SPRING.md, equipe.*). Leitura: dono e profissional (só quem está ativo; sem login nem senha).
 * Escrita: só o dono. O papel nunca vem do corpo: tudo que se cria aqui é `profissional`. Remover desativa e o dono não se remove.
 * Limite conhecido: o token já emitido de quem foi desativado vale até expirar (JWT_VALIDADE_MINUTOS); o login novo é recusado.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','PROFISSIONAL')")
public class ProfissionalController {

    public record Pessoa(UUID id, String nome, String papel, boolean atende) {
    }

    public record NovoProfissional(
            @NotBlank @Size(max = 60) @Pattern(regexp = "^[A-Za-z0-9._-]{2,60}$", message = "login: 2 a 60 letras, números, ponto, hífen ou sublinhado") String identificador,
            @NotBlank @Size(max = 80) String nome,
            @NotBlank @Size(min = 4, max = 100) String senha) {
    }

    public record Atendimento(@NotNull Boolean atende) {
    }

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;

    public ProfissionalController(LojaJdbc banco, PasswordEncoder encoder) {
        this.banco = banco;
        this.encoder = encoder;
    }

    @GetMapping("/api/profissionais")
    public List<Pessoa> listar() {
        return banco.naLoja(jdbc -> jdbc.query(
                "select id, nome, papel, atende from usuario where ativo order by nome limit 200",
                (rs, i) -> new Pessoa(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("papel"), rs.getBoolean("atende"))));
    }

    @PostMapping("/api/profissionais")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Pessoa> criar(@Valid @RequestBody NovoProfissional d) {
        Loja loja = LojaContext.exigir();
        String login = d.identificador().trim().toLowerCase(Locale.ROOT);
        String nome = Texto.limpar(d.nome());
        if (nome.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o nome");
        String hash = encoder.encode(d.senha());
        UUID id = banco.naLoja(jdbc -> jdbc.queryForObject(
                "insert into usuario (loja_id, identificador, nome, papel, senha_hash) values (?::uuid, ?, ?, 'profissional', ?) returning id",
                UUID.class, loja.id().toString(), login, nome, hash));
        return ResponseEntity.status(HttpStatus.CREATED).body(new Pessoa(id, nome, "profissional", true));
    }

    /** Liga ou desliga a presença na agenda. (Quando a agenda existir: bloquear desligar com agendamentos futuros.) */
    @PutMapping("/api/profissionais/{id}/atendimento")
    @PreAuthorize("hasRole('DONO')")
    public Pessoa definirAtendimento(@PathVariable UUID id, @Valid @RequestBody Atendimento d) {
        int mudou = banco.naLoja(jdbc -> jdbc.update("update usuario set atende = ? where id = ? and ativo", d.atende(), id));
        if (mudou == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado");
        return obter(id);
    }

    /** Desativa o profissional (nunca apaga: o histórico continua apontando para ele). O dono não é removido por aqui. */
    @DeleteMapping("/api/profissionais/{id}")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Void> remover(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        Pessoa p = obter(id);
        if (!"profissional".equals(p.papel()) || id.toString().equals(jwt.getSubject())) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "O dono não pode ser removido por aqui.");
        }
        banco.naLoja(jdbc -> jdbc.update("update usuario set ativo = false, atende = false where id = ?", id));
        return ResponseEntity.noContent().build();
    }

    private Pessoa obter(UUID id) {
        List<Pessoa> achados = banco.naLoja(jdbc -> jdbc.query(
                "select id, nome, papel, atende from usuario where id = ? and ativo",
                (rs, i) -> new Pessoa(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("papel"), rs.getBoolean("atende")), id));
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado");
        return achados.get(0);
    }
}
