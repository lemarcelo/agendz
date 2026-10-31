package br.com.agendz.avaliacoes;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.seguranca.Permissoes;
import br.com.agendz.seguranca.Permissoes.EscopoAvaliacoes;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
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
 * Avaliações e mensagens em lote, lado do painel. Nenhum id de loja entra por aqui (a loja é a do Host). A estrela do cartão e o pedido exigem a seção `agenda`;
 * lista e resumo: dono e quem tem a seção `avaliacoes` veem todas e o profissional só as próprias; ocultar é só do dono; a fila em lote exige a seção `avaliacoes`.
 * Mapa: docs/MAPA-API-SPRING.md, seção 10p.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
public class AvaliacaoController {

    /** O método com `@PreAuthorize` próprio SUBSTITUI o da classe: por isso cada um repete os papéis. */
    private static final String PAPEIS = "hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')";

    public record Motivo(String motivo) {
    }

    public record NovaFila(String tipo, String modelo, String de, String ate, UUID profissionalId, UUID servicoId) {
    }

    public record Marca(String status) {
    }

    private final AvaliacaoService servico;
    private final FilaMensagemService filas;
    private final Permissoes permissoes;

    public AvaliacaoController(AvaliacaoService servico, FilaMensagemService filas, Permissoes permissoes) {
        this.servico = servico;
        this.filas = filas;
        this.permissoes = permissoes;
    }

    private static AvaliacaoService.Ator ator(Jwt jwt) {
        String papel = jwt.getClaimAsString("papel");
        return new AvaliacaoService.Ator(UUID.fromString(jwt.getSubject()), Permissoes.veTudo(papel), "dono".equals(papel));
    }

    private EscopoAvaliacoes escopo(Authentication auth) {
        EscopoAvaliacoes e = permissoes.escopoAvaliacoes(auth);
        if (e == null) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Sem permissão");
        return e;
    }

    // ---------- a estrela do cartão

    /** GET /api/agendamentos/{id}/avaliacao: pode pedir a avaliação? Se não, por quê (`motivo` e `aviso`). */
    @GetMapping("/api/agendamentos/{id}/avaliacao")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'agenda')")
    public AvaliacaoService.Situacao situacao(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return servico.situacao(ator(jwt), id);
    }

    /** POST /api/agendamentos/{id}/avaliacao/pedido: gera o token pessoal (devolvido UMA vez) e marca "pedida em". */
    @PostMapping("/api/agendamentos/{id}/avaliacao/pedido")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'agenda')")
    public AvaliacaoService.Pedido pedir(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return servico.pedir(ator(jwt), id);
    }

    // ---------- lista, resumo e ocultar

    /** GET /api/avaliacoes?de=&ate=&profissionalId=&servicoId= */
    @GetMapping("/api/avaliacoes")
    public AvaliacaoService.Lista listar(Authentication auth, @RequestParam(required = false) String de, @RequestParam(required = false) String ate,
                                         @RequestParam(required = false) UUID profissionalId, @RequestParam(required = false) UUID servicoId) {
        return servico.listar(escopo(auth), de, ate, profissionalId, servicoId);
    }

    /** GET /api/avaliacoes/resumo?de=&ate=&profissionalId=&servicoId= */
    @GetMapping("/api/avaliacoes/resumo")
    public AvaliacaoService.ResumoDto resumo(Authentication auth, @RequestParam(required = false) String de, @RequestParam(required = false) String ate,
                                             @RequestParam(required = false) UUID profissionalId, @RequestParam(required = false) UUID servicoId) {
        return servico.resumo(escopo(auth), de, ate, profissionalId, servicoId);
    }

    /** POST /api/avaliacoes/{id}/ocultar {motivo}: só o dono; não apaga, sai da média. */
    @PostMapping("/api/avaliacoes/{id}/ocultar")
    @PreAuthorize("hasRole('DONO')")
    public void ocultar(@PathVariable UUID id, @RequestBody Motivo corpo, @AuthenticationPrincipal Jwt jwt) {
        servico.mudarOculta(ator(jwt), id, corpo == null ? null : corpo.motivo(), true);
    }

    @PostMapping("/api/avaliacoes/{id}/reexibir")
    @PreAuthorize("hasRole('DONO')")
    public void reexibir(@PathVariable UUID id, @RequestBody Motivo corpo, @AuthenticationPrincipal Jwt jwt) {
        servico.mudarOculta(ator(jwt), id, corpo == null ? null : corpo.motivo(), false);
    }

    // ---------- mensagens em lote

    /** GET /api/mensagens/fila?tipo=&de=&ate=&profissionalId=&servicoId=: prévia, não grava. */
    @GetMapping("/api/mensagens/fila")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'avaliacoes')")
    public FilaMensagemService.Previa previa(@RequestParam(required = false) String tipo, @RequestParam(required = false) String de, @RequestParam(required = false) String ate,
                                             @RequestParam(required = false) UUID profissionalId, @RequestParam(required = false) UUID servicoId) {
        return filas.previa(tipo, de, ate, profissionalId, servicoId);
    }

    @PostMapping("/api/mensagens/filas")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'avaliacoes')")
    public FilaMensagemService.Fila iniciar(@RequestBody NovaFila c, @AuthenticationPrincipal Jwt jwt) {
        return filas.iniciar(ator(jwt).id(), c.tipo(), c.modelo(), c.de(), c.ate(), c.profissionalId(), c.servicoId());
    }

    @GetMapping("/api/mensagens/filas/atual")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'avaliacoes')")
    public FilaMensagemService.FilaAtual atual(@AuthenticationPrincipal Jwt jwt) {
        return filas.atual(ator(jwt).id());
    }

    @PostMapping("/api/mensagens/filas/{filaId}/itens/{item}/abrir")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'avaliacoes')")
    public FilaMensagemService.Aberto abrir(@PathVariable UUID filaId, @PathVariable int item, @AuthenticationPrincipal Jwt jwt) {
        return filas.abrir(ator(jwt).id(), filaId, item);
    }

    @PutMapping("/api/mensagens/filas/{filaId}/itens/{item}")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'avaliacoes')")
    public FilaMensagemService.Fila marcar(@PathVariable UUID filaId, @PathVariable int item, @RequestBody Marca c, @AuthenticationPrincipal Jwt jwt) {
        return filas.marcar(ator(jwt).id(), filaId, item, c == null ? null : c.status());
    }

    @PostMapping("/api/mensagens/filas/{filaId}/encerrar")
    @PreAuthorize(PAPEIS + " and @perm.pode(authentication, 'avaliacoes')")
    public void encerrar(@PathVariable UUID filaId, @AuthenticationPrincipal Jwt jwt) {
        filas.encerrar(ator(jwt).id(), filaId);
    }
}
