package br.com.agendz.auth;

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

    public SessaoService(LojaJdbc banco, JwtService jwt, ObjectMapper json) {
        this.banco = banco;
        this.jwt = jwt;
        this.json = json;
    }

    public Sessao abrir(UUID usuarioId, Loja loja, String papel, String nome, boolean deveTrocarSenha) {
        boolean pendente = "dono".equals(papel) && Boolean.TRUE.equals(banco.naLoja(jdbc -> jdbc.queryForObject(
                "select exists (select 1 from onboarding where concluido_em is null)", Boolean.class)));
        return new Sessao(jwt.emitir(usuarioId, loja.id(), papel, nome, deveTrocarSenha), nome, papel, deveTrocarSenha, pendente, secoes(usuarioId, papel), usuarioId.toString());
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
