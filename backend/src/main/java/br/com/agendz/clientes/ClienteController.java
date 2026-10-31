package br.com.agendz.clientes;

import br.com.agendz.clientes.ClienteService.Ator;
import br.com.agendz.clientes.ClienteService.Entrada;
import br.com.agendz.clientes.ClienteService.Ficha;
import br.com.agendz.clientes.ClienteService.Resumo;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Clientes da loja. Nenhum id de loja entra por aqui: a loja é a do Host (conferida contra o token) e o banco filtra por RLS.
 * Cliente de outra loja responde 404 (não revela que existe). Regras em {@link ClienteService}.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'clientes')")
public class ClienteController {

    public record NovoCliente(@Size(max = 100) String nome, @Size(max = 100) String apelido, @Size(max = 30) String telefone,
                              @Size(max = 20) String cpf, @Size(max = 10) String nascimento,
                              @Size(max = 50) List<@Valid VeiculoEntrada> veiculos, Boolean semMensagens) {
        Entrada paraEntrada() {
            return new Entrada(nome, apelido, telefone, cpf, nascimento,
                    veiculos == null ? null : veiculos.stream().map(v -> v == null ? null : new ClienteService.EntradaVeiculo(v.id(), v.placa(), v.marca(), v.modelo(), v.cor(), v.porte())).toList(),
                    semMensagens);
        }
    }

    public record VeiculoEntrada(@Size(max = 40) String id, @Size(max = 16) String placa, @Size(max = 30) String marca, @Size(max = 40) String modelo,
                                 @Size(max = 20) String cor, @Size(max = 16) String porte) {
    }

    private final ClienteService servico;

    public ClienteController(ClienteService servico) {
        this.servico = servico;
    }

    private static Ator ator(Jwt jwt) {
        return new Ator(UUID.fromString(jwt.getSubject()), br.com.agendz.seguranca.Permissoes.veTudo(jwt.getClaimAsString("papel")));
    }

    /** `q` busca por nome, apelido, telefone (DDD + número), CPF, placa ou modelo. Até 500 resultados. */
    @GetMapping("/api/clientes")
    public List<Resumo> listar(@RequestParam(required = false, defaultValue = "") String q) {
        return servico.listar(q);
    }

    @GetMapping("/api/clientes/{id}")
    public Ficha obter(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return servico.obter(ator(jwt), id);
    }

    @PostMapping("/api/clientes")
    public ResponseEntity<Ficha> criar(@Valid @RequestBody NovoCliente corpo, @AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.CREATED).body(servico.criar(ator(jwt), corpo.paraEntrada()));
    }

    /** Campo ausente não muda; CPF ou nascimento em branco apagam. */
    @PutMapping("/api/clientes/{id}")
    public Ficha atualizar(@PathVariable UUID id, @Valid @RequestBody NovoCliente corpo, @AuthenticationPrincipal Jwt jwt) {
        return servico.atualizar(ator(jwt), id, corpo.paraEntrada());
    }
}
