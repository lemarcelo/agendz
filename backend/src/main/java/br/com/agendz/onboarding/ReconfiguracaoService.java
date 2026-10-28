package br.com.agendz.onboarding;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService;
import br.com.agendz.escala.EscalaService.Escala;
import br.com.agendz.escala.EscalaService.Faixa;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Reconfigurar a loja com senha e desfazer (docs/PROMPT-CONTINUACAO.md, item 00b). Depois que o assistente foi concluído, os passos de
 * serviços, equipe e expediente só valem dentro de uma reconfiguração autorizada pela senha do dono (30 minutos). Cada reconfiguração guarda o
 * expediente de antes e os ids do que criou; desfazer devolve o expediente e DESATIVA o criado, nunca exclui e nunca toca dado lançado.
 * Todas as funções rodam dentro de `LojaJdbc.naLoja` (RLS).
 */
@Component
public class ReconfiguracaoService {

    private final ObjectMapper json;
    private final EscalaService escalas;

    public ReconfiguracaoService(ObjectMapper json, EscalaService escalas) {
        this.json = json;
        this.escalas = escalas;
    }

    /**
     * Reconfiguração autorizada agora para esta pessoa, ou `null` se o assistente ainda não foi concluído (primeiro acesso: a senha acabou de ser
     * trocada, não há o que confirmar). Concluído e sem autorização: 403.
     */
    public UUID autorizada(JdbcTemplate jdbc, UUID usuarioId) {
        Boolean concluido = jdbc.queryForObject("select coalesce(bool_or(concluido_em is not null), false) from onboarding", Boolean.class);
        if (!Boolean.TRUE.equals(concluido)) return null;
        List<UUID> ids = jdbc.query("select id from reconfiguracao where usuario_id = ? and autorizada_ate > now() and desfeita_em is null order by criada_em desc limit 1",
                (rs, i) -> rs.getObject("id", UUID.class), usuarioId);
        if (ids.isEmpty()) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Confirme sua senha para reconfigurar a loja");
        return ids.get(0);
    }

    public void anotarServico(JdbcTemplate jdbc, UUID reconfiguracao, UUID servicoId) {
        if (reconfiguracao != null) {
            jdbc.update("update reconfiguracao set servicos_criados = servicos_criados || jsonb_build_array(?::text) where id = ?", servicoId.toString(), reconfiguracao);
        }
    }

    public void anotarPessoa(JdbcTemplate jdbc, UUID reconfiguracao, UUID usuarioId) {
        if (reconfiguracao != null) {
            jdbc.update("update reconfiguracao set usuarios_criados = usuarios_criados || jsonb_build_array(?::text) where id = ?", usuarioId.toString(), reconfiguracao);
        }
    }

    public void anotarExpediente(JdbcTemplate jdbc, UUID reconfiguracao) {
        if (reconfiguracao != null) jdbc.update("update reconfiguracao set expediente_trocado = true where id = ?", reconfiguracao);
    }

    /** Expediente da loja em JSON (null = loja sem expediente). */
    public String expedienteAtual(JdbcTemplate jdbc) {
        Map<Integer, List<Faixa>> m = escalas.ler(jdbc, null);
        return EscalaService.temFaixa(m) ? escrever(EscalaService.paraJson(m)) : null;
    }

    /** Grava de volta um expediente guardado (null = sem expediente: só apaga). Passa pela mesma validação do cadastro. */
    public void restaurarExpediente(JdbcTemplate jdbc, UUID lojaId, String guardado) {
        if (guardado == null) {
            escalas.gravar(jdbc, lojaId, null, Map.of());
            return;
        }
        try {
            escalas.gravar(jdbc, lojaId, null, EscalaService.validar(json.readValue(guardado, Escala.class)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String escrever(Object v) {
        try {
            return json.writeValueAsString(v);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
