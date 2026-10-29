package br.com.agendz.tenant;

/**
 * Capacidades por tipo de estabelecimento (espelho de src/tipos/<tipo>/definicao.js). O código pergunta a capacidade, nunca "é estética?" espalhado:
 * tipo novo com veículo, box ou preço por porte entra aqui, num lugar só.
 */
public final class Capacidades {

    private static final String ESTETICA = "estetica_automotiva";

    private Capacidades() {
    }

    /** Cliente tem veículos e o serviço depende do porte. */
    public static boolean usaVeiculo(Loja loja) {
        return ESTETICA.equals(loja.tipo());
    }

    /** O atendimento ocupa um recurso físico (box) além do profissional. */
    public static boolean usaRecursoFisico(Loja loja) {
        return ESTETICA.equals(loja.tipo());
    }

    /** Preço e duração do serviço variam com o porte do veículo. */
    public static boolean precoPorPorte(Loja loja) {
        return ESTETICA.equals(loja.tipo());
    }
}
