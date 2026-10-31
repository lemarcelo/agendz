package br.com.agendz.avaliacoes;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Página de avaliação do cliente: SEM login (liberada em `SegurancaConfig`), a loja vem do Host. O acesso é o token pessoal no cabeçalho `X-Acesso` (NUNCA na URL,
 * que vai para log e histórico). Errado, vencido ou já usado: a mesma resposta (404). Mapa: docs/MAPA-API-SPRING.md, seção 10p.
 */
@RestController
public class AvaliacaoPublicoController {

    private final AvaliacaoService servico;

    public AvaliacaoPublicoController(AvaliacaoService servico) {
        this.servico = servico;
    }

    /** GET /api/publico/avaliacoes: o que a página mostra (loja, serviços, profissional e data; nunca o nome do cliente). */
    @GetMapping("/api/publico/avaliacoes")
    public ResponseEntity<AvaliacaoService.Dados> dados(@RequestHeader(value = "X-Acesso", required = false) String token, HttpServletRequest req) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(servico.dados(ip(req), token));
    }

    /** POST /api/publico/avaliacoes {nota, texto?, anonimo?, site?}: grava e gasta o token. */
    @PostMapping("/api/publico/avaliacoes")
    public ResponseEntity<Map<String, Boolean>> avaliar(@RequestHeader(value = "X-Acesso", required = false) String token, @RequestBody(required = false) JsonNode corpo, HttpServletRequest req) {
        servico.avaliar(ip(req), token, corpo);
        return ResponseEntity.status(201).header("Cache-Control", "no-store").body(Map.of("ok", true));
    }

    private static String ip(HttpServletRequest req) {
        String f = req.getHeader("X-Forwarded-For");
        String v = f != null && !f.isBlank() ? f.split(",")[0].trim() : req.getRemoteAddr();
        return v != null && v.length() <= 45 && v.matches("[0-9a-fA-F:.]+") ? v : "desconhecido";
    }
}
