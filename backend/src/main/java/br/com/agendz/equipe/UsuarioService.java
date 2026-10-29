package br.com.agendz.equipe;

import br.com.agendz.auth.Temporarias;
import br.com.agendz.cifra.Cifra;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.seguranca.Permissoes;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Documentos;
import br.com.agendz.validacao.Reservados;
import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Cadastro da equipe (espelho de `equipe.*` em src/services/api.js, com as mesmas mensagens; só o proprietário usa). Perfis: dono, admin, atendente e
 * profissional. CPF, e-mail, telefone e nascimento são cifrados ({@link Cifra}); CPF e e-mail têm hash só para impedir duplicidade.
 * A senha nunca vem do cliente: a pessoa nova (ou a que teve a senha refeita) recebe uma temporária, gerada aqui e devolvida UMA vez, e escolhe a sua no
 * primeiro acesso. Remover só apaga quem nunca teve agendamento; quem tem histórico deixa de atender (o histórico fica).
 */
@Service
public class UsuarioService {

    static final List<String> PAPEIS = List.of("dono", "admin", "atendente", "profissional");
    private static final int TOTAL_CORES = 36;
    private static final Pattern LOGIN = Pattern.compile("^[a-z0-9._-]{2,60}$");
    private static final Pattern FOTO = Pattern.compile("^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$");
    private static final int FOTO_MAX = 30000;
    private static final TypeReference<Map<String, Boolean>> MAPA = new TypeReference<>() {
    };
    private static final String COLUNAS = "id, identificador, nome, apelido, papel, atende, pode_vender, comissao_pct, comissao_produto_pct, permissoes::text as permissoes, cor_slot, foto, "
            + "email_cif, telefone_cif, cpf_cif, nascimento_cif, deve_trocar_senha";

    public record Usuario(UUID id, String nome, String apelido, String usuario, String papel, boolean atende, boolean podeVender, BigDecimal comissaoPct,
                          BigDecimal comissaoProdutoPct, Map<String, Boolean> permissoes, Integer corSlot, String foto, String email, String telefone, String cpfMascarado, String cpf,
                          String nascimento, boolean deveTrocarSenha) {
    }

    /** Corpo de POST/PUT. Campo ausente não muda; texto vazio apaga (CPF, e-mail, telefone, nascimento, foto). `senhaTemporaria` (opcional, só ao CRIAR, 8 a 100 caracteres): o proprietário escolhe a senha de
     *  entrada; vazia = gerada pelo sistema. Em qualquer caso é temporária (a pessoa troca no primeiro acesso). Não existe campo `senha` (400). */
    public record Dados(@Size(max = 300) String nome, @Size(max = 300) String apelido, @Size(max = 100) String usuario, @Size(max = 100) String cpf,
                        @Size(max = 100) String nascimento, @Size(max = 300) String email, @Size(max = 100) String telefone, @Size(max = 40) String papel,
                        @Size(max = 20) Map<String, Boolean> permissoes, Boolean atende, Boolean podeVender, BigDecimal comissaoPct,
                        @Size(max = 40000) String foto, BigDecimal comissaoProdutoPct, @Size(max = 200) String senhaTemporaria) {
    }

    /** Os dados que a própria pessoa vê e muda em "Meu perfil". Sem CPF, perfil, permissões nem comissão (isso é do proprietário). */
    public record MeusDados(UUID id, String nome, String apelido, String usuario, String papel, String email, String telefone, String nascimento, String foto) {
    }

    /** Corpo de PUT /api/usuarios/me: campo ausente não muda; texto vazio apaga e-mail, telefone e nascimento (nome e apelido não podem ficar vazios). */
    public record MeusDadosEntrada(@Size(max = 150) String nome, @Size(max = 60) String apelido, @Size(max = 150) String email, @Size(max = 100) String telefone,
                                   @Size(max = 100) String nascimento) {
    }

