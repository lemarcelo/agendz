package br.com.agendz.planos;

import br.com.agendz.planos.PlanoService.AssinaturaDto;
import br.com.agendz.planos.PlanoService.Autor;
import br.com.agendz.planos.PlanoService.Contrato;
import br.com.agendz.planos.PlanoService.Envelope;
import br.com.agendz.planos.PlanoService.Listagem;
import br.com.agendz.planos.PlanoService.Mensalidade;
import br.com.agendz.planos.PlanoService.Motivo;
import br.com.agendz.planos.PlanoService.PlanoDto;
import br.com.agendz.planos.PlanoService.PlanoEntrada;
import br.com.agendz.planos.PlanoService.Recebido;
import br.com.agendz.planos.PlanoService.Remocao;
import br.com.agendz.tenant.Idempotencia;
import jakarta.validation.Valid;
import java.time.Clock;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Planos de serviço no painel (docs/MAPA-API-SPRING.md, 10n): só quem tem a seção `planos` (o dono libera por pessoa; padrão: ninguém). Toda rota confere a seção
 * na própria anotação (não há permissão de classe: `doCliente` aceita também quem lança na agenda). A loja vem do Host; nada recebe loja ou papel no corpo.
 * Rotas: GET/POST /api/planos, PUT/DELETE /api/planos/{id}, POST /api/assinaturas, POST /api/assinaturas/{id}/pagamentos (Idempotency-Key), …/pagamentos/{pagId}/estorno,
 * …/encerrar, …/quitar, POST /api/planos/pedidos/{id}/aceitar|recusar, GET /api/planos/cliente/{clienteId}.
 */
@RestController
public class PlanoController {

    private static final String SECAO = "hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'planos')";
    private static final String AGENDA_OU_PLANOS = "hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and (@perm.pode(authentication, 'agenda') or @perm.pode(authentication, 'planos'))";

    private final PlanoService planos;
    private final Idempotencia idempotencia;
    private final Clock relogio;

    public PlanoController(PlanoService planos, Idempotencia idempotencia, Clock relogio) {
        this.planos = planos;
        this.idempotencia = idempotencia;
        this.relogio = relogio;
    }

    private static Autor autor(Jwt jwt) {
        String nome = jwt.getClaimAsString("nome");
        return new Autor(UUID.fromString(jwt.getSubject()), nome == null ? "" : nome);
    }

    @GetMapping("/api/planos")
    @PreAuthorize(SECAO)
    public Listagem listar() {
        return planos.listar(relogio.instant());
    }

    @PostMapping("/api/planos")
    @PreAuthorize(SECAO)
    public ResponseEntity<PlanoDto> criar(@Valid @RequestBody PlanoEntrada d, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED).body(planos.salvarPlano(null, d, UUID.fromString(jwt.getSubject())));
    }

    @PutMapping("/api/planos/{id}")
    @PreAuthorize(SECAO)
    public PlanoDto alterar(@PathVariable UUID id, @Valid @RequestBody PlanoEntrada d, @AuthenticationPrincipal Jwt jwt) {
        return planos.salvarPlano(id, d, UUID.fromString(jwt.getSubject()));
    }

    @DeleteMapping("/api/planos/{id}")
    @PreAuthorize(SECAO)
    public Remocao remover(@PathVariable UUID id) {
        return planos.removerPlano(id);
    }

    @PostMapping("/api/assinaturas")
    @PreAuthorize(SECAO)
    public ResponseEntity<AssinaturaDto> contratar(@Valid @RequestBody Contrato d, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED).body(planos.contratar(d, autor(jwt), relogio.instant()));
    }

    /** Dinheiro: leva Idempotency-Key (o mesmo pedido de novo devolve a resposta guardada, sem registrar a mensalidade duas vezes). */
    @PostMapping("/api/assinaturas/{id}/pagamentos")
    @PreAuthorize(SECAO)
    public ResponseEntity<AssinaturaDto> pagar(@PathVariable UUID id, @Valid @RequestBody Mensalidade d, @RequestHeader(value = "Idempotency-Key", required = false) String chave,
                                               @AuthenticationPrincipal Jwt jwt) {
        AssinaturaDto r = idempotencia.executar(chave, UUID.fromString(jwt.getSubject()), "POST /api/assinaturas/" + id + "/pagamentos", d, AssinaturaDto.class,
                () -> planos.pagar(id, d, autor(jwt), relogio.instant()));
        return ResponseEntity.status(HttpStatus.CREATED).body(r);
    }

    @PostMapping("/api/assinaturas/{id}/pagamentos/{pagamentoId}/estorno")
    @PreAuthorize(SECAO)
    public AssinaturaDto estornar(@PathVariable UUID id, @PathVariable UUID pagamentoId, @Valid @RequestBody Motivo d, @AuthenticationPrincipal Jwt jwt) {
        return planos.estornar(id, pagamentoId, d.motivo(), autor(jwt), relogio.instant());
    }

    @PostMapping("/api/assinaturas/{id}/encerrar")
    @PreAuthorize(SECAO)
    public AssinaturaDto encerrar(@PathVariable UUID id, @Valid @RequestBody Motivo d, @AuthenticationPrincipal Jwt jwt) {
        return planos.encerrar(id, d.motivo(), autor(jwt), relogio.instant());
    }

    @PostMapping("/api/assinaturas/{id}/quitar")
    @PreAuthorize(SECAO)
    public AssinaturaDto quitar(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return planos.quitar(id, autor(jwt), relogio.instant());
    }

    @PostMapping("/api/planos/pedidos/{id}/aceitar")
    @PreAuthorize(SECAO)
    public AssinaturaDto aceitar(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return planos.aceitarPedido(id, autor(jwt), relogio.instant());
    }

    @PostMapping("/api/planos/pedidos/{id}/recusar")
    @PreAuthorize(SECAO)
    public Recebido recusar(@PathVariable UUID id) {
        planos.recusarPedido(id, relogio.instant());
        return new Recebido(true);
    }

    /** Atender: o plano ativo do cliente (quanto resta e quanto ainda pode adiantar). Quem lança na agenda precisa disso sem ter a seção Planos; nunca o valor da mensalidade. */
    @GetMapping("/api/planos/cliente/{clienteId}")
    @PreAuthorize(AGENDA_OU_PLANOS)
    public Envelope doCliente(@PathVariable UUID clienteId) {
        return new Envelope(planos.doCliente(clienteId, relogio.instant()));
    }
}
