package br.com.agendz.onboarding;

import br.com.agendz.auth.LimiteDeLogin;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reconfigurar com senha e desfazer (só o dono). Confirmar a senha abre uma reconfiguração de 30 minutos; os passos de serviços, equipe e
 * expediente do assistente só funcionam dentro dela depois que o assistente foi concluído. Desfazer e refazer pedem a senha de novo.
 * Regras: só a MAIS RECENTE pode ser desfeita (desfaça de trás para frente); desfazer vale por 30 dias; desfazer devolve o expediente de antes e
 * DESATIVA os serviços e as pessoas que a sessão criou (nunca exclui, nunca mexe em agendamento, cliente, financeiro, comissão ou histórico);
 * refazer volta tudo como estava antes do desfazer. Errar a senha 5 vezes em 15 minutos bloqueia (429). Senha errada é 403, não 401
 * (401 derrubaria a sessão no navegador).
 */
@RestController
@PreAuthorize("hasRole('DONO')")
public class ReconfiguracaoController {

    static final Duration AUTORIZACAO = Duration.ofMinutes(30);
    static final Duration PRAZO = Duration.ofDays(30);

    public record Confirmacao(@NotBlank @Size(max = 100) String senha) {
    }

    public record Autorizacao(String id, Instant autorizadaAte) {
    }

    public record Item(String id, Instant criadaEm, String por, int servicosCriados, int pessoasCriadas, boolean expedienteTrocado, Instant desfeitaEm,
                       boolean podeDesfazer, boolean podeRefazer) {
    }

    public record Lista(List<Item> itens) {
    }

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;
    private final LimiteDeLogin limite;
    private final ReconfiguracaoService servico;
    private final ObjectMapper json;

    public ReconfiguracaoController(LojaJdbc banco, PasswordEncoder encoder, LimiteDeLogin limite, ReconfiguracaoService servico, ObjectMapper json) {
        this.banco = banco;
        this.encoder = encoder;
        this.limite = limite;
        this.servico = servico;
        this.json = json;
    }

    private void confirmarSenha(UUID usuarioId, String senha) {
        Loja loja = LojaContext.exigir();
        String chave = "reconf|" + loja.id() + "|" + usuarioId;
        if (limite.bloqueado(chave)) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        List<String> hashes = banco.naLoja(jdbc -> jdbc.queryForList("select senha_hash from usuario where id = ? and ativo", String.class, usuarioId));
        if (hashes.isEmpty() || !encoder.matches(senha, hashes.get(0))) {
            limite.registrarErro(chave);
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Senha incorreta");
        }
        limite.limpar(chave);
    }

    private void exigirConcluido(java.util.function.Supplier<Boolean> concluido) {
        if (!Boolean.TRUE.equals(concluido.get())) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Conclua o assistente de início antes de reconfigurar");
    }

    /** Abre (ou renova) a reconfiguração: confere a senha do dono e guarda o expediente de antes. */
    @PostMapping("/api/onboarding/reconfiguracoes")
    public ResponseEntity<Autorizacao> abrir(@Valid @RequestBody Confirmacao corpo, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        UUID usuario = UUID.fromString(jwt.getSubject());
        List<Boolean> linhas = banco.naLoja(jdbc -> jdbc.query("select concluido_em is not null from onboarding", (rs, i) -> rs.getBoolean(1)));
        if (linhas.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "O assistente de início não se aplica a esta loja");
        exigirConcluido(() -> linhas.get(0));
        confirmarSenha(usuario, corpo.senha());
        Autorizacao a = banco.naLoja(jdbc -> {
            Instant ate = Instant.now().plus(AUTORIZACAO);
            List<UUID> ativas = jdbc.query("select id from reconfiguracao where usuario_id = ? and autorizada_ate > now() and desfeita_em is null order by criada_em desc limit 1",
                    (rs, i) -> rs.getObject("id", UUID.class), usuario);
            if (!ativas.isEmpty()) {
                jdbc.update("update reconfiguracao set autorizada_ate = ? where id = ?", java.sql.Timestamp.from(ate), ativas.get(0));
                return new Autorizacao(ativas.get(0).toString(), ate);
            }
            UUID id = jdbc.queryForObject("insert into reconfiguracao (loja_id, usuario_id, autorizada_ate, expediente_antes) values (?::uuid, ?, ?, cast(? as jsonb)) returning id",
                    UUID.class, loja.id().toString(), usuario, java.sql.Timestamp.from(ate), servico.expedienteAtual(jdbc));
            return new Autorizacao(id.toString(), ate);
        });
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(a);
    }