    /** Resposta de criar e de refazer a senha: a senha temporária aparece só aqui. */
    public record ComSenha(Usuario usuario, String senhaTemporaria) {
    }

    private record Linha(UUID id, String login, String nome, String apelido, String papel, boolean atende, boolean podeVender, BigDecimal comissao, BigDecimal comissaoProduto,
                         String permissoes, Integer corSlot, String foto, String emailCif, String telefoneCif, String cpfCif, String nascimentoCif, boolean deve) {
    }

    private final LojaJdbc banco;
    private final Cifra cifra;
    private final PasswordEncoder encoder;
    private final ObjectMapper json;

    public UsuarioService(LojaJdbc banco, Cifra cifra, PasswordEncoder encoder, ObjectMapper json) {
        this.banco = banco;
        this.cifra = cifra;
        this.encoder = encoder;
        this.json = json;
    }

    // ---------- leitura ----------

    public List<Usuario> listar() {
        return banco.naLoja(jdbc -> jdbc.query("select " + COLUNAS + " from usuario where ativo and " + Reservados.OCULTOS_SQL + " order by lower(coalesce(apelido, nome)), id limit 200",
                (rs, i) -> lerLinha(rs)).stream().map(l -> paraUsuario(l, false)).toList());
    }

    /** Ficha: CPF completo e nascimento (a lista só traz o CPF mascarado). */
    public Usuario obter(UUID id) {
        Linha l = banco.naLoja(jdbc -> buscar(jdbc, id));
        if (l == null) throw naoEncontrado();
        return paraUsuario(l, true);
    }

    // ---------- criar ----------

    public ComSenha criar(Dados d) {
        Loja loja = LojaContext.exigir();
        Validado v = validar(d, true);
        String senha = v.senhaTemporaria != null ? v.senhaTemporaria : Temporarias.senha();
        String hash = encoder.encode(senha);
        try {
            UUID id = banco.naLoja(jdbc -> {
                conferirDuplicados(jdbc, loja.id(), v, null);
                Set<String> logins = new HashSet<>(jdbc.queryForList("select identificador from usuario", String.class));
                String login = v.usuario != null ? v.usuario : Temporarias.loginLivre(v.apelido, logins);
                if (logins.contains(login)) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse usuário já existe.");
                boolean atende = d.atende() != null ? d.atende() : !Permissoes.ehGestor(v.papel);
                return jdbc.queryForObject(
                        "insert into usuario (loja_id, identificador, nome, apelido, papel, senha_hash, atende, deve_trocar_senha, pode_vender, comissao_pct, comissao_produto_pct, permissoes, cor_slot, "
                                + "foto, email_cif, email_hash, telefone_cif, cpf_cif, cpf_hash, nascimento_cif) "
                                + "values (?::uuid, ?, ?, ?, ?, ?, ?, true, ?, ?, ?, cast(? as jsonb), ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                        UUID.class, loja.id().toString(), login, v.nome, v.apelido, v.papel, hash, atende, v.podeVender == null || v.podeVender, v.comissao, v.comissaoProduto,
                        escrever(v.permissoes == null ? Map.of() : v.permissoes), proximaCor(jdbc), v.foto == null || v.foto.isEmpty() ? null : v.foto,
                        cif(v.email), hashDe(loja.id(), "email", v.email == null ? null : v.email.toLowerCase(Locale.ROOT)), cif(v.telefone),
                        cif(v.cpf), hashDe(loja.id(), "cpf", v.cpf), cif(v.nascimento));
            });
            return new ComSenha(obter(id), senha);
        } catch (DuplicateKeyException e) { // corrida entre duas gravações: a trava única do banco decide
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe alguém com esses dados. Confira o CPF, o apelido, o e-mail e o usuário.");
        }
    }

    // ---------- alterar ----------

