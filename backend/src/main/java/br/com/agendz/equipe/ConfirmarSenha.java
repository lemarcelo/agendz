package br.com.agendz.equipe;

import br.com.agendz.auth.LimiteDeLogin;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Pede a senha de novo em ação sensível do proprietário (B6, sobra do B8): promover ou rebaixar um proprietário e refazer a senha de outro proprietário.
 * Senha errada ou vazia = 403 "Senha incorreta" (nunca 401: o front derrubaria a sessão); 5 erros em 15 minutos bloqueiam (429), por loja e pessoa.
 */
@Component
public class ConfirmarSenha {

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;
    private final LimiteDeLogin limite;

    public ConfirmarSenha(LojaJdbc banco, PasswordEncoder encoder, LimiteDeLogin limite) {
        this.banco = banco;
        this.encoder = encoder;
        this.limite = limite;
    }

    public void confirmar(UUID usuarioId, String senha) {
        Loja loja = LojaContext.exigir();
        String chave = "sens|" + loja.id() + "|" + usuarioId;
        if (limite.bloqueado(chave)) throw new ErroDeNegocio(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        List<String> hashes = banco.naLoja(jdbc -> jdbc.queryForList("select senha_hash from usuario where id = ? and ativo", String.class, usuarioId));
        if (senha == null || senha.isEmpty() || hashes.isEmpty() || !encoder.matches(senha, hashes.get(0))) {
            limite.registrarErro(chave);
            throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Senha incorreta");
        }
        limite.limpar(chave);
    }
}
