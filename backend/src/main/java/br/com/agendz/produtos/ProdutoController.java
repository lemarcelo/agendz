package br.com.agendz.produtos;

import br.com.agendz.produtos.ProdutoService.Dados;
import br.com.agendz.produtos.ProdutoService.Produto;
import br.com.agendz.seguranca.Permissoes;
import br.com.agendz.tenant.Idempotencia;
import jakarta.validation.Valid;
import java.time.Clock;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Produtos à venda (docs/MAPA-API-SPRING.md, seção estoque.*). Leitura: dono, atendente e profissional (quem só vende vê os ativos, sem comissão, custo nem mínimo).
 * Escrita: seção `estoque` liberada (dono sempre); só o proprietário define a comissão do produto. A loja é a do Host; produto de outra loja responde 404.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class ProdutoController {

    private final ProdutoService produtos;
    private final Idempotencia idempotencia;
    private final Clock relogio;

    public ProdutoController(ProdutoService produtos, Idempotencia idempotencia, Clock relogio) {
        this.produtos = produtos;
        this.idempotencia = idempotencia;
        this.relogio = relogio;
    }

    private static boolean gerente(Jwt jwt) {
        return Permissoes.veTudo(jwt.getClaimAsString("papel"));
    }

    private static boolean dono(Jwt jwt) {
        return "dono".equals(jwt.getClaimAsString("papel"));
    }

    @GetMapping("/api/produtos")
    public List<Produto> listar(@AuthenticationPrincipal Jwt jwt) {
        List<Produto> todos = produtos.listar(gerente(jwt));
        return gerente(jwt) ? todos : todos.stream().map(Produto::paraVendedor).toList();
    }

    @GetMapping("/api/produtos/{id}")
    public Produto obter(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        Produto p = produtos.obter(id, gerente(jwt));
        return gerente(jwt) ? p : p.paraVendedor();
    }

    @PostMapping("/api/produtos")
    @PreAuthorize("@perm.pode(authentication, 'estoque')")
    public ResponseEntity<Produto> criar(@Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED).body(produtos.criar(d, dono(jwt)));
    }

    @PutMapping("/api/produtos/{id}")
    @PreAuthorize("@perm.pode(authentication, 'estoque')")
    public Produto alterar(@PathVariable UUID id, @Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        return produtos.alterar(id, d, dono(jwt));
    }

    /** Nunca vendido nem movimentado: apaga (204). Com histórico: só desativa (200 com `desativado: true`). */
    @DeleteMapping("/api/produtos/{id}")
    @PreAuthorize("@perm.pode(authentication, 'estoque')")
    public ResponseEntity<?> remover(@PathVariable UUID id) {
        return produtos.remover(id).desativado() ? ResponseEntity.ok(Map.of("desativado", true)) : ResponseEntity.noContent().build();
    }

    /** GET /api/produtos/{id}/movimentos: histórico de estoque (entradas, saídas, contagens e baixas das vendas). */
    @GetMapping("/api/produtos/{id}/movimentos")
    @PreAuthorize("@perm.pode(authentication, 'estoque')")
    public ResponseEntity<List<ProdutoService.Movimento>> movimentos(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(produtos.movimentos(id));
    }

    /** POST /api/produtos/{id}/movimentos { tipo: entrada|saida|ajuste, qtd, obs }: quantidade não pode duplicar, então leva Idempotency-Key. */
    @PostMapping("/api/produtos/{id}/movimentos")
    @PreAuthorize("@perm.pode(authentication, 'estoque')")
    public ResponseEntity<ProdutoService.Movimento> movimentar(@PathVariable UUID id, @Valid @RequestBody ProdutoService.MovimentoDados d,
                                                               @RequestHeader(value = "Idempotency-Key", required = false) String chave, @AuthenticationPrincipal Jwt jwt) {
        UUID eu = UUID.fromString(jwt.getSubject());
        ProdutoService.Movimento m = idempotencia.executar(chave, eu, "POST /api/produtos/" + id + "/movimentos", d, ProdutoService.Movimento.class,
                () -> produtos.movimentar(id, d, eu, relogio.instant()));
        return ResponseEntity.status(HttpStatus.CREATED).body(m);
    }
}
