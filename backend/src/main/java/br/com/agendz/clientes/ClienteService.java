package br.com.agendz.clientes;

import br.com.agendz.cifra.Cifra;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Documentos;
import br.com.agendz.validacao.Texto;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
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
 * Regras dos clientes (espelho de `clientes.salvar` em src/services/api.js; tabela em docs/MAPA-API-SPRING.md).
 * Nome e apelido em texto puro; telefone, CPF e nascimento cifrados ({@link Cifra}) com hash para achar e impedir duplicidade.
 * Nada aqui escreve log: telefone e CPF nunca saem por mensagem de erro.
 */
@Service
public class ClienteService {

    public static final int LIMITE_VEICULOS = 10;
    private static final Set<String> PORTES = Set.of("pequeno", "medio", "grande", "suv", "pickup");
    private static final String MSG_NOME = "Informe o nome ou apelido do cliente.";
    private static final String MSG_TELEFONE = "Informe o telefone com DDD.";

    /** Quem está agindo: o id vem do token, nunca do corpo. */
    public record Ator(UUID id, boolean dono) {
    }

    public record Veiculo(UUID id, String placa, String marca, String modelo, String cor, String porte) {
    }

    /** Linha da lista: CPF só mascarado, sem nascimento. */
    public record Resumo(UUID id, String nome, String apelido, String telefone, String cpfMascarado, List<Veiculo> veiculos) {
    }

    /** Ficha: CPF completo e nascimento só quando `dadosCompletos` (dono, quem atende o cliente ou cadastro sem horários). */
    public record Ficha(UUID id, String nome, String apelido, String telefone, String telefoneAnterior, String cpf, String cpfMascarado,
                        String nascimento, boolean dadosCompletos, List<Veiculo> veiculos) {
    }

    public record EntradaVeiculo(String id, String placa, String marca, String modelo, String cor, String porte) {
    }

    public record Entrada(String nome, String apelido, String telefone, String cpf, String nascimento, List<EntradaVeiculo> veiculos) {
    }

    private record Linha(UUID id, String nome, String apelido, String telefoneCif, String telefoneHash, String cpfCif, String cpfHash, String nascimentoCif) {
    }

    private final LojaJdbc banco;
    private final Cifra cifra;

    public ClienteService(LojaJdbc banco, Cifra cifra) {
        this.banco = banco;
        this.cifra = cifra;
    }

    /** Capacidade `usaVeiculo` (src/tipos/estetica_automotiva/definicao.js). Tipo novo que usa veículo entra aqui. */
    static boolean usaVeiculo(Loja loja) {
        return "estetica_automotiva".equals(loja.tipo());
    }

    // ---------- leitura ----------

    public List<Resumo> listar(String busca) {
        String q = busca == null ? "" : Texto.limpar(busca).toLowerCase(Locale.ROOT);
        if (q.length() > 60) q = q.substring(0, 60);
        String consulta = q;
        String soDigitos = Documentos.digitos(q);
        return banco.naLoja(jdbc -> {
            List<Linha> linhas = jdbc.query("select id, nome, apelido, telefone_cif, telefone_hash, cpf_cif, cpf_hash, nascimento_cif from cliente order by lower(nome), id limit 2000",
                    (rs, i) -> lerLinha(rs));
            Map<UUID, List<Veiculo>> veiculos = veiculosDaLoja(jdbc);
            List<Resumo> saida = new ArrayList<>();
            for (Linha l : linhas) {
                String tel = cifra.decifrar(l.telefoneCif());
                String cpf = l.cpfCif() == null ? null : cifra.decifrar(l.cpfCif());
                List<Veiculo> vs = veiculos.getOrDefault(l.id(), List.of());
                if (!consulta.isEmpty() && !confere(consulta, soDigitos, l, tel, cpf, vs)) continue;
                saida.add(new Resumo(l.id(), l.nome(), l.apelido(), tel, cpf == null ? null : Documentos.cpfMascarado(cpf), vs));
                if (saida.size() >= 500) break;
            }
            return saida;
        });
    }

