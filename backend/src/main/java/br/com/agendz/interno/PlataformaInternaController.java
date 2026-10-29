package br.com.agendz.interno;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rotas internas do Admin da plataforma (A3; rede interna, o Caddy não publica /interno) com a chave `X-Interno-Chave` (INTERNO_CHAVE, 16+ caracteres;
 * sem chave configurada = 503, nunca aberta). Cada rota que mexe em loja grava o motivo e o evento no Admin API (esta base não guarda auditoria).
 *   GET  /interno/plataforma/lojas                               → lojas com situação e contagens (nada de cliente final)
 *   POST /interno/plataforma/lojas                               → cria loja + dono (senha temporária uma vez) + suporte
 *   GET  /interno/plataforma/lojas/{slug}/usuarios               → equipe visível (sem suporte e fumaça)
 *   POST /interno/plataforma/lojas/{slug}/usuarios/{id}/senha    → nova senha temporária (uma vez)
 *   PUT  /interno/plataforma/lojas/{slug}/usuarios/{id}/ativo    → {ativo}; nunca deixa a loja sem proprietário ativo
 *   GET|PUT /interno/plataforma/lojas/{slug}/regras              → limites e campos obrigatórios (a loja aplica no servidor)
 *   GET|PUT /interno/plataforma/lojas/{slug}/status              → em_teste | ativo | em_atraso | suspenso | encerrado (suspenso/encerrado = 402 na loja)
 */
@RestController
public class PlataformaInternaController {

    public record CorpoAtivo(Boolean ativo) {
    }

    public record CorpoStatus(String status) {
    }

    public record CorpoRegras(Integer limiteAgendas, Integer limiteUsuarios, Boolean mensagensAtivas, Integer limiteMensagensMes, List<String> cadastroObrigatorios) {
    }

    private final PlataformaService servico;
    private final String chave;

    public PlataformaInternaController(PlataformaService servico, @Value("${agendz.interno.chave:}") String chave) {
        this.servico = servico;
        this.chave = chave == null ? "" : chave.trim();
    }

    @GetMapping("/interno/plataforma/lojas")
    public ResponseEntity<List<PlataformaService.ResumoLoja>> listar(@RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(servico.listar());
    }

    @PostMapping("/interno/plataforma/lojas")
    public ResponseEntity<PlataformaService.LojaCriada> criar(@RequestBody PlataformaService.NovaLoja corpo, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        return ResponseEntity.status(HttpStatus.CREATED).header("Cache-Control", "no-store").body(servico.criar(corpo));
    }

    @GetMapping("/interno/plataforma/lojas/{slug}/usuarios")
    public ResponseEntity<List<PlataformaService.UsuarioDaLoja>> usuarios(@PathVariable String slug, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(servico.usuarios(servico.loja(slug)));
    }

    @PostMapping("/interno/plataforma/lojas/{slug}/usuarios/{id}/senha")
    public ResponseEntity<PlataformaService.SenhaNova> senha(@PathVariable String slug, @PathVariable UUID id, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        Loja loja = servico.loja(slug);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(servico.redefinirSenha(loja, id));
    }

    @PutMapping("/interno/plataforma/lojas/{slug}/usuarios/{id}/ativo")
    public ResponseEntity<Map<String, Boolean>> ativo(@PathVariable String slug, @PathVariable UUID id, @RequestBody CorpoAtivo corpo, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        if (corpo == null || corpo.ativo() == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Diga se o usuário fica ativo.");
        servico.ativar(servico.loja(slug), id, corpo.ativo());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("ativo", corpo.ativo()));
    }

    @GetMapping("/interno/plataforma/lojas/{slug}/regras")
    public ResponseEntity<RegrasDaLoja.Regras> regras(@PathVariable String slug, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(servico.regras(servico.loja(slug)));
    }

    @PutMapping("/interno/plataforma/lojas/{slug}/regras")
    public ResponseEntity<RegrasDaLoja.Regras> salvarRegras(@PathVariable String slug, @RequestBody CorpoRegras c, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        RegrasDaLoja.Regras r = new RegrasDaLoja.Regras(c.limiteAgendas(), c.limiteUsuarios(), c.mensagensAtivas() == null || c.mensagensAtivas(), c.limiteMensagensMes(),
                c.cadastroObrigatorios() == null ? List.of() : c.cadastroObrigatorios());
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(servico.salvarRegras(servico.loja(slug), r));
    }

    @GetMapping("/interno/plataforma/lojas/{slug}/status")
    public ResponseEntity<Map<String, String>> status(@PathVariable String slug, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("status", servico.statusDe(servico.loja(slug))));
    }

    @PutMapping("/interno/plataforma/lojas/{slug}/status")
    public ResponseEntity<Map<String, String>> mudarStatus(@PathVariable String slug, @RequestBody CorpoStatus c, @RequestHeader(value = "X-Interno-Chave", required = false) String enviada) {
        conferir(enviada);
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(Map.of("status", servico.mudarStatus(servico.loja(slug), c == null ? null : c.status())));
    }

    private void conferir(String enviada) {
        if (chave.length() < 16) throw new ErroDeNegocio(HttpStatus.SERVICE_UNAVAILABLE, "Rota interna desligada: falta a chave INTERNO_CHAVE.");
        boolean ok = enviada != null && MessageDigest.isEqual(chave.getBytes(StandardCharsets.UTF_8), enviada.getBytes(StandardCharsets.UTF_8));
        if (!ok) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Chave interna inválida.");
    }
}
