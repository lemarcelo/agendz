package br.com.agendz.tenant;

import br.com.agendz.erro.ErroDeNegocio;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Chave de repetição (cabeçalho `Idempotency-Key`) para escritas que não podem duplicar (atendimento, agendamento). Sem a chave, nada muda.
 * Com a chave: o pedido e a gravação da chave acontecem na MESMA transação da loja; um segundo pedido com a mesma chave (e o mesmo usuário, rota e corpo)
 * devolve a resposta guardada do primeiro, sem gravar de novo. Mesma chave com corpo ou usuário diferente = 409 (nunca devolve resposta de outro pedido).
 * Pedido que falhou não deixa chave (a transação volta atrás), então pode ser tentado de novo. Duas chamadas ao mesmo tempo: a segunda espera a primeira terminar.
 */
@Component
public class Idempotencia {

    private static final Pattern FORMATO = Pattern.compile("^[A-Za-z0-9_-]{16,64}$");

    private final LojaJdbc banco;
    private final ObjectMapper json;

    public Idempotencia(LojaJdbc banco, ObjectMapper json) {
        this.banco = banco;
        this.json = json;
    }

    public <T> T executar(String chave, UUID usuarioId, String rota, Object corpo, Class<T> tipo, Supplier<T> acao) {
        if (chave == null || chave.isBlank()) return acao.get();
        if (!FORMATO.matcher(chave).matches()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Chave de repetição inválida.");
        String hash = hash(rota, corpo);
        return banco.naLoja(jdbc -> {
            UUID loja = LojaContext.exigir().id();
            int novo = jdbc.update("insert into idempotencia (loja_id, chave, usuario_id, rota, corpo_hash) values (?::uuid, ?, ?, ?, ?) on conflict do nothing",
                    loja.toString(), chave, usuarioId, rota, hash);
            if (novo == 0) {
                List<String[]> achado = jdbc.query("select usuario_id::text, corpo_hash, resposta from idempotencia where chave = ?",
                        (rs, i) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3)}, chave);
                if (achado.isEmpty()) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Tente de novo em instantes.");
                String[] l = achado.get(0);
                if (!l[0].equals(usuarioId.toString()) || !l[1].equals(hash)) {
                    throw new ErroDeNegocio(HttpStatus.CONFLICT, "Essa chave de repetição já foi usada em outro pedido.");
                }
                if (l[2] == null) throw new ErroDeNegocio(HttpStatus.CONFLICT, "O pedido anterior ainda está em andamento. Tente de novo em instantes.");
                try {
                    return json.readValue(l[2], tipo);
                } catch (JsonProcessingException e) {
                    throw new IllegalStateException("Resposta guardada ilegível", e);
                }
            }
            T r = acao.get();
            try {
                jdbc.update("update idempotencia set resposta = ? where chave = ?", json.writeValueAsString(r), chave);
            } catch (JsonProcessingException e) {
                throw new IllegalStateException("Resposta não pôde ser guardada", e);
            }
            return r;
        });
    }

    private String hash(String rota, Object corpo) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest((rota + "|" + json.writeValueAsString(corpo)).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
