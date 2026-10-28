package br.com.agendz.validacao;

/** Telefone e CPF: normalização e conferência (a mesma regra de src/domain/rules.js `telefoneNacional` e src/domain/pix.js `cpfValido`). */
public final class Documentos {

    private Documentos() {
    }

    public static String digitos(String s) {
        return s == null ? "" : s.replaceAll("\\D", "");
    }

    /** Telefone brasileiro como o canal entrega: 55 + DDD + 8 ou 9 dígitos. Aceita com ou sem o 55 e com máscara; qualquer outro tamanho é recusado (null). */
    public static String telefone(String bruto) {
        String d = digitos(bruto).replaceFirst("^0+", "");
        if (d.startsWith("55") && (d.length() == 12 || d.length() == 13)) {
            // já tem o código do país
        } else if (d.length() == 10 || d.length() == 11) {
            d = "55" + d;
        } else {
            return null;
        }
        return d.matches("^55[1-9]\\d\\d{8,9}$") ? d : null;
    }

    /** 11 dígitos com os dois verificadores certos; sequência repetida não vale. */
    public static boolean cpfValido(String cpf) {
        String c = digitos(cpf);
        if (c.length() != 11 || c.chars().distinct().count() == 1) return false;
        return dv(c, 9) == c.charAt(9) - '0' && dv(c, 10) == c.charAt(10) - '0';
    }

    private static int dv(String c, int n) {
        int t = 0;
        for (int i = 0; i < n; i++) t += (c.charAt(i) - '0') * (n + 1 - i);
        int r = (t * 10) % 11;
        return r == 10 ? 0 : r;
    }

    public static String cpfMascarado(String cpf) {
        String c = digitos(cpf);
        return c.length() == 11 ? c.substring(0, 3) + ".***.***-" + c.substring(9) : "";
    }
}
