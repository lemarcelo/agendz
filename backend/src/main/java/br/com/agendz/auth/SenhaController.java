package br.com.agendz.auth;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
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
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','PROFISSIONAL')")
public class SenhaController {

    public record TrocaDeSenha(
            @NotBlank @Size(max = 100) String senhaAtual,
            @NotBlank @Size(min = 8, max = 100, message = "a nova senha precisa ter de 8 a 100 caracteres") String nova) {
    }

    private record Linha(String hash, String papel, String nome, boolean ativo) {
    }

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;
    private final LimiteDeLogin limite;
    private final SessaoService sessao;

    public SenhaController(LojaJdbc banco, PasswordEncoder encoder, LimiteDeLogin limite, SessaoService sessao) {
        this.banco = banco;
        this.encoder = encoder;
        this.limite = limite;
        this.sessao = sessao;
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
        if (!encoder.matches(d.senhaAtual(), u.hash())) {
            limite.registrarErro(chave);
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Senha atual incorreta");
        }
        if (encoder.matches(d.nova(), u.hash())) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A nova senha precisa ser diferente da atual");
        }
        limite.limpar(chave);
        String novoHash = encoder.encode(d.nova());
        boolean dono = "dono".equals(u.papel());
        banco.naLoja(jdbc -> {
            jdbc.update("update usuario set senha_hash = ?, deve_trocar_senha = false where id = ?", novoHash, id);
            // o dono trocou a senha temporária: o assistente de início passa para o passo de serviços
            if (dono) jdbc.update("update onboarding set passo = 'servicos', atualizado_em = now() where passo = 'senha' and concluido_em is null");
            return null;
        });
        return sessao.abrir(id, loja, u.papel(), u.nome(), false);
    }
}
