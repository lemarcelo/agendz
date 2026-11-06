package br.com.agendz.servicos;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serviços × profissionais (bloco A1). Leitura: toda a equipe (o Atender e a agenda filtram por aqui). Escrita: Serviços > Editar (seção `servicos`) e
 * Equipe > Editar (só o proprietário) gravam a mesma tabela.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class VinculoServicosController {

    public record Ids(List<UUID> ids) {
    }

    private final VinculoServicos vinculos;

    public VinculoServicosController(VinculoServicos vinculos) {
        this.vinculos = vinculos;
    }

    /** { "<servicoId>": ["<usuarioId>", ...] } */
    @GetMapping("/api/servicos/profissionais")
    public Map<String, List<UUID>> porServico() {
        Map<String, List<UUID>> saida = new LinkedHashMap<>();
        vinculos.porServico().forEach((k, v) -> saida.put(k.toString(), v));
        return saida;
    }

    @PutMapping("/api/servicos/{id}/profissionais")
    @PreAuthorize("@perm.pode(authentication, 'servicos')")
    public Ids definirDoServico(@PathVariable UUID id, @RequestBody Ids corpo) {
        return new Ids(vinculos.definirDoServico(id, corpo == null ? null : corpo.ids()));
    }

    @GetMapping("/api/usuarios/{id}/servicos")
    public Ids doProfissional(@PathVariable UUID id) {
        return new Ids(vinculos.doProfissional(id));
    }

    @PutMapping("/api/usuarios/{id}/servicos")
    @PreAuthorize("hasRole('DONO')")
    public Ids definirDoProfissional(@PathVariable UUID id, @RequestBody Ids corpo) {
        return new Ids(vinculos.definirDoProfissional(id, corpo == null ? null : corpo.ids()));
    }
}
