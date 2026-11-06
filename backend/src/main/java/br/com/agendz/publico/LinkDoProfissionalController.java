package br.com.agendz.publico;

import br.com.agendz.tenant.LojaContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * B3: link do cliente com o profissional pré-escolhido. A emissão é autenticada e SEMPRE para quem pede (nunca o id vem do corpo);
 * a conferência é pública e responde 200 igual para token válido ou não (o corpo só traz o profissional quando vale), sem revelar o motivo.
 */
@RestController
public class LinkDoProfissionalController {

    public record Emitido(String token) {
    }

    public record Conferir(@Size(max = 100) String token) {
    }

    public record Conferido(UUID profissionalId) {
    }

    private final LinkDoProfissional links;
    private final LimitePublico limite;

    public LinkDoProfissionalController(LinkDoProfissional links, LimitePublico limite) {
        this.links = links;
        this.limite = limite;
    }

    /** GET /api/agenda/meu-link: token do link da própria agenda (profissional, administrador ou proprietário). */
    @GetMapping("/api/agenda/meu-link")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','PROFISSIONAL')")
    public Emitido emitir(@AuthenticationPrincipal Jwt jwt) {
        return new Emitido(links.emitir(LojaContext.exigir().id(), UUID.fromString(jwt.getSubject())));
    }

    /** POST /api/publico/link-profissional: {token} → {profissionalId} ou {profissionalId: null}. Pedido em excesso também dá null (não vira pista). */
    @PostMapping("/api/publico/link-profissional")
    public Conferido conferir(@Valid @RequestBody Conferir corpo, HttpServletRequest req) {
        UUID loja = LojaContext.exigir().id();
        if (!limite.liberar(loja + "|link-prof|" + LinkPublicoController.ip(req), 60, Duration.ofMinutes(1))) return new Conferido(null);
        return new Conferido(links.validar(loja, corpo.token()).orElse(null));
    }
}
