package br.com.agendz.push;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.LojaContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Aviso com o app fechado (v130). Cada pessoa cuida só dos próprios aparelhos.
 * | GET    /api/push/chave             | { chave } pública do servidor (VAPID); 503 se o recurso não está ligado
 * | GET    /api/push/inscricoes        | os aparelhos da pessoa (sem endpoint nem chaves)
 * | POST   /api/push/inscricoes        | { endpoint, keys: { p256dh, auth }, aparelho? } → 201
 * | DELETE /api/push/inscricoes/{id}
 * | POST   /api/push/teste             | manda uma mensagem de teste aos aparelhos da pessoa → { enviados, falhas }
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class PushController {

    public record Chaves(@NotBlank @Size(max = 120) String p256dh, @NotBlank @Size(max = 60) String auth) {
    }

    public record Inscrever(@NotBlank @Size(max = 600) String endpoint, @NotNull @Valid Chaves keys, @Size(max = 60) String aparelho) {
    }

    private final PushConfig config;
    private final Inscricoes inscricoes;
    private final EntregaPush entrega;
    private final ObjectMapper json;

    public PushController(PushConfig config, Inscricoes inscricoes, EntregaPush entrega, ObjectMapper json) {
        this.config = config;
        this.inscricoes = inscricoes;
        this.entrega = entrega;
        this.json = json;
    }

    private void exigirLigado() {
        if (!config.ligado()) throw new ErroDeNegocio(HttpStatus.SERVICE_UNAVAILABLE, "Aviso com o app fechado ainda não está ligado neste servidor.");
    }

    @GetMapping("/api/push/chave")
    public Map<String, String> chave() {
        exigirLigado();
        return Map.of("chave", config.publica());
    }

    @GetMapping("/api/push/inscricoes")
    public List<Inscricoes.Item> listar(@AuthenticationPrincipal Jwt jwt) {
        return inscricoes.listar(UUID.fromString(jwt.getSubject()));
    }

    @PostMapping("/api/push/inscricoes")
    @ResponseStatus(HttpStatus.CREATED)
    public Inscricoes.Item inscrever(@Valid @RequestBody Inscrever d, @AuthenticationPrincipal Jwt jwt) {
        exigirLigado();
        return inscricoes.inscrever(UUID.fromString(jwt.getSubject()), d.endpoint(), d.keys().p256dh(), d.keys().auth(), d.aparelho());
    }

    @DeleteMapping("/api/push/inscricoes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remover(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        inscricoes.remover(UUID.fromString(jwt.getSubject()), id);
    }

    @PostMapping("/api/push/teste")
    public Map<String, Integer> testar(@AuthenticationPrincipal Jwt jwt) throws com.fasterxml.jackson.core.JsonProcessingException {
        exigirLigado();
        UUID eu = UUID.fromString(jwt.getSubject());
        String mensagem = json.writeValueAsString(Map.of("titulo", LojaContext.exigir().nome(), "texto", "Teste: o aviso com o app fechado está funcionando.", "url", "/", "tag", "teste"));
        int enviados = 0;
        int falhas = 0;
        for (Inscricoes.Alvo a : inscricoes.daPessoa(eu)) {
            Enviador.Resultado r = entrega.enviar(a, mensagem);
            if (r == Enviador.Resultado.ENTREGUE) {
                enviados++;
            } else {
                falhas++;
                if (r == Enviador.Resultado.INSCRICAO_MORTA) inscricoes.remover(eu, a.id()); // o serviço de push disse que esse aparelho não existe mais
            }
        }
        return Map.of("enviados", enviados, "falhas", falhas);
    }
}
