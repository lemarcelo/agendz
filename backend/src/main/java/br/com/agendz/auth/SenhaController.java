package br.com.agendz.auth;

import br.com.agendz.auth.aparelho.AparelhosConfiaveis;
import br.com.agendz.auth.rede.RedesConfiaveis;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * PUT /api/usuarios/me/senha: a própria pessoa troca a senha (a de outro usuário nunca vem na rota). Confere a atual (5 erros bloqueiam por 15 min,
 * como no login), exige 8+ caracteres e diferente da atual, zera a marca de senha temporária e devolve um token novo (sem `trocar`).
 * É a ÚNICA rota que um token de senha temporária consegue usar (TrocarSenhaFilter).
 * `usuario` (opcional): a pessoa escolhe o próprio login no primeiro acesso (minúsculas, 2 a 60: letras, números, ponto, hífen, sublinhado;
 * único dentro da loja, nunca entre lojas). Sem `usuario`, o login não muda. A conferência da senha atual e a loja do endereço valem como antes.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class SenhaController {

    public record TrocaDeSenha(
            @NotBlank @Size(max = 100) String senhaAtual,
            @NotBlank @Size(min = 8, max = 100, message = "a nova senha precisa ter de 8 a 100 caracteres") String nova,
            @Size(max = 60) String usuario) {
    }

    private static final Pattern LOGIN = Pattern.compile("^[a-z0-9._-]{2,60}$");

    private record Linha(String hash, String papel, String nome, boolean ativo) {
    }

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;
    private final LimiteDeLogin limite;
    private final SessaoService sessao;
    private final RedesConfiaveis redes;
    private final AparelhosConfiaveis aparelhos;

    public SenhaController(LojaJdbc banco, PasswordEncoder encoder, LimiteDeLogin limite, SessaoService sessao, RedesConfiaveis redes, AparelhosConfiaveis aparelhos) {
        this.banco = banco;
        this.encoder = encoder;
        this.limite = limite;
        this.sessao = sessao;
        this.redes = redes;
        this.aparelhos = aparelhos;
    }

    @PutMapping("/api/usuarios/me/senha")
    public Sessao trocar(@Valid @RequestBody TrocaDeSenha d, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        UUID id = UUID.fromString(jwt.getSubject());
        String chave = "senha|" + loja.id() + "|" + id;
        if (limite.bloqueado(chave)) {
            throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        }
        List<Linha> achadas = banco.naLoja(jdbc -> jdbc.query(
                "select senha_hash, papel, nome, ativo from usuario where id = ?",
                (rs, i) -> new Linha(rs.getString("senha_hash"), rs.getString("papel"), rs.getString("nome"), rs.getBoolean("ativo")), id));
        if (achadas.isEmpty() || !achadas.get(0).ativo()) throw new ErroDeNegocio(HttpStatus.UNAUTHORIZED, "Sessão inválida");
        Linha u = achadas.get(0);
        String pedido = d.usuario() == null || d.usuario().isBlank() ? null : d.usuario().trim().toLowerCase(Locale.ROOT);
        // O usuário `suporte` (criado pelo Admin) nunca troca de nome: pedir o próprio nome é ignorado; qualquer outro é recusado.
        boolean ehSuporte = Boolean.TRUE.equals(banco.naLoja(jdbc -> jdbc.queryForObject("select identificador = 'suporte' from usuario where id = ?", Boolean.class, id)));
        if (ehSuporte && pedido != null && !br.com.agendz.validacao.Reservados.reservado(pedido)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O usuário de suporte não troca de nome.");
        String novoLogin = ehSuporte ? null : pedido;
        if (novoLogin != null && !LOGIN.matcher(novoLogin).matches()) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Usuário: de 2 a 60 caracteres, só letras, números, ponto, hífen e sublinhado");
        }
        br.com.agendz.validacao.Reservados.exigirLivre(novoLogin);
        if (!encoder.matches(d.senhaAtual(), u.hash())) {
            limite.registrarErro(chave);
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Senha atual incorreta");
        }
        if (encoder.matches(d.nova(), u.hash())) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A nova senha precisa ser diferente da atual");
        }
        if (novoLogin != null) {
            Integer ocupado = banco.naLoja(jdbc -> jdbc.queryForObject("select count(*) from usuario where identificador = ? and id <> ?", Integer.class, novoLogin, id));
            if (ocupado != null && ocupado > 0) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse usuário já está em uso nesta loja. Escolha outro.");
        }
        limite.limpar(chave);
        String novoHash = encoder.encode(d.nova());
        boolean dono = "dono".equals(u.papel());
        try {
            banco.naLoja(jdbc -> {
                if (novoLogin != null) jdbc.update("update usuario set identificador = ? where id = ?", novoLogin, id);
                jdbc.update("update usuario set senha_hash = ?, deve_trocar_senha = false where id = ?", novoHash, id);
                // o dono trocou a senha temporária: o assistente de início passa para o passo de serviços
                if (dono) jdbc.update("update onboarding set passo = 'servicos', atualizado_em = now() where passo = 'senha' and concluido_em is null");
                return null;
            });
        } catch (DuplicateKeyException e) { // duas pessoas escolhendo o mesmo login ao mesmo tempo: a trava única do banco decide
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esse usuário já está em uso nesta loja. Escolha outro.");
        }
        redes.encerrarTodas(id); // trocou a senha: os tokens longos de redes confiáveis deixam de valer
        aparelhos.removerTodos(id); // e os aparelhos confiáveis deixam de ser confiáveis (v125)
        return sessao.abrir(id, loja, u.papel(), u.nome(), false);
    }
}
