package br.com.agendz.tenant;

import java.util.UUID;

/** Loja resolvida para a requisição atual. O tipo (estetica_automotiva, barbearia...) nunca muda. */
public record Loja(UUID id, String slug, String nome, String tipo, String logo, String temaCor, String temaCor2) {
}
