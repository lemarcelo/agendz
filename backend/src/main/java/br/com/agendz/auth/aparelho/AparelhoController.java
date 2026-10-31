package br.com.agendz.auth.aparelho;

import br.com.agendz.auth.Sessao;
import br.com.agendz.auth.SessaoService;
import br.com.agendz.auth.rede.RedeController;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Aparelho confiável (v125, B8): o celular continua logado em qualquer rede. Só quem acabou de entrar (token de até 10 min) pode confiar; senha temporária nunca
 * chega aqui (o token dela só troca a senha). Quem já usa um aparelho confiável não cria outro a partir dele.
 * | POST   /api/auth/aparelhos-confiaveis        | { rotulo? } → Sessao nova (token de aparelho confiável, 365 dias)
 * | GET    /api/usuarios/me/aparelhos-confiaveis | os da própria pessoa (`atual`: é o aparelho deste token)
 * | DELETE /api/usuarios/me/aparelhos-confiaveis/{id}
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class AparelhoController {

    public record Pedido(@Size(max = 60) String rotulo) {
    }

    private final AparelhosConfiaveis aparelhos;
    private final SessaoService sessao;

    public AparelhoController(AparelhosConfiaveis aparelhos, SessaoService sessao) {
        this.aparelhos = aparelhos;
        this.sessao = sessao;
    }

    @PostMapping("/api/auth/aparelhos-confiaveis")
    public Sessao confiar(@Valid @RequestBody(required = false) Pedido d, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        UUID id = UUID.fromString(jwt.getSubject());
        if (Boolean.TRUE.equals(jwt.getClaim("ap"))) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este aparelho já é confiável.");
        if (jwt.getIssuedAt() == null || Instant.now().isAfter(jwt.getIssuedAt().plus(RedeController.JANELA_PARA_CONFIAR))) {
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Para confiar neste aparelho, entre de novo agora (com a senha ou a digital).");
        }
        UUID aparelho = aparelhos.gravar(id, d == null ? null : d.rotulo());
        return sessao.abrirDeAparelho(id, loja, jwt.getClaimAsString("papel"), jwt.getClaimAsString("nome"), aparelho);
    }

    @GetMapping("/api/usuarios/me/aparelhos-confiaveis")
    public List<AparelhosConfiaveis.Item> listar(@AuthenticationPrincipal Jwt jwt) {
        return aparelhos.listar(UUID.fromString(jwt.getSubject()), idDoAparelho(jwt));
    }

    @DeleteMapping("/api/usuarios/me/aparelhos-confiaveis/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remover(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        aparelhos.remover(UUID.fromString(jwt.getSubject()), id);
    }

    /** O aparelho do token (claim `rid` de um token `ap`); `null` em token comum ou de rede. */
    static UUID idDoAparelho(Jwt jwt) {
        if (!Boolean.TRUE.equals(jwt.getClaim("ap"))) return null;
        try {
            return UUID.fromString(jwt.getClaimAsString("rid"));
        } catch (RuntimeException e) {
            return null;
        }
    }
}
