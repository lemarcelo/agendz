package br.com.agendz.agenda;

import br.com.agendz.planos.PlanoService.Autor;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Horários fixos do assinante (v128, docs/MAPA-API-SPRING.md 10n): só quem tem a seção `planos`, como o resto da aba Planos. A loja vem do Host; nada recebe loja ou papel no corpo.
 * POST /api/assinaturas/{id}/fixos  { fixos: [{ dia 0-6, hm "HH:MM", profissionalId, servicoIds[1..10], veiculoId? }] }  → { assinatura, apagados }.
 */
@RestController
public class FixosController {

    private static final String SECAO = "hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'planos')";

    private final HorariosFixos fixos;

    public FixosController(HorariosFixos fixos) {
        this.fixos = fixos;
    }

    @PostMapping("/api/assinaturas/{id}/fixos")
    @PreAuthorize(SECAO)
    public HorariosFixos.Resposta definir(@PathVariable UUID id, @RequestBody HorariosFixos.Pedido d, @AuthenticationPrincipal Jwt jwt) {
        String nome = jwt.getClaimAsString("nome");
        return fixos.definir(id, d.fixos(), new Autor(UUID.fromString(jwt.getSubject()), nome == null ? "" : nome));
    }
}
