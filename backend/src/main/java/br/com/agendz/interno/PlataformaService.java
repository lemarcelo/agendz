package br.com.agendz.interno;

import br.com.agendz.auth.Temporarias;
import br.com.agendz.equipe.SuporteDaLoja;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.tenant.LojaRepository;
import br.com.agendz.validacao.Reservados;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Operações do Admin da plataforma sobre as lojas (rotas internas `/interno/plataforma/**`, só com a chave interna). O painel NUNCA vê dado de cliente
 * final: só contagens; da equipe da loja, só nome, login, papel e situação. `suporte` e usuários de fumaça nunca aparecem nem são mexidos aqui.
 * Senha temporária: gerada aqui, devolvida UMA vez, troca obrigatória no próximo acesso.
 */
@Service
public class PlataformaService {

    public static final Set<String> STATUS = Set.of("em_teste", "ativo", "em_atraso", "suspenso", "encerrado");
    public static final Set<String> TIPOS = Set.of("estetica_automotiva", "barbearia");
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$");
    private static final Set<String> SLUGS_RESERVADOS = Set.of("www", "app", "api", "admin", "painel", "static", "assets", "mail", "agendar", "login", "suporte", "status");
    private static final Pattern LOGIN = Pattern.compile("^[a-z0-9._-]{2,60}$");
    private static final Pattern LOGO = Pattern.compile("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$");

    public record ResumoLoja(String slug, String nome, String tipo, String status, Instant criadaEm, int usuarios, int agendas, Instant ultimoAcesso) {
    }

    public record UsuarioDaLoja(UUID id, String usuario, String nome, String papel, boolean atende, boolean ativo, Instant ultimoAcesso) {
    }

    public record NovaLoja(String slug, String nome, String tipo, String logo, String donoUsuario, String donoNome) {
    }

    public record LojaCriada(String slug, String nome, String tipo, String donoUsuario, String senhaTemporaria, String suporteSenhaTemporaria) {
    }

    public record SenhaNova(String usuario, String senhaTemporaria) {
    }

    private final JdbcTemplate jdbc;
    private final LojaJdbc banco;
    private final LojaRepository lojas;
    private final PasswordEncoder encoder;
    private final SuporteDaLoja suporte;
    private final RegrasDaLoja regras;
    private final TransactionTemplate tx;

    public PlataformaService(JdbcTemplate jdbc, LojaJdbc banco, LojaRepository lojas, PasswordEncoder encoder, SuporteDaLoja suporte, RegrasDaLoja regras, PlatformTransactionManager tm) {
        this.jdbc = jdbc;
        this.banco = banco;
        this.lojas = lojas;
        this.encoder = encoder;
        this.suporte = suporte;
        this.regras = regras;
        this.tx = new TransactionTemplate(tm);
    }

