package br.com.agendz.escala;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.escala.EscalaService.Dia;
import br.com.agendz.escala.EscalaService.Escala;
import br.com.agendz.escala.EscalaService.Faixa;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Expediente da loja (`/api/estabelecimento/escala`) e escala do profissional (`/api/profissionais/{id}/escala`).
 * Leitura: dono e profissional (o profissional só lê a própria). Escrita: loja = só o dono; profissional = o dono ou a própria pessoa.
 * A escala do profissional vazia (nenhum dia aberto) APAGA a escala própria: ele volta a seguir o expediente da loja.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'agenda')")
public class EscalaController {

    public record CorpoEscala(@NotNull Map<Integer, @Valid Dia> semana) {
    }

    private final LojaJdbc banco;
    private final EscalaService escalas;

    public EscalaController(LojaJdbc banco, EscalaService escalas) {
        this.banco = banco;
        this.escalas = escalas;
    }

    @GetMapping("/api/estabelecimento/escala")
    public Escala lerLoja() {
        return banco.naLoja((jdbc) -> EscalaService.paraJson(escalas.ler(jdbc, null)));
    }

    @PutMapping("/api/estabelecimento/escala")
    @PreAuthorize("@perm.pode(authentication, 'estabelecimento')")
    public Escala gravarLoja(@Valid @RequestBody CorpoEscala corpo) {
        Loja loja = LojaContext.exigir();
        Map<Integer, List<Faixa>> semana = EscalaService.validar(new Escala(corpo.semana()));
        if (!EscalaService.temFaixa(semana)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Abra pelo menos um dia da semana");
        return banco.naLoja((jdbc) -> {
            escalas.gravar(jdbc, loja.id(), null, semana);
            return EscalaService.paraJson(escalas.ler(jdbc, null));
        });
    }

    @GetMapping("/api/profissionais/{id}/escala")
    public Escala lerProfissional(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        exigirAcesso(id, jwt);
        return banco.naLoja((jdbc) -> {
            existe(jdbc, id);
            return EscalaService.paraJson(escalas.ler(jdbc, id));
        });
    }

    @PutMapping("/api/profissionais/{id}/escala")
    public Escala gravarProfissional(@PathVariable UUID id, @Valid @RequestBody CorpoEscala corpo, @AuthenticationPrincipal Jwt jwt) {
        exigirAcesso(id, jwt);
        Loja loja = LojaContext.exigir();
        Map<Integer, List<Faixa>> semana = EscalaService.validar(new Escala(corpo.semana()));
        return banco.naLoja((jdbc) -> {
            existe(jdbc, id);
            escalas.gravar(jdbc, loja.id(), id, semana);
            return EscalaService.paraJson(escalas.ler(jdbc, id));
        });
    }

    /** Dono mexe em qualquer profissional; profissional só na própria escala (a de outro responde 404, como se não existisse). */
    private static void exigirAcesso(UUID id, Jwt jwt) {
        boolean dono = br.com.agendz.seguranca.Permissoes.veTudo(jwt.getClaimAsString("papel"));
        if (!dono && !id.toString().equals(jwt.getSubject())) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado");
    }

    private static void existe(org.springframework.jdbc.core.JdbcTemplate jdbc, UUID id) {
        Integer n = jdbc.queryForObject("select count(*) from usuario where id = ? and ativo", Integer.class, id);
        if (n == null || n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado");
    }
}
