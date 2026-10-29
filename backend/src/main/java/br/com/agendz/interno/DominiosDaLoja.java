package br.com.agendz.interno;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.TenantProperties;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * A5: domínio próprio da loja com prova por TXT. Quem cadastra (só o Admin da plataforma, pela rota interna) recebe o registro a criar; o domínio só
 * passa a valer (`verificado`) quando o TXT `_agendz-verificacao.<host>` traz o token gerado aqui. O Caddy só emite certificado para domínio verificado
 * (DominioPermitidoController). Host sob o domínio da plataforma, IP, localhost ou outro formato estranho é recusado.
 */
@Service
public class DominiosDaLoja {

    static final int MAXIMO_POR_LOJA = 3;
    static final String PREFIXO_TXT = "_agendz-verificacao.";
    private static final String CHAVE_TXT = "agendz-verificacao=";
    private static final Pattern HOST = Pattern.compile("^(?=.{4,100}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+([a-z]{2,24}|xn--[a-z0-9-]{2,20})$");
    private static final Set<String> RESERVADOS = Set.of("localhost", "example.com", "example.org", "example.net");
    private static final SecureRandom SORTE = new SecureRandom();

    public record Dominio(String host, boolean verificado, String txtNome, String txtValor, String cname, Instant criadoEm, Instant verificadoEm) {
    }

    public record Resultado(Dominio dominio, boolean acabouDeVerificar, String mensagem) {
    }

    private final JdbcTemplate jdbc;
    private final ConsultaTxt dns;
    private final List<String> bases;

    public DominiosDaLoja(JdbcTemplate jdbc, ConsultaTxt dns, TenantProperties props) {
        this.jdbc = jdbc;
        this.dns = dns;
        this.bases = props.dominiosBase().stream().map(b -> b.trim().toLowerCase(Locale.ROOT)).toList();
    }

    public static String normalizar(String bruto) {
        String h = bruto == null ? "" : bruto.trim().toLowerCase(Locale.ROOT);
        if (h.endsWith(".")) h = h.substring(0, h.length() - 1);
        return h;
    }

    private String validar(String bruto) {
        String h = normalizar(bruto);
        if (!HOST.matcher(h).matches() || RESERVADOS.contains(h)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Endereço inválido. Use um domínio como agenda.minhaloja.com.br (sem http://, porta ou barra).");
        for (String b : bases) {
            if (h.equals(b) || h.endsWith("." + b)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Este endereço é da plataforma. Use um domínio do próprio cliente.");
        }
        return h;
    }

    private Dominio ler(java.sql.ResultSet rs) throws java.sql.SQLException {
        String host = rs.getString("host");
        String token = rs.getString("token");
        java.sql.Timestamp v = rs.getTimestamp("verificado_em");
        java.sql.Timestamp c = rs.getTimestamp("criado_em");
        return new Dominio(host, rs.getBoolean("verificado"), PREFIXO_TXT + host, CHAVE_TXT + (token == null ? "" : token),
                "alias." + (bases.isEmpty() ? "agendz.io" : bases.get(0)), c == null ? null : c.toInstant(), v == null ? null : v.toInstant());
    }

    public List<Dominio> listar(Loja loja) {
        return jdbc.query("select host, token, verificado, criado_em, verificado_em from loja_dominio where loja_id = ? order by criado_em, host", (rs, i) -> ler(rs), loja.id());
    }

    public Dominio cadastrar(Loja loja, String bruto) {
        String host = validar(bruto);
        Integer n = jdbc.queryForObject("select count(*) from loja_dominio where loja_id = ?", Integer.class, loja.id());
        if (n != null && n >= MAXIMO_POR_LOJA) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Esta loja já tem " + MAXIMO_POR_LOJA + " domínios. Remova um antes de cadastrar outro.");
        byte[] b = new byte[24];
        SORTE.nextBytes(b);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        try {
            jdbc.update("insert into loja_dominio (host, loja_id, verificado, token) values (?, ?, false, ?)", host, loja.id(), token);
        } catch (DuplicateKeyException e) {
            throw new ErroDeNegocio(HttpStatus.CONFLICT, "Este endereço já está cadastrado.");
        }
        return listar(loja).stream().filter(d -> d.host().equals(host)).findFirst().orElseThrow();
    }

    public Resultado verificar(Loja loja, String bruto) {
        String host = normalizar(bruto);
        Dominio atual = listar(loja).stream().filter(d -> d.host().equals(host)).findFirst()
                .orElseThrow(() -> new ErroDeNegocio(HttpStatus.NOT_FOUND, "Domínio não encontrado nesta loja."));
        if (atual.verificado()) return new Resultado(atual, false, "Este domínio já está verificado.");
        String esperado = atual.txtValor();
        boolean achou = dns.txt(atual.txtNome()).stream().anyMatch(v -> v.trim().equals(esperado));
        if (!achou) return new Resultado(atual, false, "Ainda não encontramos o registro TXT. O DNS pode levar alguns minutos para atualizar; confira o nome e o valor e tente de novo.");
        jdbc.update("update loja_dominio set verificado = true, verificado_em = now() where host = ? and loja_id = ? and not verificado", host, loja.id());
        Dominio novo = listar(loja).stream().filter(d -> d.host().equals(host)).findFirst().orElseThrow();
        return new Resultado(novo, true, "Domínio verificado.");
    }

    public void remover(Loja loja, String bruto) {
        int n = jdbc.update("delete from loja_dominio where host = ? and loja_id = ?", normalizar(bruto), loja.id());
        if (n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Domínio não encontrado nesta loja.");
    }
}
