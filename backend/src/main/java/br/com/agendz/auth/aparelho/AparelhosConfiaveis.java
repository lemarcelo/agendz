package br.com.agendz.auth.aparelho;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Aparelhos de onde a pessoa pediu "confiar neste aparelho" (v125, B8). O token longo do aparelho só carrega o id da linha; a linha existir (e a pessoa estar
 * ativa, com o mesmo papel) é o que o faz valer. Apagar a linha derruba o token na hora. Nada de segredo no banco.
 */
@Service
public class AparelhosConfiaveis {

    public static final int MAX_POR_PESSOA = 5;
    /** Sem nenhum uso por tantos dias o aparelho deixa de valer (a pessoa entra de novo e confia outra vez). */
    public static final int DIAS_PARADO = 90;

    public record Item(String id, String rotulo, String criadoEm, String ultimoUso, boolean atual) {
    }

    private final LojaJdbc banco;

    public AparelhosConfiaveis(LojaJdbc banco) {
        this.banco = banco;
    }

    /** Nome curto que a tela tirou do navegador (ex.: "Celular Android · Chrome"); texto de pessoa, sempre limpo e com limite. */
    public static String rotuloLimpo(String bruto) {
        String r = bruto == null ? "" : bruto.replaceAll("[\\p{Cntrl}]", " ").trim().replaceAll("\\s+", " ");
        if (r.isEmpty()) return "Este aparelho";
        return r.length() > 60 ? r.substring(0, 60) : r;
    }

    /** Marca o aparelho como confiável: cada pedido é um aparelho novo (até 5 por pessoa). */
    public UUID gravar(UUID usuarioId, String rotulo) {
        Loja loja = LojaContext.exigir();
        String r = rotuloLimpo(rotulo);
        return banco.naLoja(jdbc -> {
            Integer n = jdbc.queryForObject("select count(*) from aparelho_confiavel where usuario_id = ?", Integer.class, usuarioId);
            if (n != null && n >= MAX_POR_PESSOA) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Você já tem " + MAX_POR_PESSOA + " aparelhos confiáveis. Remova um em Meu perfil para adicionar outro.");
            }
            UUID id = UUID.randomUUID();
            jdbc.update("insert into aparelho_confiavel (id, loja_id, usuario_id, rotulo) values (?, ?, ?, ?)", id, loja.id(), usuarioId, r);
            return id;
        });
    }

    /** O aparelho ainda vale: a linha existe, é desta pessoa e foi usada nos últimos 90 dias. */
    public boolean vale(UUID id, UUID usuarioId) {
        Integer n = banco.naLoja(jdbc -> jdbc.queryForObject(
                "select count(*) from aparelho_confiavel where id = ? and usuario_id = ? and ultimo_uso > now() - make_interval(days => ?)", Integer.class, id, usuarioId, DIAS_PARADO));
        return n != null && n > 0;
    }

    public void usou(UUID id) {
        banco.naLoja(jdbc -> jdbc.update("update aparelho_confiavel set ultimo_uso = now() where id = ? and ultimo_uso < now() - interval '10 minutes'", id));
    }

    public List<Item> listar(UUID usuarioId, UUID atual) {
        return banco.naLoja(jdbc -> jdbc.query("select id, rotulo, criado_em, ultimo_uso from aparelho_confiavel where usuario_id = ? order by criado_em",
                (rs, i) -> new Item(rs.getString("id"), rs.getString("rotulo"), rs.getTimestamp("criado_em").toInstant().toString(),
                        rs.getTimestamp("ultimo_uso").toInstant().toString(), atual != null && atual.toString().equals(rs.getString("id"))), usuarioId));
    }

    /** DELETE: só o próprio; de outra pessoa ou inexistente = 404. O token desse aparelho para de valer na hora. */
    public void remover(UUID usuarioId, UUID id) {
        int n = banco.naLoja(jdbc -> jdbc.update("delete from aparelho_confiavel where id = ? and usuario_id = ?", id, usuarioId));
        if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Aparelho não encontrado.");
    }

    /** "Sair" num aparelho confiável: ele deixa de ser confiável (o próximo login pergunta de novo). */
    public void sair(UUID usuarioId, UUID id) {
        banco.naLoja(jdbc -> jdbc.update("delete from aparelho_confiavel where id = ? and usuario_id = ?", id, usuarioId));
    }

    /** Troca de senha: todos os aparelhos da pessoa deixam de ser confiáveis. */
    public void removerTodos(UUID usuarioId) {
        banco.naLoja(jdbc -> jdbc.update("delete from aparelho_confiavel where usuario_id = ?", usuarioId));
    }
}
