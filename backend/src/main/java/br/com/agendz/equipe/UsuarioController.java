package br.com.agendz.equipe;

import br.com.agendz.equipe.UsuarioService.ComSenha;
import br.com.agendz.equipe.UsuarioService.Dados;
import br.com.agendz.equipe.UsuarioService.MeusDados;
import br.com.agendz.equipe.UsuarioService.MeusDadosEntrada;
import br.com.agendz.equipe.UsuarioService.Usuario;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Equipe (docs/MAPA-API-SPRING.md, equipe.*; regras em {@link UsuarioService}). Só o proprietário cadastra, altera, refaz senha, remove e vê a lista com
 * contatos e CPF mascarado. Desde o E1 trocar o perfil (inclusive de proprietário) não pede senha; as travas e o registro ficam no service. Cada pessoa troca só a própria foto. A lista simples de quem atende (para a agenda) continua em `/api/profissionais`.
 */
@RestController
public class UsuarioController {

    public record Atendimento(@NotNull Boolean atende) {
    }

    public record Foto(@Size(max = 40000) String foto) {
    }

    private final UsuarioService usuarios;

    public UsuarioController(UsuarioService usuarios) {
        this.usuarios = usuarios;
    }

    @GetMapping("/api/usuarios")
    @PreAuthorize("hasRole('DONO')")
    public List<Usuario> listar() {
        return usuarios.listar();
    }

    @GetMapping("/api/usuarios/{id}")
    @PreAuthorize("hasRole('DONO')")
    public Usuario obter(@PathVariable UUID id) {
        return usuarios.obter(id);
    }

    /** Devolve a senha temporária UMA vez; nada de cache no navegador nem em proxy. */
    @PostMapping("/api/usuarios")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<ComSenha> criar(@Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        // E1: cadastrar alguém já como proprietário NÃO pede mais a senha de quem faz; fica no registro de ações
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(usuarios.criarPor(UUID.fromString(jwt.getSubject()), d));
    }

    @PutMapping("/api/usuarios/{id}")
    @PreAuthorize("hasRole('DONO')")
    public Usuario alterar(@PathVariable UUID id, @Valid @RequestBody Dados d, @AuthenticationPrincipal Jwt jwt) {
        // E1: trocar o perfil (inclusive promover ou rebaixar proprietário) não pede senha; ninguém muda o próprio perfil; fica no registro de ações
        return usuarios.alterarPor(UUID.fromString(jwt.getSubject()), id, d);
    }

    @PutMapping("/api/usuarios/{id}/atendimento")
    @PreAuthorize("hasRole('DONO')")
    public Usuario atendimento(@PathVariable UUID id, @Valid @RequestBody Atendimento d) {
        return usuarios.definirAtendimento(id, d.atende());
    }

    @PostMapping("/api/usuarios/{id}/senha-temporaria")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<ComSenha> refazerSenha(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        // E1: sem senha de confirmação (a própria senha tem outro caminho e o service recusa); fica no registro de ações
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(usuarios.refazerSenha(id, UUID.fromString(jwt.getSubject())));
    }

    @DeleteMapping("/api/usuarios/{id}")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Void> remover(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        usuarios.remover(id, UUID.fromString(jwt.getSubject()));
        return ResponseEntity.noContent().build();
    }

    /** "Meu perfil": cada pessoa lê e muda os próprios dados de contato (nunca perfil, permissões, CPF nem comissão). */
    @GetMapping("/api/usuarios/me")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public MeusDados meusDados(@AuthenticationPrincipal Jwt jwt) {
        return usuarios.meusDados(UUID.fromString(jwt.getSubject()));
    }

    @PutMapping("/api/usuarios/me")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public MeusDados alterarMeusDados(@Valid @RequestBody MeusDadosEntrada d, @AuthenticationPrincipal Jwt jwt) {
        return usuarios.alterarMeusDados(UUID.fromString(jwt.getSubject()), d);
    }

    /** Cada pessoa troca só a própria foto (qualquer perfil logado); `foto` vazio ou ausente remove. */
    @PutMapping("/api/usuarios/me/foto")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public ResponseEntity<Void> minhaFoto(@Valid @RequestBody Foto d, @AuthenticationPrincipal Jwt jwt) {
        usuarios.minhaFoto(UUID.fromString(jwt.getSubject()), d.foto());
        return ResponseEntity.noContent().build();
    }
}
