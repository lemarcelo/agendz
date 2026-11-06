package br.com.agendz.agenda;

import br.com.agendz.configuracao.RegrasAtendimento;
import br.com.agendz.escala.Fuso;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * B2: ordem de preferência na escolha automática do profissional, segundo o modo da loja ({@link ModoEscolha}; V57). Só vale com a escolha automática LIGADA
 * (sem ela a ordem é a de sempre). Quem chama pega o primeiro da ordem que atende o serviço e cabe no horário. Sempre dentro de uma transação da loja.
 * Fila: o ponteiro (último escolhido, por serviço) só avança em {@link #registrar}, chamado na criação do agendamento (mesma transação: rollback desfaz).
 */
public final class EscolhaAutomatica {

    private EscolhaAutomatica() {
    }

    /** `servicoChave` = o primeiro serviço do pedido (a fila é por serviço). `dia` = dia local do atendimento (o mês do "menos atendeu" é o dele). */
    public static List<UUID> ordem(JdbcTemplate jdbc, List<UUID> ids, UUID servicoChave, LocalDate dia) {
        if (ids.size() < 2) return ids;
        String modo = RegrasAtendimento.ler(jdbc).modoEscolha();
        if (ModoEscolha.LIVRE.equals(modo)) return Folga.ordem(jdbc, ids, dia);
        List<String> texto = ids.stream().map(UUID::toString).toList();
        Instant ini = dia.atStartOfDay(Fuso.BRASIL).toInstant();
        Instant mesIni = dia.withDayOfMonth(1).atStartOfDay(Fuso.BRASIL).toInstant();
        Instant mesFim = dia.withDayOfMonth(1).plusMonths(1).atStartOfDay(Fuso.BRASIL).toInstant();
        ModoEscolha.Limites l = new ModoEscolha.Limites(ini.toEpochMilli(), dia.plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant().toEpochMilli(),
                dia.plusDays(Folga.JANELA_DIAS).atStartOfDay(Fuso.BRASIL).toInstant().toEpochMilli(), mesIni.toEpochMilli(), mesFim.toEpochMilli());
        List<Folga.Ag> ags = ModoEscolha.MENOS.equals(modo)
                ? jdbc.query("select profissional_id, inicio from agendamento where status <> 'cancelado' and inicio >= ? and inicio < ?",
                        (rs, i) -> new Folga.Ag(rs.getString(1), rs.getObject(2, OffsetDateTime.class).toInstant().toEpochMilli(), false),
                        OffsetDateTime.ofInstant(mesIni, ZoneOffset.UTC), OffsetDateTime.ofInstant(mesFim, ZoneOffset.UTC))
                : List.of();
        Map<String, Double> sorteio = new HashMap<>();
        if (ModoEscolha.ALEATORIO.equals(modo)) for (String id : texto) sorteio.put(id, ThreadLocalRandom.current().nextDouble());
        String ponteiro = null;
        if (ModoEscolha.FILA.equals(modo) && servicoChave != null) {
            List<UUID> p = jdbc.queryForList("select usuario_id from fila_profissional where servico_id = ?", UUID.class, servicoChave);
            if (!p.isEmpty()) ponteiro = p.get(0).toString();
        }
        // `ja` (serviços já atribuídos no mesmo agendamento) fica vazio: hoje um agendamento tem um profissional só (a divisão por serviço é manual, B1)
        return ModoEscolha.ordenar(modo, texto, ags, l, Map.of(), sorteio, ponteiro).stream().map(UUID::fromString).toList();
    }

    /** Chamado na CRIAÇÃO do agendamento: na fila, o escolhido vira o ponteiro do serviço. Nos outros modos, e sem a escolha automática ligada, não faz nada. */
    public static void registrar(JdbcTemplate jdbc, UUID servicoChave, UUID profissional) {
        if (servicoChave == null || profissional == null) return;
        RegrasAtendimento.Regras r = RegrasAtendimento.ler(jdbc);
        if (!r.profissionalAutomatico() || !ModoEscolha.FILA.equals(r.modoEscolha())) return;
        jdbc.update("insert into fila_profissional (loja_id, servico_id, usuario_id) values (nullif(current_setting('app.loja_id', true), '')::uuid, ?, ?) "
                + "on conflict (loja_id, servico_id) do update set usuario_id = excluded.usuario_id, atualizado_em = now()", servicoChave, profissional);
    }
}
