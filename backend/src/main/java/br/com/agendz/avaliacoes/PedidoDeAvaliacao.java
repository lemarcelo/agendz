package br.com.agendz.avaliacoes;

import br.com.agendz.cifra.Cifra;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Por que um atendimento pode (ou não) receber o pedido de avaliação: a MESMA regra serve a estrela do cartão, o pedido e a fila em lote
 * (espelho de `situacaoDoPedido` em src/domain/avaliacoes.js). Lê o agendamento, os serviços e o cadastro do cliente de uma vez.
 */
final class PedidoDeAvaliacao {

    private PedidoDeAvaliacao() {
    }

    static final Map<String, String> TEXTOS = Map.of(
            "nao_concluido", "Só se pede avaliação de um atendimento concluído.",
            "sem_servico", "Este atendimento é só de produto: não gera pedido de avaliação.",
            "sem_cadastro", "Este atendimento está sem cadastro de cliente: não há como enviar o pedido. Cadastre o cliente com telefone para os próximos.",
            "sem_telefone", "Cliente sem telefone válido: não dá para enviar o pedido pelo WhatsApp. Cadastre o telefone na ficha do cliente.",
            "sem_mensagens", "Este cliente pediu para não receber mensagens.");

    /** `motivo` = "ok" ou a chave de {@link #TEXTOS}; `numero` (55+DDD+número) e `nome` só quando ok. */
    record Situacao(String motivo, UUID profissionalId, Instant pedidaEm, boolean jaAvaliou, String numero, String nome, UUID clienteId) {
        boolean ok() {
            return "ok".equals(motivo);
        }

        String aviso() {
            return ok() ? "" : TEXTOS.get(motivo);
        }
    }

    /** null = agendamento não existe (ou é de outra loja: o RLS o esconde). `travar` bloqueia a linha do agendamento até o fim da transação. */
    static Situacao ler(JdbcTemplate jdbc, Cifra cifra, UUID agendamentoId, boolean travar) {
        List<Situacao> l = jdbc.query("select a.status, a.cliente_id, a.profissional_id, a.avaliacao_pedida_em, "
                        + "exists(select 1 from agendamento_servico s where s.agendamento_id = a.id) as tem_servico, "
                        + "exists(select 1 from avaliacao v where v.agendamento_id = a.id) as ja_avaliou, "
                        + "c.nome, c.apelido, c.telefone_cif, c.sem_mensagens "
                        + "from agendamento a left join cliente c on c.id = a.cliente_id where a.id = ?" + (travar ? " for update of a" : ""),
                (rs, i) -> {
                    UUID clienteId = rs.getObject("cliente_id", UUID.class);
                    OffsetDateTime pedida = rs.getObject("avaliacao_pedida_em", OffsetDateTime.class);
                    String numero = "";
                    String nome = null;
                    String motivo;
                    if (!"concluido".equals(rs.getString("status"))) motivo = "nao_concluido";
                    else if (!rs.getBoolean("tem_servico")) motivo = "sem_servico";
                    else if (clienteId == null || rs.getString("nome") == null) motivo = "sem_cadastro";
                    else {
                        String cif = rs.getString("telefone_cif");
                        numero = cif == null ? "" : AvaliacaoRegras.numeroWhatsapp(cifra.decifrar(cif));
                        String ap = rs.getString("apelido");
                        nome = ap != null && !ap.isBlank() ? ap : rs.getString("nome");
                        motivo = numero.isEmpty() ? "sem_telefone" : rs.getBoolean("sem_mensagens") ? "sem_mensagens" : "ok";
                    }
                    return new Situacao(motivo, rs.getObject("profissional_id", UUID.class), pedida == null ? null : pedida.toInstant(), rs.getBoolean("ja_avaliou"),
                            "ok".equals(motivo) ? numero : "", nome, clienteId);
                }, agendamentoId);
        return l.isEmpty() ? null : l.get(0);
    }
}
