package br.com.agendz.clientes;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Clientes da loja. Nenhum id de loja entra por aqui: a loja é a do Host (conferida contra o token) e o banco filtra por RLS.
 * Cliente de outra loja responde 404 (não revela que existe).
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','PROFISSIONAL')")
public class ClienteController {

    public record Cliente(UUID id, String nome, String telefone) {
    }

    public record NovoCliente(@NotBlank @Size(max = 120) String nome,
                              @NotBlank @Pattern(regexp = "^55\\d{10,11}$", message = "use 55 + DDD + número, só dígitos") String telefone) {
    }

    private final LojaJdbc banco;

    public ClienteController(LojaJdbc banco) {
        this.banco = banco;
    }

    @GetMapping("/api/clientes")
    public List<Cliente> listar() {
        return banco.naLoja(jdbc -> jdbc.query(
                "select id, nome, telefone from cliente order by nome limit 500",
                (rs, i) -> new Cliente(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("telefone"))));
    }

    @GetMapping("/api/clientes/{id}")
    public Cliente obter(@PathVariable UUID id) {
        List<Cliente> achados = banco.naLoja(jdbc -> jdbc.query(
                "select id, nome, telefone from cliente where id = ?",
                (rs, i) -> new Cliente(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("telefone")),
                id));
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Cliente não encontrado");
        return achados.get(0);
    }

    @PostMapping("/api/clientes")
    public ResponseEntity<Cliente> criar(@Valid @RequestBody NovoCliente corpo) {
        Loja loja = LojaContext.exigir();
        String nome = corpo.nome().trim();
        UUID id = banco.naLoja(jdbc -> jdbc.queryForObject(
                "insert into cliente (loja_id, nome, telefone) values (?::uuid, ?, ?) returning id",
                UUID.class, loja.id().toString(), nome, corpo.telefone()));
        return ResponseEntity.status(HttpStatus.CREATED).body(new Cliente(id, nome, corpo.telefone()));
    }
}