    private static boolean confere(String q, String digitos, Linha l, String tel, String cpf, List<Veiculo> vs) {
        if (l.nome().toLowerCase(Locale.ROOT).contains(q) || l.apelido().toLowerCase(Locale.ROOT).contains(q)) return true;
        String semTraco = q.replaceAll("[\\s-]", "");
        for (Veiculo v : vs) {
            if (v.modelo().toLowerCase(Locale.ROOT).contains(q) || (!semTraco.isEmpty() && chavePlaca(v.placa()).toLowerCase(Locale.ROOT).contains(semTraco))) return true;
        }
        if (digitos.isEmpty()) return false;
        if (tel.substring(2).contains(digitos)) return true;   // sem o 55 do país: a pessoa digita DDD + número
        return cpf != null && cpf.contains(digitos);
    }

    public Ficha obter(Ator ator, UUID id) {
        return banco.naLoja(jdbc -> ficha(jdbc, ator, lerPorId(jdbc, id, false)));
    }

    // ---------- escrita ----------

    public Ficha criar(Ator ator, Entrada e) {
        Loja loja = LojaContext.exigir();
        String nome = nomeObrigatorio(e.nome());
        String apelido = apelido(e.apelido());
        String tel = telefoneObrigatorio(e.telefone());
        String cpf = cpfOpcional(e.cpf());
        String nasc = nascimentoOpcional(e.nascimento());
        List<Veiculo> veiculos = usaVeiculo(loja) && e.veiculos() != null ? veiculosValidos(e.veiculos()) : List.of();
        try {
            return banco.naLoja(jdbc -> {
                UUID id = jdbc.queryForObject(
                        "insert into cliente (loja_id, nome, apelido, telefone_cif, telefone_hash, cpf_cif, cpf_hash, nascimento_cif) values (?::uuid, ?, ?, ?, ?, ?, ?, ?) returning id",
                        UUID.class, loja.id().toString(), nome, apelido, cifra.cifrar(tel), cifra.hash(loja.id(), "tel", tel),
                        cpf == null ? null : cifra.cifrar(cpf), cpf == null ? null : cifra.hash(loja.id(), "cpf", cpf), nasc == null ? null : cifra.cifrar(nasc));
                for (int i = 0; i < veiculos.size(); i++) inserirVeiculo(jdbc, loja, id, veiculos.get(i), i);
                return ficha(jdbc, ator, lerPorId(jdbc, id, false));
            });
        } catch (DuplicateKeyException ex) {
            throw duplicado(ex);
        }
    }

