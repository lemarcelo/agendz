package br.com.agendz.servicos;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Quem realiza cada serviço (bloco A1, tabela `profissional_servico`, V55). Serviços > Editar e Equipe > Editar gravam a MESMA tabela: o vínculo é um só.
 * Padrão (gatilhos do banco): serviço novo vem com todos os usuários, usuário novo vem com todos os serviços. O servidor recusa agendar um profissional que não realiza o serviço
 * ({@link #exigirRealiza}); o front só filtra para facilitar a escolha. Tudo roda dentro de `LojaJdbc.naLoja` (RLS), então vínculo de outra loja nem aparece.
 */
@Service
public class VinculoServicos {

    private final LojaJdbc banco;

    public VinculoServicos(LojaJdbc banco) {
        this.banco = banco;
    }

    /** serviço → profissionais que o realizam (só usuários ativos). */
    public Map<UUID, List<UUID>> porServico() {
        return banco.naLoja(jdbc -> porServico(jdbc));
    }

    public static Map<UUID, List<UUID>> porServico(JdbcTemplate jdbc) {
        Map<UUID, List<UUID>> saida = new LinkedHashMap<>();
        jdbc.query("select p.servico_id, p.usuario_id from profissional_servico p join usuario u on u.id = p.usuario_id and u.ativo order by p.servico_id, u.nome, u.id",
                rs -> {
                    saida.computeIfAbsent(rs.getObject("servico_id", UUID.class), k -> new ArrayList<>()).add(rs.getObject("usuario_id", UUID.class));
                });
        return saida;
    }

    /** serviços que o profissional realiza. */
    public List<UUID> doProfissional(UUID usuarioId) {
        return banco.naLoja(jdbc -> {
            existeUsuario(jdbc, usuarioId);
            return jdbc.queryForList("select servico_id from profissional_servico where usuario_id = ?", UUID.class, usuarioId);
        });
    }

    /** Serviços > Editar: troca quem realiza o serviço (só usuários ativos entram; os desativados mantêm o que tinham). */
    public List<UUID> definirDoServico(UUID servicoId, List<UUID> usuarioIds) {
        Loja loja = LojaContext.exigir();
        Set<UUID> ids = limpar(usuarioIds);
        return banco.naLoja(jdbc -> {
            Integer existe = jdbc.queryForObject("select count(*) from servico where id = ?", Integer.class, servicoId);
            if (existe == null || existe == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado.");
            conferirTodosExistem(jdbc, "usuario", ids, "Profissional não encontrado.", true);
            jdbc.update("delete from profissional_servico where servico_id = ? and usuario_id in (select id from usuario where ativo)", servicoId);
            for (UUID u : ids) {
                jdbc.update("insert into profissional_servico (loja_id, usuario_id, servico_id) values (?::uuid, ?, ?) on conflict do nothing", loja.id().toString(), u, servicoId);
            }
            return jdbc.queryForList("select usuario_id from profissional_servico where servico_id = ?", UUID.class, servicoId);
        });
    }

    /** Equipe > Editar: troca os serviços que o profissional realiza (serviço desativado mantém o vínculo que tinha). */
    public List<UUID> definirDoProfissional(UUID usuarioId, List<UUID> servicoIds) {
        Loja loja = LojaContext.exigir();
        Set<UUID> ids = limpar(servicoIds);
        return banco.naLoja(jdbc -> {
            existeUsuario(jdbc, usuarioId);
            conferirTodosExistem(jdbc, "servico", ids, "Serviço não encontrado.", false);
            jdbc.update("delete from profissional_servico where usuario_id = ? and servico_id in (select id from servico where ativo)", usuarioId);
            for (UUID s : ids) {
                jdbc.update("insert into profissional_servico (loja_id, usuario_id, servico_id) values (?::uuid, ?, ?) on conflict do nothing", loja.id().toString(), usuarioId, s);
            }
            return jdbc.queryForList("select servico_id from profissional_servico where usuario_id = ?", UUID.class, usuarioId);
        });
    }

    /** Recusa (409) quando o profissional não realiza algum dos serviços. Chamado por quem grava o agendamento, dentro da transação da loja. */
    public static void exigirRealiza(JdbcTemplate jdbc, UUID profissionalId, List<UUID> servicoIds) {
        if (profissionalId == null || servicoIds == null || servicoIds.isEmpty()) return;
        String marcas = String.join(",", servicoIds.stream().map(x -> "?").toList());
        List<Object> args = new ArrayList<>();
        args.add(profissionalId);
        args.addAll(servicoIds);
        List<String> faltam = jdbc.queryForList("select s.nome from servico s where not exists (select 1 from profissional_servico p where p.usuario_id = ? and p.servico_id = s.id) and s.id in (" + marcas + ") order by s.nome",
                String.class, args.toArray());
        if (faltam.isEmpty()) return;
        String quem = jdbc.queryForObject("select coalesce(nullif(apelido, ''), nome) from usuario where id = ?", String.class, profissionalId);
        throw new ErroDeNegocio(HttpStatus.CONFLICT, quem + " não realiza " + (faltam.size() == 1 ? "o serviço " : "os serviços ") + String.join(", ", faltam) + ".");
    }

    /** O profissional realiza todos estes serviços? (para filtrar candidatos sem lançar erro) */
    public static boolean realizaTodos(Map<UUID, List<UUID>> porServico, UUID profissionalId, List<UUID> servicoIds) {
        for (UUID s : servicoIds) {
            if (!porServico.getOrDefault(s, List.of()).contains(profissionalId)) return false;
        }
        return true;
    }

    private static Set<UUID> limpar(List<UUID> ids) {
        if (ids == null || ids.size() > 500 || ids.stream().anyMatch(java.util.Objects::isNull)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Lista inválida.");
        return new LinkedHashSet<>(ids);
    }

    private static void existeUsuario(JdbcTemplate jdbc, UUID id) {
        Integer n = jdbc.queryForObject("select count(*) from usuario where id = ?", Integer.class, id);
        if (n == null || n == 0) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Profissional não encontrado.");
    }

    private static void conferirTodosExistem(JdbcTemplate jdbc, String tabela, Set<UUID> ids, String mensagem, boolean soAtivos) {
        if (ids.isEmpty()) return;
        String marcas = String.join(",", ids.stream().map(x -> "?").toList());
        Integer n = jdbc.queryForObject("select count(*) from " + tabela + " where id in (" + marcas + ")" + (soAtivos ? " and ativo" : ""), Integer.class, ids.toArray());
        if (n == null || n != ids.size()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, mensagem);
    }
}
