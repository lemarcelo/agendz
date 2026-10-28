package br.com.agendz.auth;

import java.util.List;

/**
 * Resposta de login e da troca de senha. `deveTrocarSenha`: senha temporária (o token só serve para trocá-la). `onboardingPendente`: o dono ainda não
 * concluiu o assistente de início. `secoes`: as seções liberáveis que a pessoa pode usar agora (o menu do site mostra só essas; o servidor confere de novo
 * em cada rota). `id`: o id da própria pessoa (a tela não oferece "remover" nem "refazer senha" para si).
 */
public record Sessao(String token, String nome, String papel, boolean deveTrocarSenha, boolean onboardingPendente, List<String> secoes, String id) {
}