    /** Reconfigurações que mudaram algo (as 20 mais recentes), só contagens: nunca senha, nome de cliente ou valor. */
    @GetMapping("/api/onboarding/reconfiguracoes")
    public Lista listar() {
        List<Item> itens = banco.naLoja(jdbc -> jdbc.query(
                "select r.id, r.criada_em, u.nome, jsonb_array_length(r.servicos_criados) as sc, jsonb_array_length(r.usuarios_criados) as uc, r.expediente_trocado, r.desfeita_em, "
                        + "(select count(*) from reconfiguracao n where n.criada_em > r.criada_em and n.desfeita_em is null and (jsonb_array_length(n.servicos_criados) + jsonb_array_length(n.usuarios_criados) > 0 or n.expediente_trocado)) as novas_ativas, "
                        + "(select count(*) from reconfiguracao n where n.criada_em > r.criada_em and (jsonb_array_length(n.servicos_criados) + jsonb_array_length(n.usuarios_criados) > 0 or n.expediente_trocado)) as novas "
                        + "from reconfiguracao r left join usuario u on u.id = r.usuario_id "
                        + "where jsonb_array_length(r.servicos_criados) + jsonb_array_length(r.usuarios_criados) > 0 or r.expediente_trocado "
                        + "order by r.criada_em desc limit 20",
                (rs, i) -> {
                    Instant criada = rs.getObject("criada_em", OffsetDateTime.class).toInstant();
                    OffsetDateTime desfeita = rs.getObject("desfeita_em", OffsetDateTime.class);
                    boolean noPrazo = criada.plus(PRAZO).isAfter(Instant.now());
                    long ativasNovas = rs.getLong("novas_ativas");
                    long novas = rs.getLong("novas");
                    return new Item(rs.getObject("id", UUID.class).toString(), criada, rs.getString("nome"), rs.getInt("sc"), rs.getInt("uc"), rs.getBoolean("expediente_trocado"),
                            desfeita == null ? null : desfeita.toInstant(), noPrazo && desfeita == null && ativasNovas == 0, noPrazo && desfeita != null && novas == 0);
                }));
        return new Lista(itens);
    }

    /** Desfaz: expediente volta ao de antes; serviços e pessoas criados nesta reconfiguração ficam desativados. */
    @PostMapping("/api/onboarding/reconfiguracoes/{id}/desfazer")
    public Lista desfazer(@PathVariable UUID id, @Valid @RequestBody Confirmacao corpo, @AuthenticationPrincipal Jwt jwt) {
        return trocar(id, corpo, jwt, true);
    }

    /** Refaz o que foi desfeito (volta o expediente e reativa o que foi desativado). */
    @PostMapping("/api/onboarding/reconfiguracoes/{id}/refazer")
    public Lista refazer(@PathVariable UUID id, @Valid @RequestBody Confirmacao corpo, @AuthenticationPrincipal Jwt jwt) {
        return trocar(id, corpo, jwt, false);
    }

    private Lista trocar(UUID id, Confirmacao corpo, Jwt jwt, boolean desfazer) {
        Loja loja = LojaContext.exigir();
        UUID usuario = UUID.fromString(jwt.getSubject());
        confirmarSenha(usuario, corpo.senha());
        banco.naLoja(jdbc -> {
            List<Item> estado = listar().itens();
            Item item = estado.stream().filter((x) -> x.id().equals(id.toString())).findFirst().orElse(null);
            List<String[]> dados = jdbc.query("select servicos_criados::text, usuarios_criados::text, expediente_antes::text, expediente_depois::text, expediente_trocado, desfeita_em is not null from reconfiguracao where id = ?",
                    (rs, i) -> new String[]{rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6)}, id);
            if (dados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Reconfiguração não encontrada");
            String[] d = dados.get(0);
            boolean jaDesfeita = "t".equals(d[5]) || "true".equals(d[5]);
            boolean trocado = "t".equals(d[4]) || "true".equals(d[4]);
            if (desfazer) {
                if (jaDesfeita) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esta reconfiguração já foi desfeita");
                if (item == null || !item.podeDesfazer()) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Só a reconfiguração mais recente pode ser desfeita, e só por 30 dias");
            } else {
                if (!jaDesfeita) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esta reconfiguração não foi desfeita");
                if (item == null || !item.podeRefazer()) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Não é mais possível refazer esta reconfiguração");
            }
            List<String> servicos = lista(d[0]);
            List<String> pessoas = lista(d[1]);
            if (trocado) {
                String atual = servico.expedienteAtual(jdbc);
                servico.restaurarExpediente(jdbc, loja.id(), desfazer ? d[2] : d[3]);
                jdbc.update("update reconfiguracao set expediente_depois = cast(? as jsonb) where id = ?", desfazer ? atual : d[3], id);
            }
            for (String s : servicos) jdbc.update("update servico set ativo = ? where id = ?::uuid", !desfazer, s);
            for (String p : pessoas) jdbc.update("update usuario set ativo = ? where id = ?::uuid and papel = 'profissional'", !desfazer, p);
            if (desfazer) jdbc.update("update reconfiguracao set desfeita_em = now(), desfeita_por = ? where id = ?", usuario, id);
            else jdbc.update("update reconfiguracao set desfeita_em = null, desfeita_por = null, refeita_em = now() where id = ?", id);
            return null;
        });
        return listar();
    }

    private List<String> lista(String texto) {
        try {
            return json.readValue(texto, new TypeReference<List<String>>() {
            });
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
