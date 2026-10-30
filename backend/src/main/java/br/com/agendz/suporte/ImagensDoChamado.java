package br.com.agendz.suporte;

import br.com.agendz.erro.ErroDeNegocio;
import java.util.Base64;
import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * Conferência das imagens do chamado ANTES de repassar à Admin API (que confere de novo): até 3 por mensagem, 1,5 MB cada, só PNG, JPEG ou WebP, e o tipo
 * vem do CONTEÚDO (primeiros bytes), nunca do que a pessoa disser. SVG, GIF, HTML e PDF são recusados. A mesma regra vale na Admin API.
 */
final class ImagensDoChamado {
    private ImagensDoChamado() {
    }

    static final int MAX_POR_MENSAGEM = 3;
    static final int MAX_BYTES = 1_500_000;
    static final int MAX_TOTAL = 4_000_000;

    static String tipoPorConteudo(byte[] b) {
        if (b == null || b.length < 12) return null;
        if ((b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[4] == 0x0d && b[5] == 0x0a && b[6] == 0x1a && b[7] == 0x0a) return "image/png";
        if ((b[0] & 0xff) == 0xff && (b[1] & 0xff) == 0xd8 && (b[2] & 0xff) == 0xff) return "image/jpeg";
        if (b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        return null;
    }

    /** Devolve a mesma lista (base64) quando está tudo certo; qualquer defeito recusa a mensagem inteira (400). */
    static List<String> conferir(List<String> base64) {
        if (base64 == null || base64.isEmpty()) return List.of();
        if (base64.size() > MAX_POR_MENSAGEM) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Até " + MAX_POR_MENSAGEM + " imagens por mensagem.");
        long total = 0;
        for (String s : base64) {
            if (s == null || s.isEmpty() || s.length() > MAX_BYTES * 4L / 3 + 8) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Imagem grande demais. O limite é 1,5 MB por imagem.");
            byte[] dados;
            try {
                dados = Base64.getDecoder().decode(s);
            } catch (IllegalArgumentException e) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Imagem inválida.");
            }
            if (dados.length > MAX_BYTES) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Imagem grande demais. O limite é 1,5 MB por imagem.");
            if (tipoPorConteudo(dados) == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Só imagens PNG, JPEG ou WebP.");
            total += dados.length;
            if (total > MAX_TOTAL) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "As imagens passam de 4 MB no total.");
        }
        return base64;
    }
}
