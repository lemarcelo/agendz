package br.com.agendz.publico;

import br.com.agendz.auth.Recaptcha;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaRepository;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/publico/loja: o React pergunta isto antes de desenhar (tipo, tema e marca). Sem login; a loja vem do Host. */
@RestController
public class LojaPublicaController {

    private static final String ICONE_PADRAO_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 96 96\"><rect width=\"96\" height=\"96\" rx=\"20\" fill=\"#0b0d10\"/><rect x=\"20\" y=\"26\" width=\"56\" height=\"52\" rx=\"8\" fill=\"none\" stroke=\"#fff\" stroke-width=\"6\"/><path d=\"M20 42h56\" stroke=\"#fff\" stroke-width=\"6\"/><path d=\"M34 18v14M62 18v14\" stroke=\"#fff\" stroke-width=\"6\" stroke-linecap=\"round\"/></svg>";

    public record LojaPublica(String slug, String nome, String tipo, String logo, String temaCor, String temaCor2, String captchaChave, boolean emHomologacao) {
    }

    public record IconeManifesto(String src, String sizes, String type, String purpose) {
    }

    private final Recaptcha recaptcha;
    private final LojaRepository lojas;

    public LojaPublicaController(Recaptcha recaptcha, LojaRepository lojas) {
        this.recaptcha = recaptcha;
        this.lojas = lojas;
    }

    @GetMapping("/api/publico/loja")
    public LojaPublica loja() {
        Loja l = LojaContext.exigir();
        return new LojaPublica(l.slug(), l.nome(), l.tipo(), l.logo(), l.temaCor(), l.temaCor2(), recaptcha.chaveSite(lojas.recaptchaChaveSite(l.id())), lojas.emHomologacao(l.id()));
    }

    /** Manifesto PWA por loja: nome do app = nome da loja, ícone = logo da loja e cor da barra = fundo neutro escuro (#0b0d10). */
    @GetMapping(value = "/api/publico/manifest.webmanifest", produces = "application/manifest+json")
    public ResponseEntity<Map<String, Object>> manifesto() {
        Loja l = LojaContext.exigir();
        String mime = mimeDaLogo(l.logo());
        String sizes = mime != null ? "192x192 512x512 any" : "any";
        String type = mime != null ? mime : "image/svg+xml";
        Map<String, Object> corpo = Map.of(
                "name", l.nome(),
                "short_name", l.nome(),
                "start_url", "/",
                "scope", "/",
                "display", "standalone",
                "background_color", "#0b0d10",
                "theme_color", "#0b0d10",
                "lang", "pt-BR",
                "icons", List.of(new IconeManifesto("/api/publico/icone", sizes, type, "any")));
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(corpo);
    }

    /** Ícone do app instalado e das notificações: devolve os bytes da logo da loja ou o SVG neutro quando a loja não tem logo. */
    @GetMapping("/api/publico/icone")
    public ResponseEntity<byte[]> icone() {
        Loja l = LojaContext.exigir();
        String logo = l.logo();
        String mime = mimeDaLogo(logo);
        if (mime != null) {
            try {
                byte[] bytes = Base64.getDecoder().decode(logo.substring(logo.indexOf(',') + 1));
                return ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(mime))
                        .cacheControl(CacheControl.noCache())
                        .body(bytes);
            } catch (IllegalArgumentException ignored) {
                // cai no ícone padrão se o base64 estiver inválido
            }
        }
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml"))
                .cacheControl(CacheControl.noCache())
                .body(ICONE_PADRAO_SVG.getBytes(StandardCharsets.UTF_8));
    }

    private static String mimeDaLogo(String logo) {
        if (logo == null) return null;
        for (String t : new String[] {"png", "jpeg", "webp"}) {
            if (logo.startsWith("data:image/" + t + ";base64,")) return "image/" + t;
        }
        return null;
    }
}

