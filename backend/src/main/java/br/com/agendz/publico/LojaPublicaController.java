package br.com.agendz.publico;

import br.com.agendz.auth.Recaptcha;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/publico/loja: o React pergunta isto antes de desenhar (tipo, tema e marca). Sem login; a loja vem do Host. */
@RestController
public class LojaPublicaController {

    public record LojaPublica(String slug, String nome, String tipo, String logo, String temaCor, String temaCor2, String captchaChave) {
    }

    private final Recaptcha recaptcha;

    public LojaPublicaController(Recaptcha recaptcha) {
        this.recaptcha = recaptcha;
    }

    @GetMapping("/api/publico/loja")
    public LojaPublica loja() {
        Loja l = LojaContext.exigir();
        return new LojaPublica(l.slug(), l.nome(), l.tipo(), l.logo(), l.temaCor(), l.temaCor2(), recaptcha.chaveSite());
    }
}
