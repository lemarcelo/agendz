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
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class ServicoController {

    private final ServicoService servico;

    public ServicoController(ServicoService servico) {
        this.servico = servico;
    }

    private static boolean dono(Jwt jwt) {
        return br.com.agendz.seguranca.Permissoes.veTudo(jwt.getClaimAsString("papel")); // quem gerencia vê também os desativados
    }

    /** Só o proprietário define a comissão do serviço; para os outros perfis o campo é ignorado (como na API simulada). */
    private static Dados semComissaoSeNaoForDono(Dados d, Jwt jwt) {
        if ("dono".equals(jwt.getClaimAsString("papel")) || d.comissaoPct() == null) return d;
        return new Dados(d.nome(), d.codigo(), d.categoria(), d.preco(), d.duracaoMin(), d.precos(), d.duracoes(), d.multiDia(), d.combo(), d.componentes(), d.intervaloMin(),
                d.antecedenciaH(), null, d.ativo());
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
    @PreAuthorize("@perm.pode(authentication, 'servicos')")
    public ResponseEntity<Servico> criar(@Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED).body(servico.criar(semComissaoSeNaoForDono(d, jwt)));
    }

    @PutMapping("/api/servicos/{id}")
    @PreAuthorize("@perm.pode(authentication, 'servicos')")
    public Servico alterar(@PathVariable UUID id, @Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        return servico.alterar(id, semComissaoSeNaoForDono(d, jwt));
    }

    /** Nunca usado: apaga (204). Com histórico de agendamento ou dentro de um combo: só desativa (200 com `desativado: true`). */
    @DeleteMapping("/api/servicos/{id}")
    @PreAuthorize("@perm.pode(authentication, 'servicos')")
    public ResponseEntity<?> remover(@PathVariable UUID id) {
        return servico.remover(id).desativado() ? ResponseEntity.ok(Map.of("desativado", true)) : ResponseEntity.noContent().build();
    }
}
