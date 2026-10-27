package br.com.agendz.validacao;

import java.text.Normalizer;

/** Limpeza de texto vindo de pessoa: normaliza (NFC), tira caracteres de controle e espaços das pontas. O React escapa na tela; aqui só higiene. */
public final class Texto {

    private Texto() {
    }

    public static String limpar(String s) {
        if (s == null) return null;
        String n = Normalizer.normalize(s, Normalizer.Form.NFC);
        StringBuilder sb = new StringBuilder(n.length());
        for (int i = 0; i < n.length(); i++) {
            char c = n.charAt(i);
            if (!Character.isISOControl(c)) sb.append(c);
        }
        return sb.toString().trim();
    }
}
