package br.com.agendz.push;

/** Quem entrega o corpo já criptografado ao serviço de push. Em produção é HTTP; nos testes é trocado por um falso. */
public interface Enviador {

    enum Resultado { ENTREGUE, INSCRICAO_MORTA, FALHOU }

    Resultado enviar(String endpoint, byte[] corpo, String autorizacao, int ttlSegundos);
}
