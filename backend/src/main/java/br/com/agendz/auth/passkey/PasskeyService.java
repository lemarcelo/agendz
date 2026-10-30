package br.com.agendz.auth.passkey;

import br.com.agendz.auth.Sessao;
import br.com.agendz.auth.SessaoService;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Login por passkey. Regras: (1) o desafio é de uso único, curto e preso à loja do endereço (e à pessoa no cadastro); (2) a assinatura é conferida contra a
 * chave pública guardada, com rpId = Host da loja e origem = https do mesmo Host; (3) exige verificação do usuário (digital, rosto ou PIN); (4) recusa
 * é sempre 403 com a mesma frase (nunca revela se a credencial existe); (5) cadastrar pede a SENHA de novo e a passkey nunca substitui a senha;
 * (6) a conta `suporte` e as de fumaça não usam passkey; (7) a entrada gera a mesma sessão do login por senha, com o mesmo papel e as mesmas seções.
 */
@Service
public class PasskeyService {

    private static final Logger LOG = LoggerFactory.getLogger(PasskeyService.class);
    static final int MAX_POR_PESSOA = 5;
    public static final String RECUSA = "Não foi possível entrar com a digital. Use a senha.";

    public record Pedido(String desafioId, String desafio, String rpId, String usuarioHandle, String usuarioNome, List<String> excluir) {
    }

    public record Item(String id, String nome, String criadoEm, String ultimoUso) {
    }

    private record Conta(UUID id, String nome, String papel, boolean ativo, boolean deveTrocar, String identificador) {
    }

    private record Guardada(UUID id, UUID usuarioId, byte[] chave, int alg, long contador) {
    }

    private final LojaJdbc banco;
    private final DesafiosPasskey desafios;
    private final SessaoService sessao;
    private final ObjectMapper json;

    public PasskeyService(LojaJdbc banco, DesafiosPasskey desafios, SessaoService sessao, ObjectMapper json) {
        this.banco = banco;
        this.desafios = desafios;
        this.sessao = sessao;
        this.json = json;
    }

    /** O rpId é o nome do servidor da requisição (a loja vem do endereço). */
    private static Predicate<String> origemDa(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        return origem -> {
            try {
                URI u = URI.create(origem);
                String ho = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
                if (!ho.equals(h) || u.getRawPath() != null && !u.getRawPath().isEmpty() || u.getRawQuery() != null || u.getRawUserInfo() != null) return false;
                if ("https".equals(u.getScheme())) return u.getPort() == -1 || u.getPort() == 443;
                return "http".equals(u.getScheme()) && (ho.equals("localhost") || ho.endsWith(".localhost")); // só para desenvolvimento local
            } catch (IllegalArgumentException e) {
                return false;
            }
        };
    }

    private static ErroDeNegocio recusa() {
        return new ErroDeNegocio(HttpStatus.FORBIDDEN, RECUSA);
    }

    private Conta conta(UUID id) {
        List<Conta> l = banco.naLoja(jdbc -> jdbc.query("select id, nome, papel, ativo, deve_trocar_senha, identificador from usuario where id = ?",
                (rs, i) -> new Conta(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("papel"), rs.getBoolean("ativo"), rs.getBoolean("deve_trocar_senha"),
                        rs.getString("identificador")), id));
        return l.isEmpty() ? null : l.get(0);
    }

    private static boolean contaOculta(Conta c) {
        return "suporte".equals(c.identificador()) || c.identificador().startsWith("fumaca-");
    }

    private ClientDataLido clientData(String b64) {
        byte[] bruto = Webauthn.deB64(b64);
        try {
            JsonNode n = json.readTree(new String(bruto, StandardCharsets.UTF_8));
            return new ClientDataLido(bruto, new Webauthn.ClientData(n.path("type").asText(null), n.path("challenge").asText(null), n.path("origin").asText(null), n.path("crossOrigin").asBoolean(false)));
        } catch (java.io.IOException e) {
            throw new Webauthn.Recusa("clientData ilegível");
        }
    }

    private record ClientDataLido(byte[] bruto, Webauthn.ClientData dados) {
    }

    // ---------- cadastro (pessoa logada; a senha já foi conferida por quem chama) ----------

    /** POST /api/usuarios/me/passkeys/desafio */
    public Pedido desafioDeCadastro(UUID usuarioId, String host) {
        Loja loja = LojaContext.exigir();
        Conta c = conta(usuarioId);
        if (c == null || !c.ativo() || contaOculta(c) || c.deveTrocar()) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Esta conta não pode cadastrar digital.");
        int ja = banco.naLoja(jdbc -> jdbc.queryForObject("select count(*) from passkey where usuario_id = ?", Integer.class, usuarioId));
        if (ja >= MAX_POR_PESSOA) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Você já tem " + MAX_POR_PESSOA + " aparelhos cadastrados. Remova um para cadastrar outro.");
        DesafiosPasskey.Emitido e = desafios.emitir("cadastro", loja.id(), usuarioId);
        if (e == null) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitos pedidos agora. Tente de novo em instantes.");
        List<String> excluir = banco.naLoja(jdbc -> jdbc.query("select credencial_id from passkey where usuario_id = ?", (rs, i) -> Webauthn.b64(rs.getBytes(1)), usuarioId));
        return new Pedido(e.id(), Webauthn.b64(e.desafio()), host, Webauthn.b64(usuarioId.toString().getBytes(StandardCharsets.UTF_8)), c.nome(), excluir);
    }

