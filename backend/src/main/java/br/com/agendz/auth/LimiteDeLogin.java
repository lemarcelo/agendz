package br.com.agendz.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Trava de força bruta: 5 erros em 15 minutos para o mesmo login na mesma loja bloqueiam novas tentativas (429) até a janela passar. Em memória (uma API). */
@Component
public class LimiteDeLogin {

    static final int MAX_ERROS = 5;
    static final Duration JANELA = Duration.ofMinutes(15);

    private final Map<String, Deque<Instant>> erros = new ConcurrentHashMap<>();
    private final Clock relogio;

    public LimiteDeLogin(Clock relogio) {
        this.relogio = relogio;
    }

    private Deque<Instant> recentes(String chave) {
        Deque<Instant> fila = erros.computeIfAbsent(chave, k -> new ArrayDeque<>());
        Instant corte = Instant.now(relogio).minus(JANELA);
        while (!fila.isEmpty() && fila.peekFirst().isBefore(corte)) fila.pollFirst();
        return fila;
    }

    public boolean bloqueado(String chave) {
        Deque<Instant> fila = recentes(chave);
        synchronized (fila) {
            return fila.size() >= MAX_ERROS;
        }
    }

    public void registrarErro(String chave) {
        Deque<Instant> fila = recentes(chave);
        synchronized (fila) {
            fila.addLast(Instant.now(relogio));
        }
    }

    public void limpar(String chave) {
        erros.remove(chave);
    }
}
