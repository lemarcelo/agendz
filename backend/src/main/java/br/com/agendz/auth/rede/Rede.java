package br.com.agendz.auth.rede;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;

/**
 * De onde veio o pedido, como o servidor consegue ver: o IP PÚBLICO da conexão (o primeiro do X-Forwarded-For que o Caddy escreve, senão o da conexão).
 * O servidor nunca enxerga o nome do Wi-Fi nem a rede interna do aparelho. A "rede" é o IPv4 inteiro ou, em IPv6, o prefixo /64 (a casa inteira).
 */
public final class Rede {

    private Rede() {
    }

    /** IP de quem pede, só com caracteres de IP; `null` quando não dá para saber. */
    public static String ip(HttpServletRequest req) {
        String f = req.getHeader("X-Forwarded-For");
        String v = f != null && !f.isBlank() ? f.split(",")[0].trim() : req.getRemoteAddr();
        return v != null && v.length() <= 45 && v.matches("[0-9a-fA-F:.]+") ? v : null;
    }

    /** Forma canônica da rede: IPv4 como está; IPv6 pelos 64 primeiros bits; IPv4 mapeado em IPv6 vira IPv4. Texto que não é IP (ou nulo) = `null`. */
    public static String normalizar(String ip) {
        if (ip == null || ip.isBlank() || !ip.matches("[0-9a-fA-F:.]+")) return null;
        try {
            byte[] b = InetAddress.getByName(ip).getAddress(); // literal: não consulta DNS
            if (b.length == 4) return (b[0] & 255) + "." + (b[1] & 255) + "." + (b[2] & 255) + "." + (b[3] & 255);
            StringBuilder s = new StringBuilder("v6:");
            for (int i = 0; i < 8; i++) s.append(String.format("%02x", b[i]));
            return s.toString();
        } catch (UnknownHostException e) {
            return null;
        }
    }
}
