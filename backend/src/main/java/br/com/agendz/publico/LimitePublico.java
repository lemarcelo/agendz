package br.com.agendz.publico;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Freio das rotas sem login (link do cliente): conta pedidos por chave numa janela deslizante, em memória (uma API só). A chave junta a loja e quem pede
 * (telefone, IP ou a loja inteira), então uma loja nunca gasta o limite de outra. `liberar` registra o pedido e diz se ainda cabe.
 */
@Component
public class LimitePublico {

    private static final int MAX_CHAVES = 20000;

    private final Map<String, Deque<Instant>> pedidos = new ConcurrentHashMap<>();
    private final Clock relogio;

    public LimitePublico(Clock relogio) {
        this.relogio = relogio;
    }

    /** true = pode seguir (e o pedido foi contado); false = passou do limite na janela (e o pedido NÃO é contado de novo). */
    public boolean liberar(String chave, int max, Duration janela) {
        Instant agora = Instant.now(relogio);
        if (pedidos.size() > MAX_CHAVES) varrer(agora);
        Deque<Instant> fila = pedidos.computeIfAbsent(chave, k -> new ArrayDeque<>());
        synchronized (fila) {
            Instant corte = agora.minus(janela);
            while (!fila.isEmpty() && fila.peekFirst().isBefore(corte)) fila.pollFirst();
            if (fila.size() >= max) return false;
            fila.addLast(agora);
            return true;
        }
    }

    /** Zera todas as contagens (uso dos testes: o limite é compartilhado entre eles). */
    public void reiniciar() {
        pedidos.clear();
    }

    /** Descarta as chaves sem pedido recente (evita crescer sem fim com IPs avulsos). */
    private void varrer(Instant agora) {
        Instant corte = agora.minus(Duration.ofHours(1));
        pedidos.entrySet().removeIf(e -> {
            Deque<Instant> f = e.getValue();
            synchronized (f) {
                return f.isEmpty() || f.peekLast().isBefore(corte);
            }
        });
    }
}
