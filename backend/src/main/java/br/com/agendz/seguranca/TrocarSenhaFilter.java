package br.com.agendz.seguranca;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/** Token de senha temporária (`trocar`): só pode chamar PUT /api/usuarios/me/senha. Todo o resto responde 403 com código `trocar_senha`. */
public class TrocarSenhaFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt && Boolean.TRUE.equals(jwt.getToken().getClaim("trocar"))) {
            boolean troca = "PUT".equals(req.getMethod()) && "/api/usuarios/me/senha".equals(req.getRequestURI());
            if (!troca) {
                res.setStatus(HttpServletResponse.SC_FORBIDDEN);
                res.setContentType("application/json");
                res.setCharacterEncoding(StandardCharsets.UTF_8.name());
                res.getWriter().write("{\"mensagem\":\"Troque a senha para continuar\",\"codigo\":\"trocar_senha\"}");
                return;
            }
        }
        chain.doFilter(req, res);
    }
}
