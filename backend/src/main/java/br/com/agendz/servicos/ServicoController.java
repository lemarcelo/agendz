package br.com.agendz.servicos;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
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
 * Serviços da loja (docs/MAPA-API-SPRING.md, seção servicos.*). Leitura: dono e profissional (profissional só vê os ativos).
 * Escrita: só o dono. A loja é a do Host; o banco filtra por RLS; serviço de outra loja responde 404.
 * Remover desativa (ativo=false): quando existir histórico de agendamentos o serviço nunca some.
 */
@RestController
@PreAuthorize("hasAnyRole('DONO','PROFISSIONAL')")
public class ServicoController {

    static final Set<String> PORTES = Set.of("pequeno", "medio", "grande", "suv", "pickup");
    private static final TypeReference<Map<String, BigDecimal>> MAPA_PRECOS = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, Integer>> MAPA_DURACOES = new TypeReference<>() {
    };
    private static final String COLUNAS =
            "id, codigo, nome, categoria, preco, duracao_min, multi_dia, comissao_pct, ativo, precos::text as precos, duracoes::text as duracoes";

    public record Servico(UUID id, String codigo, String nome, String categoria, BigDecimal preco, int duracaoMin,
                          boolean multiDia, BigDecimal comissaoPct, boolean ativo,
                          Map<String, BigDecimal> precos, Map<String, Integer> duracoes) {
    }

    public record DadosServico(
            @NotBlank @Size(max = 100) String nome,
            @Pattern(regexp = "^[A-Za-z0-9._-]{0,20}$", message = "código: até 20 letras, números, ponto, hífen ou sublinhado") String codigo,
            @Size(max = 60) String categoria,
            @NotNull @DecimalMin("0") @DecimalMax("100000") BigDecimal preco,
            @NotNull @Min(1) @Max(14400) Integer duracaoMin,
            Boolean multiDia,
            @DecimalMin("0") @DecimalMax("100") BigDecimal comissaoPct,
            Boolean ativo,
            @Size(max = 5) Map<String, BigDecimal> precos,
            @Size(max = 5) Map<String, Integer> duracoes) {
    }

    private final LojaJdbc banco;
    private final ObjectMapper json;

    public ServicoController(LojaJdbc banco, ObjectMapper json) {
        this.banco = banco;
        this.json = json;
    }

    @GetMapping("/api/servicos")
    public List<Servico> listar(@AuthenticationPrincipal Jwt jwt) {
        boolean dono = "dono".equals(jwt.getClaimAsString("papel"));
        String filtro = dono ? "" : " where ativo";
        return banco.naLoja(jdbc -> jdbc.query(
                "select " + COLUNAS + " from servico" + filtro + " order by nome limit 500", (rs, i) -> linha(rs)));
    }

    @GetMapping("/api/servicos/{id}")
    public Servico obter(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        Servico s = buscar(id);
        if (s == null || (!s.ativo() && !"dono".equals(jwt.getClaimAsString("papel")))) {
            throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado");
        }
        return s;
    }