    public Ficha atualizar(Ator ator, UUID id, Entrada e) {
        Loja loja = LojaContext.exigir();
        // Validação de formato antes de abrir a transação (campo ausente = não mexe).
        String nome = e.nome() == null ? null : nomeObrigatorio(e.nome());
        String apelido = e.apelido() == null ? null : apelido(e.apelido());
        String tel = e.telefone() == null ? null : telefoneObrigatorio(e.telefone());
        String cpf = e.cpf() == null ? null : cpfOpcional(e.cpf());          // "" = apagar
        String nasc = e.nascimento() == null ? null : nascimentoOpcional(e.nascimento());
        List<Veiculo> veiculos = usaVeiculo(loja) && e.veiculos() != null ? veiculosValidos(e.veiculos()) : null;
        try {
            return banco.naLoja(jdbc -> {
                Linha atual = lerPorId(jdbc, id, true);
                boolean forte = dadosCompletos(jdbc, ator, id);
                String telAtual = cifra.decifrar(atual.telefoneCif());
                String cpfAtual = atual.cpfCif() == null ? null : cifra.decifrar(atual.cpfCif());
                String nascAtual = atual.nascimentoCif() == null ? null : cifra.decifrar(atual.nascimentoCif());

                String novoTelCif = atual.telefoneCif(), novoTelHash = atual.telefoneHash();
                if (tel != null && !tel.equals(telAtual)) {
                    if (!forte) throw new ErroDeNegocio(HttpStatus.FORBIDDEN, "Só o proprietário ou o profissional que atende esse cliente altera o telefone de um cliente já cadastrado.");
                    jdbc.update("insert into cliente_telefone_anterior (loja_id, cliente_id, telefone_cif, trocado_por) values (?::uuid, ?, ?, ?)",
                            loja.id().toString(), id, atual.telefoneCif(), ator.id());
                    novoTelCif = cifra.cifrar(tel);
                    novoTelHash = cifra.hash(loja.id(), "tel", tel);
                }
                String cpfFinal = cpfAtual, nascFinal = nascAtual;
                if (cpf != null) {
                    String novo = cpf.isEmpty() ? null : cpf;
                    if (!java.util.Objects.equals(novo, cpfAtual)) {
                        if (!forte) throw semPermissaoDados();
                        cpfFinal = novo;
                    }
                }
                if (nasc != null) {
                    String novo = nasc.isEmpty() ? null : nasc;
                    if (!java.util.Objects.equals(novo, nascAtual)) {
                        if (!forte) throw semPermissaoDados();
                        nascFinal = novo;
                    }
                }
                jdbc.update("update cliente set nome = ?, apelido = ?, telefone_cif = ?, telefone_hash = ?, cpf_cif = ?, cpf_hash = ?, nascimento_cif = ?, atualizado_em = now() where id = ?",
                        nome != null ? nome : atual.nome(), apelido != null ? apelido : atual.apelido(), novoTelCif, novoTelHash,
                        cpfFinal == null ? null : (cpfFinal.equals(cpfAtual) ? atual.cpfCif() : cifra.cifrar(cpfFinal)),
                        cpfFinal == null ? null : cifra.hash(loja.id(), "cpf", cpfFinal),
                        nascFinal == null ? null : (nascFinal.equals(nascAtual) ? atual.nascimentoCif() : cifra.cifrar(nascFinal)), id);
                if (veiculos != null) sincronizarVeiculos(jdbc, loja, id, veiculos);
                return ficha(jdbc, ator, lerPorId(jdbc, id, false));
            });
        } catch (DuplicateKeyException ex) {
            throw duplicado(ex);
        }
    }

    // ---------- permissão de dados fortes ----------

    /**
     * CPF completo, nascimento e troca de telefone: o dono, o profissional que atende o cliente (tem agendamento com ele) ou qualquer um quando o cadastro
     * ainda não tem horários (cadastro novo). Os demais veem o CPF mascarado e não veem o nascimento.
     */
    private boolean dadosCompletos(JdbcTemplate jdbc, Ator ator, UUID clienteId) {
        if (ator.dono()) return true;
        Integer total = jdbc.queryForObject("select count(*) from agendamento where cliente_id = ?", Integer.class, clienteId);
        if (total == null || total == 0) return true;
        Integer meus = jdbc.queryForObject("select count(*) from agendamento where cliente_id = ? and profissional_id = ?", Integer.class, clienteId, ator.id());
        return meus != null && meus > 0;
    }

    private static ErroDeNegocio semPermissaoDados() {
        return new ErroDeNegocio(HttpStatus.FORBIDDEN, "Só o proprietário ou o profissional que atende esse cliente altera o CPF e o nascimento.");
    }

    // ---------- leitura de linha e ficha ----------

    private static Linha lerLinha(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Linha(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("apelido"), rs.getString("telefone_cif"), rs.getString("telefone_hash"),
                rs.getString("cpf_cif"), rs.getString("cpf_hash"), rs.getString("nascimento_cif"));
    }

    private Linha lerPorId(JdbcTemplate jdbc, UUID id, boolean travar) {
        List<Linha> achados = jdbc.query("select id, nome, apelido, telefone_cif, telefone_hash, cpf_cif, cpf_hash, nascimento_cif from cliente where id = ?" + (travar ? " for update" : ""),
                (rs, i) -> lerLinha(rs), id);
        if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Cliente não encontrado");
        return achados.get(0);
    }

