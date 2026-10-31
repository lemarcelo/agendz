package br.com.agendz.auth.rede;

import br.com.agendz.auth.Sessao;
import br.com.agendz.auth.aparelho.AparelhosConfiaveis;
import br.com.agendz.auth.SessaoService;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Size;
import java.time.Duration;
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
 * Login automático por rede (v119). A rede é SEMPRE a que o servidor viu agora (IP público; nunca vem do corpo). Só quem acabou de entrar (token de até 10 min)
 * pode confiar na rede; o token novo vem de longa duração. A pessoa lista e remove as próprias redes em Meu perfil; "Sair" derruba o token longo.
 * | POST   /api/auth/redes-confiaveis        | { rotulo? } → Sessao nova (token de rede confiável)
 * | GET    /api/auth/sessao                  | a sessão do token que a tela guardou (mesmo token; a tela reabre sem pedir login)
 * | POST   /api/auth/sair                    | 204: o token longo desta rede deixa de valer
 * | GET    /api/usuarios/me/redes-confiaveis | as da própria pessoa (`atual`: é a rede de onde pede)
 * | DELETE /api/usuarios/me/redes-confiaveis/{id}
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class RedeController {

    public static final Duration JANELA_PARA_CONFIAR = Duration.ofMinutes(10);

    public record Pedido(@Size(max = 60) String rotulo) {
    }

    private final RedesConfiaveis redes;
    private final AparelhosConfiaveis aparelhos;
    private final SessaoService sessao;

    public RedeController(RedesConfiaveis redes, AparelhosConfiaveis aparelhos, SessaoService sessao) {
        this.redes = redes;
        this.aparelhos = aparelhos;
        this.sessao = sessao;
    }

    @PostMapping("/api/auth/redes-confiaveis")
    public Sessao confiar(@RequestBody(required = false) Pedido d, @AuthenticationPrincipal Jwt jwt, HttpServletRequest req) {
        Loja loja = LojaContext.exigir();
        UUID id = UUID.fromString(jwt.getSubject());
        if (Boolean.TRUE.equals(jwt.getClaim("ap"))) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este aparelho já é confiável; a rede confiável é pedida no computador."); // v125
        if (jwt.getIssuedAt() == null || Instant.now().isAfter(jwt.getIssuedAt().plus(JANELA_PARA_CONFIAR))) {
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Para confiar nesta rede, entre de novo agora (com a senha ou a digital).");
        }
        String hash = redes.hash(loja.id(), id, Rede.ip(req));
        if (hash == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Não foi possível identificar esta rede.");
        redes.gravar(id, hash, d == null ? null : d.rotulo());
        return sessao.abrir(id, loja, jwt.getClaimAsString("papel"), jwt.getClaimAsString("nome"), false, Rede.ip(req), false);
    }

    @GetMapping("/api/auth/sessao")
    public Sessao sessaoAtual(@AuthenticationPrincipal Jwt jwt) {
        return sessao.descrever(UUID.fromString(jwt.getSubject()), LojaContext.exigir(), jwt.getClaimAsString("papel"), jwt.getClaimAsString("nome"), jwt.getTokenValue(),
                Boolean.TRUE.equals(jwt.getClaim("auto")));
    }

    @PostMapping("/api/auth/sair")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void sair(@AuthenticationPrincipal Jwt jwt) {
        String rid = jwt.getClaimAsString("rid");
        if (rid == null) return;
        try {
            if (Boolean.TRUE.equals(jwt.getClaim("ap"))) aparelhos.sair(UUID.fromString(jwt.getSubject()), UUID.fromString(rid)); // aparelho confiável: sair tira a confiança
            else redes.encerrarSessao(UUID.fromString(rid));
        } catch (IllegalArgumentException e) {
            // claim estranho: nada a encerrar
        }
    }

    @GetMapping("/api/usuarios/me/redes-confiaveis")
    public List<RedesConfiaveis.Item> listar(@AuthenticationPrincipal Jwt jwt, HttpServletRequest req) {
        Loja loja = LojaContext.exigir();
        UUID id = UUID.fromString(jwt.getSubject());
        return redes.listar(id, redes.hash(loja.id(), id, Rede.ip(req)));
    }

    @DeleteMapping("/api/usuarios/me/redes-confiaveis/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remover(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        redes.remover(UUID.fromString(jwt.getSubject()), id);
    }
}
