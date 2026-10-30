package br.com.agendz.servicos;

import br.com.agendz.configuracao.PorteController;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Regras dos serviços (espelho de `servicos.salvar` e `servicos.remover` em src/services/api.js, com as mesmas mensagens).
 * Fica de fora, por enquanto, o que depende de outros módulos: notificações próprias, materiais (Estoque), confirmação do serviço e grupo/Pix (Financeiro).
 * A duração e o intervalo são copiados para o agendamento na hora da marcação, então mudar o serviço depois nunca sobrepõe horários já marcados.
 */
@Service
public class ServicoService {

    private static final BigDecimal TETO_PRECO = new BigDecimal("100000");
    private static final int DURACAO_DIA = 1440, DURACAO_MULTIDIA = 14400;
    private static final String MSG_DURACAO = "A duração precisa ser maior que zero e de no máximo 24 horas.";
    private static final TypeReference<Map<String, BigDecimal>> MAPA_PRECOS = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, Integer>> MAPA_DURACOES = new TypeReference<>() {
    };
    private static final String COLUNAS = "id, codigo, nome, categoria, preco, duracao_min, intervalo_min, antecedencia_h, multi_dia, combo, comissao_pct, ativo, precos::text as precos, duracoes::text as duracoes";

    public record Servico(UUID id, String codigo, String nome, String categoria, BigDecimal preco, int duracaoMin, int intervaloMin, int antecedenciaH,
                          boolean multiDia, boolean combo, List<UUID> componentes, BigDecimal comissaoPct, boolean ativo,
                          Map<String, BigDecimal> precos, Map<String, Integer> duracoes) {
    }

    /** Corpo de POST/PUT. Os limites daqui só barram corpo gigante; as mensagens de cada regra saem de {@link #validar}. */
    public record Dados(@Size(max = 500) String nome, @Size(max = 60) String codigo, @Size(max = 200) String categoria, BigDecimal preco, Integer duracaoMin,
                        @Size(max = 20) Map<String, BigDecimal> precos, @Size(max = 20) Map<String, Integer> duracoes,
                        Boolean multiDia, Boolean combo, @Size(max = 50) List<@Size(max = 100) String> componentes, Integer intervaloMin, Integer antecedenciaH,
                        BigDecimal comissaoPct, Boolean ativo) {
    }

    /** Resultado de remover: apagado de vez (nunca foi usado) ou só desativado (tem histórico ou faz parte de um combo). */
    public record Remocao(boolean desativado) {
    }

    private final LojaJdbc banco;
    private final ObjectMapper json;

    public ServicoService(LojaJdbc banco, ObjectMapper json) {
        this.banco = banco;
        this.json = json;
    }

    /** Capacidade `precoPorPorte` (src/tipos/estetica_automotiva/definicao.js). Tipo novo com preço por porte entra aqui. */
    static boolean precoPorPorte(Loja loja) {
        return br.com.agendz.tenant.Capacidades.precoPorPorte(loja);
    }

    // ---------- leitura ----------

    /** Lista de Serviços (ordem manual do dono; sem ordem, por nome). `paraAtender`: ordem do Atender, pelo modo da loja (mais usados primeiro ou manual). */
    public List<Servico> listar(boolean dono, boolean paraAtender) {
        return banco.naLoja(jdbc -> {
            String ordem = paraAtender ? OrdemDosServicos.sql(jdbc) : OrdemDosServicos.MANUAL;
            List<Servico> lista = jdbc.query("select " + COLUNAS + " from servico" + (dono ? "" : " where ativo") + " order by " + ordem + " limit 500", (rs, i) -> linha(rs));
            Map<UUID, List<UUID>> comps = componentesDaLoja(jdbc);
            List<Servico> saida = new ArrayList<>();
            for (Servico s : lista) saida.add(comComponentes(s, comps.getOrDefault(s.id(), List.of())));
            return saida;
        });
    }

