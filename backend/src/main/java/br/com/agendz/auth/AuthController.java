package br.com.agendz.auth;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.seguranca.JwtService;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
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

/** POST /api/auth/login: a loja vem do Host (nunca do corpo). Erro de usuário e de senha dão a MESMA resposta (não revela quem existe). */
@RestController
public class AuthController {

    public record LoginRequest(@NotBlank @Size(max = 60) String identificador, @NotBlank @Size(max = 100) String senha) {
    }

    public record LoginResposta(String token, String nome, String papel) {
    }

    private record Usuario(UUID id, String nome, String papel, String senhaHash, boolean ativo) {
    }

    // BCrypt de uma senha qualquer: gasta o mesmo tempo quando o usuário não existe (evita descobrir logins pelo tempo de resposta).
    private static final String HASH_FALSO = "$2a$10$IlQxxgVQLtNKvB/zNhvZHO7uE77gh6rnd8Up83sH3kRgXEMg9t8sm";

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final LimiteDeLogin limite;

    public AuthController(LojaJdbc banco, PasswordEncoder encoder, JwtService jwt, LimiteDeLogin limite) {
        this.banco = banco;
        this.encoder = encoder;
        this.jwt = jwt;
        this.limite = limite;
    }

    @PostMapping("/api/auth/login")
    public LoginResposta login(@Valid @RequestBody LoginRequest req) {
        Loja loja = LojaContext.exigir();
        String login = req.identificador().trim().toLowerCase(Locale.ROOT);
        String chave = loja.id() + "|" + login;
        if (limite.bloqueado(chave)) {
            throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        }
        List<Usuario> achados = banco.naLoja(jdbc -> jdbc.query(
                "select id, nome, papel, senha_hash, ativo from usuario where identificador = ?",
                (rs, i) -> new Usuario(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("papel"),
                        rs.getString("senha_hash"), rs.getBoolean("ativo")),
                login));
        Usuario u = achados.isEmpty() ? null : achados.get(0);
        boolean senhaOk = encoder.matches(req.senha(), u == null ? HASH_FALSO : u.senhaHash());
        if (u == null || !u.ativo() || !senhaOk) {
            limite.registrarErro(chave);
            throw new ErroDeNegocio(HttpStatus.UNAUTHORIZED, "Usuário ou senha inválidos");
        }
        limite.limpar(chave);
        return new LoginResposta(jwt.emitir(u.id(), loja.id(), u.papel(), u.nome()), u.nome(), u.papel());
    }
}