    private Ficha ficha(JdbcTemplate jdbc, Ator ator, Linha l) {
        boolean forte = dadosCompletos(jdbc, ator, l.id());
        String cpf = l.cpfCif() == null ? null : cifra.decifrar(l.cpfCif());
        List<String> anteriores = jdbc.query("select telefone_cif from cliente_telefone_anterior where cliente_id = ? order by trocado_em desc, id limit 1",
                (rs, i) -> rs.getString(1), l.id());
        return new Ficha(l.id(), l.nome(), l.apelido(), cifra.decifrar(l.telefoneCif()), anteriores.isEmpty() ? null : cifra.decifrar(anteriores.get(0)),
                forte ? cpf : null, cpf == null ? null : Documentos.cpfMascarado(cpf),
                forte && l.nascimentoCif() != null ? cifra.decifrar(l.nascimentoCif()) : null, forte, veiculosDe(jdbc, l.id()));
    }

    // ---------- veículos ----------

    private static Veiculo lerVeiculo(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Veiculo(rs.getObject("id", UUID.class), rs.getString("placa"), rs.getString("marca"), rs.getString("modelo"), rs.getString("cor"), rs.getString("porte"));
    }

    private static List<Veiculo> veiculosDe(JdbcTemplate jdbc, UUID clienteId) {
        return jdbc.query("select id, placa, marca, modelo, cor, porte from cliente_veiculo where cliente_id = ? order by ordem, criado_em, id", (rs, i) -> lerVeiculo(rs), clienteId);
    }

    private static Map<UUID, List<Veiculo>> veiculosDaLoja(JdbcTemplate jdbc) {
        Map<UUID, List<Veiculo>> mapa = new HashMap<>();
        jdbc.query("select id, cliente_id, placa, marca, modelo, cor, porte from cliente_veiculo order by ordem, criado_em, id limit 20000", rs -> {
            mapa.computeIfAbsent(rs.getObject("cliente_id", UUID.class), k -> new ArrayList<>()).add(lerVeiculo(rs));
        });
        return mapa;
    }

    private static String chavePlaca(String placa) {
        return placa.toUpperCase(Locale.ROOT).replaceAll("[\\s-]", "");
    }

