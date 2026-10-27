package br.com.agendz.seguranca;

import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gate 3 (b): o token só vale na loja que o emitiu. Se o claim `loja` não for a loja do Host (mesmo com o token válido), responde 403 e registra no log.
 * Roda depois da autenticação do token e antes de qualquer rota.
 */
public class ConferirLojaDoTokenFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger("seguranca");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            String doToken = jwt.getToken().getClaimAsString("loja");
            String daRequisicao = LojaContext.atual().map(Loja::id).map(Object::toString).orElse(null);
            if (doToken == null || !doToken.equals(daRequisicao)) {
                LOG.warn("Token de outra loja recusado: usuario={} lojaDoToken={} lojaDoHost={} caminho={}",
                        jwt.getName(), doToken, daRequisicao, req.getRequestURI());
                res.setStatus(HttpServletResponse.SC_FORBIDDEN);
                res.setContentType("application/json");
                res.setCharacterEncoding(StandardCharsets.UTF_8.name());
                res.getWriter().write("{\"mensagem\":\"Sem permissão\"}");
                return;
            }
        }
        chain.doFilter(req, res);
    }
}
