package br.com.agendz.servicos;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Capacidades;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * G3 (V63): boxes permitidos por serviço (estética). Lista vazia = qualquer box. Só o proprietário grava; quem tem a agenda lê.
 * GET /api/servicos/boxes → { "<servicoId>": ["<boxId>", ...] } só dos serviços com restrição.
 * PUT /api/servicos/{id}/boxes { boxIds } substitui a lista do serviço. O cliente nunca escolhe box: o servidor decide.
 */
@RestController
public class ServicoBoxController {

    public record Corpo(@Size(max = 20) List<UUID> boxIds) {
    }

    private final LojaJdbc banco;

    public ServicoBoxController(LojaJdbc banco) {
        this.banco = banco;
    }

    @GetMapping("/api/servicos/boxes")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'agenda')")
    public Map<String, List<UUID>> listar() {
        if (!Capacidades.usaRecursoFisico(LojaContext.exigir())) return Map.of();
        return banco.naLoja(jdbc -> {
            Map<String, List<UUID>> mapa = new LinkedHashMap<>();
            jdbc.query("select servico_id, box_id from servico_box order by servico_id, box_id", rs -> {
                mapa.computeIfAbsent(rs.getString(1), k -> new java.util.ArrayList<>()).add(rs.getObject(2, UUID.class));
            });
            return mapa;
        });
    }

    @PutMapping("/api/servicos/{id}/boxes")
    @PreAuthorize("hasRole('DONO')")
    public Map<String, List<UUID>> gravar(@PathVariable UUID id, @RequestBody Corpo corpo) {
        var loja = LojaContext.exigir();
        if (!Capacidades.usaRecursoFisico(loja)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Este tipo de estabelecimento não usa box.");
        List<UUID> boxIds = corpo == null || corpo.boxIds() == null ? List.of() : corpo.boxIds().stream().filter(java.util.Objects::nonNull).distinct().toList();
        return banco.naLoja(jdbc -> {
            Integer existe = jdbc.queryForObject("select count(*) from servico where id = ?", Integer.class, id);
            if (existe == null || existe == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado.");
            if (!boxIds.isEmpty()) {
                Integer achados = jdbc.queryForObject("select count(*) from box where id = any (?::uuid[])", Integer.class, (Object) boxIds.stream().map(UUID::toString).toArray(String[]::new));
                if (achados == null || achados != boxIds.size()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha só boxes da loja.");
                // carro já agendado, no futuro, num box que deixaria de servir: permitido (decisão G2/G3), só vale daqui para a frente
            }
            jdbc.update("delete from servico_box where servico_id = ?", id);
            for (UUID b : boxIds) jdbc.update("insert into servico_box (loja_id, servico_id, box_id) values (?::uuid, ?, ?)", loja.id().toString(), id, b);
            return Map.of(id.toString(), boxIds);
        });
    }
}
