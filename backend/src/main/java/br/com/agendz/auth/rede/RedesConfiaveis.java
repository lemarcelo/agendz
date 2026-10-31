package br.com.agendz.auth.rede;

import br.com.agendz.cifra.Cifra;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Redes de onde a pessoa pediu "login automático" (v119). Só o HASH da rede fica no banco (HMAC com pepper, amarrado à loja e à pessoa: a mesma rede em duas
 * contas não casa). Nunca recebe a rede do cliente: quem chama passa o IP que o servidor viu.
 */
@Service
public class RedesConfiaveis {

    public static final int MAX_POR_PESSOA = 5;

    public record Linha(UUID id, UUID usuarioId, String hash, int versao) {
    }

    public record Item(String id, String rotulo, String criadoEm, String ultimoUso, boolean atual) {
    }

    private final LojaJdbc banco;
    private final Cifra cifra;

    public RedesConfiaveis(LojaJdbc banco, Cifra cifra) {
        this.banco = banco;
        this.cifra = cifra;
    }

    /** Hash da rede deste IP para esta pessoa; `null` quando o IP não é utilizável. */
    public String hash(UUID lojaId, UUID usuarioId, String ip) {
        String r = Rede.normalizar(ip);
        return r == null ? null : cifra.hash(lojaId, "rede:" + usuarioId, r);
    }

    private static Optional<Linha> acharCom(JdbcTemplate jdbc, UUID usuarioId, String hash) {
        return jdbc.query("select id, usuario_id, rede_hash, versao from rede_confiavel where usuario_id = ? and rede_hash = ?",
                (rs, i) -> new Linha(rs.getObject("id", UUID.class), rs.getObject("usuario_id", UUID.class), rs.getString("rede_hash"), rs.getInt("versao")), usuarioId, hash).stream().findFirst();
    }

    public Optional<Linha> achar(UUID usuarioId, String hash) {
        if (hash == null) return Optional.empty();
        return banco.naLoja(jdbc -> acharCom(jdbc, usuarioId, hash));
    }

    public Optional<Linha> porId(UUID id) {
        return banco.naLoja(jdbc -> jdbc.query("select id, usuario_id, rede_hash, versao from rede_confiavel where id = ?",
                (rs, i) -> new Linha(rs.getObject("id", UUID.class), rs.getObject("usuario_id", UUID.class), rs.getString("rede_hash"), rs.getInt("versao")), id)).stream().findFirst();
    }

    /** Marca a rede como confiável (idempotente: a mesma rede de novo só renova o uso). Até 5 por pessoa. */
    public Linha gravar(UUID usuarioId, String hash, String rotulo) {
        Loja loja = LojaContext.exigir();
        if (hash == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Não foi possível identificar esta rede.");
        String r = rotulo == null || rotulo.isBlank() ? "Esta rede" : rotulo.trim().replaceAll("\\s+", " ");
        if (r.length() > 60) r = r.substring(0, 60);
        final String rotuloFinal = r;
        return banco.naLoja(jdbc -> {
            Optional<Linha> ja = acharCom(jdbc, usuarioId, hash);
            if (ja.isPresent()) {
                jdbc.update("update rede_confiavel set ultimo_uso = now() where id = ?", ja.get().id());
                return ja.get();
            }
            Integer n = jdbc.queryForObject("select count(*) from rede_confiavel where usuario_id = ?", Integer.class, usuarioId);
            if (n != null && n >= MAX_POR_PESSOA) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Você já tem " + MAX_POR_PESSOA + " redes confiáveis. Remova uma em Meu perfil para adicionar outra.");
            UUID id = UUID.randomUUID();
            jdbc.update("insert into rede_confiavel (id, loja_id, usuario_id, rede_hash, rotulo, ultimo_uso) values (?, ?, ?, ?, ?, now())", id, loja.id(), usuarioId, hash, rotuloFinal);
            return new Linha(id, usuarioId, hash, 1);
        });
    }

    /** O token longo carrega o papel de quando entrou: só vale enquanto a pessoa continua ativa e com o mesmo papel (desativar ou mudar o papel derruba). */
    public boolean usuarioConfere(UUID usuarioId, String papel) {
        Integer n = banco.naLoja(jdbc -> jdbc.queryForObject("select count(*) from usuario where id = ? and ativo and papel = ?", Integer.class, usuarioId, papel));
        return n != null && n > 0;
    }

    public void usou(UUID id) {
        banco.naLoja(jdbc -> jdbc.update("update rede_confiavel set ultimo_uso = now() where id = ? and (ultimo_uso is null or ultimo_uso < now() - interval '10 minutes')", id));
    }

    public List<Item> listar(UUID usuarioId, String hashAtual) {
        return banco.naLoja(jdbc -> jdbc.query("select id, rotulo, criado_em, ultimo_uso, rede_hash from rede_confiavel where usuario_id = ? order by criado_em",
                (rs, i) -> new Item(rs.getString("id"), rs.getString("rotulo"), rs.getTimestamp("criado_em").toInstant().toString(),
                        rs.getTimestamp("ultimo_uso") == null ? null : rs.getTimestamp("ultimo_uso").toInstant().toString(), hashAtual != null && hashAtual.equals(rs.getString("rede_hash"))), usuarioId));
    }

    /** DELETE: só a própria; de outra pessoa ou inexistente = 404. Os tokens longos dessa rede param de valer na hora. */
    public void remover(UUID usuarioId, UUID id) {
        int n = banco.naLoja(jdbc -> jdbc.update("delete from rede_confiavel where id = ? and usuario_id = ?", id, usuarioId));
        if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Rede não encontrada.");
    }

    /** "Sair": o token longo desta rede deixa de valer (a rede continua confiável: o próximo login gera token novo). */
    public void encerrarSessao(UUID id) {
        banco.naLoja(jdbc -> jdbc.update("update rede_confiavel set versao = versao + 1 where id = ?", id));
    }

    /** Troca de senha: todos os tokens longos da pessoa deixam de valer. */
    public void encerrarTodas(UUID usuarioId) {
        banco.naLoja(jdbc -> jdbc.update("update rede_confiavel set versao = versao + 1 where usuario_id = ?", usuarioId));
    }
}
