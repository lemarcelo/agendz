package br.com.agendz.interno;

import br.com.agendz.tenant.LojaRepository;
import br.com.agendz.tenant.TenantProperties;
import br.com.agendz.tenant.TenantResolver;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Pergunta do Caddy (TLS sob demanda, diretiva `ask`): GET /interno/dominio-permitido?domain=host.
 * 200 só se o host é domínio próprio VERIFICADO ou subdomínio de uma loja que existe; senão 404 (e o Caddy não emite certificado).
 * Fica na rede interna: o Caddy NÃO publica /interno para fora.
 */
@RestController
public class DominioPermitidoController {

    private final TenantResolver resolver;
    private final LojaRepository lojas;

    public DominioPermitidoController(TenantProperties props, LojaRepository lojas) {
        this.resolver = new TenantResolver(props.dominiosBase(), false);
        this.lojas = lojas;
    }

    @GetMapping("/interno/dominio-permitido")
    public ResponseEntity<Void> permitido(@RequestParam("domain") String domain) {
        TenantResolver.Resolucao r = resolver.resolver(domain, "", null, lojas::slugDoDominioVerificado);
        boolean ok = r.achou() && ("dominio".equals(r.via()) || lojas.porSlug(r.slug()).isPresent());
        return ok ? ResponseEntity.ok().build() : ResponseEntity.notFound().build();
    }
}
