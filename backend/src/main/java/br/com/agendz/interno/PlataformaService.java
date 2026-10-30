package br.com.agendz.interno;

import br.com.agendz.auth.Temporarias;
import br.com.agendz.equipe.SuporteDaLoja;
import br.com.agendz.equipe.UsuarioService;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.tenant.LojaRepository;
import br.com.agendz.validacao.Reservados;
import br.com.agendz.validacao.Texto;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashSet;
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
    /** Perfis da equipe da loja (os mesmos de `UsuarioService`). */
    public static final List<String> PAPEIS = List.of("dono", "admin", "atendente", "profissional");
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

    /** Corpo de POST /usuarios: sem CPF, e-mail, telefone nem senha (a senha é sempre gerada aqui). `apelido` é opcional (padrão: o primeiro nome, com número se já existir). */
    public record NovoUsuario(String nome, String usuario, String papel, String apelido) {
    }

    /** Resposta de mudar o perfil: `mudou` é falso quando a pessoa já tinha esse perfil (o Admin não grava evento à toa). */
    public record PerfilMudado(String usuario, String papel, String anterior, boolean mudou) {
    }

    /** Resposta de criar: a senha temporária aparece só aqui, uma vez. */
    public record UsuarioCriado(UUID id, String usuario, String nome, String papel, boolean atende, boolean ativo, String senhaTemporaria) {
    }

    private final JdbcTemplate jdbc;
    private final LojaJdbc banco;
    private final LojaRepository lojas;
    private final PasswordEncoder encoder;
    private final SuporteDaLoja suporte;
    private final RegrasDaLoja regras;
    private final UsuarioService equipe;
    private final TransactionTemplate tx;

    public PlataformaService(JdbcTemplate jdbc, LojaJdbc banco, LojaRepository lojas, PasswordEncoder encoder, SuporteDaLoja suporte, RegrasDaLoja regras, UsuarioService equipe,
                             PlatformTransactionManager tm) {
        this.equipe = equipe;
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

    /**
     * Cria um usuário na equipe da loja (pela mesma regra do painel da loja: limite de usuários da plataforma = 409, `suporte`/fumaça = 400 "Nome reservado.",
     * usuário e apelido únicos = 409). Senha temporária gerada AQUI e devolvida uma vez; a pessoa troca no primeiro acesso. CPF e nascimento obrigatórios são
     * regra do cadastro de CLIENTE, não da equipe; a pessoa completa os próprios dados em "Meu perfil".
     */
    public UsuarioCriado criarUsuario(Loja loja, NovoUsuario d) {
        if (d == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe os dados do usuário.");
        String nome = d.nome() == null ? "" : Texto.limpar(d.nome());
        if (nome.isEmpty() || nome.length() > 80) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O nome precisa ter de 1 a 80 caracteres.");
        String papel = papelValido(d.papel());
        String login = d.usuario() == null ? "" : d.usuario().trim().toLowerCase(Locale.ROOT);
        if (!LOGIN.matcher(login).matches()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Usuário: de 2 a 60 caracteres, só letras, números, ponto, hífen e sublinhado.");
        Reservados.exigirLivre(login, nome, d.apelido());
        String apelido = d.apelido() == null || Texto.limpar(d.apelido()).isEmpty() ? apelidoLivre(loja, nome) : Texto.limpar(d.apelido());
        if (apelido.length() > 60) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O apelido pode ter até 60 caracteres.");
        UsuarioService.ComSenha novo = equipe.criar(loja, new UsuarioService.Dados(nome, apelido, login, null, null, null, null, papel, null, null, null, null, null, null, null));
        UsuarioService.Usuario u = novo.usuario();
        return new UsuarioCriado(u.id(), u.usuario(), u.nome(), u.papel(), u.atende(), true, novo.senhaTemporaria());
    }

    /**
     * Muda o perfil (papel) de um usuário da equipe. Perfil fora dos quatro = 400; usuário de outra loja, inexistente, `suporte` ou fumaça = 404; o proprietário
     * nunca passa para outro perfil por aqui (409), então a loja não fica sem dono. Mesmo perfil = sem mudança (200). As permissões escolhidas pelo dono para a
     * pessoa continuam; Atenção: o token já emitido leva o perfil antigo até vencer (8 h) ou até a pessoa entrar de novo; para efeito imediato, desativar e reativar derruba o acesso na hora.
     */
    public PerfilMudado mudarPerfil(Loja loja, UUID usuarioId, String papelNovo) {
        String papel = papelValido(papelNovo);
        PerfilMudado resultado = banco.naLoja(loja.id(), j -> {
            List<Object[]> atual = j.query("select identificador, papel from usuario where id = ? and " + Reservados.OCULTOS_SQL,
                    (rs, i) -> new Object[] {rs.getString("identificador"), rs.getString("papel")}, usuarioId);
            if (atual.isEmpty()) return null;
            String login = (String) atual.get(0)[0];
            String antes = (String) atual.get(0)[1];
            if (antes.equals(papel)) return new PerfilMudado(login, papel, antes, false);
            if ("dono".equals(antes)) throw new ErroDeNegocio(HttpStatus.CONFLICT, "O proprietário não muda de perfil por aqui: a loja precisa ter um proprietário.");
            j.update("update usuario set papel = ? where id = ?", papel, usuarioId);
            return new PerfilMudado(login, papel, antes, true);
        });
        if (resultado == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Usuário não encontrado.");
        return resultado;
    }

    private static String papelValido(String bruto) {
        String p = bruto == null ? "" : bruto.trim().toLowerCase(Locale.ROOT);
        if (!PAPEIS.contains(p)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Perfil inválido: use dono, admin, atendente ou profissional.");
        return p;
    }

    /** Primeiro nome; se alguém da loja já tem esse apelido (sem diferenciar maiúsculas), acrescenta 2, 3, ... */
    private String apelidoLivre(Loja loja, String nome) {
        Set<String> usados = new HashSet<>(banco.naLoja(loja.id(), j -> j.queryForList("select lower(apelido) from usuario where apelido is not null", String.class)));
        String base = nome.split("\\s+")[0];
        if (base.length() > 50) base = base.substring(0, 50);
        String apelido = base;
        for (int n = 2; usados.contains(apelido.toLowerCase(Locale.ROOT)) || Reservados.reservado(apelido); n++) apelido = base + " " + n;
        return apelido;
    }
}
