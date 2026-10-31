package br.com.agendz.publico;

import br.com.agendz.tenant.LojaJdbc;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Registro mínimo dos pedidos que o link do cliente barrou (B10): hora, motivo e só o HASH do IP e do telefone, nunca o dado. Apagado em 30 dias. Serve para o
 * proprietário ver quantas tentativas foram barradas (contador em Estabelecimento > Link) e para o suporte investigar abuso sem guardar dado pessoal.
 * Grava numa transação própria: o pedido barrado costuma terminar em erro, e o erro desfaria o registro. Um mesmo IP e motivo grava no máximo 1 linha por minuto
 * (um robô em laço não enche o banco).
 */
@Component
public class BarradosDoLink {

    public static final int DIAS_GUARDADOS = 30;

    public enum Motivo {
        LIMITE_CLIENTE("limite_cliente"), ISCA("isca"), RAPIDO("rapido"), SELO_INVALIDO("selo_invalido"), FREQUENCIA("frequencia");

        public final String codigo;

        Motivo(String codigo) {
            this.codigo = codigo;
        }
    }

    /** Barrados nos últimos 30 dias: total e por motivo. Nunca IP, telefone nem hash. */
    public record Resumo(int total, Map<String, Integer> porMotivo) {
    }

    private final LojaJdbc banco;
    private final LimitePublico limite;

    public BarradosDoLink(LojaJdbc banco, LimitePublico limite) {
        this.banco = banco;
        this.limite = limite;
    }

    public void registrar(UUID lojaId, Motivo motivo, String ipHash, String telHash) {
        if (!limite.liberar("barrado:" + lojaId + ":" + motivo.codigo + ":" + ipHash, 1, Duration.ofMinutes(1))) return;
        try {
            banco.naLojaIndependente(lojaId, jdbc -> {
                jdbc.update("delete from link_barrado where em < now() - make_interval(days => ?)", DIAS_GUARDADOS);
                return jdbc.update("insert into link_barrado (loja_id, motivo, ip_hash, tel_hash) values (?::uuid, ?, ?, ?)", lojaId.toString(), motivo.codigo, ipHash, telHash);
            });
        } catch (RuntimeException e) {
            // o registro é um auxílio: nunca derruba o pedido nem muda a resposta ao cliente
        }
    }

    /** Dentro de uma transação já aberta da loja (RLS). */
    public static Resumo resumo(JdbcTemplate jdbc) {
        Map<String, Integer> por = new LinkedHashMap<>();
        for (Motivo m : Motivo.values()) por.put(m.codigo, 0);
        int[] total = {0};
        jdbc.query("select motivo, count(*) from link_barrado where em >= now() - make_interval(days => ?) group by motivo", rs -> {
            int n = rs.getInt(2);
            por.merge(rs.getString(1), n, Integer::sum);
            total[0] += n;
        }, DIAS_GUARDADOS);
        return new Resumo(total[0], por);
    }
}
