package br.com.agendz.planos;

import br.com.agendz.planos.PlanoService.PaginaPlanos;
import br.com.agendz.planos.PlanoService.PedidoPublico;
import br.com.agendz.planos.PlanoService.Recebido;
import br.com.agendz.planos.PlanoService.SaldoPublico;
import br.com.agendz.planos.PlanoService.UsoPublico;
import jakarta.validation.constraints.Size;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Página pública de planos, SEM login (GET já liberado em `SegurancaConfig`; o POST do pedido está na lista). A loja vem do Host; nenhuma rota recebe loja, cliente ou papel.
 * GET /api/publico/planos, POST /api/publico/planos/pedidos, GET /api/publico/planos/saldo?telefone= (docs/MAPA-API-SPRING.md, 10n).
 */
@RestController
public class PlanoPublicoController {

    private final PlanoService planos;
    private final Clock relogio;

    public PlanoPublicoController(PlanoService planos, Clock relogio) {
        this.planos = planos;
        this.relogio = relogio;
    }

    /** IP de quem pede: o primeiro do X-Forwarded-For que o Caddy escreve (ele substitui o que o cliente mandar), senão o da conexão. Só caracteres de IP. */
    static String ip(HttpServletRequest req) {
        String f = req.getHeader("X-Forwarded-For");
        String v = f != null && !f.isBlank() ? f.split(",")[0].trim() : req.getRemoteAddr();
        return v != null && v.length() <= 45 && v.matches("[0-9a-fA-F:.]+") ? v : "desconhecido";
    }

    @GetMapping("/api/publico/planos")
    public PaginaPlanos pagina(HttpServletRequest req) {
        return planos.paginaPublica(ip(req));
    }

    @PostMapping("/api/publico/planos/pedidos")
    public ResponseEntity<Recebido> pedir(@Valid @RequestBody PedidoPublico d, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(planos.pedirPlano(ip(req), relogio.instant(), d));
    }

    @GetMapping("/api/publico/planos/saldo")
    public SaldoPublico saldo(@RequestParam String telefone, HttpServletRequest req) {
        return planos.saldoPorTelefone(ip(req), relogio.instant(), telefone);
    }

    /** Corpo da prévia: telefone no corpo (POST), nunca na URL. */
    public record ConsultaUso(@Size(max = 30) String telefone, @Size(max = 10) List<UUID> servicoIds, Instant inicio) {
    }

    /** POST /api/publico/planos/uso: "este horário usa um atendimento do seu plano?" Só sim ou não. */
    @PostMapping("/api/publico/planos/uso")
    public UsoPublico uso(@Valid @RequestBody ConsultaUso d, HttpServletRequest req) {
        return planos.usoPorTelefone(ip(req), relogio.instant(), d.telefone(), d.servicoIds(), d.inicio());
    }
}
