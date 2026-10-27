package br.com.agendz.onboarding;

import br.com.agendz.escala.EscalaService.Escala;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Serviços de exemplo de cada tipo de estabelecimento, para o assistente de primeiro acesso. Os arquivos `catalogo/<tipo>.json` são GERADOS
 * dos seeds do front (`node tools/gerar-catalogo.mjs`; `tests/catalogo.test.mjs` falha se divergirem). O servidor só aceita chaves daqui,
 * e só do tipo da loja (tipo vem da loja do Host, nunca do corpo).
 */
@Component
public class CatalogoDeServicos {

    public record Item(String chave, String nome, String categoria, BigDecimal preco, int duracaoMin, int intervaloMin, boolean multiDia,
                       Map<String, BigDecimal> precos, Map<String, Integer> duracoes) {
    }

    public record Catalogo(String tipo, Escala expediente, List<Item> servicos) {
    }

    private final ObjectMapper json;
    private final Map<String, Catalogo> cache = new ConcurrentHashMap<>();

    public CatalogoDeServicos(ObjectMapper json) {
        this.json = json;
    }

    /** Catálogo do tipo (vazio quando o tipo não tem arquivo). O nome do arquivo só usa letras minúsculas e sublinhado (o tipo vem do banco, mas confere). */
    public Optional<Catalogo> doTipo(String tipo) {
        if (tipo == null || !tipo.matches("^[a-z_]{1,40}$")) return Optional.empty();
        Catalogo c = cache.computeIfAbsent(tipo, this::ler);
        return c.servicos().isEmpty() ? Optional.empty() : Optional.of(c);
    }

    private Catalogo ler(String tipo) {
        ClassPathResource r = new ClassPathResource("catalogo/" + tipo + ".json");
        if (!r.exists()) return new Catalogo(tipo, null, List.of());
        try (InputStream in = r.getInputStream()) {
            return json.readValue(in, Catalogo.class);
        } catch (IOException e) {
            throw new IllegalStateException("catálogo inválido: " + tipo, e);
        }
    }
}
