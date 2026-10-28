package br.com.agendz.comissao;

import br.com.agendz.tenant.Idempotencia;
import br.com.agendz.tenant.LojaContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Comissões (5d-4b; docs/MAPA-API-SPRING.md, seção 10g). O proprietário vê tudo, paga e cancela; profissional, atendente e admin veem só o que eles recebem
 * (nunca o valor cheio, a parte do estabelecimento nem o percentual).
 */
@RestController
public class ComissaoController {

    public record PedidoPagamento(@NotNull UUID profissionalId, @Size(max = 7) String mes, @Size(max = 10) String de, @Size(max = 10) String ate) {
    }

    public record Cancelamento(UUID quem, @Size(max = 600) String motivo) {
    }

    public record Restauracao(UUID quem) {
    }

    private final ComissaoService comissoes;
    private final Idempotencia idempotencia;
    private final Clock relogio;

    public ComissaoController(ComissaoService comissoes, Idempotencia idempotencia, Clock relogio) {
        this.comissoes = comissoes;
        this.idempotencia = idempotencia;
        this.relogio = relogio;
    }

    /** GET /api/comissoes?mes=AAAA-MM ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD (até 366 dias). */
    @GetMapping("/api/comissoes")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<ComissaoService.RelatorioDono> relatorio(@RequestParam(required = false) String mes, @RequestParam(required = false) String de, @RequestParam(required = false) String ate) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(comissoes.relatorio(ComissaoService.periodo(mes, de, ate)));
    }

    /** GET /api/comissoes/meu: só o que a própria pessoa recebe. */
    @GetMapping("/api/comissoes/meu")
    @PreAuthorize("hasAnyRole('PROFISSIONAL','ATENDENTE','ADMIN')")
    public ResponseEntity<ComissaoService.RelatorioMeu> meu(@RequestParam(required = false) String mes, @RequestParam(required = false) String de, @RequestParam(required = false) String ate,
                                                           @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(comissoes.meu(ComissaoService.periodo(mes, de, ate), UUID.fromString(jwt.getSubject())));
    }

    /** POST /api/comissoes/pagamentos: paga o que está em aberto da pessoa no período. Leva Idempotency-Key (dinheiro não duplica). */
    @PostMapping("/api/comissoes/pagamentos")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<ComissaoService.Pagamento> pagar(@Valid @RequestBody PedidoPagamento d, @RequestHeader(value = "Idempotency-Key", required = false) String chave, @AuthenticationPrincipal Jwt jwt) {
        ComissaoService.Periodo per = ComissaoService.periodo(d.mes(), d.de(), d.ate());
        UUID eu = UUID.fromString(jwt.getSubject());
        ComissaoService.Pagamento p = idempotencia.executar(chave, eu, "POST /api/comissoes/pagamentos", d, ComissaoService.Pagamento.class,
                () -> comissoes.pagar(d.profissionalId(), per, eu, relogio.instant()));
        return ResponseEntity.status(201).body(p);
    }

    /** POST /api/agendamentos/{id}/comissao/cancelar  { quem?, motivo }: só o proprietário; motivo de 5 a 300 letras; comissão paga não se cancela. */
    @PostMapping("/api/agendamentos/{id}/comissao/cancelar")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Void> cancelar(@PathVariable UUID id, @Valid @RequestBody Cancelamento d, @AuthenticationPrincipal Jwt jwt) {
        LojaContext.exigir();
        comissoes.cancelar(id, d.quem(), d.motivo(), UUID.fromString(jwt.getSubject()), String.valueOf(jwt.getClaimAsString("nome")), relogio.instant());
        return ResponseEntity.noContent().build();
    }

    /** POST /api/agendamentos/{id}/comissao/restaurar  { quem? } */
    @PostMapping("/api/agendamentos/{id}/comissao/restaurar")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Void> restaurar(@PathVariable UUID id, @RequestBody(required = false) Restauracao d, @AuthenticationPrincipal Jwt jwt) {
        LojaContext.exigir();
        comissoes.restaurar(id, d == null ? null : d.quem(), UUID.fromString(jwt.getSubject()), String.valueOf(jwt.getClaimAsString("nome")), relogio.instant());
        return ResponseEntity.noContent().build();
    }
}
