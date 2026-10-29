package br.com.agendz.suporte;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Suporte dentro do sistema da loja (A4): quem está logado abre chamados e conversa com a equipe da plataforma. A loja (pelo Host) e o usuário (pelo token)
 * vão para a Admin API por rota interna: NUNCA vêm do corpo (IDOR). O dono vê todos os chamados da loja; os demais, só os que abriram. Outro usuário ou outra
 * loja = 404. Nota interna, prioridade e atribuição não existem no que chega aqui. Fica liberado com a loja suspensa (LojaFilter: `/api/suporte`).
 *
 * | rota                                     |
 * | GET  /api/suporte/chamados               | lista (do usuário; o dono vê a loja toda)
 * | POST /api/suporte/chamados               | { assunto, categoria, texto }
 * | GET  /api/suporte/chamados/nao-lidas     | { naoLidas }
 * | GET  /api/suporte/chamados/{id}          | conversa (abrir marca como lido)
 * | POST /api/suporte/chamados/{id}/mensagens| { texto }
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class SuporteController {

    public record Novo(@NotNull @Size(min = 1, max = 120, message = "O assunto pode ter até 120 caracteres") String assunto, @NotNull @Size(max = 20) String categoria,
                       @NotNull @Size(min = 1, max = 4000, message = "A mensagem pode ter até 4000 caracteres") String texto) {
    }

    public record Resposta(@NotNull @Size(min = 1, max = 4000, message = "A mensagem pode ter até 4000 caracteres") String texto) {
    }

    private final AdminLigacao admin;

    public SuporteController(AdminLigacao admin) {
        this.admin = admin;
    }

    private static <T> ResponseEntity<T> semCache(HttpStatus st, T corpo) {
        return ResponseEntity.status(st).cacheControl(CacheControl.noStore()).body(corpo);
    }

    private static String quem(String loja, Jwt t, boolean todos) {
        return "loja=" + URLEncoder.encode(loja, StandardCharsets.UTF_8) + "&usuario=" + t.getSubject() + "&todos=" + todos;
    }

    private static boolean ehDono(Jwt t) {
        return "dono".equals(t.getClaimAsString("papel"));
    }

    private static String nome(Jwt t) {
        String n = t.getClaimAsString("nome");
        return n == null || n.isBlank() ? "Usuário" : n;
    }

    private static UUID id(String s) {
        try {
            return UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Chamado não encontrado.");
        }
    }

    // GET /api/suporte/chamados
    @GetMapping("/api/suporte/chamados")
    public ResponseEntity<JsonNode> listar(@AuthenticationPrincipal Jwt t) {
        Loja loja = LojaContext.exigir();
        return semCache(HttpStatus.OK, admin.obter("?" + quem(loja.slug(), t, ehDono(t))));
    }

    // GET /api/suporte/chamados/nao-lidas
    @GetMapping("/api/suporte/chamados/nao-lidas")
    public ResponseEntity<JsonNode> naoLidas(@AuthenticationPrincipal Jwt t) {
        Loja loja = LojaContext.exigir();
        return semCache(HttpStatus.OK, admin.obter("/nao-lidas?" + quem(loja.slug(), t, ehDono(t))));
    }

    // POST /api/suporte/chamados  { assunto, categoria, texto }
    @PostMapping("/api/suporte/chamados")
    public ResponseEntity<JsonNode> abrir(@Valid @RequestBody Novo n, @AuthenticationPrincipal Jwt t) {
        Loja loja = LojaContext.exigir();
        ObjectNode corpo = admin.objetos().createObjectNode();
        corpo.put("loja", loja.slug()).put("lojaNome", loja.nome()).put("usuario", t.getSubject()).put("usuarioNome", nome(t)).put("usuarioPapel", String.valueOf(t.getClaimAsString("papel")))
                .put("todos", ehDono(t)).put("assunto", n.assunto()).put("categoria", n.categoria()).put("texto", n.texto());
        return semCache(HttpStatus.CREATED, admin.enviar("", corpo));
    }

    // GET /api/suporte/chamados/{id}
    @GetMapping("/api/suporte/chamados/{id}")
    public ResponseEntity<JsonNode> conversa(@PathVariable String id, @AuthenticationPrincipal Jwt t) {
        Loja loja = LojaContext.exigir();
        return semCache(HttpStatus.OK, admin.obter("/" + id(id) + "?" + quem(loja.slug(), t, ehDono(t))));
    }

    // POST /api/suporte/chamados/{id}/mensagens  { texto }
    @PostMapping("/api/suporte/chamados/{id}/mensagens")
    public ResponseEntity<JsonNode> responder(@PathVariable String id, @Valid @RequestBody Resposta r, @AuthenticationPrincipal Jwt t) {
        Loja loja = LojaContext.exigir();
        ObjectNode corpo = admin.objetos().createObjectNode();
        corpo.put("loja", loja.slug()).put("usuario", t.getSubject()).put("usuarioNome", nome(t)).put("todos", ehDono(t)).put("texto", r.texto());
        return semCache(HttpStatus.CREATED, admin.enviar("/" + id(id) + "/mensagens", corpo));
    }
}
