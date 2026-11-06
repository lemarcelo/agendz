package br.com.agendz.agenda;

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
 * G2: ordem de preferência na escolha automática do BOX, segundo o modo da loja (V62; os mesmos modos do profissional, {@link ModoEscolha}, reaproveitados com o id
 * do box no lugar do id da pessoa). Só vale quando ninguém pediu um box e o carro não tinha um. Quem chama pega o primeiro da ordem que está livre.
 * Fila circular: o ponteiro (último box escolhido) só avança em {@link #registrar}, na criação do agendamento (mesma transação: rollback desfaz).
 */
public final class EscolhaDeBox {

    private EscolhaDeBox() {
    }

    public static String modo(JdbcTemplate jdbc) {
        List<String> m = jdbc.queryForList("select modo_escolha_box from configuracao_loja", String.class);
        return m.isEmpty() ? ModoEscolha.LIVRE : ModoEscolha.sanear(m.get(0));
    }

    /** `ids` na ordem dos boxes → a ordem de preferência. `inicio` é o começo do atendimento (o dia e o mês do "menos atendeu" são os dele). */
    public static List<UUID> ordem(JdbcTemplate jdbc, List<UUID> ids, Instant inicio) {
        if (ids.size() < 2) return ids;
        String modo = modo(jdbc);
        LocalDate dia = inicio.atZone(Fuso.BRASIL).toLocalDate();
        List<String> texto = ids.stream().map(UUID::toString).toList();
        Instant ini = dia.atStartOfDay(Fuso.BRASIL).toInstant();
        Instant mesIni = dia.withDayOfMonth(1).atStartOfDay(Fuso.BRASIL).toInstant();
        Instant mesFim = dia.withDayOfMonth(1).plusMonths(1).atStartOfDay(Fuso.BRASIL).toInstant();
        Instant janelaFim = dia.plusDays(Folga.JANELA_DIAS).atStartOfDay(Fuso.BRASIL).toInstant();
        ModoEscolha.Limites l = new ModoEscolha.Limites(ini.toEpochMilli(), dia.plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant().toEpochMilli(), janelaFim.toEpochMilli(),
                mesIni.toEpochMilli(), mesFim.toEpochMilli());
        List<Folga.Ag> ags = ModoEscolha.LIVRE.equals(modo) || ModoEscolha.MENOS.equals(modo)
                ? jdbc.query("select box_id, inicio from agendamento where box_id is not null and status <> 'cancelado' and inicio >= ? and inicio < ?",
                        (rs, i) -> new Folga.Ag(rs.getString(1), rs.getObject(2, OffsetDateTime.class).toInstant().toEpochMilli(), false),
                        OffsetDateTime.ofInstant(ModoEscolha.MENOS.equals(modo) ? mesIni : ini, ZoneOffset.UTC),
                        OffsetDateTime.ofInstant(ModoEscolha.MENOS.equals(modo) ? mesFim : janelaFim, ZoneOffset.UTC))
                : List.of();
        Map<String, Double> sorteio = new HashMap<>();
        if (ModoEscolha.ALEATORIO.equals(modo)) for (String id : texto) sorteio.put(id, ThreadLocalRandom.current().nextDouble());
        String ponteiro = null;
        if (ModoEscolha.FILA.equals(modo)) {
            List<UUID> p = jdbc.queryForList("select box_id from fila_box", UUID.class);
            if (!p.isEmpty()) ponteiro = p.get(0).toString();
        }
        return ModoEscolha.ordenar(modo, texto, ags, l, Map.of(), sorteio, ponteiro).stream().map(UUID::fromString).toList();
    }

    /** Na CRIAÇÃO do agendamento, no modo fila, o box escolhido vira o ponteiro da loja. Nos outros modos não faz nada. */
    public static void registrar(JdbcTemplate jdbc, UUID box) {
        if (box == null || !ModoEscolha.FILA.equals(modo(jdbc))) return;
        jdbc.update("insert into fila_box (loja_id, box_id) values (nullif(current_setting('app.loja_id', true), '')::uuid, ?) "
                + "on conflict (loja_id) do update set box_id = excluded.box_id, atualizado_em = now()", box);
    }
}
