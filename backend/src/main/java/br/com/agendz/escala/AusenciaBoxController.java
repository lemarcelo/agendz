package br.com.agendz.escala;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Capacidades;
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
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
 * Ausência do box (bloco G2), igual à do profissional (`AusenciaController`) mas para o recurso físico da estética. Decisões do Marcelo: proprietário,
 * administrador e recepção lançam e removem (o profissional não); agendamento já marcado no período NÃO impede a ausência: ela é gravada e a resposta lista os
 * agendamentos afetados para a equipe remarcar. A ausência vale só daqui para frente e bloqueia novos agendamentos (Ocupacao e link do cliente).
 * "Dia inteiro" (`dia`) vale o dia todo no fuso da loja. Tipo sem box (barbearia) não tem o que lançar.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE') and @perm.pode(authentication, 'agenda')")
public class AusenciaBoxController {

    public record Intervalo(Instant ini, Instant fim, LocalDate dia) {
    }

    public record NovaAusenciaBox(@NotNull UUID boxId, @Size(max = 120) String motivo, @NotNull @Size(min = 1, max = 300) List<Intervalo> intervalos) {
    }

    public record AusenciaBox(UUID id, UUID boxId, String box, Instant ini, Instant fim, boolean diaInteiro, String motivo) {
    }

    /** `afetados`: agendamentos ativos que já estavam no box dentro da ausência (continuam marcados; a equipe decide). */
    public record Criadas(List<AusenciaBox> ausencias, List<String> afetados) {
    }

    private static final int MAX_DIAS_A_FRENTE = 400;
    private static final DateTimeFormatter DATA_HORA = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    private final LojaJdbc banco;
    private final java.time.Clock relogio;

    public AusenciaBoxController(LojaJdbc banco, java.time.Clock relogio) {
        this.banco = banco;
        this.relogio = relogio;
    }

    @GetMapping("/api/boxes/ausencias")
    public List<AusenciaBox> listar(@RequestParam(required = false) Instant de, @RequestParam(required = false) Instant ate) {
        Instant ini = de == null ? relogio.instant().minusSeconds(86400L) : de;
        Instant fim = ate == null ? ini.plusSeconds(86400L * 120) : ate;
        if (!fim.isAfter(ini) || fim.isAfter(ini.plusSeconds(86400L * 400))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Período inválido.");
        return banco.naLoja(jdbc -> jdbc.query(
                "select a.id, a.box_id, b.nome, a.ini, a.fim, a.dia_inteiro, a.motivo from ausencia_box a join box b on b.id = a.box_id where a.ini < ? and a.fim > ? order by a.ini, a.id limit 1000",
                (rs, i) -> new AusenciaBox(rs.getObject("id", UUID.class), rs.getObject("box_id", UUID.class), rs.getString("nome"),
                        rs.getObject("ini", OffsetDateTime.class).toInstant(), rs.getObject("fim", OffsetDateTime.class).toInstant(), rs.getBoolean("dia_inteiro"), rs.getString("motivo")),
                utc(fim), utc(ini)));
    }

    @PostMapping("/api/boxes/ausencias")
    public ResponseEntity<Criadas> criar(@jakarta.validation.Valid @RequestBody NovaAusenciaBox d, @AuthenticationPrincipal Jwt jwt) {
        Loja loja = LojaContext.exigir();
        if (!Capacidades.usaRecursoFisico(loja)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Este tipo de loja não usa box.");
        UUID eu = UUID.fromString(jwt.getSubject());
        Instant agora = relogio.instant();
        List<Instant[]> janelas = new ArrayList<>();
        Set<Instant> diasInteiros = new HashSet<>();
        for (Intervalo v : d.intervalos()) {
            if (v == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Intervalo inválido.");
            Instant ini;
            Instant fim;
            if (v.dia() != null) {
                ini = v.dia().atStartOfDay(Fuso.BRASIL).toInstant();
                fim = v.dia().plusDays(1).atStartOfDay(Fuso.BRASIL).toInstant();
                diasInteiros.add(ini);
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
        String motivo = d.motivo() == null || d.motivo().isBlank() ? null : d.motivo().trim();
        Criadas saida = banco.naLoja(jdbc -> {
            Integer existe = jdbc.queryForObject("select count(*) from box where id = ? and ativo", Integer.class, d.boxId());
            if (existe == null || existe == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Box não encontrado.");
            // trava o box (mesma ordem de quem agenda: `escolherBox` trava os boxes) para a lista de afetados valer até gravar
            jdbc.queryForList("select id from box where id = ? for update", UUID.class, d.boxId());
            List<String> afetados = afetados(jdbc, d.boxId(), janelas);
            List<AusenciaBox> criadas = new ArrayList<>();
            for (Instant[] j : janelas) {
                boolean dia = diasInteiros.contains(j[0]);
                UUID id = jdbc.queryForObject("insert into ausencia_box (loja_id, box_id, ini, fim, dia_inteiro, motivo, criado_por) values (?::uuid, ?, ?, ?, ?, ?, ?) returning id",
                        UUID.class, loja.id().toString(), d.boxId(), utc(j[0]), utc(j[1]), dia, motivo, eu);
                criadas.add(new AusenciaBox(id, d.boxId(), null, j[0], j[1], dia, motivo));
            }
            return new Criadas(criadas, afetados);
        });
        return ResponseEntity.status(HttpStatus.CREATED).body(saida);
    }

    @DeleteMapping("/api/boxes/ausencias/{id}")
    public ResponseEntity<Void> remover(@PathVariable UUID id) {
        int n = banco.naLoja(jdbc -> jdbc.update("delete from ausencia_box where id = ?", id));
        if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Ausência não encontrada.");
        return ResponseEntity.noContent().build();
    }

    private static List<String> afetados(JdbcTemplate jdbc, UUID boxId, List<Instant[]> janelas) {
        List<String> achados = new ArrayList<>();
        Set<UUID> vistos = new HashSet<>();
        for (Instant[] j : janelas) {
            jdbc.query("select a.id, a.inicio, coalesce(nullif(c.apelido, ''), c.nome, nullif(a.nome_avulso, ''), 'sem nome') as quem from agendamento a left join cliente c on c.id = a.cliente_id "
                            + "where a.box_id = ? and a.status <> 'cancelado' and a.inicio < ? and a.fim_ocupado > ? order by a.inicio",
                    rs -> {
                        if (vistos.add(rs.getObject("id", UUID.class))) {
                            achados.add(rs.getObject("inicio", OffsetDateTime.class).toInstant().atZone(Fuso.BRASIL).format(DATA_HORA) + " (" + curto(rs.getString("quem")) + ")");
                        }
                    }, boxId, utc(j[1]), utc(j[0]));
        }
        return achados;
    }

    private static String curto(String nome) {
        return nome != null && nome.length() > 20 ? nome.substring(0, 19) + "…" : nome;
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
