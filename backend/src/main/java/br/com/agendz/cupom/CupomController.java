package br.com.agendz.cupom;

import br.com.agendz.cupom.CupomService.Cupom;
import br.com.agendz.cupom.CupomService.Dados;
import jakarta.validation.Valid;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
 * Cupons e vales (Estabelecimento > Cupons): só quem tem a seção `estabelecimento` (o proprietário sempre). A chave aparece só aqui e nunca é recebida do cliente.
 * Rotas: GET/POST /api/cupons, PUT /api/cupons/{id}, POST /api/cupons/{id}/chave, DELETE /api/cupons/{id} (docs/MAPA-API-SPRING.md, 10i).
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'estabelecimento')")
public class CupomController {

    public record Remocao(boolean desativado) {
    }

    private final CupomService cupons;
    private final Clock relogio;

    public CupomController(CupomService cupons, Clock relogio) {
        this.cupons = cupons;
        this.relogio = relogio;
    }

    @GetMapping("/api/cupons")
    public List<Cupom> listar() {
        return cupons.listar(relogio.instant());
    }

    @PostMapping("/api/cupons")
    public ResponseEntity<Cupom> criar(@Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED).body(cupons.salvar(null, d, UUID.fromString(jwt.getSubject()), relogio.instant()));
    }

    @PutMapping("/api/cupons/{id}")
    public Cupom alterar(@PathVariable UUID id, @Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        return cupons.salvar(id, d, UUID.fromString(jwt.getSubject()), relogio.instant());
    }

    @PostMapping("/api/cupons/{id}/chave")
    public Cupom novaChave(@PathVariable UUID id) {
        return cupons.novaChave(id, relogio.instant());
    }

    @DeleteMapping("/api/cupons/{id}")
    public Remocao remover(@PathVariable UUID id) {
        return new Remocao(cupons.remover(id));
    }
}
