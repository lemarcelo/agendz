package br.com.agendz.auth;

/** Resposta de login e da troca de senha. `deveTrocarSenha`: senha temporária (o token só serve para trocá-la). `onboardingPendente`: o dono ainda não concluiu o assistente de início. */
public record Sessao(String token, String nome, String papel, boolean deveTrocarSenha, boolean onboardingPendente) {
}
