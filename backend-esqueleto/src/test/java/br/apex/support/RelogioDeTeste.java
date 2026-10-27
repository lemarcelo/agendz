package br.apex.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** Relógio que os testes controlam (equivale ao store.avancar do protótipo). O código de produção recebe um Clock injetado. */
public class RelogioDeTeste extends Clock {
    public static final ZoneId SAO_PAULO = ZoneId.of("America/Sao_Paulo");
    private volatile Instant agora = Instant.parse("2026-10-11T12:00:00Z"); // domingo, 09:00 em São Paulo

    @Override public ZoneId getZone() { return SAO_PAULO; }
    @Override public Clock withZone(ZoneId zone) { return this; }
    @Override public Instant instant() { return agora; }

    public void definir(Instant novo) { this.agora = novo; }
    public void avancar(Duration d) { this.agora = this.agora.plus(d); }
    public Instant agora() { return agora; }
    public ZoneOffset offsetSaoPaulo() { return SAO_PAULO.getRules().getOffset(agora); }
}
