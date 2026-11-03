package br.com.agendz.auth;

import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Preferência de navegação da própria conta, isolada pela loja do endereço. */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class PreferenciaMenuController {
    public record Preferencia(@NotNull Boolean recolhido) {}
    private final LojaJdbc banco;
    public PreferenciaMenuController(LojaJdbc banco) { this.banco = banco; }

    @GetMapping("/api/usuarios/me/menu")
    public Preferencia obter(@AuthenticationPrincipal Jwt jwt) {
        UUID id = UUID.fromString(jwt.getSubject());
        Boolean valor = banco.naLoja(jdbc -> jdbc.queryForObject(
                "select menu_recolhido from usuario where id = ? and ativo", Boolean.class, id));
        return new Preferencia(valor);
    }

    @PutMapping("/api/usuarios/me/menu")
    public Preferencia salvar(@Valid @RequestBody Preferencia preferencia, @AuthenticationPrincipal Jwt jwt) {
        UUID id = UUID.fromString(jwt.getSubject());
        banco.naLoja(jdbc -> jdbc.update("update usuario set menu_recolhido = ? where id = ? and ativo", preferencia.recolhido(), id));
        return preferencia;
    }
}