    /** Mesma regra de `limparVeiculo` (src/domain/veiculos.js): placa antiga ou Mercosul só por formato; modelo e porte obrigatórios. */
    static List<Veiculo> veiculosValidos(List<EntradaVeiculo> entrada) {
        if (entrada.size() > LIMITE_VEICULOS) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Veículos inválidos: no máximo " + LIMITE_VEICULOS + " por cliente.");
        List<Veiculo> saida = new ArrayList<>();
        Set<String> vistas = new HashSet<>();
        Set<String> idsVistos = new HashSet<>();
        for (EntradaVeiculo v : entrada) {
            if (v == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o veículo.");
            String chave = v.placa() == null || v.placa().length() > 16 ? "" : chavePlaca(v.placa());
            if (!chave.matches("^[A-Z]{3}[0-9]{4}$") && !chave.matches("^[A-Z]{3}[0-9][A-Z][0-9]{2}$")) {
                throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23).");
            }
            String modelo = limitar(Texto.limpar(v.modelo() == null ? "" : v.modelo()), 40);
            if (modelo.length() < 2) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o modelo do veículo.");
            if (v.porte() == null || !PORTES.contains(v.porte())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o porte do veículo.");
            String placa = chave.matches("^[A-Z]{3}[0-9]{4}$") ? chave.substring(0, 3) + "-" + chave.substring(3) : chave;
            if (!vistas.add(chave)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "A placa " + placa + " aparece duas vezes nesse cliente.");
            UUID id = null;
            if (v.id() != null && idsVistos.add(v.id())) {   // id repetido na mesma lista vira veículo novo
                try {
                    id = UUID.fromString(v.id());
                } catch (IllegalArgumentException ex) {
                    id = null;
                }
            }
            saida.add(new Veiculo(id, placa, limitar(Texto.limpar(v.marca() == null ? "" : v.marca()), 30), modelo, limitar(Texto.limpar(v.cor() == null ? "" : v.cor()), 20), v.porte()));
        }
        return saida;
    }

    private static String limitar(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private void inserirVeiculo(JdbcTemplate jdbc, Loja loja, UUID clienteId, Veiculo v, int ordem) {
        jdbc.update("insert into cliente_veiculo (loja_id, cliente_id, placa, placa_chave, marca, modelo, cor, porte, ordem) values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?)",
                loja.id().toString(), clienteId, v.placa(), chavePlaca(v.placa()), v.marca(), v.modelo(), v.cor(), v.porte(), ordem);
    }

    /**
     * Lista nova substitui a antiga: id conhecido do próprio cliente atualiza, o resto entra como novo (id sempre gerado no servidor) e o que sumiu é removido.
     * (Quando a agenda guardar o veículo no agendamento, aqui entra a trava "veículo com agendamento ativo não sai".)
     */
    private void sincronizarVeiculos(JdbcTemplate jdbc, Loja loja, UUID clienteId, List<Veiculo> novos) {
        Set<UUID> atuais = new HashSet<>(jdbc.query("select id from cliente_veiculo where cliente_id = ?", (rs, i) -> rs.getObject(1, UUID.class), clienteId));
        Set<UUID> mantidos = new HashSet<>();
        for (Veiculo v : novos) if (v.id() != null && atuais.contains(v.id())) mantidos.add(v.id());
        for (UUID id : atuais) if (!mantidos.contains(id)) jdbc.update("delete from cliente_veiculo where id = ?", id);
        for (int i = 0; i < novos.size(); i++) {
            Veiculo v = novos.get(i);
            if (v.id() != null && mantidos.contains(v.id())) {
                jdbc.update("update cliente_veiculo set placa = ?, placa_chave = ?, marca = ?, modelo = ?, cor = ?, porte = ?, ordem = ? where id = ?",
                        v.placa(), chavePlaca(v.placa()), v.marca(), v.modelo(), v.cor(), v.porte(), i, v.id());
            } else {
                inserirVeiculo(jdbc, loja, clienteId, v, i);
            }
        }
    }

    // ---------- campos ----------

    private static String nomeObrigatorio(String bruto) {
        String n = bruto == null ? "" : Texto.limpar(bruto);
        if (n.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, MSG_NOME);
        if (n.length() > 100) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Texto inválido ou grande demais em nome.");
        return n;
    }

    private static String apelido(String bruto) {
        String a = bruto == null ? "" : Texto.limpar(bruto);
        if (a.length() > 100) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Texto inválido ou grande demais em apelido.");
        return a;
    }

    private static String telefoneObrigatorio(String bruto) {
        String t = bruto == null ? null : Documentos.telefone(bruto);
        if (t == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, MSG_TELEFONE);
        return t;
    }

    /** null = não informado; "" = em branco (apaga na edição); senão 11 dígitos válidos. */
    private static String cpfOpcional(String bruto) {
        if (bruto == null) return null;
        if (bruto.isBlank()) return "";
        if (!Documentos.cpfValido(bruto)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "CPF inválido.");
        return Documentos.digitos(bruto);
    }

    /** null = não informado; "" = em branco; senão yyyy-MM-dd real, entre 1900 e hoje. */
    private static String nascimentoOpcional(String bruto) {
        if (bruto == null) return null;
        if (bruto.isBlank()) return "";
        try {
            LocalDate d = LocalDate.parse(bruto.trim());
            if (d.isBefore(LocalDate.of(1900, 1, 1)) || d.isAfter(LocalDate.now())) throw new DateTimeParseException("fora da faixa", bruto, 0);
            return d.toString();
        } catch (DateTimeParseException ex) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Data de nascimento inválida.");
        }
    }

    /** A mensagem nunca diz de quem é o CPF ou o telefone repetido. */
    private static ErroDeNegocio duplicado(DuplicateKeyException ex) {
        String m = String.valueOf(ex.getMessage());
        if (m.contains("cliente_cpf_uq")) return new ErroDeNegocio(HttpStatus.CONFLICT, "Esse CPF já está cadastrado.");
        if (m.contains("cliente_telefone_nome_uq")) return new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe um cliente com esse nome e telefone.");
        if (m.contains("cliente_veiculo")) return new ErroDeNegocio(HttpStatus.CONFLICT, "Há placas repetidas nesse cliente.");
        return new ErroDeNegocio(HttpStatus.CONFLICT, "Já existe um registro com esses dados");
    }
}
