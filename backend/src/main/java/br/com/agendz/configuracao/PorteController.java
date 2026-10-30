package br.com.agendz.configuracao;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Capacidades;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Portes de veículo da loja (espelho de `estabelecimento.portes` e `sanearPortes` em src/domain/veiculos.js; só no tipo com a capacidade precoPorPorte).
 * GET /api/estabelecimento/portes (quem usa o painel) e PUT /api/estabelecimento/portes (só o proprietário): a lista inteira substitui a anterior, por id.
 * Sem lista gravada valem os cinco de fábrica. O Médio fica sempre e ativo; porte já usado (veículo de cliente ou agendamento) só se desativa, e não com agendamento futuro.
 * Serviço sem preço/duração num porte novo usa o valor do Médio (o serviço guarda o preço do Médio em `preco`/`duracao_min`).
 */
@RestController
public class PorteController {

    public static final int MAXIMO = 12;
    public static final String PADRAO = "medio";
    private static final Pattern ID = Pattern.compile("^[a-z0-9-]{2,24}$");
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Porte>> LISTA = new TypeReference<>() {
    };

    public record Porte(String id, String nome, String exemplo, boolean ativo) {
    }

    public static final List<Porte> DE_FABRICA = List.of(
            new Porte("pequeno", "Pequeno", "Ex.: Mobi, Kwid, Up", true),
            new Porte("medio", "Médio", "Ex.: Onix, HB20, Corolla", true),
            new Porte("grande", "Grande", "Ex.: Spin, Compass sedã grande, Van", true),
            new Porte("suv", "SUV", "Ex.: Creta, T-Cross, Tracker", true),
            new Porte("pickup", "Pickup", "Ex.: Strada, Hilux, S10", true));

    public record EntradaPorte(@Size(max = 40) String id, @Size(max = 200) String nome, @Size(max = 300) String exemplo, Boolean ativo) {
    }

    public record Corpo(@Size(max = 100) List<EntradaPorte> portes) {
    }

    private final LojaJdbc banco;

    public PorteController(LojaJdbc banco) {
        this.banco = banco;
    }

    /** Portes da loja (RLS: a loja da conexão). Sem cadastro, os de fábrica. */
    public static List<Porte> ler(JdbcTemplate jdbc) {
        List<String> linhas = jdbc.query("select portes from configuracao_loja where portes is not null limit 1", (rs, i) -> rs.getString(1));
        if (linhas.isEmpty()) return DE_FABRICA;
        try {
            List<Porte> l = JSON.readValue(linhas.get(0), LISTA);
            return l == null || l.isEmpty() ? DE_FABRICA : l;
        } catch (JsonProcessingException e) {
            return DE_FABRICA;
        }
    }

    /** Todos os ids conhecidos (ativos ou não): serve para ler o que já existe. */
    public static Set<String> ids(JdbcTemplate jdbc) {
        Set<String> s = new LinkedHashSet<>();
        for (Porte p : ler(jdbc)) s.add(p.id());
        return s;
    }

    /** Ids que se podem escolher agora. */
    public static Set<String> ativos(JdbcTemplate jdbc) {
        Set<String> s = new LinkedHashSet<>();
        for (Porte p : ler(jdbc)) if (p.ativo()) s.add(p.id());
        return s;
    }

    /** Portes de fábrica ativos: o preço e a duração deles são obrigatórios no serviço; os cadastrados pelo dono podem ficar sem valor (vale o do Médio). */
    public static Set<String> obrigatoriosNoServico(List<Porte> portes) {
        Set<String> fabrica = new HashSet<>();
        for (Porte p : DE_FABRICA) fabrica.add(p.id());
        Set<String> s = new LinkedHashSet<>();
        for (Porte p : portes) if (p.ativo() && fabrica.contains(p.id())) s.add(p.id());
        return s;
    }

    @GetMapping("/api/estabelecimento/portes")
    @PreAuthorize("hasAnyRole('DONO','ADMIN','ATENDENTE','PROFISSIONAL')")
    public List<Porte> listar() {
        Loja loja = LojaContext.exigir();
        if (!Capacidades.precoPorPorte(loja)) return List.of();
        return banco.naLoja(PorteController::ler);
    }

    @PutMapping("/api/estabelecimento/portes")
    @PreAuthorize("hasRole('DONO')")
    public List<Porte> gravar(@RequestBody Corpo corpo) {
        Loja loja = LojaContext.exigir();
        if (!Capacidades.precoPorPorte(loja)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Este tipo de estabelecimento não usa porte de veículo.");
        List<EntradaPorte> entrada = corpo == null || corpo.portes() == null ? List.of() : corpo.portes();
        if (entrada.isEmpty() || entrada.size() > MAXIMO) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Cadastre de 1 a " + MAXIMO + " portes.");
        List<Porte> novos = new ArrayList<>();
        Set<String> nomes = new HashSet<>();
        Set<String> ids = new HashSet<>();
        for (EntradaPorte e : entrada) {
            if (e == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Porte inválido.");
            String nome = e.nome() == null ? "" : Texto.limpar(e.nome()).trim();
            if (nome.length() < 2 || nome.length() > 20) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O nome do porte tem de 2 a 20 letras.");
            if (!nomes.add(nome.toLowerCase(Locale.ROOT))) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O porte “" + nome + "” aparece duas vezes.");
            String exemplo = e.exemplo() == null ? "" : Texto.limpar(e.exemplo()).trim();
            if (exemplo.length() > 60) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Os exemplos do porte têm até 60 letras.");
            String id = e.id() == null || e.id().isBlank() ? null : e.id();
            if (id != null && !ID.matcher(id).matches()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Porte inválido.");
            if (id == null) id = "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
            if (!ids.add(id)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Porte repetido.");
            novos.add(new Porte(id, nome, exemplo, e.ativo() == null || e.ativo()));
        }
        Porte medio = novos.stream().filter(p -> p.id().equals(PADRAO)).findFirst().orElse(null);
        if (medio == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O porte padrão (Médio) não pode ser retirado; você pode mudar o nome dele.");
        if (!medio.ativo()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O porte padrão (Médio) não pode ser desativado.");
        return banco.naLoja(jdbc -> {
            for (Porte antigo : ler(jdbc)) {
                Porte depois = novos.stream().filter(p -> p.id().equals(antigo.id())).findFirst().orElse(null);
                boolean usado = existe(jdbc, "select 1 from cliente_veiculo where porte = ? limit 1", antigo.id()) || existe(jdbc, "select 1 from agendamento where porte = ? limit 1", antigo.id());
                if (depois == null && usado) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O porte " + antigo.nome() + " já foi usado: desative em vez de remover.");
                if (depois != null && !depois.ativo() && antigo.ativo()
                        && existe(jdbc, "select 1 from agendamento where porte = ? and status in ('a_confirmar', 'confirmado') and inicio > now() limit 1", antigo.id())) {
                    throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O porte " + antigo.nome() + " tem agendamentos futuros: desative depois deles.");
                }
            }
            String json;
            try {
                json = JSON.writeValueAsString(novos);
            } catch (JsonProcessingException ex) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Portes inválidos.");
            }
            jdbc.update("insert into configuracao_loja (loja_id, portes) values (?::uuid, ?) on conflict (loja_id) do update set portes = excluded.portes, atualizado_em = now()", loja.id().toString(), json);
            return novos;
        });
    }

    private static boolean existe(JdbcTemplate jdbc, String sql, String porte) {
        return !jdbc.queryForList(sql, porte).isEmpty();
    }
}
