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
    private final br.com.agendz.interno.RegrasDaLoja regras;

    public ClienteService(LojaJdbc banco, Cifra cifra, br.com.agendz.interno.RegrasDaLoja regras) {
        this.regras = regras;
        this.banco = banco;
        this.cifra = cifra;
    }

    /** Campos que o Admin tornou obrigatórios no cadastro (só CPF e nascimento são ligáveis; telefone e nome sempre). Vale no cadastro pelo painel. */
    private void exigirCamposDaLoja(Loja loja, String cpf, String nasc) {
        List<String> obrig = regras.ler(loja.id()).cadastroObrigatorios();
        if (obrig.contains("cpf") && (cpf == null || cpf.isBlank())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o CPF: este estabelecimento exige.");
        if (obrig.contains("nascimento") && (nasc == null || nasc.isBlank())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe a data de nascimento: este estabelecimento exige.");
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
        exigirCamposDaLoja(loja, cpf, nasc);
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
                jdbc.update("update cliente set sem_nome = false, nome = ?, apelido = ?, telefone_cif = ?, telefone_hash = ?, cpf_cif = ?, cpf_hash = ?, nascimento_cif = ?, atualizado_em = now() where id = ?",
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

    private static final String PORTE_PADRAO = "medio";

    /** Placa antiga (ABC-1234) ou Mercosul (ABC1D23), só por formato. */
    private static boolean placaConfere(String bruta) {
        if (bruta == null || bruta.length() > 16) return false;
        String c = chavePlaca(bruta);
        return c.matches("^[A-Z]{3}[0-9]{4}$") || c.matches("^[A-Z]{3}[0-9][A-Z][0-9]{2}$");
    }

    /** Antiga com hífen, Mercosul junta (mesma saída de `formatarPlaca` do front). */
    private static String formatarPlaca(String bruta) {
        String c = chavePlaca(bruta);
        return c.matches("^[A-Z]{3}[0-9]{4}$") ? c.substring(0, 3) + "-" + c.substring(3) : c;
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
        for (UUID id : atuais) {
            if (mantidos.contains(id)) continue;
            // como no simulador: veículo com agendamento ativo e futuro não sai da lista (cancele ou remarque antes)
            Integer ativos = jdbc.queryForObject("select count(*) from agendamento where veiculo_id = ? and status in ('a_confirmar', 'confirmado') and inicio > now()", Integer.class, id);
            if (ativos != null && ativos > 0) {
                String placa = jdbc.queryForObject("select placa from cliente_veiculo where id = ?", String.class, id);
                throw new ErroDeNegocio(HttpStatus.CONFLICT, "O veículo " + placa + " tem agendamento ativo. Cancele ou remarque antes de removê-lo.");
            }
            jdbc.update("delete from cliente_veiculo where id = ?", id);
        }
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

    // ---------- veículo do atendimento ----------

    /** O veículo como ficou no agendamento (a "foto"): `veiculoId` é o do cadastro do cliente, ou null se o atendimento é de balcão sem cadastro. */
    public record VeiculoDoAgendamento(UUID veiculoId, String placa, String marca, String modelo, String cor, String porte) {
    }

    private static VeiculoDoAgendamento foto(Veiculo v) {
        return new VeiculoDoAgendamento(v.id(), v.placa(), v.marca(), v.modelo(), v.cor(), v.porte());
    }

    /**
     * Veículo do atendimento (espelho de `resolverVeiculo`/`gravarVeiculo`, src/domain/engine.js): um do cadastro do cliente (`veiculoId`), o único do cliente quando nada foi
     * informado, ou um novo (`novo`: placa, modelo, porte…), que entra no cadastro se o cliente existe (placa que ele já tem vale o existente). Sem cliente (balcão) fica só a foto.
     * Tipo sem veículo (barbearia) devolve null. Roda na transação do atendimento: se o horário for recusado depois, o veículo novo volta atrás junto.
     */
    /** Regra antiga: tudo do veículo é obrigatório (painel `POST /api/agendamentos`, chat). */
    public static final Set<String> EXIGE_TUDO_DO_VEICULO = Set.of("veiculo", "placa", "modelo", "porte");
    public static final Set<String> CAMPOS_DO_VEICULO = EXIGE_TUDO_DO_VEICULO;

    public VeiculoDoAgendamento resolverVeiculo(JdbcTemplate jdbc, Loja loja, UUID clienteId, UUID veiculoId, EntradaVeiculo novo) {
        return resolverVeiculo(jdbc, loja, clienteId, veiculoId, novo, EXIGE_TUDO_DO_VEICULO);
    }

    private static boolean vazio(String s) {
        return s == null || s.isBlank();
    }

    /**
     * v121: `exigir` diz o que é obrigatório (`veiculo`, `placa`, `modelo`, `porte`). O que for informado sempre é conferido; o que não for exigido pode faltar.
     * Nada informado e nada exigido = null (atendimento sem veículo, preço e duração do porte médio). Sem placa válida ou sem modelo, o veículo vale só como foto
     * do atendimento (não entra no cadastro do cliente). Sem porte, vale o médio.
     */
    public VeiculoDoAgendamento resolverVeiculo(JdbcTemplate jdbc, Loja loja, UUID clienteId, UUID veiculoId, EntradaVeiculo novo, Set<String> exigir) {
        if (!br.com.agendz.tenant.Capacidades.usaVeiculo(loja)) return null;
        List<Veiculo> doCliente = clienteId == null ? List.of() : veiculosDe(jdbc, clienteId);
        if (veiculoId != null) {
            return foto(doCliente.stream().filter(x -> x.id().equals(veiculoId)).findFirst().orElseThrow(() -> new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Veículo não encontrado.")));
        }
        boolean informado = novo != null && (!vazio(novo.placa()) || !vazio(novo.marca()) || !vazio(novo.modelo()) || !vazio(novo.cor()) || !vazio(novo.porte()));
        if (!informado) {
            if (doCliente.size() == 1) return foto(doCliente.get(0));
            if (exigir.stream().anyMatch(CAMPOS_DO_VEICULO::contains)) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o veículo do atendimento.");
            return null;
        }
        String placaBruta = vazio(novo.placa()) ? "" : novo.placa().trim();
        if (placaBruta.isEmpty() ? exigir.contains("placa") : !placaConfere(placaBruta)) {
            throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, placaBruta.isEmpty() ? "Informe a placa do veículo." : "Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23).");
        }
        String modeloLimpo = vazio(novo.modelo()) ? "" : br.com.agendz.validacao.Texto.limpar(novo.modelo());
        if (exigir.contains("modelo") ? modeloLimpo.length() < 2 : modeloLimpo.length() == 1) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o modelo do veículo.");
        if (modeloLimpo.length() > 40) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o modelo do veículo.");
        if (vazio(novo.porte()) ? exigir.contains("porte") : !PORTES.contains(novo.porte())) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Escolha o porte do veículo.");
        String porte = vazio(novo.porte()) ? PORTE_PADRAO : novo.porte();
        if (placaBruta.isEmpty() || modeloLimpo.length() < 2) {
            // incompleto: só a foto do atendimento
            String marca = vazio(novo.marca()) ? "" : br.com.agendz.validacao.Texto.limpar(novo.marca());
            String cor = vazio(novo.cor()) ? "" : br.com.agendz.validacao.Texto.limpar(novo.cor());
            if (marca.length() > 30 || cor.length() > 20) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Dados do veículo inválidos.");
            return new VeiculoDoAgendamento(null, placaBruta.isEmpty() ? "" : formatarPlaca(placaBruta), marca, modeloLimpo, cor, porte);
        }
        Veiculo limpo = veiculosValidos(List.of(new EntradaVeiculo(null, novo.placa(), novo.marca(), novo.modelo(), novo.cor(), porte))).get(0);
        String chave = chavePlaca(limpo.placa());
        for (Veiculo x : doCliente) if (chavePlaca(x.placa()).equals(chave)) return foto(x);
        if (clienteId == null) return new VeiculoDoAgendamento(null, limpo.placa(), limpo.marca(), limpo.modelo(), limpo.cor(), limpo.porte());
        if (doCliente.size() >= LIMITE_VEICULOS) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O cliente já tem " + LIMITE_VEICULOS + " veículos cadastrados.");
        UUID id = jdbc.queryForObject("insert into cliente_veiculo (loja_id, cliente_id, placa, placa_chave, marca, modelo, cor, porte, ordem) values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?) returning id",
                UUID.class, loja.id().toString(), clienteId, limpo.placa(), chave, limpo.marca(), limpo.modelo(), limpo.cor(), limpo.porte(), doCliente.size());
        return new VeiculoDoAgendamento(id, limpo.placa(), limpo.marca(), limpo.modelo(), limpo.cor(), limpo.porte());
    }

    // ---------- cliente de um atendimento (Atender) ----------

    /** Resultado: cadastro escolhido/achado/criado (`clienteId`) ou, sem telefone, só o nome digitado (`nomeAvulso`, sem cadastro). */
    public record DoAtendimento(UUID clienteId, String nomeAvulso) {
    }

    private record Candidato(UUID id, String nome, String apelido, boolean semNome, String telefoneHash) {
    }

    /**
     * Espelho de `resolverClienteDoAtendimento` (src/domain/engine.js). Roda dentro da transação do chamador (`jdbc` já na loja):
     * - telefone que já tem cadastro vale mais que o cliente escolhido na lista (com vários no mesmo número: o de mesmo nome ou apelido; senão o primeiro);
     * - telefone novo cria o cadastro (sem nome, o nome fica igual ao telefone até alguém informar um);
     * - só nome, sem telefone: não cria cadastro.
     * Nome digitado MAIS COMPLETO que o do cadastro atualiza o cadastro; cadastro sem nome recebe o digitado.
     */
    public DoAtendimento resolverDoAtendimento(JdbcTemplate jdbc, String nomeBruto, String telefoneBruto, UUID clienteId) {
        Loja loja = LojaContext.exigir();
        String tel = null;
        if (telefoneBruto != null && !telefoneBruto.isBlank()) {
            tel = Documentos.telefone(telefoneBruto);
            if (tel == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Telefone com DDD e número (10 ou 11 dígitos).");
        }
        String nomeInf = nomeBruto == null ? "" : Texto.limpar(nomeBruto);
        if (nomeInf.length() > 60) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O nome pode ter até 60 letras.");
        String hash = tel == null ? null : cifra.hash(loja.id(), "tel", tel);
        if (clienteId != null) {
            List<Candidato> achados = jdbc.query("select id, nome, apelido, sem_nome, telefone_hash from cliente where id = ? for update", (rs, i) -> candidato(rs), clienteId);
            if (achados.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Cliente não encontrado.");
            Candidato c = achados.get(0);
            // telefone digitado de OUTRO cadastro sobrescreve a escolha da lista; vazio ou do próprio cliente mantém a escolha
            if (tel == null || c.telefoneHash().equals(hash)) {
                atualizarNome(jdbc, c, nomeInf);
                return new DoAtendimento(c.id(), null);
            }
        }
        if (tel == null) return new DoAtendimento(null, nomeInf);
        List<Candidato> doNumero = jdbc.query("select id, nome, apelido, sem_nome, telefone_hash from cliente where telefone_hash = ? order by criado_em, id for update",
                (rs, i) -> candidato(rs), hash);
        Candidato achado = null;
        if (!nomeInf.isEmpty()) {
            String n = nomeInf.toLowerCase(Locale.ROOT);
            for (Candidato c : doNumero) {
                if (c.nome().toLowerCase(Locale.ROOT).equals(n) || c.apelido().toLowerCase(Locale.ROOT).equals(n)) { achado = c; break; }
            }
            if (achado == null) {
                for (Candidato c : doNumero) {
                    if (nomeMaisCompleto(c.nome(), nomeInf)) { achado = c; break; }
                }
            }
        }
        if (achado == null && !doNumero.isEmpty()) achado = doNumero.get(0);
        if (achado != null) {
            atualizarNome(jdbc, achado, nomeInf);
            return new DoAtendimento(achado.id(), null);
        }
        try {
            UUID novo = jdbc.queryForObject(
                    "insert into cliente (loja_id, nome, telefone_cif, telefone_hash, sem_nome, origem_cadastro) values (?::uuid, ?, ?, ?, ?, 'atendimento') returning id",
                    UUID.class, loja.id().toString(), nomeInf.isEmpty() ? telefoneFormatado(tel) : nomeInf, cifra.cifrar(tel), hash, nomeInf.isEmpty());
            return new DoAtendimento(novo, null);
        } catch (DuplicateKeyException ex) {
            throw duplicado(ex);
        }
    }

    public record DoLink(UUID clienteId, boolean criado) {
    }

    /**
     * Cliente de quem agenda pelo link (sem login). Telefone existente manda: acha o cadastro do número (nome igual, ou nome mais completo, ou o mais antigo)
     * e NÃO altera nada nele, porque quem digita no link não é conferido (outra pessoa não pode renomear um cliente). Número novo cria o cadastro com `origem_cadastro = 'link'`.
     * Chamar dentro de `naLoja` e depois de travar os profissionais (a trava serializa os pedidos da loja, então dois pedidos iguais não criam o cadastro duas vezes).
     */
    public DoLink resolverDoLink(JdbcTemplate jdbc, String nomeBruto, String telefoneBruto) {
        Loja loja = LojaContext.exigir();
        String tel = Documentos.telefone(telefoneBruto);
        if (tel == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o telefone com DDD.");
        String nome = nomeBruto == null ? "" : Texto.limpar(nomeBruto).trim();
        if (nome.length() == 1) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe o seu nome."); // em branco só chega aqui se o dono tirou a obrigatoriedade (v121)
        if (nome.length() > 60) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O nome pode ter até 60 letras.");
        String hash = cifra.hash(loja.id(), "tel", tel);
        List<Candidato> doNumero = jdbc.query("select id, nome, apelido, sem_nome, telefone_hash from cliente where telefone_hash = ? order by criado_em, id",
                (rs, i) -> candidato(rs), hash);
        if (!doNumero.isEmpty()) {
            String n = nome.toLowerCase(Locale.ROOT);
            Candidato achado = null;
            for (Candidato c : doNumero) {
                if (c.nome().toLowerCase(Locale.ROOT).equals(n) || c.apelido().toLowerCase(Locale.ROOT).equals(n)) { achado = c; break; }
            }
            if (achado == null) {
                for (Candidato c : doNumero) {
                    if (nomeMaisCompleto(c.nome(), nome)) { achado = c; break; }
                }
            }
            return new DoLink((achado == null ? doNumero.get(0) : achado).id(), false);
        }
        try {
            UUID novo = jdbc.queryForObject(
                    "insert into cliente (loja_id, nome, telefone_cif, telefone_hash, sem_nome, origem_cadastro) values (?::uuid, ?, ?, ?, ?, 'link') returning id",
                    UUID.class, loja.id().toString(), nome.isEmpty() ? telefoneFormatado(tel) : nome, cifra.cifrar(tel), hash, nome.isEmpty());
            return new DoLink(novo, true);
        } catch (DuplicateKeyException ex) {
            throw duplicado(ex);
        }
    }

    private static Candidato candidato(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Candidato(rs.getObject("id", UUID.class), rs.getString("nome"), rs.getString("apelido"), rs.getBoolean("sem_nome"), rs.getString("telefone_hash"));
    }

    private static void atualizarNome(JdbcTemplate jdbc, Candidato c, String nomeInf) {
        if (nomeInf.isEmpty()) return;
        if (c.semNome()) {
            jdbc.update("update cliente set nome = ?, sem_nome = false, atualizado_em = now() where id = ?", nomeInf, c.id());
        } else if (nomeMaisCompleto(c.nome(), nomeInf)) {
            jdbc.update("update cliente set nome = ?, atualizado_em = now() where id = ?", nomeInf, c.id());
        }
    }

    private static String semAcento(String x) {
        String n = java.text.Normalizer.normalize(x == null ? "" : x, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    /** "João" → "João Silva": o novo é mais longo e cada palavra do antigo começa alguma palavra do novo. */
    static boolean nomeMaisCompleto(String antigo, String novo) {
        String a = semAcento(antigo), n = semAcento(novo);
        if (a.isEmpty() || n.length() <= a.length()) return false;
        String[] palavrasNovo = n.split(" ");
        for (String w : a.split(" ")) {
            boolean achou = false;
            for (String x : palavrasNovo) {
                if (x.startsWith(w)) { achou = true; break; }
            }
            if (!achou) return false;
        }
        return true;
    }

    /** "5553999000001" → "(53) 99900-0001". */
    static String telefoneFormatado(String tel55) {
        String r = tel55.substring(2);
        String ddd = r.substring(0, 2), num = r.substring(2);
        int corte = num.length() - 4;
        return "(" + ddd + ") " + num.substring(0, corte) + "-" + num.substring(corte);
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
