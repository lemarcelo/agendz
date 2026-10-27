package br.com.agendz.escala;

import java.time.ZoneId;

/** Fuso das lojas. Hoje todas são do Brasil (sem horário de verão desde 2019); quando houver loja em outro fuso, vira coluna de `loja`. */
public final class Fuso {

    public static final ZoneId BRASIL = ZoneId.of("America/Sao_Paulo");

    private Fuso() {
    }
}