    @PostMapping("/api/servicos")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Servico> criar(@Valid @RequestBody DadosServico d) {
        Loja loja = LojaContext.exigir();
        String precos = jsonDosPrecos(d);
        String duracoes = jsonDasDuracoes(d);
        String nome = Texto.limpar(d.nome());
        String codigo = d.codigo() == null ? "" : Texto.limpar(d.codigo());
        if (nome.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o nome do serviço");
        String categoria = d.categoria() == null ? null : Texto.limpar(d.categoria());
        boolean multiDia = Boolean.TRUE.equals(d.multiDia());
        conferirDuracao(d.duracaoMin(), multiDia, duracoes == null ? null : d.duracoes());
        UUID id = banco.naLoja(jdbc -> jdbc.queryForObject(
                "insert into servico (loja_id, codigo, nome, categoria, preco, duracao_min, multi_dia, comissao_pct, ativo, precos, duracoes) "
                        + "values (?::uuid, coalesce(nullif(?, ''), (select (coalesce(max(case when codigo ~ '^[0-9]{1,9}$' then codigo::int end), 0) + 1)::text from servico)), "
                        + "?, nullif(?, ''), ?, ?, ?, ?, ?, cast(? as jsonb), cast(? as jsonb)) returning id",
                UUID.class, loja.id().toString(), codigo, nome, categoria, dinheiro(d.preco()), d.duracaoMin(), multiDia,
                d.comissaoPct(), d.ativo() == null || d.ativo(), precos, duracoes));
        return ResponseEntity.status(HttpStatus.CREATED).body(buscar(id));
    }

    @PutMapping("/api/servicos/{id}")
    @PreAuthorize("hasRole('DONO')")
    public Servico alterar(@PathVariable UUID id, @Valid @RequestBody DadosServico d) {
        String precos = jsonDosPrecos(d);
        String duracoes = jsonDasDuracoes(d);
        String nome = Texto.limpar(d.nome());
        if (nome.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o nome do serviço");
        String codigo = d.codigo() == null || d.codigo().isBlank() ? null : Texto.limpar(d.codigo());
        String categoria = d.categoria() == null ? null : Texto.limpar(d.categoria());
        conferirDuracao(d.duracaoMin(), Boolean.TRUE.equals(d.multiDia()), d.duracoes());
        int mudou = banco.naLoja(jdbc -> jdbc.update(
                "update servico set codigo = coalesce(?, codigo), nome = ?, categoria = coalesce(nullif(?, ''), categoria), preco = ?, duracao_min = ?, "
                        + "multi_dia = coalesce(?, multi_dia), comissao_pct = coalesce(?, comissao_pct), ativo = coalesce(?, ativo), "
                        + "precos = coalesce(cast(? as jsonb), precos), duracoes = coalesce(cast(? as jsonb), duracoes) where id = ?",
                codigo, nome, categoria, dinheiro(d.preco()), d.duracaoMin(), d.multiDia(), d.comissaoPct(), d.ativo(), precos, duracoes, id));
        if (mudou == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado");
        return buscar(id);
    }

    /** Desativa (não apaga): o serviço continua no histórico dos agendamentos. */
    @DeleteMapping("/api/servicos/{id}")
    @PreAuthorize("hasRole('DONO')")
    public ResponseEntity<Void> remover(@PathVariable UUID id) {
        int mudou = banco.naLoja(jdbc -> jdbc.update("update servico set ativo = false where id = ?", id));
        if (mudou == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado");
        return ResponseEntity.noContent().build();
    }

    private Servico buscar(UUID id) {
        List<Servico> achados = banco.naLoja(jdbc -> jdbc.query(
                "select " + COLUNAS + " from servico where id = ?", (rs, i) -> linha(rs), id));
        return achados.isEmpty() ? null : achados.get(0);
    }

    private Servico linha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Servico(rs.getObject("id", UUID.class), rs.getString("codigo"), rs.getString("nome"), rs.getString("categoria"),
                rs.getBigDecimal("preco"), rs.getInt("duracao_min"), rs.getBoolean("multi_dia"), rs.getBigDecimal("comissao_pct"),
                rs.getBoolean("ativo"), lerMapa(rs.getString("precos"), MAPA_PRECOS), lerMapa(rs.getString("duracoes"), MAPA_DURACOES));
    }

    private <T> T lerMapa(String texto, TypeReference<T> tipo) {
        if (texto == null) return null;
        try {
            return json.readValue(texto, tipo);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("jsonb de serviço inválido", e);
        }
    }

    private static BigDecimal dinheiro(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }

    /** Valida portes conhecidos e valores dentro do teto; devolve o JSON a gravar (ou null se não veio tabela). */
    private String jsonDosPrecos(DadosServico d) {
        if (d.precos() == null) return null;
        Map<String, BigDecimal> limpo = new LinkedHashMap<>();
        for (Map.Entry<String, BigDecimal> e : d.precos().entrySet()) {
            if (!PORTES.contains(e.getKey())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Porte desconhecido: " + Texto.limpar(e.getKey()));
            BigDecimal v = e.getValue();
            if (v == null || v.signum() < 0 || v.compareTo(new BigDecimal("100000")) > 0) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Preço por porte deve ficar entre 0 e 100.000");
            }
            limpo.put(e.getKey(), dinheiro(v));
        }
        return escrever(limpo);
    }

    private String jsonDasDuracoes(DadosServico d) {
        if (d.duracoes() == null) return null;
        Map<String, Integer> limpo = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> e : d.duracoes().entrySet()) {
            if (!PORTES.contains(e.getKey())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Porte desconhecido: " + Texto.limpar(e.getKey()));
            Integer v = e.getValue();
            if (v == null || v < 1 || v > 14400) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Duração por porte inválida");
            limpo.put(e.getKey(), v);
        }
        return escrever(limpo);
    }

    private static void conferirDuracao(int duracaoMin, boolean multiDia, Map<String, Integer> duracoes) {
        int teto = multiDia ? 14400 : 1440;
        if (duracaoMin > teto) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Duração acima do limite (" + teto + " min)");
        if (duracoes != null) {
            for (Integer v : duracoes.values()) {
                if (v != null && v > teto) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Duração acima do limite (" + teto + " min)");
            }
        }
    }

    private String escrever(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
