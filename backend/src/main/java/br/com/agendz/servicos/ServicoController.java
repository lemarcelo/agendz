package br.com.agendz.servicos;

import br.com.agendz.servicos.ServicoService.Dados;
import br.com.agendz.servicos.ServicoService.Servico;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
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
 * Serviços da loja (docs/MAPA-API-SPRING.md, seção servicos.*; regras em {@link ServicoService}). Leitura: dono e profissional (profissional só vê os ativos).
 * Escrita: só o dono. A loja é a do Host; o banco filtra por RLS; serviço de outra loja responde 404.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','PROFISSIONAL')")
public class ServicoController {

    private final ServicoService servico;

    public ServicoController(ServicoService servico) {
        this.servico = servico;
    }

    private static boolean dono(Jwt jwt) {
        return "dono".equals(jwt.getClaimAsString("papel"));
    }

    @GetMapping("/api/servicos")
    public List<Servico> listar(@AuthenticationPrincipal Jwt jwt) {
        return servico.listar(dono(jwt));
    }

    @GetMapping("/api/servicos/{id}")
    public Servico obter(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return servico.obter(id, dono(jwt));
    }

    @PostMapping("/api/servicos")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Servico> criar(@Valid @RequestBody Dados d) {
        return ResponseEntity.status(HttpStatus.CREATED).body(servico.criar(d));
    }

    @PutMapping("/api/servicos/{id}")
    @PreAuthorize("hasRole('DONO')")
    public Servico alterar(@PathVariable UUID id, @Valid @RequestBody Dados d) {
        return servico.alterar(id, d);
    }

    /** Nunca usado: apaga (204). Com histórico de agendamento ou dentro de um combo: só desativa (200 com `desativado: true`). */
    @DeleteMapping("/api/servicos/{id}")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<?> remover(@PathVariable UUID id) {
        return servico.remover(id).desativado() ? ResponseEntity.ok(Map.of("desativado", true)) : ResponseEntity.noContent().build();
    }
}
