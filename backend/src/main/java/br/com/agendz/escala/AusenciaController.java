package br.com.agendz.escala;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.seguranca.Permissoes;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ausências (bloco A3). Decisão sem confirmação: lança o próprio profissional e o proprietário/administrador para qualquer um; a recepção só lê. Se já há agendamento
 * ativo no período, a ausência é recusada (409) e a mensagem lista os conflitos: a equipe remarca antes. "Dia inteiro" (`dia`) bloqueia o dia todo no fuso da loja.
 * O profissional só enxerga e remove as próprias; o de outra loja nem existe (RLS).
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'agenda')")
public class AusenciaController {

    /** Um intervalo: ou `ini`/`fim` (horários específicos) ou `dia` (dia inteiro). */
    public record Intervalo(Instant ini, Instant fim, LocalDate dia) {
    }

    public record NovaAusencia(@NotNull UUID profissionalId, @NotNull @Size(min = 1, max = 300) List<Intervalo> intervalos) {
    }

    public record Ausencia(UUID id, UUID profissionalId, String profissional, Instant ini, Instant fim, boolean diaInteiro) {
    }

    private static final int MAX_DIAS_A_FRENTE = 400;
    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    private final LojaJdbc banco;
    private final java.time.Clock relogio;

    public AusenciaController(LojaJdbc banco, java.time.Clock relogio) {
        this.banco = banco;
        this.relogio = relogio;
    }

