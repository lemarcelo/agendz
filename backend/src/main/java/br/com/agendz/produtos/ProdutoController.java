package br.com.agendz.produtos;

import br.com.agendz.produtos.ProdutoService.Dados;
import br.com.agendz.produtos.ProdutoService.Produto;
import br.com.agendz.seguranca.Permissoes;
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
 * Produtos à venda (docs/MAPA-API-SPRING.md, seção estoque.*). Leitura: dono, atendente e profissional (quem só vende vê os ativos, sem comissão, custo nem mínimo).
 * Escrita: seção `estoque` liberada (dono sempre); só o proprietário define a comissão do produto. A loja é a do Host; produto de outra loja responde 404.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class ProdutoController {

    private final ProdutoService produtos;

    public ProdutoController(ProdutoService produtos) {
        this.produtos = produtos;
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
}