    /** POST /api/usuarios/me/passkeys */
    public Item cadastrar(UUID usuarioId, String host, String desafioId, String nome, String clientDataB64, String atestadoB64) {
        Loja loja = LojaContext.exigir();
        byte[] desafio = desafios.consumir(desafioId, "cadastro", loja.id(), usuarioId);
        if (desafio == null) throw recusa();
        Conta c = conta(usuarioId);
        if (c == null || !c.ativo() || contaOculta(c)) throw recusa();
        Webauthn.Cadastro cad;
        try {
            ClientDataLido cd = clientData(clientDataB64);
            cad = Webauthn.cadastro(host, desafio, cd.dados(), Webauthn.deB64(atestadoB64), origemDa(host));
        } catch (Webauthn.Recusa r) {
            LOG.info("Cadastro de passkey recusado loja={} motivo={}", loja.slug(), r.getMessage());
            throw recusa();
        }
        String rotulo = nome == null || nome.isBlank() ? "Este aparelho" : nome.trim().replaceAll("\\s+", " ");
        if (rotulo.length() > 60) rotulo = rotulo.substring(0, 60);
        final String nomeFinal = rotulo;
        UUID id = UUID.randomUUID();
        try {
            banco.naLoja(jdbc -> jdbc.update("insert into passkey (id, loja_id, usuario_id, credencial_id, chave_publica, alg, contador, nome) values (?, ?, ?, ?, ?, ?, ?, ?)",
                    id, loja.id(), usuarioId, cad.credencialId(), cad.chavePublicaCose(), cad.alg(), cad.contador(), nomeFinal));
        } catch (DuplicateKeyException e) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este aparelho já está cadastrado.");
        }
        return new Item(id.toString(), nomeFinal, java.time.Instant.now().toString(), null);
    }

    /** GET /api/usuarios/me/passkeys: só as da própria pessoa. */
    public List<Item> listar(UUID usuarioId) {
        return banco.naLoja(jdbc -> jdbc.query("select id, nome, criado_em, ultimo_uso from passkey where usuario_id = ? order by criado_em",
                (rs, i) -> new Item(rs.getString("id"), rs.getString("nome"), rs.getTimestamp("criado_em").toInstant().toString(),
                        rs.getTimestamp("ultimo_uso") == null ? null : rs.getTimestamp("ultimo_uso").toInstant().toString()), usuarioId));
    }

    /** DELETE /api/usuarios/me/passkeys/{id}: só a própria; de outra pessoa ou inexistente = 404. */
    public void remover(UUID usuarioId, UUID id) {
        int n = banco.naLoja(jdbc -> jdbc.update("delete from passkey where id = ? and usuario_id = ?", id, usuarioId));
        if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Aparelho não encontrado.");
    }

    // ---------- entrada (pública) ----------

    /** POST /api/auth/passkey/desafio */
    public Pedido desafioDeEntrada(String host) {
        Loja loja = LojaContext.exigir();
        DesafiosPasskey.Emitido e = desafios.emitir("entrada", loja.id(), null);
        if (e == null) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitos pedidos agora. Tente de novo em instantes.");
        return new Pedido(e.id(), Webauthn.b64(e.desafio()), host, null, null, List.of());
    }

    /** POST /api/auth/passkey/entrar */
    public Sessao entrar(String host, String desafioId, String credencialIdB64, String clientDataB64, String authDataB64, String assinaturaB64, String userHandleB64, String ip, boolean loginAutomatico) {
        Loja loja = LojaContext.exigir();
        byte[] desafio = desafios.consumir(desafioId, "entrada", loja.id(), null);
        if (desafio == null) throw recusa();
        try {
            byte[] credencial = Webauthn.deB64(credencialIdB64);
            List<Guardada> achadas = banco.naLoja(jdbc -> jdbc.query("select id, usuario_id, chave_publica, alg, contador from passkey where credencial_id = ?",
                    (rs, i) -> new Guardada(rs.getObject("id", UUID.class), rs.getObject("usuario_id", UUID.class), rs.getBytes("chave_publica"), rs.getInt("alg"), rs.getLong("contador")), credencial));
            if (achadas.isEmpty()) throw new Webauthn.Recusa("credencial desconhecida");
            Guardada g = achadas.get(0);
            if (userHandleB64 != null && !userHandleB64.isBlank()
                    && !new String(Webauthn.deB64(userHandleB64), StandardCharsets.UTF_8).equals(g.usuarioId().toString())) throw new Webauthn.Recusa("userHandle de outra pessoa");
            ClientDataLido cd = clientData(clientDataB64);
            long novo = Webauthn.entrada(host, desafio, cd.dados(), cd.bruto(), Webauthn.deB64(authDataB64), Webauthn.deB64(assinaturaB64), g.chave(), g.alg(), g.contador(), origemDa(host));
            Conta c = conta(g.usuarioId());
            if (c == null || !c.ativo() || contaOculta(c) || c.deveTrocar()) throw new Webauthn.Recusa("conta não pode entrar");
            banco.naLoja(jdbc -> {
                jdbc.update("update passkey set contador = ?, ultimo_uso = now() where id = ?", novo, g.id());
                jdbc.update("update usuario set ultimo_acesso = now() where id = ?", c.id());
                return null;
            });
            return sessao.abrir(c.id(), loja, c.papel(), c.nome(), false, ip, loginAutomatico);
        } catch (Webauthn.Recusa r) {
            LOG.info("Entrada por passkey recusada loja={} motivo={}", loja.slug(), r.getMessage());
            throw recusa();
        }
    }
}
