package br.com.agendz.configuracao;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.util.Base64;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Logo e tema (duas cores) da loja, em Estabelecimento. GET/PUT /api/estabelecimento/marca; o proprietário ou quem tem a seção `estabelecimento`.
 * O corpo INTEIRO substitui o gravado: logo nula remove a logo; as duas cores nulas voltam ao tema padrão (a cor 2 sozinha, sem a 1, é recusada).
 * A logo é uma data URL de PNG, JPEG ou WebP com até 140 000 caracteres (cerca de 100 KB de imagem) e o TIPO é conferido pelo CONTEÚDO (bytes do início do
 * arquivo), não só pelo texto do cabeçalho; SVG fica de fora. A gravação passa pela função `loja_gravar_marca` (V33), que só mexe na loja da sessão:
 * uma loja nunca grava a marca de outra. A logo de outra loja nunca aparece aqui (a leitura também é pela loja da sessão).
 */
@RestController
@PreAuthorize("hasRole('DONO') or @perm.pode(authentication, 'estabelecimento')")
public class MarcaDaLoja {

    public static final int LOGO_MAX = 140_000;
    private static final String COR = "^#[0-9a-fA-F]{6}$";
    private static final Pattern COR_PADRAO = Pattern.compile(COR);

    public record Marca(String logo, String temaCor, String temaCor2) {
    }

    private final LojaJdbc banco;

    public MarcaDaLoja(LojaJdbc banco) {
        this.banco = banco;
    }

    @GetMapping("/api/estabelecimento/marca")
    public Marca obter() {
        UUID id = LojaContext.exigir().id();
        return banco.naLoja((jdbc) -> jdbc.query("select logo, tema_cor, tema_cor2 from loja where id = ?::uuid",
                (rs, i) -> new Marca(rs.getString(1), rs.getString(2), rs.getString(3)), id.toString()).stream().findFirst().orElse(new Marca(null, null, null)));
    }

    @PutMapping("/api/estabelecimento/marca")
    public Marca gravar(@RequestBody Marca corpo) {
        if (corpo == null) throw ruim("Informe a logo e o tema.");
        String logo = corpo.logo() == null || corpo.logo().isBlank() ? null : corpo.logo().trim();
        if (logo != null) conferirLogo(logo);
        String cor1 = cor(corpo.temaCor()), cor2 = cor(corpo.temaCor2());
        if (cor1 == null && cor2 != null) throw ruim("Informe a cor principal do tema.");
        Marca nova = new Marca(logo, cor1, cor2);
        banco.naLoja((jdbc) -> {
            Integer n = jdbc.queryForObject("select loja_gravar_marca(?::text, ?::text, ?::text)", Integer.class, nova.logo(), nova.temaCor(), nova.temaCor2());
            if (n == null || n != 1) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Loja não encontrada");
            return null;
        });
        return nova;
    }

    private static String cor(String c) {
        if (c == null || c.isBlank()) return null;
        String t = c.trim();
        if (!COR_PADRAO.matcher(t).matches()) throw ruim("Cor do tema inválida: use #rrggbb.");
        return t.toLowerCase(java.util.Locale.ROOT);
    }

    /** PNG, JPEG ou WebP em base64 cujo começo do arquivo bate com o tipo declarado; tamanho dentro do teto. */
    static void conferirLogo(String url) {
        String[] tipos = {"png", "jpeg", "webp"};
        String tipo = null;
        for (String t : tipos) if (url.startsWith("data:image/" + t + ";base64,")) tipo = t;
        if (tipo == null || url.length() > LOGO_MAX) throw invalida();
        String b64 = url.substring(url.indexOf(',') + 1);
        if (b64.length() < 24) throw invalida();
        byte[] b;
        try {
            b = Base64.getDecoder().decode(b64);
        } catch (IllegalArgumentException e) {
            throw invalida();
        }
        boolean ok = switch (tipo) {
            case "png" -> b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G';
            case "jpeg" -> b.length >= 3 && (b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff;
            default -> b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
        };
        if (!ok) throw invalida();
    }

    private static ErroDeNegocio invalida() {
        return ruim("Logo inválida: use PNG, JPEG ou WebP de até 100 KB.");
    }

    private static ErroDeNegocio ruim(String m) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, m);
    }
}