    public Loja loja(String slug) {
        return lojas.porSlug(slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT)).orElseThrow(() -> new ErroDeNegocio(HttpStatus.NOT_FOUND, "Loja não encontrada."));
    }

    // ---------- lista ----------

    public List<ResumoLoja> listar() {
        List<Object[]> base = jdbc.query("select id, slug, nome, tipo, status, criada_em from loja order by lower(nome), slug",
                (rs, i) -> new Object[] {rs.getObject("id", UUID.class), rs.getString("slug"), rs.getString("nome"), rs.getString("tipo"), rs.getString("status"), rs.getTimestamp("criada_em")});
        return base.stream().map(b -> {
            UUID id = (UUID) b[0];
            String tipo = (String) b[3];
            int[] n = new int[2];
            Instant[] ultimo = new Instant[1];
            banco.naLoja(id, j -> {
                Integer u = j.queryForObject("select count(*) from usuario where ativo and " + Reservados.OCULTOS_SQL, Integer.class);
                n[0] = u == null ? 0 : u;
                String sqlAgendas = "estetica_automotiva".equals(tipo) ? "select count(*) from box where ativo"
                        : "select count(*) from usuario where ativo and atende and " + Reservados.OCULTOS_SQL;
                Integer a = j.queryForObject(sqlAgendas, Integer.class);
                n[1] = a == null ? 0 : a;
                Timestamp t = j.queryForObject("select max(ultimo_acesso) from usuario where " + Reservados.OCULTOS_SQL, Timestamp.class);
                ultimo[0] = t == null ? null : t.toInstant();
                return null;
            });
            return new ResumoLoja((String) b[1], (String) b[2], tipo, (String) b[4], ((Timestamp) b[5]).toInstant(), n[0], n[1], ultimo[0]);
        }).toList();
    }

    // ---------- criar ----------

    public LojaCriada criar(NovaLoja d) {
        String slug = d.slug() == null ? "" : d.slug().trim().toLowerCase(Locale.ROOT);
        if (!SLUG.matcher(slug).matches() || SLUGS_RESERVADOS.contains(slug)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Endereço inválido ou reservado.");
        String nome = d.nome() == null ? "" : d.nome().trim();
        if (nome.isEmpty() || nome.length() > 100) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O nome da loja precisa ter de 1 a 100 caracteres.");
        if (d.tipo() == null || !TIPOS.contains(d.tipo())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Tipo de estabelecimento desconhecido.");
        String login = d.donoUsuario() == null ? "" : d.donoUsuario().trim().toLowerCase(Locale.ROOT);
        if (!LOGIN.matcher(login).matches() || Reservados.reservado(login)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Usuário do dono inválido ou reservado.");
        String donoNome = d.donoNome() == null ? "" : d.donoNome().trim();
        if (donoNome.isEmpty() || donoNome.length() > 80 || Reservados.reservado(donoNome)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O nome do dono precisa ter de 1 a 80 caracteres e não pode ser reservado.");
        String logo = d.logo() == null || d.logo().isBlank() ? null : d.logo().trim();
        if (logo != null && (logo.length() > 140_000 || !LOGO.matcher(logo).matches())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Logo inválida: use PNG, JPEG ou WebP de até 100 KB.");
        if (lojas.porSlug(slug).isPresent()) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe uma loja com esse endereço.");
        String senha = Temporarias.senha();
        String hash = encoder.encode(senha);
        UUID id;
        try {
            id = tx.execute(st -> {
                // trabalho do dono da base primeiro (loja); depois, na mesma transação, a loja já existe e o RLS deixa gravar dono e onboarding
                UUID novo = jdbc.queryForObject("insert into loja (slug, nome, tipo, logo) values (?, ?, ?, ?) returning id", UUID.class, slug, nome, d.tipo(), logo);
                banco.naLoja(novo, j -> {
                    j.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, deve_trocar_senha) values (?::uuid, ?, ?, 'dono', ?, true)", novo.toString(), login, donoNome, hash);
                    j.update("insert into onboarding (loja_id) values (?::uuid)", novo.toString());
                    return null;
                });
                return novo;
            });
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe uma loja com esse endereço.");
        }
        SuporteDaLoja.Resultado s = suporte.garantir(id);
        return new LojaCriada(slug, nome, d.tipo(), login, senha, s.senhaTemporaria());
    }

    // ---------- situação ----------

    public String mudarStatus(Loja loja, String status) {
        if (status == null || !STATUS.contains(status)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Situação desconhecida.");
        jdbc.update("update loja set status = ?, status_em = now() where id = ?", status, loja.id());
        return status;
    }

    public String statusDe(Loja loja) {
        return jdbc.queryForObject("select status from loja where id = ?", String.class, loja.id());
    }

    // ---------- regras ----------

    public RegrasDaLoja.Regras regras(Loja loja) {
        return regras.ler(loja.id());
    }

    public RegrasDaLoja.Regras salvarRegras(Loja loja, RegrasDaLoja.Regras r) {
        return regras.salvar(loja.id(), r);
    }

    // ---------- usuários da equipe ----------

    public List<UsuarioDaLoja> usuarios(Loja loja) {
        return banco.naLoja(loja.id(), j -> j.query("select id, identificador, nome, papel, atende, ativo, ultimo_acesso from usuario where " + Reservados.OCULTOS_SQL + " order by lower(nome), identificador",
                (rs, i) -> new UsuarioDaLoja(rs.getObject("id", UUID.class), rs.getString("identificador"), rs.getString("nome"), rs.getString("papel"), rs.getBoolean("atende"), rs.getBoolean("ativo"),
                        rs.getTimestamp("ultimo_acesso") == null ? null : rs.getTimestamp("ultimo_acesso").toInstant())));
    }

    /** Nova senha temporária (mostrada uma vez); o usuário volta a ser obrigado a trocar. Só equipe visível: suporte e fumaça = 404. */
    public SenhaNova redefinirSenha(Loja loja, UUID usuarioId) {
        String senha = Temporarias.senha();
        String hash = encoder.encode(senha);
        String login = banco.naLoja(loja.id(), j -> {
            List<String> achou = j.queryForList("select identificador from usuario where id = ? and " + Reservados.OCULTOS_SQL, String.class, usuarioId);
            if (achou.isEmpty()) return null;
            j.update("update usuario set senha_hash = ?, deve_trocar_senha = true where id = ?", hash, usuarioId);
            return achou.get(0);
        });
        if (login == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Usuário não encontrado.");
        return new SenhaNova(login, senha);
    }

    /** Ativa ou desativa. A loja nunca fica sem proprietário ativo (recusa 409). */
    public void ativar(Loja loja, UUID usuarioId, boolean ativo) {
        Boolean ok = banco.naLoja(loja.id(), j -> {
            List<String> papel = j.queryForList("select papel from usuario where id = ? and " + Reservados.OCULTOS_SQL, String.class, usuarioId);
            if (papel.isEmpty()) return null;
            if (!ativo && "dono".equals(papel.get(0))) {
                Integer outros = j.queryForObject("select count(*) from usuario where papel = 'dono' and ativo and id <> ?", Integer.class, usuarioId);
                if (outros == null || outros == 0) return false;
            }
            j.update("update usuario set ativo = ? where id = ?", ativo, usuarioId);
            return true;
        });
        if (ok == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Usuário não encontrado.");
        if (!ok) throw new ErroDeNegocio(HttpStatus.CONFLICT, "A loja precisa ter ao menos um proprietário ativo.");
    }
}
