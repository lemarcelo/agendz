package br.com.agendz.auth.passkey;

import br.com.agendz.auth.LimiteDeLogin;
import br.com.agendz.auth.Sessao;
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
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Login por digital (passkey). Entrada: POST /api/auth/passkey/desafio e /entrar (públicas; só valem com assinatura do aparelho). Cadastro da própria pessoa:
 * POST /api/usuarios/me/passkeys/desafio (confirma a SENHA; errada = 403, nunca 401, que derrubaria a sessão no site), POST/GET/DELETE /api/usuarios/me/passkeys.
 * Uma pessoa só mexe nas próprias passkeys (o id da pessoa vem do token, nunca da rota).
 */
@RestController
public class PasskeyController {

    public record DesafioDeCadastro(@NotBlank @Size(max = 100) String senha) {
    }

    public record Cadastro(@NotBlank @Size(max = 64) String desafioId, @Size(max = 60) String nome, @NotBlank @Size(max = 2000) String clientDataJSON,
                           @NotBlank @Size(max = 16000) String atestado) {
    }

    public record Entrada(@NotBlank @Size(max = 64) String desafioId, @NotBlank @Size(max = 2000) String credencialId, @NotBlank @Size(max = 4000) String clientDataJSON,
                          @NotBlank @Size(max = 4000) String authenticatorData, @NotBlank @Size(max = 1000) String assinatura, @Size(max = 200) String userHandle, Boolean loginAutomatico) {
    }

    private final PasskeyService servico;
    private final LojaJdbc banco;
    private final PasswordEncoder encoder;
    private final LimiteDeLogin limite;

    public PasskeyController(PasskeyService servico, LojaJdbc banco, PasswordEncoder encoder, LimiteDeLogin limite) {
        this.servico = servico;
        this.banco = banco;
        this.encoder = encoder;
        this.limite = limite;
    }

    @PostMapping("/api/auth/passkey/desafio")
    public PasskeyService.Pedido desafioDeEntrada(HttpServletRequest req) {
        return servico.desafioDeEntrada(req.getServerName());
    }

    @PostMapping("/api/auth/passkey/entrar")
    public Sessao entrar(@Valid @RequestBody Entrada d, HttpServletRequest req) {
        return servico.entrar(req.getServerName(), d.desafioId(), d.credencialId(), d.clientDataJSON(), d.authenticatorData(), d.assinatura(), d.userHandle(),
                Rede.ip(req), Boolean.TRUE.equals(d.loginAutomatico()));
    }

    @PostMapping("/api/usuarios/me/passkeys/desafio")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public PasskeyService.Pedido desafioDeCadastro(@Valid @RequestBody DesafioDeCadastro d, @AuthenticationPrincipal Jwt jwt, HttpServletRequest req) {
        Loja loja = LojaContext.exigir();
        UUID id = UUID.fromString(jwt.getSubject());
        String chave = "senha|" + loja.id() + "|" + id; // a mesma trava da troca de senha: 5 erros = 15 min
        if (limite.bloqueado(chave)) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        List<String> hashes = banco.naLoja(jdbc -> jdbc.query("select senha_hash from usuario where id = ?", (rs, i) -> rs.getString(1), id));
        if (hashes.isEmpty() || !encoder.matches(d.senha(), hashes.get(0))) {
            limite.registrarErro(chave);
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Senha incorreta."); // 403: com 401 o site derrubaria a sessão
        }
        limite.limpar(chave);
        return servico.desafioDeCadastro(id, req.getServerName());
    }

    @PostMapping("/api/usuarios/me/passkeys")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public PasskeyService.Item cadastrar(@Valid @RequestBody Cadastro d, @AuthenticationPrincipal Jwt jwt, HttpServletRequest req) {
        return servico.cadastrar(UUID.fromString(jwt.getSubject()), req.getServerName(), d.desafioId(), d.nome(), d.clientDataJSON(), d.atestado());
    }

    @GetMapping("/api/usuarios/me/passkeys")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public List<PasskeyService.Item> listar(@AuthenticationPrincipal Jwt jwt) {
        return servico.listar(UUID.fromString(jwt.getSubject()));
    }

    @DeleteMapping("/api/usuarios/me/passkeys/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public void remover(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        servico.remover(UUID.fromString(jwt.getSubject()), id);
    }
}