    @GetMapping("/api/ausencias")
    public List<Ausencia> listar(@RequestParam(required = false) Instant de, @RequestParam(required = false) Instant ate, @AuthenticationPrincipal Jwt jwt) {
        Instant ini = de == null ? relogio.instant().minusSeconds(86400L) : de;
        Instant fim = ate == null ? ini.plusSeconds(86400L * 120) : ate;
        if (!fim.isAfter(ini) || fim.isAfter(ini.plusSeconds(86400L * 400))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Período inválido.");
        boolean todos = Permissoes.veTudo(jwt.getClaimAsString("papel"));
        return banco.naLoja(jdbc -> jdbc.query(
                "select a.id, a.usuario_id, coalesce(nullif(u.apelido, ''), u.nome) as n, a.ini, a.fim, a.dia_inteiro from ausencia a join usuario u on u.id = a.usuario_id "
                        + "where a.ini < ? and a.fim > ?" + (todos ? "" : " and a.usuario_id = ?") + " order by a.ini, a.id limit 1000",
                (rs, i) -> new Ausencia(rs.getObject("id", UUID.class), rs.getObject("usuario_id", UUID.class), rs.getString("n"),
                        rs.getObject("ini", OffsetDateTime.class).toInstant(), rs.getObject("fim", OffsetDateTime.class).toInstant(), rs.getBoolean("dia_inteiro")),
                todos ? new Object[]{utc(fim), utc(ini)} : new Object[]{utc(fim), utc(ini), UUID.fromString(jwt.getSubject())}));
    }

    @PostMapping("/api/ausencias")
    public ResponseEntity<List<Ausencia>> criar(@jakarta.validation.Valid @RequestBody NovaAusencia d, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        boolean todos = Permissoes.veTudo(jwt.getClaimAsString("papel"));
        UUID eu = UUID.fromString(jwt.getSubject());
        if (!todos && !d.profissionalId().equals(eu)) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Só o proprietário lança ausência de outra pessoa.");
        if ("atendente".equals(jwt.getClaimAsString("papel"))) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "A recepção não lança ausência.");
        Instant agora = relogio.instant();
        List<Instant[]> janelas = new ArrayList<>();
        for (Intervalo v : d.intervalos()) {
            if (v == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Intervalo inválido.");
            Instant ini, fim;
            if (v.dia() != null) {
                ini = v.dia().atStartOfDay(Fuso.BRASIL).toInstant();
                fim = v.dia().plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant();
            } else {
                ini = v.ini();
                fim = v.fim();
            }
            if (ini == null || fim == null || !ini.isBefore(fim)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o início antes do fim da ausência.");
            if (!fim.isAfter(agora)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A ausência precisa ser de agora em diante.");
            if (ini.isAfter(agora.plusSeconds(86400L * MAX_DIAS_A_FRENTE)) || java.time.Duration.between(ini, fim).toDays() > 31) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Ausência distante demais ou longa demais (máximo de 31 dias por intervalo).");
            }
            janelas.add(new Instant[]{ini, fim});
        }
        List<Ausencia> criadas = banco.naLoja(jdbc -> {
            Integer existe = jdbc.queryForObject("select count(*) from usuario where id = ? and ativo", Integer.class, d.profissionalId());
            if (existe == null || existe == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado.");
            // trava o profissional (mesma ordem de quem agenda) para a conferência de conflito valer até gravar
            jdbc.queryForList("select id from usuario where id = ? for update", UUID.class, d.profissionalId());
            conferirConflitos(jdbc, d.profissionalId(), janelas);
            List<Ausencia> saida = new ArrayList<>();
            for (Instant[] j : janelas) {
                boolean dia = d.intervalos().stream().anyMatch(v -> v.dia() != null && v.dia().atStartOfDay(Fuso.BRASIL).toInstant().equals(j[0]));
                UUID id = jdbc.queryForObject("insert into ausencia (loja_id, usuario_id, ini, fim, dia_inteiro, criado_por) values (?::uuid, ?, ?, ?, ?, ?) returning id",
                        UUID.class, loja.id().toString(), d.profissionalId(), utc(j[0]), utc(j[1]), dia, eu);
                saida.add(new Ausencia(id, d.profissionalId(), null, j[0], j[1], dia));
            }
            return saida;
        });
        return ResponseEntity.status(HttpStatus.CREATED).body(criadas);
    }

    @DeleteMapping("/api/ausencias/{id}")
    public ResponseEntity<Void> remover(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        boolean todos = Permissoes.veTudo(jwt.getClaimAsString("papel"));
        if ("atendente".equals(jwt.getClaimAsString("papel"))) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "A recepção não remove ausência.");
        int n = banco.naLoja(jdbc -> todos ? jdbc.update("delete from ausencia where id = ?", id)
                : jdbc.update("delete from ausencia where id = ? and usuario_id = ?", id, UUID.fromString(jwt.getSubject())));
        if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Ausência não encontrada."); // de outra pessoa ou inexistente: mesma resposta
        return ResponseEntity.noContent().build();
    }

    /** 409 listando os agendamentos ativos do profissional que cairiam dentro da ausência. */
    private static void conferirConflitos(JdbcTemplate jdbc, UUID profissionalId, List<Instant[]> janelas) {
        List<String> achados = new ArrayList<>();
        java.util.Set<UUID> vistos = new java.util.HashSet<>();
        for (Instant[] j : janelas) {
            jdbc.query("select distinct a.id, a.inicio, coalesce(nullif(c.apelido, ''), c.nome, nullif(a.nome_avulso, ''), 'sem nome') as quem "
                            + "from agendamento a join agendamento_bloco k on k.agendamento_id = a.id left join cliente c on c.id = a.cliente_id "
                            + "where a.profissional_id = ? and a.status <> 'cancelado' and k.ini < ? and k.fim > ? order by a.inicio",
                    rs -> {
                        if (vistos.add(rs.getObject("id", UUID.class))) {
                            achados.add(rs.getObject("inicio", OffsetDateTime.class).toInstant().atZone(Fuso.BRASIL).format(DATA_HORA) + " (" + curto(rs.getString("quem")) + ")");
                        }
                    }, profissionalId, utc(j[1]), utc(j[0]));
        }
        if (achados.isEmpty()) return;
        List<String> mostra = achados.size() > MOSTRA ? achados.subList(0, MOSTRA) : achados;
        throw new ErroDeNegocio(HttpStatus.CONFLICT, "Há " + (achados.size() == 1 ? "1 agendamento" : achados.size() + " agendamentos") + " nesse período: " + String.join(", ", mostra)
                + (achados.size() > MOSTRA ? " e mais " + (achados.size() - MOSTRA) : "") + ". Remarque ou cancele antes de lançar a ausência.");
    }

    /** A mensagem de erro cabe em 300 letras na tela: poucos conflitos e nomes curtos. */
    private static final int MOSTRA = 4;

    private static String curto(String nome) {
        return nome != null && nome.length() > 20 ? nome.substring(0, 19) + "…" : nome;
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
