package br.com.agendz.auth;

import br.com.agendz.seguranca.JwtService;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaJdbc;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Monta a sessão (token + avisos de primeiro acesso) do login e da troca de senha. */
@Service
public class SessaoService {

    private final LojaJdbc banco;
    private final JwtService jwt;

    public SessaoService(LojaJdbc banco, JwtService jwt) {
        this.banco = banco;
        this.jwt = jwt;
    }

    public Sessao abrir(UUID usuarioId, Loja loja, String papel, String nome, boolean deveTrocarSenha) {
        boolean pendente = "dono".equals(papel) && Boolean.TRUE.equals(banco.naLoja(jdbc -> jdbc.queryForObject(
                "select exists (select 1 from onboarding where concluido_em is null)", Boolean.class)));
        return new Sessao(jwt.emitir(usuarioId, loja.id(), papel, nome, deveTrocarSenha), nome, papel, deveTrocarSenha, pendente);
    }
}
