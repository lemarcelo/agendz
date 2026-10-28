package br.com.agendz.publico;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Rotas do link de agendamento do cliente: SEM login (liberadas em `SegurancaConfig`), a loja vem do Host. Nenhuma recebe loja, cliente ou papel no corpo.
 * O acesso a um horário é o token (cabeçalho `X-Acesso`), que vale só para aquele horário. Mapa: docs/MAPA-API-SPRING.md, seção 10b.
 */
@RestController
public class LinkPublicoController {

    public record Tokens(@Size(max = 10) List<@Size(max = 64) String> tokens) {
    }

    private final LinkPublicoService servico;

    public LinkPublicoController(LinkPublicoService servico) {
        this.servico = servico;
    }

    /** GET /api/publico/agendar: serviços e profissionais que a página mostra. */
    @GetMapping("/api/publico/agendar")
    public LinkPublicoService.Pagina pagina() {
        return servico.pagina();
    }

    /** GET /api/publico/horarios?data=2026-10-29&servicos=id,id&profissionalId=: horários livres do dia (só início e profissional). */
    @GetMapping("/api/publico/horarios")
    public List<LinkPublicoService.Horario> horarios(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate data, @RequestParam List<UUID> servicos,
                                                     @RequestParam(required = false) UUID profissionalId, HttpServletRequest req) {
        return servico.horarios(ip(req), data, servicos, profissionalId);
    }

    /** GET /api/publico/dias?de=2026-10-29&dias=14&servicos=id,id&profissionalId=: dias com ao menos um horário livre. */
    @GetMapping("/api/publico/dias")
    public List<LocalDate> dias(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate de, @RequestParam int dias, @RequestParam List<UUID> servicos,
                                @RequestParam(required = false) UUID profissionalId, HttpServletRequest req) {
        return servico.dias(ip(req), de, dias, servicos, profissionalId);
    }

    /** POST /api/publico/agendamentos: pede um horário (entra a confirmar). Devolve o resumo e o token de acesso, uma vez. */
    @PostMapping("/api/publico/agendamentos")
    public ResponseEntity<LinkPublicoService.Criado> agendar(@Valid @RequestBody LinkPublicoService.Pedido pedido, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(servico.agendar(ip(req), pedido));
    }

    /** POST /api/publico/meus: os horários a que os tokens dão acesso (POST só para o token não ir na URL). */
    @PostMapping("/api/publico/meus")
    public List<LinkPublicoService.Resumo> meus(@Valid @RequestBody Tokens corpo, HttpServletRequest req) {
        return servico.meus(ip(req), corpo.tokens());
    }

    /** POST /api/publico/agendamentos/{id}/cancelar (cabeçalho X-Acesso): cancela só com 24 h ou mais de antecedência. */
    @PostMapping("/api/publico/agendamentos/{id}/cancelar")
    public LinkPublicoService.Resumo cancelar(@PathVariable UUID id, @RequestHeader(value = "X-Acesso", required = false) String token, HttpServletRequest req) {
        return servico.cancelar(ip(req), id, token);
    }

    /** IP de quem pede: o primeiro do X-Forwarded-For que o Caddy escreve (ele substitui o que o cliente mandar), senão o da conexão. Só caracteres de IP. */
    static String ip(HttpServletRequest req) {
        String f = req.getHeader("X-Forwarded-For");
        String v = f != null && !f.isBlank() ? f.split(",")[0].trim() : req.getRemoteAddr();
        return v != null && v.length() <= 45 && v.matches("[0-9a-fA-F:.]+") ? v : "desconhecido";
    }
}