    public Usuario alterar(UUID id, Dados d) {
        Loja loja = LojaContext.exigir();
        Validado v = validar(d, false);
        try {
            banco.naLoja(jdbc -> {
                Linha atual = buscar(jdbc, id);
                if (atual == null) throw naoEncontrado();
                conferirDuplicados(jdbc, loja.id(), v, id);
                String papel = v.papel != null ? v.papel : atual.papel();
                if ("dono".equals(atual.papel()) && !"dono".equals(papel) && outrosDonos(jdbc, id) == 0) {
                    throw new ErroDeNegocio(HttpStatus.CONFLICT, "É preciso ter pelo menos um dono.");
                }
                boolean atende = d.atende() != null ? d.atende() : atual.atende();
                if (atual.atende() && !atende) bloqueioDesativar(jdbc, atual);
                String login = atual.login();
                if (v.usuario != null && !v.usuario.equals(login)) {
                    Integer ocupado = jdbc.queryForObject("select count(*) from usuario where identificador = ? and id <> ?", Integer.class, v.usuario, id);
                    if (ocupado != null && ocupado > 0) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse usuário já existe.");
                    login = v.usuario;
                }
                String nome = v.nome != null ? v.nome : atual.nome();
                String apelido = v.apelido != null ? v.apelido : atual.apelido();
                Map<String, Boolean> permissoes = v.permissoes != null ? v.permissoes : lerMapa(atual.permissoes());
                String emailCif = v.emailVeio ? cif(v.email) : atual.emailCif();
                String emailHash = v.emailVeio ? hashDe(loja.id(), "email", v.email == null ? null : v.email.toLowerCase(Locale.ROOT)) : null;
                String cpfCif = v.cpfVeio ? cif(v.cpf) : atual.cpfCif();
                String cpfHash = v.cpfVeio ? hashDe(loja.id(), "cpf", v.cpf) : null;
                String telCif = v.telefoneVeio ? cif(v.telefone) : atual.telefoneCif();
                String nascCif = v.nascimentoVeio ? cif(v.nascimento) : atual.nascimentoCif();
                String foto = v.foto != null ? (v.foto.isEmpty() ? null : v.foto) : atual.foto();
                // hash só é recalculado quando o campo veio; senão mantém o que está gravado
                jdbc.update("update usuario set identificador = ?, nome = ?, apelido = ?, papel = ?, atende = ?, pode_vender = ?, comissao_pct = case when ? then ? else comissao_pct end, comissao_produto_pct = case when ? then ? else comissao_produto_pct end, "
                                + "permissoes = cast(? as jsonb), foto = ?, email_cif = ?, email_hash = case when ? then ? else email_hash end, telefone_cif = ?, "
                                + "cpf_cif = ?, cpf_hash = case when ? then ? else cpf_hash end, nascimento_cif = ? where id = ?",
                        login, nome, apelido, papel, atende, v.podeVender != null ? v.podeVender : atual.podeVender(), v.comissaoVeio, v.comissao, v.comissaoProdutoVeio, v.comissaoProduto, escrever(permissoes), foto,
                        emailCif, v.emailVeio, emailHash, telCif, cpfCif, v.cpfVeio, cpfHash, nascCif, id);
                return null;
            });
        } catch (DuplicateKeyException e) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe alguém com esses dados. Confira o CPF, o apelido, o e-mail e o usuário.");
        }
        return obter(id);
    }

    // ---------- atendimento, senha, foto, remover ----------

    public Usuario definirAtendimento(UUID id, boolean atende) {
        banco.naLoja(jdbc -> {
            Linha l = buscar(jdbc, id);
            if (l == null) throw naoEncontrado();
            if (!atende) bloqueioDesativar(jdbc, l);
            jdbc.update("update usuario set atende = ? where id = ?", atende, id);
            return null;
        });
        return obter(id);
    }

    /** O proprietário refaz a senha de outra pessoa: nova senha temporária (aparece uma vez) e troca obrigatória no próximo acesso. */
    public ComSenha refazerSenha(UUID id, UUID eu) {
        if (id.equals(eu)) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Para trocar a sua própria senha, use a troca de senha da sua conta.");
        String senha = Temporarias.senha();
        String hash = encoder.encode(senha);
        banco.naLoja(jdbc -> {
            if (buscar(jdbc, id) == null) throw naoEncontrado();
            jdbc.update("update usuario set senha_hash = ?, deve_trocar_senha = true where id = ?", hash, id);
            return null;
        });
        return new ComSenha(obter(id), senha);
    }

    /** GET /api/usuarios/me: a pessoa lê os próprios dados. As contas ocultas (`suporte` e as de fumaça) não têm perfil na loja: recebem só o que já sabem do login (200, sem 404 no console). */
    public MeusDados meusDados(UUID eu) {
        List<Linha> achados = banco.naLoja(jdbc -> jdbc.query("select " + COLUNAS + " from usuario where id = ? and ativo", (rs, i) -> lerLinha(rs), eu));
        if (achados.isEmpty()) throw naoEncontrado();
        Linha l = achados.get(0);
        if (contaOculta(l.login())) return new MeusDados(l.id(), l.nome(), l.apelido(), l.login(), l.papel(), null, null, null, null);
        Usuario u = paraUsuario(l, true);
        return new MeusDados(u.id(), u.nome(), u.apelido(), u.usuario(), u.papel(), u.email(), u.telefone(), u.nascimento(), u.foto());
    }

    private static boolean contaOculta(String login) {
        return login != null && (Reservados.reservado(login) || login.startsWith(Reservados.FUMACA_PREFIXO));
    }

    /** PUT /api/usuarios/me: só nome, apelido, e-mail, telefone e nascimento. Passa pela mesma validação e pelas mesmas travas de duplicidade da ficha da equipe. */
    public MeusDados alterarMeusDados(UUID eu, MeusDadosEntrada e) {
        if (contaOculta(meusDados(eu).usuario())) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Sem acesso."); // 404/403 antes de gravar
        alterar(eu, new Dados(e.nome(), e.apelido(), null, null, e.nascimento(), e.email(), e.telefone(), null, null, null, null, null, null, null, null));
        return meusDados(eu);
    }

    /** Cada pessoa troca só a própria foto; vazio ou null remove. */
    public void minhaFoto(UUID eu, String foto) {
        if (foto != null && !foto.isEmpty() && !fotoValida(foto)) throw ruim(MSG_FOTO);
        banco.naLoja(jdbc -> {
            if (jdbc.update("update usuario set foto = ? where id = ? and ativo", foto == null || foto.isEmpty() ? null : foto, eu) == 0) throw naoEncontrado();
            return null;
        });
    }

    public void remover(UUID id, UUID eu) {
        banco.naLoja(jdbc -> {
            Linha alvo = buscar(jdbc, id);
            if (alvo == null) throw naoEncontrado();
            if (id.equals(eu)) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Você não pode remover o seu próprio usuário.");
            if ("dono".equals(alvo.papel()) && outrosDonos(jdbc, id) == 0) throw new ErroDeNegocio(HttpStatus.CONFLICT, "É preciso ter pelo menos um dono.");
            Integer historico = jdbc.queryForObject("select count(*) from agendamento where profissional_id = ?", Integer.class, id);
            if (historico != null && historico > 0) {
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse usuário tem histórico de agendamentos e não pode ser removido. Desative-o: o histórico fica e ele deixa de receber novos agendamentos.");
            }
            jdbc.update("delete from escala_faixa where usuario_id = ?", id);
            jdbc.update("delete from usuario where id = ?", id);
            return null;
        });
    }

    // ---------- validação ----------

    private static final String MSG_FOTO = "Foto inválida: use uma imagem PNG, JPEG ou WebP pequena.";

    private static final class Validado {
        String nome, apelido, usuario, papel, cpf, email, telefone, nascimento, foto;
        BigDecimal comissao, comissaoProduto;
        Boolean podeVender;
        Map<String, Boolean> permissoes;
        String senhaTemporaria;
        boolean comissaoVeio, comissaoProdutoVeio, cpfVeio, emailVeio, telefoneVeio, nascimentoVeio;
    }

    private static String vazioParaNulo(String s) {
        String t = s == null ? "" : Texto.limpar(s);
        return t.isEmpty() ? null : t;
    }

    private Validado validar(Dados d, boolean criando) {
        Validado v = new Validado();
        if (d.senhaTemporaria() != null) {
            if (!criando) throw ruim("A senha não se altera por aqui: use \"Refazer senha\".");
            String t = d.senhaTemporaria();
            if (!t.isEmpty()) {
                if (t.length() < 8 || t.length() > 100) throw ruim("A senha temporária precisa ter de 8 a 100 caracteres.");
                v.senhaTemporaria = t;
            }
        }
        Reservados.exigirLivre(d.usuario(), d.nome(), d.apelido()); // `suporte` é só do Admin da plataforma
        if (d.comissaoPct() != null) {
            if (d.comissaoPct().signum() < 0 || d.comissaoPct().compareTo(new BigDecimal("100")) > 0) throw ruim("A comissão vai de 0 a 100%.");
            v.comissao = d.comissaoPct().setScale(2, RoundingMode.HALF_UP);
        }
        v.comissaoVeio = d.comissaoPct() != null;
        if (d.comissaoProdutoPct() != null) { // comissão sobre produtos desta pessoa (vale quando o produto não tem a sua própria)
            if (d.comissaoProdutoPct().signum() < 0 || d.comissaoProdutoPct().compareTo(new BigDecimal("100")) > 0) throw ruim("A comissão vai de 0 a 100%.");
            v.comissaoProduto = d.comissaoProdutoPct().setScale(2, RoundingMode.HALF_UP);
        }
        v.comissaoProdutoVeio = d.comissaoProdutoPct() != null;
        v.podeVender = d.podeVender();
        if (d.foto() != null && !d.foto().isEmpty() && !fotoValida(d.foto())) throw ruim(MSG_FOTO);
        v.foto = d.foto();
        for (Object[] c : new Object[][]{{"nome", d.nome()}, {"apelido", d.apelido()}, {"cpf", d.cpf()}, {"nascimento", d.nascimento()}, {"email", d.email()}, {"telefone", d.telefone()}}) {
            String t = (String) c[1];
            if (t != null && t.length() > 150) throw ruim("Texto inválido ou grande demais em " + c[0] + ".");
        }
        if (d.papel() != null || criando) {
            String p = d.papel() == null ? "" : d.papel().trim().toLowerCase(Locale.ROOT);
            if (!PAPEIS.contains(p)) throw ruim("Escolha o perfil da pessoa.");
            v.papel = p;
        }
        if (d.permissoes() != null) v.permissoes = Permissoes.limpar(d.permissoes());
        // nome e apelido: obrigatórios ao criar; ao editar, só se vierem (vazio não vale)
        if (criando || d.nome() != null || d.apelido() != null) {
            String nome = vazioParaNulo(d.nome()), apelido = vazioParaNulo(d.apelido());
            if ((criando || d.nome() != null) && nome == null || (criando || d.apelido() != null) && apelido == null) throw ruim("Informe o nome e o apelido.");
            if (apelido != null && apelido.length() > 60) throw ruim("O apelido pode ter até 60 caracteres.");
            v.nome = nome;
            v.apelido = apelido;
        }
        if (d.cpf() != null) {
            v.cpfVeio = true;
            String dig = Documentos.digitos(d.cpf());
            if (!dig.isEmpty()) {
                if (dig.length() != 11) throw ruim("Informe o CPF completo.");
                if (!Documentos.cpfValido(dig)) throw ruim("CPF inválido.");
                v.cpf = dig;
            }
        }
        if (d.email() != null) {
            v.emailVeio = true;
            String e = vazioParaNulo(d.email());
            if (e != null) {
                if (!e.contains("@") || e.length() > 150) throw ruim("Informe um e-mail válido.");
                v.email = e;
            }
        }
        if (d.telefone() != null) {
            v.telefoneVeio = true;
            if (!d.telefone().isBlank()) {
                String t = Documentos.telefone(d.telefone());
                if (t == null) throw ruim("Informe o telefone com DDD.");
                v.telefone = t;
            }
        }
        if (d.nascimento() != null) {
            v.nascimentoVeio = true;
            if (!d.nascimento().isBlank()) {
                try {
                    LocalDate n = LocalDate.parse(d.nascimento().trim());
                    if (n.isAfter(LocalDate.now()) || n.getYear() < 1900) throw ruim("Informe uma data de nascimento válida.");
                    v.nascimento = n.toString();
                } catch (DateTimeParseException e) {
                    throw ruim("Informe uma data de nascimento válida.");
                }
            }
        }
        if (d.usuario() != null && !d.usuario().isBlank()) {
            String u = d.usuario().trim().toLowerCase(Locale.ROOT);
            if (!LOGIN.matcher(u).matches()) throw ruim("Usuário: de 2 a 60 caracteres, só letras, números, ponto, hífen e sublinhado");
            v.usuario = u;
        }
        return v;
    }

    /** CPF, apelido e e-mail únicos na loja (sem diferenciar maiúsculas no apelido e no e-mail). `exceto` = a própria pessoa, na edição. */
    private void conferirDuplicados(JdbcTemplate jdbc, UUID loja, Validado v, UUID exceto) {
        UUID fora = exceto == null ? new UUID(0, 0) : exceto;
        if (v.cpf != null && existe(jdbc, "select count(*) from usuario where cpf_hash = ? and id <> ?", hashDe(loja, "cpf", v.cpf), fora)) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe alguém com esse CPF.");
        }
        if (v.apelido != null && existe(jdbc, "select count(*) from usuario where lower(apelido) = lower(?) and id <> ?", v.apelido, fora)) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe alguém com esse apelido.");
        }
        if (v.email != null && existe(jdbc, "select count(*) from usuario where email_hash = ? and id <> ?", hashDe(loja, "email", v.email.toLowerCase(Locale.ROOT)), fora)) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe alguém com esse e-mail.");
        }
    }

    private static boolean existe(JdbcTemplate jdbc, String sql, Object a, Object b) {
        Integer n = jdbc.queryForObject(sql, Integer.class, a, b);
        return n != null && n > 0;
    }

    private static int outrosDonos(JdbcTemplate jdbc, UUID id) {
        Integer n = jdbc.queryForObject("select count(*) from usuario where papel = 'dono' and ativo and id <> ?", Integer.class, id);
        return n == null ? 0 : n;
    }

    /** Desligar o atendimento com agendamentos futuros (a confirmar ou confirmado) é recusado. */
    private static void bloqueioDesativar(JdbcTemplate jdbc, Linha u) {
        Integer futuros = jdbc.queryForObject("select count(*) from agendamento where profissional_id = ? and status in ('a_confirmar', 'confirmado') and inicio > now()", Integer.class, u.id());
        if (futuros == null || futuros == 0) return;
        String nome = u.apelido() != null ? u.apelido() : u.nome();
        throw new ErroDeNegocio(HttpStatus.CONFLICT, nome + " ainda tem " + futuros + (futuros == 1 ? " agendamento futuro" : " agendamentos futuros")
                + " (a confirmar ou confirmado). Remarque ou cancele antes de desativar.");
    }

    /** Menor cor (0 a 35) ainda não usada por ninguém da equipe, gravada no cadastro para não mudar quando alguém sai. */
    private static int proximaCor(JdbcTemplate jdbc) {
        Set<Integer> usadas = new HashSet<>(jdbc.queryForList("select cor_slot from usuario where cor_slot is not null", Integer.class));
        for (int i = 0; i < TOTAL_CORES; i++) if (!usadas.contains(i)) return i;
        Integer total = jdbc.queryForObject("select count(*) from usuario", Integer.class);
        return (total == null ? 0 : total) % TOTAL_CORES;
    }

    /** Data URL png/jpeg/webp até 30000 caracteres; o tipo é conferido pelos primeiros bytes, não pelo que o cliente diz. */
    static boolean fotoValida(String url) {
        if (url == null || url.length() > FOTO_MAX) return false;
        Matcher m = FOTO.matcher(url);
        if (!m.matches() || m.group(2).length() < 24) return false;
        byte[] b;
        try {
            b = Base64.getDecoder().decode(m.group(2).substring(0, 24));
        } catch (IllegalArgumentException e) {
            return false;
        }
        return switch (m.group(1)) {
            case "png" -> (b[0] & 0xff) == 0x89 && b[1] == 0x50 && b[2] == 0x4e && b[3] == 0x47;
            case "jpeg" -> (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff;
            case "webp" -> b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46 && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50;
            default -> false;
        };
    }

    // ---------- linhas ----------

    private Linha buscar(JdbcTemplate jdbc, UUID id) {
        List<Linha> achados = jdbc.query("select " + COLUNAS + " from usuario where id = ? and ativo and " + Reservados.OCULTOS_SQL, (rs, i) -> lerLinha(rs), id);
        return achados.isEmpty() ? null : achados.get(0);
    }

    private static Linha lerLinha(java.sql.ResultSet rs) throws java.sql.SQLException {
        int cor = rs.getInt("cor_slot");
        Integer corSlot = rs.wasNull() ? null : cor; // wasNull vale para a última coluna lida: conferir logo depois do getInt
        return new Linha(rs.getObject("id", UUID.class), rs.getString("identificador"), rs.getString("nome"), rs.getString("apelido"), rs.getString("papel"),
                rs.getBoolean("atende"), rs.getBoolean("pode_vender"), rs.getBigDecimal("comissao_pct"), rs.getBigDecimal("comissao_produto_pct"), rs.getString("permissoes"), corSlot,
                rs.getString("foto"), rs.getString("email_cif"), rs.getString("telefone_cif"), rs.getString("cpf_cif"), rs.getString("nascimento_cif"),
                rs.getBoolean("deve_trocar_senha"));
    }

    private Usuario paraUsuario(Linha l, boolean ficha) {
        String cpf = l.cpfCif() == null ? null : cifra.decifrar(l.cpfCif());
        return new Usuario(l.id(), l.nome(), l.apelido(), l.login(), l.papel(), l.atende(), l.podeVender(), l.comissao(), l.comissaoProduto(), lerMapa(l.permissoes()), l.corSlot(), l.foto(),
                l.emailCif() == null ? null : cifra.decifrar(l.emailCif()), l.telefoneCif() == null ? null : cifra.decifrar(l.telefoneCif()),
                cpf == null ? null : Documentos.cpfMascarado(cpf), ficha ? cpf : null,
                ficha && l.nascimentoCif() != null ? cifra.decifrar(l.nascimentoCif()) : null, l.deve());
    }

    private Map<String, Boolean> lerMapa(String texto) {
        try {
            return texto == null ? Map.of() : json.readValue(texto, MAPA);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("jsonb de permissões inválido", e);
        }
    }

    private String escrever(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String cif(String claro) {
        return claro == null ? null : cifra.cifrar(claro);
    }

    private String hashDe(UUID loja, String dominio, String valor) {
        return valor == null ? null : cifra.hash(loja, dominio, valor);
    }

    private static ErroDeNegocio ruim(String m) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, m);
    }

    private static ErroDeNegocio naoEncontrado() {
        return new ErroDeNegocio(HttpStatus.NOT_FOUND, "Usuário não encontrado.");
    }
}
