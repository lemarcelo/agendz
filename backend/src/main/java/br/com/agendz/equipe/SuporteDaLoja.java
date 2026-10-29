package br.com.agendz.equipe;

import br.com.agendz.auth.Temporarias;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Reservados;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * O usuário `suporte` de cada loja: criado pelo Admin da plataforma quando o estabelecimento nasce (nunca pelo cliente: o nome é reservado) e usado
 * pela equipe do Agendz para atender chamados dentro do sistema do cliente. Perfil `admin` (gestor, sem ser dono), não atende, não vende, não aparece
 * na equipe da loja (listas e fichas o escondem) e não troca de nome. A senha temporária é gerada aqui e devolvida UMA vez; troca obrigatória no
 * primeiro acesso. Só o Admin (rota interna com chave) chama.
 */
@Service
public class SuporteDaLoja {

    /** `senhaTemporaria` vem só quando o usuário foi criado agora (ou a senha foi refeita); senão null. */
    public record Resultado(boolean criado, String usuario, String senhaTemporaria) {
    }

    private final LojaJdbc banco;
    private final PasswordEncoder encoder;

    public SuporteDaLoja(LojaJdbc banco, PasswordEncoder encoder) {
        this.banco = banco;
        this.encoder = encoder;
    }

    /** Cria o `suporte` se a loja ainda não tem; se tem, não mexe em nada (idempotente) e não devolve senha. */
    public Resultado garantir(UUID lojaId) {
        String senha = Temporarias.senha();
        String hash = encoder.encode(senha);
        boolean criado = Boolean.TRUE.equals(banco.naLoja(lojaId, jdbc -> {
            Integer ja = jdbc.queryForObject("select count(*) from usuario where identificador = ?", Integer.class, Reservados.SUPORTE);
            if (ja != null && ja > 0) return false;
            jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, atende, pode_vender, deve_trocar_senha) values (?::uuid, ?, 'Suporte', 'admin', ?, false, false, true)",
                    lojaId.toString(), Reservados.SUPORTE, hash);
            return true;
        }));
        return new Resultado(criado, Reservados.SUPORTE, criado ? senha : null);
    }

    /** Refaz a senha do `suporte` (nova temporária, mostrada uma vez, troca obrigatória). Cria o usuário se por algum motivo não existir. */
    public Resultado refazerSenha(UUID lojaId) {
        String senha = Temporarias.senha();
        String hash = encoder.encode(senha);
        int mudou = banco.naLoja(lojaId, jdbc -> jdbc.update("update usuario set senha_hash = ?, deve_trocar_senha = true, ativo = true where identificador = ?", hash, Reservados.SUPORTE));
        if (mudou == 0) return garantir(lojaId);
        return new Resultado(false, Reservados.SUPORTE, senha);
    }
}
