package br.com.agendz.erro;

import org.springframework.http.HttpStatus;

/** Erro previsto, com o status HTTP e a mensagem em português que o cliente vê. */
public class ErroDeNegocio extends RuntimeException {
    private final HttpStatus status;

    public ErroDeNegocio(HttpStatus status, String mensagem) {
        super(mensagem);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
