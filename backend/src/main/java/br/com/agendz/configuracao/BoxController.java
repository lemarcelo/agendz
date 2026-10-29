package br.com.agendz.configuracao;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Capacidades;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Boxes da loja (espelho de `estabelecimento.boxes` na API simulada; só nos tipos com a capacidade usaRecursoFisico).
 * GET /api/boxes (quem tem a agenda) e PUT /api/estabelecimento/boxes (só o proprietário): a lista inteira substitui a anterior, por id.
 * Box com histórico de atendimentos não é removido (só desativado) e box com carro agendado não é desativado.
 */
@RestController
public class BoxController {

    public static final int MAXIMO = 20;

    public record Box(UUID id, String nome, boolean ativo) {
    }

    public record EntradaBox(@Size(max = 60) String id, @Size(max = 200) String nome, Boolean ativo) {
    }

    public record Corpo(@Size(max = 100) List<EntradaBox> boxes) {
    }

    private final LojaJdbc banco;

    public BoxController(LojaJdbc banco) {
        this.banco = banco;
    }

    public static List<Box> ler(JdbcTemplate jdbc) {
        return jdbc.query("select id, nome, ativo from box order by ordem, criado_em, id", (rs, i) -> new Box(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getBoolean("ativo")));
    }

    @GetMapping("/api/boxes")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL') and @perm.pode(authentication, 'agenda')")
    public List<Box> listar() {
        Loja loja = LojaContext.exigir();
        if (!Capacidades.usaRecursoFisico(loja)) return List.of();
        return banco.naLoja(BoxController::ler);
    }

    @PutMapping("/api/estabelecimento/boxes")
    @PreAuthorize("hasRole('DONO')")
    public List<Box> gravar(@RequestBody Corpo corpo) {
        Loja loja = LojaContext.exigir();
        if (!Capacidades.usaRecursoFisico(loja)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Este tipo de estabelecimento não usa box.");
        List<EntradaBox> entrada = corpo == null || corpo.boxes() == null ? List.of() : corpo.boxes();
        if (entrada.isEmpty() || entrada.size() > MAXIMO) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Boxes inválidos: de 1 a " + MAXIMO + ", cada um com nome de até 30 letras.");
        List<String> nomes = new ArrayList<>();
        Set<String> chaves = new HashSet<>();
        boolean algumAtivo = false;
        for (EntradaBox b : entrada) {
            String nome = b == null || b.nome() == null ? "" : Texto.limpar(b.nome()).trim();
            if (nome.isEmpty() || nome.length() > 30) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Boxes inválidos: de 1 a " + MAXIMO + ", cada um com nome de até 30 letras.");
            if (!chaves.add(nome.toLowerCase(Locale.ROOT))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Dois boxes têm o mesmo nome.");
            nomes.add(nome);
            if (b.ativo() == null || b.ativo()) algumAtivo = true;
        }
        if (!algumAtivo) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Deixe ao menos um box ativo.");
        return banco.naLoja(jdbc -> {
            List<Box> atuais = jdbc.query("select id, nome, ativo from box order by ordem, criado_em, id for update", (rs, i) -> new Box(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getBoolean("ativo")));
            Set<UUID> conhecidos = new HashSet<>();
            for (Box a : atuais) conhecidos.add(a.id());
            // quem fica (id conhecido), em que posição e com que nome/situação
            List<UUID> ids = new ArrayList<>();
            Set<UUID> mantidos = new HashSet<>();
            for (EntradaBox b : entrada) {
                UUID id = null;
                if (b.id() != null) {
                    try {
                        UUID candidato = UUID.fromString(b.id());
                        if (conhecidos.contains(candidato) && mantidos.add(candidato)) id = candidato; // id repetido na lista vira box novo
                    } catch (IllegalArgumentException e) {
                        id = null;
                    }
                }
                ids.add(id);
            }
            for (Box antigo : atuais) {
                int pos = ids.indexOf(antigo.id());
                Integer usos = jdbc.queryForObject("select count(*) from agendamento where box_id = ?", Integer.class, antigo.id());
                if (pos < 0) {
                    if (usos != null && usos > 0) throw new ErroDeNegocio(HttpStatus.CONFLICT, antigo.nome() + " tem histórico de atendimentos: desative em vez de remover.");
                    continue;
                }
                boolean ficaAtivo = entrada.get(pos).ativo() == null || entrada.get(pos).ativo();
                if (!ficaAtivo && antigo.ativo()) {
                    Integer agendados = jdbc.queryForObject("select count(*) from agendamento where box_id = ? and status in ('a_confirmar', 'confirmado') and fim_ocupado > now()", Integer.class, antigo.id());
                    if (agendados != null && agendados > 0) throw new ErroDeNegocio(HttpStatus.CONFLICT, antigo.nome() + " tem carro agendado. Remarque antes de desativar.");
                }
            }
            for (Box antigo : atuais) if (!mantidos.contains(antigo.id())) jdbc.update("delete from box where id = ?", antigo.id());
            // nomes provisórios: trocar os nomes de dois boxes entre si não esbarra no índice de nome único
            jdbc.update("update box set nome = substr(id::text, 1, 30)");
            for (int i = 0; i < entrada.size(); i++) {
                boolean ativo = entrada.get(i).ativo() == null || entrada.get(i).ativo();
                if (ids.get(i) != null) jdbc.update("update box set nome = ?, ativo = ?, ordem = ? where id = ?", nomes.get(i), ativo, i, ids.get(i));
                else jdbc.update("insert into box (loja_id, nome, ativo, ordem) values (?::uuid, ?, ?, ?)", loja.id().toString(), nomes.get(i), ativo, i);
            }
            return ler(jdbc);
        });
    }
}
