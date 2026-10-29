package br.com.agendz.equipe;

import br.com.agendz.auth.Temporarias;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Reservados;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Usuário de FUMAÇA: conta temporária de teste automático no site real (workflow `smoke-producao`). O Admin/CI cria um (`fumaca-` + 8 hexadecimais,
 * perfil `dono` (para o teste ver todas as telas; escondido da equipe, não atende nem vende, sem troca obrigatória de senha, e o teste só LÊ) e o apaga no final. A senha é gerada aqui e devolvida
 * UMA vez. O teste só LÊ; por isso o usuário não referencia nada e o `delete` basta; se algo o referenciar, ele é só desativado. Usuários de fumaça com
 * mais de 1 hora (teste que morreu antes de limpar) são apagados a cada nova criação.
 */
@Service
public class FumacaDaLoja {

    public record Resultado(String usuario, String senha) {
    }

    private static final SecureRandom ALEATORIO = new SecureRandom();
    private final LojaJdbc banco;
    private final PasswordEncoder encoder;

    public FumacaDaLoja(LojaJdbc banco, PasswordEncoder encoder) {
        this.banco = banco;
        this.encoder = encoder;
    }

    public Resultado criar(UUID lojaId) {
        byte[] b = new byte[4];
        ALEATORIO.nextBytes(b);
        String login = Reservados.FUMACA_PREFIXO + HexFormat.of().formatHex(b);
        String senha = Temporarias.senha();
        String hash = encoder.encode(senha);
        banco.naLoja(lojaId, jdbc -> {
            jdbc.update("delete from usuario where identificador like 'fumaca-%' and criado_em < now() - interval '1 hour'");
            return jdbc.update("insert into usuario (loja_id, identificador, nome, papel, senha_hash, atende, pode_vender, deve_trocar_senha) values (?::uuid, ?, 'Teste automático', 'dono', ?, false, false, false)",
                    lojaId.toString(), login, hash);
        });
        return new Resultado(login, senha);
    }

    /** Apaga (ou, se algo o referencia, desativa) um usuário de fumaça. Qualquer outro login é recusado. */
    public boolean apagar(UUID lojaId, String usuario) {
        if (usuario == null || !usuario.matches("fumaca-[0-9a-f]{8}")) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Só usuários de fumaça podem ser apagados por aqui.");
        return Boolean.TRUE.equals(banco.naLoja(lojaId, jdbc -> {
            try {
                return jdbc.update("delete from usuario where identificador = ?", usuario) > 0;
            } catch (DataIntegrityViolationException e) {
                return jdbc.update("update usuario set ativo = false where identificador = ?", usuario) > 0;
            }
        }));
    }
}
