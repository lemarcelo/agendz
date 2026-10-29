package br.com.agendz.auth;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/** Senha temporária (gerada só no servidor, mostrada uma vez) e login sugerido a partir do nome. Usadas pelo assistente de início e pelo cadastro da equipe. */
public final class Temporarias {

    private static final String ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // sem 0/O, 1/l/I
    private static final int TAMANHO_SENHA = 12;
    private static final SecureRandom ALEATORIO = new SecureRandom();

    private Temporarias() {
    }

    public static String senha() {
        StringBuilder sb = new StringBuilder(TAMANHO_SENHA);
        for (int i = 0; i < TAMANHO_SENHA; i++) sb.append(ALFABETO.charAt(ALEATORIO.nextInt(ALFABETO.length())));
        return sb.toString();
    }

    /** Primeiro nome sem acento, minúsculo, só letras e números (2 a 20); se já existe, acrescenta 2, 3, ... */
    public static String loginLivre(String nome, Set<String> existentes) {
        String primeiro = Normalizer.normalize(nome.trim().split("\\s+")[0], Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        if (primeiro.length() > 20) primeiro = primeiro.substring(0, 20);
        if (primeiro.length() < 2) primeiro = "pro";
        String login = primeiro;
        for (int n = 2; existentes.contains(login) || br.com.agendz.validacao.Reservados.reservado(login); n++) login = primeiro + n;
        return login;
    }
}
