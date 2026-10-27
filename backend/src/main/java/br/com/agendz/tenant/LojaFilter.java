package br.com.agendz.tenant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Primeiro filtro da cadeia: descobre a loja pelo ENDEREÇO. Lê só o Host (o Spring ignora X-Forwarded-Host: forward-headers-strategy=none;
 * o Caddy repassa o Host original). Sem loja = 404 antes de qualquer rota. /interno e /actuator não dependem de loja.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LojaFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger(LojaFilter.class);

    private final TenantResolver resolver;
    private final LojaRepository lojas;

    public LojaFilter(TenantProperties props, LojaRepository lojas) {
        this.resolver = new TenantResolver(props.dominiosBase(), props.permitirQuery());
        this.lojas = lojas;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String p = request.getRequestURI();
        return p.startsWith("/interno/") || p.startsWith("/actuator/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        TenantResolver.Resolucao r = resolver.resolver(
                req.getServerName(), req.getRequestURI(), req.getParameter("loja"), lojas::slugDoDominioVerificado);
        Optional<Loja> loja = r.achou() ? lojas.porSlug(r.slug()) : Optional.empty();
        if (loja.isEmpty()) {
            LOG.info("Loja nao encontrada para host={} caminho={}", req.getServerName(), req.getRequestURI());
            res.setStatus(HttpServletResponse.SC_NOT_FOUND);
            res.setContentType("application/json");
            res.setCharacterEncoding(StandardCharsets.UTF_8.name());
            res.getWriter().write("{\"mensagem\":\"Loja não encontrada\"}");
            return;
        }
        LojaContext.definir(loja.get());
        try {
            chain.doFilter(req, res);
        } finally {
            LojaContext.limpar();
        }
    }
}
