package br.com.agendz.agenda;

import br.com.agendz.erro.ErroDeNegocio;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;

/**
 * Profissional por serviço (bloco B1). Cada serviço do pedido tem o seu profissional; serviços CONSECUTIVOS do mesmo profissional viram um grupo (um agendamento);
 * grupos de profissionais diferentes viram agendamentos em sequência, ligados por `grupo_id` (V56). Espelho de `agruparAtribuicao` em src/domain/vinculo.js
 * (mesmos casos em backend/src/test/resources/equivalencia/atribuicao.json).
 */
public final class AtribuicaoDeServicos {

    private AtribuicaoDeServicos() {
    }

    /** Um agendamento: o profissional e os serviços dele, na ordem pedida. */
    public record Grupo(UUID profissionalId, List<UUID> servicoIds) {
    }

    /** `servicoIds` na ordem do pedido; `porServico` = serviço → profissional. Todo serviço precisa de profissional (e nenhum a mais). */
    public static List<Grupo> agrupar(List<UUID> servicoIds, Map<UUID, UUID> porServico) {
        if (porServico.size() != servicoIds.size() || !porServico.keySet().containsAll(servicoIds)) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o profissional de cada serviço.");
        }
        List<Grupo> grupos = new ArrayList<>();
        for (UUID s : servicoIds) {
            UUID p = porServico.get(s);
            Grupo ultimo = grupos.isEmpty() ? null : grupos.get(grupos.size() - 1);
            if (ultimo != null && ultimo.profissionalId().equals(p)) {
                ultimo.servicoIds().add(s);
            } else {
                List<UUID> lista = new ArrayList<>();
                lista.add(s);
                grupos.add(new Grupo(p, lista));
            }
        }
        return grupos;
    }
}
