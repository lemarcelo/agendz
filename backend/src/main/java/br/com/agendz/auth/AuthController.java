package br.com.agendz.auth;

import br.com.agendz.auth.rede.Rede;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** POST /api/auth/login (corpo: identificador, senha, captcha opcional): a loja vem do Host (nunca do corpo). Erro de usuário e de senha dão a MESMA resposta (não revela quem existe). */
@RestController
public class AuthController {

    public record LoginRequest(@NotBlank @Size(max = 60) String identificador, @NotBlank @Size(max = 100) String senha, Boolean loginAutomatico, @Size(max = 4096) String captcha) {
    }

    private record Usuario(UUID id, String nome, String papel, String senhaHash, boolean ativo, boolean deveTrocarSenha) {
    }

    // BCrypt de uma senha qualquer: gasta o mesmo tempo quando o usuário não existe (evita descobrir logins pelo tempo de resposta).
    private static final String HASH_FALSO = "$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm";

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;
    private final SessaoService sessao;
    private final LimiteDeLogin limite;
    private final Recaptcha recaptcha;

    public AuthController(LojaJdbc banco, PasswordEncoder encoder, SessaoService sessao, LimiteDeLogin limite, Recaptcha recaptcha) {
        this.banco = banco;
        this.encoder = encoder;
        this.sessao = sessao;
        this.limite = limite;
        this.recaptcha = recaptcha;
    }

    @PostMapping("/api/auth/login")
    public Sessao login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        Loja loja = LojaContext.exigir();
        String login = req.identificador().trim().toLowerCase(Locale.ROOT);
        String chave = loja.id() + "|" + login;
        if (limite.bloqueadoNoLogin(chave, recaptcha.ativo())) {
            throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        }
        // Depois de 5 senhas erradas seguidas a senha sozinha não basta: 428 faz a tela mostrar o reCAPTCHA. A recusa do captcha não conta como erro de senha.
        if (recaptcha.ativo() && limite.exigeCaptcha(chave) && !recaptcha.valido(req.captcha())) {
            throw new ErroDeNegocio(HttpStatus.PRECONDITION_REQUIRED, "Confirme que você não é um robô para continuar.");
        }
        List<Usuario> achados = banco.naLoja(jdbc -> jdbc.query(
                "select id, nome, papel, senha_hash, ativo, deve_trocar_senha from usuario where identificador = ?",
                (rs, i) -> new Usuario(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("papel"),
                        rs.getString("senha_hash"), rs.getBoolean("ativo"), rs.getBoolean("deve_trocar_senha")),
                login));
        Usuario u = achados.isEmpty() ? null : achados.get(0);
        boolean senhaOk = encoder.matches(req.senha(), u == null ? HASH_FALSO : u.senhaHash());
        if (u == null || !u.ativo() || !senhaOk) {
            limite.registrarErro(chave);
            throw new ErroDeNegocio(HttpStatus.UNAUTHORIZED, "Usuário ou senha inválidos");
        }
        limite.limpar(chave);
        banco.naLoja(jdbc -> jdbc.update("update usuario set ultimo_acesso = now() where id = ?", u.id()));
        return sessao.abrir(u.id(), loja, u.papel(), u.nome(), u.deveTrocarSenha(), Rede.ip(http), Boolean.TRUE.equals(req.loginAutomatico()));
    }
}
