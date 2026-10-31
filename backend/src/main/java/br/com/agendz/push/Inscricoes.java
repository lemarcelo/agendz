package br.com.agendz.push;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Inscrições de aviso com o app fechado (v130): um aparelho/navegador da pessoa por linha, até 5 por pessoa. O endpoint e as chaves nunca saem do servidor
 * (a lista devolve só nome do aparelho e datas). Só o endpoint de serviço de push conhecido é aceito (`Destinos`).
 */
@Service
public class Inscricoes {

    public static final int MAX_POR_PESSOA = 5;

    public record Item(String id, String aparelho, String criadoEm, String ultimoEnvio) {
    }

    /** O que o envio precisa de uma inscrição. */
    public record Alvo(UUID id, UUID usuarioId, String endpoint, String p256dh, String auth) {
    }

    private final LojaJdbc banco;

    public Inscricoes(LojaJdbc banco) {
        this.banco = banco;
    }

    private static String nomeLimpo(String bruto) {
        String r = bruto == null ? "" : bruto.replaceAll("[\\p{Cntrl}]", " ").trim().replaceAll("\\s+", " ");
        if (r.isEmpty()) return "Este aparelho";
        return r.length() > 60 ? r.substring(0, 60) : r;
    }

    public Item inscrever(UUID usuarioId, String endpoint, String p256dh, String auth, String aparelho) {
        Loja loja = LojaContext.exigir();
        if (!Destinos.permitido(endpoint)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Este navegador usa um serviço de aviso que não é aceito.");
        String chave;
        String segredo;
        try {
            byte[] ponto = WebPush.debase64url(p256dh);
            WebPush.publica(ponto);
            byte[] a = WebPush.debase64url(auth);
            if (a.length != 16) throw new IllegalArgumentException("auth");
            chave = WebPush.base64url(ponto);
            segredo = WebPush.base64url(a);
        } catch (IllegalArgumentException e) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Inscrição inválida. Ative os avisos de novo.");
        }
        String nome = nomeLimpo(aparelho);
        return banco.naLoja(jdbc -> {
            Integer n = jdbc.queryForObject("select count(*) from push_inscricao where usuario_id = ? and endpoint <> ?", Integer.class, usuarioId, endpoint);
            if (n != null && n >= MAX_POR_PESSOA) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Você já tem " + MAX_POR_PESSOA + " aparelhos com aviso. Remova um em Meu perfil para adicionar outro.");
            }
            // mesmo aparelho de novo (ou de outra pessoa que entrou nele): fica com quem apresentou as chaves
            UUID id = jdbc.queryForObject("insert into push_inscricao (loja_id, usuario_id, endpoint, p256dh, auth, aparelho) values (?, ?, ?, ?, ?, ?) "
                    + "on conflict (loja_id, endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho, falhas = 0 returning id",
                    UUID.class, loja.id(), usuarioId, endpoint, chave, segredo, nome);
            return itens(jdbc.query("select id, aparelho, criado_em, ultimo_envio from push_inscricao where id = ?", (rs, i) -> linha(rs), id)).get(0);
        });
    }

    private static Object[] linha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Object[] {rs.getObject("id", UUID.class), rs.getString("aparelho"), rs.getObject("criado_em", OffsetDateTime.class), rs.getObject("ultimo_envio", OffsetDateTime.class)};
    }

    private static List<Item> itens(List<Object[]> linhas) {
        return linhas.stream().map(l -> new Item(l[0].toString(), (String) l[1], l[2].toString(), l[3] == null ? null : l[3].toString())).toList();
    }

    public List<Item> listar(UUID usuarioId) {
        return banco.naLoja(jdbc -> itens(jdbc.query("select id, aparelho, criado_em, ultimo_envio from push_inscricao where usuario_id = ? order by criado_em, id", (rs, i) -> linha(rs), usuarioId)));
    }

    public void remover(UUID usuarioId, UUID id) {
        int n = banco.naLoja(jdbc -> jdbc.update("delete from push_inscricao where id = ? and usuario_id = ?", id, usuarioId));
        if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Aparelho não encontrado.");
    }

    public List<Alvo> daPessoa(UUID usuarioId) {
        return banco.naLoja(jdbc -> jdbc.query("select id, usuario_id, endpoint, p256dh, auth from push_inscricao where usuario_id = ? order by criado_em, id",
                (rs, i) -> new Alvo(rs.getObject("id", UUID.class), rs.getObject("usuario_id", UUID.class), rs.getString("endpoint"), rs.getString("p256dh"), rs.getString("auth")), usuarioId));
    }
}
