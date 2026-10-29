package br.com.agendz.interno;

import br.com.agendz.equipe.SuporteDaLoja;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rotas internas do Admin da plataforma para o usuário `suporte` da loja (rede interna; o Caddy não publica /interno). Além da rede, exigem a chave
 * `X-Interno-Chave` (variável INTERNO_CHAVE, 16+ caracteres); sem chave configurada as rotas respondem 503, nunca abertas.
 * POST /interno/plataforma/lojas/{slug}/suporte        → cria o `suporte` se a loja não tem (idempotente); a senha temporária vem só ao criar.
 * POST /interno/plataforma/lojas/{slug}/suporte/senha  → refaz a senha do `suporte` (aparece uma vez).
 */
@RestController
public class SuporteInternoController {

    private final LojaRepository lojas;
    private final SuporteDaLoja suporte;
    private final String chave;

    public SuporteInternoController(LojaRepository lojas, SuporteDaLoja suporte, @Value("${agendz.interno.chave:}") String chave) {
        this.lojas = lojas;
        this.suporte = suporte;
        this.chave = chave == null ? "" : chave.trim();
    }

    @PostMapping("/interno/plataforma/lojas/{slug}/suporte")
    public ResponseEntity<SuporteDaLoja.Resultado> garantir(@PathVariable String slug, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        Loja loja = conferir(slug, enviada);
        SuporteDaLoja.Resultado r = suporte.garantir(loja.id());
        return ResponseEntity.status(r.criado() ? HttpStatus.CREATED : HttpStatus.OK).header("Cache-Control", "no-store").body(r);
    }

    @PostMapping("/interno/plataforma/lojas/{slug}/suporte/senha")
    public ResponseEntity<SuporteDaLoja.Resultado> refazer(@PathVariable String slug, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        Loja loja = conferir(slug, enviada);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(suporte.refazerSenha(loja.id()));
    }

    private Loja conferir(String slug, String enviada) {
        if (chave.length() < 16) throw new ErroDeNegocio(HttpStatus.SERVICE_UNAVAILABLE, "Rota interna desligada: falta a chave INTERNO_CHAVE.");
        boolean ok = enviada != null && MessageDigest.isEqual(chave.getBytes(StandardCharsets.UTF_8), enviada.getBytes(StandardCharsets.UTF_8));
        if (!ok) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Chave interna inválida.");
        return lojas.porSlug(slug == null ? "" : slug.trim().toLowerCase(java.util.Locale.ROOT)).orElseThrow(() -> new ErroDeNegocio(HttpStatus.NOT_FOUND, "Loja não encontrada."));
    }
}
