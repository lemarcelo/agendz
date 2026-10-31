package br.com.agendz.seguranca;

import br.com.agendz.auth.aparelho.AparelhosConfiaveis;
import br.com.agendz.auth.rede.Rede;
import br.com.agendz.auth.rede.RedesConfiaveis;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Sessão por rede confiável (v119). Só olha tokens de rede confiável (claim `auto`): (1) a rede de origem tem de existir ainda e estar na mesma versão ("Sair",
 * troca de senha ou remover a rede derrubam o token); (2) vindo da rede confiável o token vale até o fim; (3) vindo de OUTRA rede só vale por 24 h desde o login.
 * Recusa é 401 (a tela volta ao login). Token comum de quem não é proprietário passa direto, sem consulta; o de proprietário confere no banco a cada chamada (v135).
 */
public class ConferirRedeDoTokenFilter extends OncePerRequestFilter {

    public static final Duration FORA_DA_REDE = Duration.ofHours(24);

    private final RedesConfiaveis redes;
    private final AparelhosConfiaveis aparelhos;

    public ConferirRedeDoTokenFilter(RedesConfiaveis redes, AparelhosConfiaveis aparelhos) {
        this.redes = redes;
        this.aparelhos = aparelhos;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt && !Boolean.TRUE.equals(jwt.getToken().getClaim("auto")) && "dono".equals(jwt.getToken().getClaimAsString("papel")) && !proprietarioAindaE(jwt)) {
            recusar(res); // v135: quem deixou de ser proprietário (ou foi desativado) perde o acesso na hora, sem esperar o token vencer
            return;
        }
        if (auth instanceof JwtAuthenticationToken jwt && Boolean.TRUE.equals(jwt.getToken().getClaim("auto")) && !valido(jwt, req)) {
            recusar(res);
            return;
        }
        chain.doFilter(req, res);
    }

    private void recusar(HttpServletResponse res) throws IOException {
        res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        res.setContentType("application/json");
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write("{\"mensagem\":\"Sessão encerrada. Entre de novo.\"}");
    }

    /** Só tokens de proprietário pagam a consulta: a mudança de perfil de um proprietário tem de valer na hora (B6). Sem loja no contexto não há o que conferir. */
    private boolean proprietarioAindaE(JwtAuthenticationToken jwt) {
        try {
            if (LojaContext.atual().isEmpty()) return true;
            return redes.usuarioConfere(UUID.fromString(jwt.getToken().getSubject()), "dono");
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Token de aparelho confiável (v125): vale em qualquer rede enquanto a linha do aparelho existir, a pessoa estiver ativa com o mesmo papel e o uso não tiver parado por 90 dias. */
    private boolean validoDeAparelho(JwtAuthenticationToken jwt) {
        try {
            UUID aparelho = UUID.fromString(jwt.getToken().getClaimAsString("rid"));
            UUID usuario = UUID.fromString(jwt.getToken().getSubject());
            if (!aparelhos.vale(aparelho, usuario) || !redes.usuarioConfere(usuario, jwt.getToken().getClaimAsString("papel"))) return false;
            aparelhos.usou(aparelho);
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private boolean valido(JwtAuthenticationToken jwt, HttpServletRequest req) {
        if (Boolean.TRUE.equals(jwt.getToken().getClaim("ap"))) return validoDeAparelho(jwt);
        try {
            UUID rid = UUID.fromString(jwt.getToken().getClaimAsString("rid"));
            Number rv = jwt.getToken().getClaim("rv");
            UUID usuario = UUID.fromString(jwt.getToken().getSubject());
            var linha = redes.porId(rid);
            if (linha.isEmpty() || rv == null || linha.get().versao() != rv.intValue() || !linha.get().usuarioId().equals(usuario)) return false;
            if (!redes.usuarioConfere(usuario, jwt.getToken().getClaimAsString("papel"))) return false;
            Loja loja = LojaContext.atual().orElse(null);
            if (loja == null) return false;
            String daRequisicao = redes.hash(loja.id(), usuario, Rede.ip(req));
            if (daRequisicao != null && daRequisicao.equals(linha.get().hash())) {
                redes.usou(rid);
                return true;
            }
            Instant emitido = jwt.getToken().getIssuedAt();
            return emitido != null && Instant.now().isBefore(emitido.plus(FORA_DA_REDE));
        } catch (RuntimeException e) {
            return false; // claim faltando ou estranho: não vale
        }
    }
}