    /** PUT /api/servicos/ordem — nova ordem manual a partir da lista de ids (desconhecidos e repetidos são ignorados; os que faltam vão depois, na ordem de antes). */
    public void reordenar(List<UUID> ids) {
        if (ids == null || ids.size() > 300 || ids.stream().anyMatch(java.util.Objects::isNull)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Ordem dos serviços inválida.");
        banco.naLoja(jdbc -> {
            List<UUID> atuais = jdbc.queryForList("select id from servico order by " + OrdemDosServicos.MANUAL, UUID.class);
            java.util.LinkedHashSet<UUID> fila = new java.util.LinkedHashSet<>();
            for (UUID id : ids) if (atuais.contains(id)) fila.add(id);
            fila.addAll(atuais);
            int n = 1;
            for (UUID id : fila) jdbc.update("update servico set ordem = ? where id = ?", n++, id);
            return null;
        });
    }

    public Servico obter(UUID id, boolean dono) {
        Servico s = banco.naLoja(jdbc -> buscar(jdbc, id));
        if (s == null || (!s.ativo() && !dono)) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado.");
        return s;
    }

    // ---------- escrita ----------

    public Servico criar(Dados d) {
        Loja loja = LojaContext.exigir();
        Validado v = validar(d, loja, null, false);
        try {
            return banco.naLoja(jdbc -> {
                String codigo = codigoFinal(jdbc, v.codigo, null);
                UUID id = jdbc.queryForObject(
                        "insert into servico (loja_id, codigo, nome, categoria, preco, duracao_min, intervalo_min, antecedencia_h, multi_dia, combo, comissao_pct, ativo, precos, duracoes, ordem) "
                                + "values (?::uuid, ?, ?, nullif(?, ''), ?, ?, ?, ?, ?, ?, ?, ?, cast(? as jsonb), cast(? as jsonb), (select coalesce(max(ordem), 0) + 1 from servico)) returning id",
                        UUID.class, loja.id().toString(), codigo, v.nome, v.categoria, v.preco, v.duracao, v.intervalo == null ? 0 : v.intervalo, v.antecedencia == null ? 0 : v.antecedencia,
                        v.multiDia != null && v.multiDia, v.combo != null && v.combo, v.comissao, v.ativo == null || v.ativo, v.precosJson, v.duracoesJson);
                conferirComponentes(jdbc, id, v);
                gravarComponentes(jdbc, loja, id, v);
                return buscar(jdbc, id);
            });
        } catch (DuplicateKeyException ex) {
            throw codigoRepetido(ex, v.codigo);
        }
    }

    public Servico alterar(UUID id, Dados d) {
        Loja loja = LojaContext.exigir();
        Validado v = validar(d, loja, id, true);
        try {
            return banco.naLoja(jdbc -> {
                Servico atual = buscar(jdbc, id);
                if (atual == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado.");
                // A regra "vários dias" e a tabela por porte dependem do que já está gravado quando o campo não vem.
                boolean multi = v.multiDia != null ? v.multiDia : atual.multiDia();
                validarLimiteDuracao(multi, v);
                String codigo = codigoFinal(jdbc, v.codigo, id);
                boolean combo = v.combo != null ? v.combo : atual.combo();
                jdbc.update("update servico set codigo = ?, nome = ?, categoria = case when ? then nullif(?, '') else categoria end, preco = ?, duracao_min = ?, intervalo_min = coalesce(?, intervalo_min), "
                                + "antecedencia_h = coalesce(?, antecedencia_h), multi_dia = ?, combo = ?, comissao_pct = case when ? then ? else comissao_pct end, ativo = coalesce(?, ativo), "
                                + "precos = case when ? then cast(? as jsonb) else precos end, duracoes = case when ? then cast(? as jsonb) else duracoes end where id = ?",
                        codigo, v.nome, v.categoriaVeio, v.categoria, v.preco, v.duracao, v.intervalo, v.antecedencia, multi, combo, v.comissaoVeio, v.comissao, v.ativo,
                        v.precosVeio, v.precosJson, v.duracoesVeio, v.duracoesJson, id);
                if (v.componentesVeio || v.combo != null) {
                    conferirComponentes(jdbc, id, v);
                    jdbc.update("delete from servico_componente where combo_id = ?", id);
                    gravarComponentes(jdbc, loja, id, v);
                }
                return buscar(jdbc, id);
            });
        } catch (DuplicateKeyException ex) {
            throw codigoRepetido(ex, v.codigo);
        }
    }

    /** Nunca usado: apaga. Com histórico de agendamento ou como parte de um combo: só desativa (igual à API simulada). */
    public Remocao remover(UUID id) {
        return banco.naLoja(jdbc -> {
            if (buscar(jdbc, id) == null) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Serviço não encontrado.");
            Integer usos = jdbc.queryForObject("select (select count(*) from agendamento_servico where servico_id = ?) + (select count(*) from servico_componente where componente_id = ?) + (select count(*) from plano_servico where servico_id = ?)", Integer.class, id, id, id);
            if (usos != null && usos > 0) {
                jdbc.update("update servico set ativo = false where id = ?", id);
                return new Remocao(true);
            }
            jdbc.update("delete from servico where id = ?", id);   // leva junto os componentes, se for um combo
            return new Remocao(false);
        });
    }

    // ---------- validação ----------

    private static final class Validado {
        String nome, codigo, categoria;
        boolean categoriaVeio, precosVeio, duracoesVeio, componentesVeio, comissaoVeio;
        BigDecimal preco, comissao;
        Integer duracao, intervalo, antecedencia;
        Boolean multiDia, combo, ativo;
        String precosJson, duracoesJson;
        List<String> componentes;
        Map<String, BigDecimal> precoMapa;
        Map<String, Integer> duracaoMapa;
    }

    private Validado validar(Dados d, Loja loja, UUID id, boolean edicao) {
        Validado v = new Validado();
        String nomeBruto = d.nome() == null ? "" : Texto.limpar(d.nome());
        if (nomeBruto.length() > 100) throw ruim("O nome do serviço pode ter até 100 caracteres.");
        if (nomeBruto.isEmpty()) throw ruim("Informe o nome do serviço.");
        v.nome = nomeBruto;
        v.multiDia = d.multiDia();
        v.combo = d.combo();
        if (d.categoria() != null) {
            String c = Texto.limpar(d.categoria());
            if (c.length() > 30) throw ruim("A categoria pode ter até 30 letras.");
            v.categoria = c;
            v.categoriaVeio = true;
        } else {
            v.categoria = null;
            v.categoriaVeio = !edicao;   // criar sem categoria = sem categoria; editar sem o campo = mantém
        }
        if (d.comissaoPct() != null) {
            if (d.comissaoPct().signum() < 0 || d.comissaoPct().compareTo(new BigDecimal("100")) > 0) throw ruim("A comissão vai de 0 a 100%.");
            v.comissao = d.comissaoPct().setScale(2, RoundingMode.HALF_UP);
            v.comissaoVeio = true;
        }
        v.ativo = d.ativo();

        // preço: valor único ou tabela dos 5 portes (só no tipo com preço por porte; nos outros a tabela é ignorada)
        boolean porPorte = precoPorPorte(loja);
        if (d.preco() != null && (d.preco().signum() < 0 || d.preco().compareTo(TETO_PRECO) > 0)) throw ruim("Informe o preço.");
        if (d.duracaoMin() != null && (d.duracaoMin() <= 0 || d.duracaoMin() > DURACAO_MULTIDIA)) throw ruim(MSG_DURACAO);
        boolean multi = Boolean.TRUE.equals(d.multiDia());
        // Edição sem o campo "vários dias": o teto certo depende do que já está gravado e é conferido em alterar().
        boolean generoso = multi || (edicao && d.multiDia() == null);
        int limite = generoso ? DURACAO_MULTIDIA : DURACAO_DIA;
        List<PorteController.Porte> portes = porPorte ? banco.naLoja(PorteController::ler) : List.of();
        Map<String, BigDecimal> tp = porPorte ? tabelaPrecos(portes, d.precos(), d.preco()) : null;
        Map<String, Integer> td = porPorte ? tabelaDuracoes(portes, d.duracoes(), d.duracaoMin(), limite, multi) : null;
        if (!porPorte) {
            if (d.preco() == null) throw ruim("Informe o preço.");
            if (d.duracaoMin() == null) throw ruim("Informe a duração.");
        }
        v.preco = (porPorte ? tp.get("medio") : d.preco()).setScale(2, RoundingMode.HALF_UP);
        v.duracao = porPorte ? td.get("medio") : d.duracaoMin();
        v.precoMapa = tp;
        v.duracaoMapa = td;
        v.precosJson = tp == null ? null : escrever(tp);
        v.duracoesJson = td == null ? null : escrever(td);
        v.precosVeio = porPorte && (!edicao || d.precos() != null || d.preco() != null);
        v.duracoesVeio = porPorte && (!edicao || d.duracoes() != null || d.duracaoMin() != null);
        if (!edicao || d.multiDia() != null) validarLimiteDuracao(multi, v);

        if (Boolean.TRUE.equals(d.combo())) {
            List<String> comp = d.componentes();
            if (!(comp != null && comp.size() >= 2 && comp.size() <= 10 && Set.copyOf(comp).size() == comp.size() && comp.stream().allMatch(x -> x != null && !x.isBlank() && x.length() <= 60))) {
                throw ruim("Um combo junta de 2 a 10 serviços diferentes.");
            }
        }
        v.componentes = d.componentes();
        v.componentesVeio = d.componentes() != null;
        if (d.intervaloMin() != null && (d.intervaloMin() < 0 || d.intervaloMin() > 1440)) throw ruim("Intervalo inválido.");
        if (d.antecedenciaH() != null && (d.antecedenciaH() < 0 || d.antecedenciaH() > 8760)) throw ruim("Antecedência inválida.");
        v.intervalo = d.intervaloMin();
        v.antecedencia = d.antecedenciaH();
        if (d.codigo() != null && !d.codigo().isBlank()) {
            String c = Texto.limpar(d.codigo());
            if (!c.matches("^[A-Za-z0-9._-]{1,20}$")) throw ruim("Código inválido: use até 20 letras, números, ponto, hífen ou sublinhado.");
            v.codigo = c;
        }
        return v;
    }

    /** Edição que muda "vários dias" ou não manda a duração: confere o teto de 24 h quando o serviço não é de vários dias. */
    private void validarLimiteDuracao(boolean multi, Validado v) {
        if (multi) return;
        if (v.duracao != null && v.duracao > DURACAO_DIA) throw ruim(MSG_DURACAO);
        if (v.duracaoMapa != null) for (Integer x : v.duracaoMapa.values()) if (x > DURACAO_DIA) throw ruim(MSG_DURACAO);
    }

    /** Os portes de fábrica ativos precisam de preço; porte cadastrado pelo dono ou desativado pode ficar sem (vale o do Médio). */
    private static Map<String, BigDecimal> tabelaPrecos(List<PorteController.Porte> portes, Map<String, BigDecimal> bruto, BigDecimal unico) {
        Map<String, BigDecimal> v = new LinkedHashMap<>();
        if (bruto == null) {
            if (unico == null) throw ruim("Informe o preço.");
            for (PorteController.Porte p : portes) v.put(p.id(), unico);
            return v;
        }
        java.util.Set<String> conhecidos = new java.util.HashSet<>();
        for (PorteController.Porte p : portes) conhecidos.add(p.id());
        if (!conhecidos.containsAll(bruto.keySet())) throw ruim("Tabela de preços inválida.");
        java.util.Set<String> obrigatorios = PorteController.obrigatoriosNoServico(portes);
        for (PorteController.Porte p : portes) {
            BigDecimal x = bruto.get(p.id());
            if (x == null && !obrigatorios.contains(p.id())) continue;
            if (x == null || x.signum() < 0 || x.compareTo(TETO_PRECO) > 0) throw ruim("Informe o preço para o porte " + p.nome() + ".");
            v.put(p.id(), x);
        }
        return v;
    }

    private static Map<String, Integer> tabelaDuracoes(List<PorteController.Porte> portes, Map<String, Integer> bruto, Integer unico, int limite, boolean multi) {
        Map<String, Integer> v = new LinkedHashMap<>();
        if (bruto == null) {
            if (unico == null) throw ruim("Informe a duração.");
            for (PorteController.Porte p : portes) v.put(p.id(), unico);
            return v;
        }
        String sufixo = multi ? "" : " " + MSG_DURACAO;
        java.util.Set<String> conhecidos = new java.util.HashSet<>();
        for (PorteController.Porte p : portes) conhecidos.add(p.id());
        if (!conhecidos.containsAll(bruto.keySet())) throw ruim("Tabela de durações inválida." + sufixo);
        java.util.Set<String> obrigatorios = PorteController.obrigatoriosNoServico(portes);
        for (PorteController.Porte p : portes) {
            Integer x = bruto.get(p.id());
            if (x == null && !obrigatorios.contains(p.id())) continue;
            if (x == null || x <= 0 || x > limite) throw ruim("Informe a duração para o porte " + p.nome() + "." + sufixo);
            v.put(p.id(), x);
        }
        return v;
    }

    private void conferirComponentes(JdbcTemplate jdbc, UUID idDoCombo, Validado v) {
        if (!Boolean.TRUE.equals(v.combo) || v.componentes == null) return;
        for (String texto : v.componentes) {
            UUID c;
            try {
                c = UUID.fromString(texto);
            } catch (IllegalArgumentException e) {
                throw ruim("O combo só aceita serviços comuns já cadastrados (combo dentro de combo não vale).");
            }
            Integer ok = jdbc.queryForObject("select count(*) from servico where id = ? and not combo", Integer.class, c);
            if (c.equals(idDoCombo) || ok == null || ok == 0) throw ruim("O combo só aceita serviços comuns já cadastrados (combo dentro de combo não vale).");
        }
    }

    private void gravarComponentes(JdbcTemplate jdbc, Loja loja, UUID id, Validado v) {
        if (!Boolean.TRUE.equals(v.combo) || v.componentes == null) return;
        int ordem = 0;
        for (String texto : v.componentes) {
            jdbc.update("insert into servico_componente (loja_id, combo_id, componente_id, ordem) values (?::uuid, ?, ?, ?)", loja.id().toString(), id, UUID.fromString(texto), ordem++);
        }
    }

    // ---------- código ----------

    /** Vazio = o próximo número (criando) ou o que já tinha (editando); informado = único na loja, sem diferenciar maiúsculas. */
    private String codigoFinal(JdbcTemplate jdbc, String informado, UUID id) {
        if (informado == null) {
            if (id != null) return jdbc.queryForObject("select codigo from servico where id = ?", String.class, id);
            return jdbc.queryForObject("select (coalesce(max(case when codigo ~ '^[0-9]{1,9}$' then codigo::int end), 0) + 1)::text from servico", String.class);
        }
        Integer repetidos = id == null
                ? jdbc.queryForObject("select count(*) from servico where lower(codigo) = lower(?)", Integer.class, informado)
                : jdbc.queryForObject("select count(*) from servico where lower(codigo) = lower(?) and id <> ?", Integer.class, informado, id);
        if (repetidos != null && repetidos > 0) throw new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe serviço com o código " + informado + ".");
        return informado;
    }

    private static ErroDeNegocio codigoRepetido(DuplicateKeyException ex, String codigo) {
        // Corrida entre duas gravações com o mesmo código (a conferência acima já pegou o caso comum).
        return new ErroDeNegocio(HttpStatus.CONFLICT, codigo == null ? "Tente salvar de novo." : "Já existe serviço com o código " + codigo + ".");
    }

    // ---------- linhas ----------

    private Servico buscar(JdbcTemplate jdbc, UUID id) {
        List<Servico> achados = jdbc.query("select " + COLUNAS + " from servico where id = ?", (rs, i) -> linha(rs), id);
        if (achados.isEmpty()) return null;
        List<UUID> comps = jdbc.query("select componente_id from servico_componente where combo_id = ? order by ordem", (rs, i) -> rs.getObject(1, UUID.class), id);
        return comComponentes(achados.get(0), comps);
    }

    private static Map<UUID, List<UUID>> componentesDaLoja(JdbcTemplate jdbc) {
        Map<UUID, List<UUID>> mapa = new HashMap<>();
        jdbc.query("select combo_id, componente_id from servico_componente order by ordem", rs -> {
            mapa.computeIfAbsent(rs.getObject(1, UUID.class), k -> new ArrayList<>()).add(rs.getObject(2, UUID.class));
        });
        return mapa;
    }

    private static Servico comComponentes(Servico s, List<UUID> comps) {
        return new Servico(s.id(), s.codigo(), s.nome(), s.categoria(), s.preco(), s.duracaoMin(), s.intervaloMin(), s.antecedenciaH(), s.multiDia(), s.combo(), comps,
                s.comissaoPct(), s.ativo(), s.precos(), s.duracoes());
    }

    private Servico linha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Servico(rs.getObject("id", UUID.class), rs.getString("codigo"), rs.getString("nome"), rs.getString("categoria"), rs.getBigDecimal("preco"),
                rs.getInt("duracao_min"), rs.getInt("intervalo_min"), rs.getInt("antecedencia_h"), rs.getBoolean("multi_dia"), rs.getBoolean("combo"), List.of(),
                rs.getBigDecimal("comissao_pct"), rs.getBoolean("ativo"), lerMapa(rs.getString("precos"), MAPA_PRECOS), lerMapa(rs.getString("duracoes"), MAPA_DURACOES));
    }

    private <T> T lerMapa(String texto, TypeReference<T> tipo) {
        if (texto == null) return null;
        try {
            return json.readValue(texto, tipo);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("jsonb de serviço inválido", e);
        }
    }

    private String escrever(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ErroDeNegocio ruim(String mensagem) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, mensagem);
    }
}
