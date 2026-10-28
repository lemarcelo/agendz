package br.com.agendz.agenda;

import br.com.agendz.tenant.LojaJdbc;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * O "tick" do simulador (engine.tick) no servidor, por loja, uma vez por minuto (docs/F2-front-na-api-real.md, parte 5a):
 * - confirmado cujo serviço terminou vira CONCLUÍDO (automático);
 * - a confirmar cujo serviço terminou sem confirmação vira CANCELADO (motivo "falta_confirmacao").
 * Status escolhido à mão depois do horário começar (`status_manual_inicio` = `inicio`) não é tocado; remarcar libera de novo.
 * Fica para as próximas fatias (precisam de módulos que o servidor ainda não tem): confirmação do serviço antes de concluir, aviso e mensagem
 * ao cliente, lembretes, baixa de estoque, e o marcador "pronto/aguardando retirada" da estética.
 * A leitura da agenda não tem efeito colateral: quem muda status é só esta rotina e as ações do usuário.
 */
@Component
public class AgendaAutomatica {

    private static final Logger LOG = LoggerFactory.getLogger(AgendaAutomatica.class);

    private final JdbcTemplate dono;
    private final LojaJdbc banco;
    private final Clock relogio;
    private final boolean ativa;

    public AgendaAutomatica(JdbcTemplate dono, LojaJdbc banco, Clock relogio, @Value("${agendz.automacao.ativa:true}") boolean ativa) {
        this.dono = dono;
        this.banco = banco;
        this.relogio = relogio;
        this.ativa = ativa;
    }

    @Scheduled(fixedDelayString = "${agendz.automacao.intervalo-ms:60000}", initialDelayString = "${agendz.automacao.atraso-ms:30000}")
    public void rodar() {
        if (!ativa) return;
        try {
            executar(relogio.instant());
        } catch (RuntimeException e) {
            LOG.warn("Automação da agenda falhou: {}", e.getMessage()); // nunca derruba o agendador; tenta de novo no próximo minuto
        }
    }

    /** Roda todas as lojas com a hora dada. Devolve quantos agendamentos mudaram (útil nos testes). */
    public int executar(Instant agora) {
        int mudou = 0;
        List<UUID> lojas = dono.queryForList("select id from loja", UUID.class);
        for (UUID loja : lojas) {
            try {
                mudou += banco.naLoja(loja, jdbc -> daLoja(jdbc, loja, agora));
            } catch (RuntimeException e) {
                LOG.warn("Automação da agenda falhou na loja {}: {}", loja, e.getMessage()); // uma loja com problema não trava as outras
            }
        }
        return mudou;
    }

    private int daLoja(JdbcTemplate jdbc, UUID loja, Instant agora) {
        OffsetDateTime ate = OffsetDateTime.ofInstant(agora, ZoneOffset.UTC);
        int concluidos = jdbc.update(
                "with feitos as (update agendamento set status = 'concluido', atualizado_em = now() "
                        + "where status = 'confirmado' and fim_servico <= ? and status_manual_inicio is distinct from inicio returning id, fim_servico) "
                        + "insert into agendamento_evento (loja_id, agendamento_id, em, autor_id, autor_nome, campo, de, para) "
                        + "select ?::uuid, id, fim_servico, null, 'Sistema', 'status', 'Confirmado', 'Concluído (automático)' from feitos",
                ate, loja.toString());
        int cancelados = jdbc.update(
                "with perdidos as (update agendamento set status = 'cancelado', motivo_cancelamento = 'falta_confirmacao', atualizado_em = now() "
                        + "where status = 'a_confirmar' and fim_servico <= ? and status_manual_inicio is distinct from inicio returning id, fim_servico) "
                        + "insert into agendamento_evento (loja_id, agendamento_id, em, autor_id, autor_nome, campo, de, para) "
                        + "select ?::uuid, id, fim_servico, null, 'Sistema', 'status', 'A confirmar', 'Cancelado (sem confirmação)' from perdidos",
                ate, loja.toString());
        return concluidos + cancelados;
    }
}
