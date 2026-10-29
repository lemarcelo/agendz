package br.com.agendz.validacao;

import br.com.agendz.erro.ErroDeNegocio;
import java.text.Normalizer;
import java.util.Locale;
import org.springframework.http.HttpStatus;

/**
 * Nomes que o cliente não pode usar: `suporte` é o usuário que o Admin da plataforma cria sozinho em toda loja (para o atendimento de chamados) e
 * nunca é cadastrado pela equipe da loja. Vale para login, nome e apelido, sem diferenciar maiúscula, acento nem espaço sobrando.
 * (Espelho de `nomeReservado` em src/domain/rules.js.)
 */
public final class Reservados {

    public static final String SUPORTE = "suporte";
    /** Usuários de fumaça (teste automático no site real, criados e apagados pelo Admin/CI): prefixo reservado e escondido da equipe. */
    public static final String FUMACA_PREFIXO = "fumaca-";
    /** Trecho de SQL (sobre a tabela usuario) que esconde os usuários da plataforma (suporte e fumaça) das listas e fichas da loja. */
    public static final String OCULTOS_SQL = "identificador <> 'suporte' and identificador not like 'fumaca-%'";
    public static final String MENSAGEM = "Nome reservado.";

    private Reservados() {
    }

    public static boolean reservado(String texto) {
        if (texto == null) return false;
        String t = Normalizer.normalize(texto, Normalizer.Form.NFD).replaceAll("\\p{M}", "").trim().toLowerCase(Locale.ROOT);
        return t.equals(SUPORTE) || t.startsWith(FUMACA_PREFIXO);
    }

    /** Recusa com 400 "Nome reservado." se algum dos textos é reservado. */
    public static void exigirLivre(String... textos) {
        for (String t : textos) if (reservado(t)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, MENSAGEM);
    }
}
