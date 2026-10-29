package br.com.agendz.interno;

import java.util.List;

/** Consulta de registros TXT no DNS (trocada por uma versão falsa nos testes). */
public interface ConsultaTxt {

    /** Valores TXT de `nome`; lista vazia se o nome não existe; {@code ErroDeNegocio} 503 se o DNS não respondeu. */
    List<String> txt(String nome);
}
