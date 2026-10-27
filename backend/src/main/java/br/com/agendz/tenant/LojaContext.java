package br.com.agendz.tenant;

import java.util.Optional;

/** Loja da requisição em andamento. Preenchido por {@link LojaFilter} e sempre limpo no fim. Nenhum endpoint recebe lojaId do cliente. */
public final class LojaContext {
    private static final ThreadLocal<Loja> ATUAL = new ThreadLocal<>();

    private LojaContext() {
    }

    static void definir(Loja loja) {
        ATUAL.set(loja);
    }

    static void limpar() {
        ATUAL.remove();
    }

    public static Optional<Loja> atual() {
        return Optional.ofNullable(ATUAL.get());
    }

    public static Loja exigir() {
        return atual().orElseThrow(() -> new IllegalStateException("Requisição sem loja resolvida"));
    }
}
