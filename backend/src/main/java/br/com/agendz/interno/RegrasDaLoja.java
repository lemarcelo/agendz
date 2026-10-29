package br.com.agendz.interno;

import br.com.agendz.erro.ErroDeNegocio;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Regras que o Admin da plataforma define para cada cliente (tabela `loja_regra_plataforma`, só o Admin escreve, pela rota interna). A loja LÊ e aplica
 * no servidor: limite de usuários, limite de agendas (box na estética) e campos obrigatórios do cadastro de cliente (telefone sempre; CPF e nascimento
 * ligáveis). Sem linha gravada = sem limite e nada obrigatório além do telefone. Nunca derruba em silêncio: a recusa diz o motivo.
 */
@Service
public class RegrasDaLoja {

    public static final Set<String> CAMPOS = Set.of("cpf", "nascimento");

    public record Regras(Integer limiteAgendas, Integer limiteUsuarios, boolean mensagensAtivas, Integer limiteMensagensMes, List<String> cadastroObrigatorios) {
    }

    public static final Regras PADRAO = new Regras(null, null, true, null, List.of());

    private final JdbcTemplate jdbc;

    public RegrasDaLoja(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Regras ler(UUID lojaId) {
        return jdbc.query("select limite_agendas, limite_usuarios, mensagens_ativas, limite_mensagens_mes, cadastro_obrigatorios from loja_regra_plataforma where loja_id = ?",
                (rs, i) -> new Regras((Integer) rs.getObject("limite_agendas"), (Integer) rs.getObject("limite_usuarios"), rs.getBoolean("mensagens_ativas"),
                        (Integer) rs.getObject("limite_mensagens_mes"), lista(rs.getString("cadastro_obrigatorios"))), lojaId).stream().findFirst().orElse(PADRAO);
    }

    /** Grava a regra inteira (o Admin manda o conjunto). Valida faixa e campos; entrada ruim = 400. */
    public Regras salvar(UUID lojaId, Regras r) {
        Integer agendas = faixa(r.limiteAgendas(), 1, 1000, "Limite de agendas");
        Integer usuarios = faixa(r.limiteUsuarios(), 1, 1000, "Limite de usuários");
        Integer mensagens = faixa(r.limiteMensagensMes(), 0, 1_000_000, "Limite de mensagens por mês");
        Set<String> campos = new LinkedHashSet<>();
        if (r.cadastroObrigatorios() != null) for (String c : r.cadastroObrigatorios()) {
            String k = c == null ? "" : c.trim().toLowerCase(java.util.Locale.ROOT);
            if (!CAMPOS.contains(k)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Campo de cadastro desconhecido.");
            campos.add(k);
        }
        String csv = String.join(",", campos.stream().sorted().toList());
        jdbc.update("insert into loja_regra_plataforma (loja_id, limite_agendas, limite_usuarios, mensagens_ativas, limite_mensagens_mes, cadastro_obrigatorios, atualizado_em) "
                + "values (?, ?, ?, ?, ?, ?, now()) on conflict (loja_id) do update set limite_agendas = excluded.limite_agendas, limite_usuarios = excluded.limite_usuarios, "
                + "mensagens_ativas = excluded.mensagens_ativas, limite_mensagens_mes = excluded.limite_mensagens_mes, cadastro_obrigatorios = excluded.cadastro_obrigatorios, atualizado_em = now()",
                lojaId, agendas, usuarios, r.mensagensAtivas(), mensagens, csv);
        return ler(lojaId);
    }

    private static Integer faixa(Integer v, int min, int max, String nome) {
        if (v == null) return null;
        if (v < min || v > max) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, nome + " precisa estar entre " + min + " e " + max + ".");
        return v;
    }

    private static List<String> lista(String csv) {
        List<String> l = new ArrayList<>();
        if (csv != null && !csv.isBlank()) for (String s : csv.split(",")) l.add(s);
        return l;
    }

    // ---- aplicação nas escritas da loja ----

    /** Recusa criar mais usuários da equipe do que o limite (conta só os ativos visíveis: `suporte` e fumaça não contam). */
    public void exigirVagaDeUsuario(UUID lojaId, int ativosHoje) {
        Integer lim = ler(lojaId).limiteUsuarios();
        if (lim != null && ativosHoje >= lim) throw new ErroDeNegocio(HttpStatus.CONFLICT, "O limite de " + lim + " usuários deste estabelecimento foi atingido. Fale com o suporte para ampliar.");
    }

    public void exigirAgendas(UUID lojaId, int ativasDepois) {
        Integer lim = ler(lojaId).limiteAgendas();
        if (lim != null && ativasDepois > lim) throw new ErroDeNegocio(HttpStatus.CONFLICT, "O limite de " + lim + " agendas deste estabelecimento foi atingido. Fale com o suporte para ampliar.");
    }
}
