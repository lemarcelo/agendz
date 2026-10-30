package br.com.agendz.auth;

import br.com.agendz.auth.rede.RedesConfiaveis;
import br.com.agendz.seguranca.JwtService;
import br.com.agendz.seguranca.Permissoes;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaJdbc;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Monta a sessão (token + avisos de primeiro acesso) do login e da troca de senha. */
@Service
public class SessaoService {

    private final LojaJdbc banco;
    private final JwtService jwt;
    private final ObjectMapper json;
    private final RedesConfiaveis redes;

    public SessaoService(LojaJdbc banco, JwtService jwt, ObjectMapper json, RedesConfiaveis redes) {
        this.banco = banco;
        this.jwt = jwt;
        this.json = json;
        this.redes = redes;
    }

    /** Sessão comum (sem olhar a rede): troca de senha e afins. Vale 24 h. */
    public Sessao abrir(UUID usuarioId, Loja loja, String papel, String nome, boolean deveTrocarSenha) {
        return montar(usuarioId, loja, papel, nome, deveTrocarSenha, jwt.emitir(usuarioId, loja.id(), papel, nome, deveTrocarSenha), false, false);
    }

    /**
     * Sessão do login (senha ou digital). `ip` é o que o servidor viu (nunca vem do corpo). Rede já confiável para esta pessoa = token de longa duração
     * (`redeConfiavel`); rede nova com "login automático" marcado = token de 24 h e `perguntarRede` (a tela pergunta); senão, token de 24 h. Senha temporária
     * (`deveTrocarSenha`) nunca ganha rede confiável.
     */
    public Sessao abrir(UUID usuarioId, Loja loja, String papel, String nome, boolean deveTrocarSenha, String ip, boolean loginAutomatico) {
        if (deveTrocarSenha) return abrir(usuarioId, loja, papel, nome, true);
        String hash = redes.hash(loja.id(), usuarioId, ip);
        var rede = redes.achar(usuarioId, hash);
        if (rede.isPresent()) {
            redes.usou(rede.get().id());
            return montar(usuarioId, loja, papel, nome, false, jwt.emitirDeRedeConfiavel(usuarioId, loja.id(), papel, nome, rede.get().id(), rede.get().versao()), true, false);
        }
        return montar(usuarioId, loja, papel, nome, false, jwt.emitir(usuarioId, loja.id(), papel, nome, false), false, loginAutomatico && hash != null);
    }

    /** Descreve a sessão de um token que a pessoa já tem (reabrir o site com a rede confiável): mesmo token, nada novo é emitido. */
    public Sessao descrever(UUID usuarioId, Loja loja, String papel, String nome, String token, boolean redeConfiavel) {
        return montar(usuarioId, loja, papel, nome, false, token, redeConfiavel, false);
    }

    private Sessao montar(UUID usuarioId, Loja loja, String papel, String nome, boolean deveTrocarSenha, String token, boolean redeConfiavel, boolean perguntarRede) {
        boolean pendente = "dono".equals(papel) && Boolean.TRUE.equals(banco.naLoja(jdbc -> jdbc.queryForObject(
                "select exists (select 1 from onboarding where concluido_em is null)", Boolean.class)));
        return new Sessao(token, nome, papel, deveTrocarSenha, pendente, secoes(usuarioId, papel), usuarioId.toString(), redeConfiavel, perguntarRede);
    }

    private List<String> secoes(UUID usuarioId, String papel) {
        List<String> brutas = banco.naLoja(jdbc -> jdbc.query("select permissoes::text from usuario where id = ?", (rs, i) -> rs.getString(1), usuarioId));
        Map<String, Boolean> escolhas = Map.of();
        try {
            if (!brutas.isEmpty() && brutas.get(0) != null) escolhas = json.readValue(brutas.get(0), new TypeReference<Map<String, Boolean>>() {
            });
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            escolhas = Map.of();
        }
        Map<String, Boolean> finais = escolhas;
        return Permissoes.LIBERAVEIS.stream().filter(s -> Permissoes.pode(papel, finais, s)).toList();
    }
}
