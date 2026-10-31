package br.com.agendz.agenda;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.aviso.AvisosPainel;
import br.com.agendz.planos.FixosDoPlano;
import br.com.agendz.planos.FixosDoPlano.Fixo;
import br.com.agendz.planos.PlanoService;
import br.com.agendz.tenant.Capacidades;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import static br.com.agendz.escala.Fuso.BRASIL;

/**
 * Horários fixos do assinante de um plano (v128; espelho de `definirFixos` e `materializarFixos` em src/domain/assinaturas.js).
 * - {@link #definir}: até 3 por assinatura (dia da semana + hora + profissional + serviços do plano); troca a lista inteira. Quem saiu perde os agendamentos futuros ainda não realizados.
 * - {@link #materializar}: no minuto da automação cria o agendamento de cada fixo dos próximos 14 dias, em ordem de data (o atendimento do plano é gasto na ordem), pelo mesmo
 *   caminho de qualquer agendamento, sem duplicar (o banco garante: um agendamento por fixo e dia). Ocupado por outro, sem atendimento ou sem mensalidade: não cria e avisa o painel,
 *   uma vez por ocorrência. Cada ocorrência roda na própria transação, então uma recusa nunca deixa nada pela metade.
 * A reserva do horário (ninguém mais toma) fica no AgendaController (`conferirFixoReservado`).
 */
@Component
public class HorariosFixos {

    private static final Logger LOG = LoggerFactory.getLogger(HorariosFixos.class);

    public static final int MAX_FIXOS = 3;
    public static final int DIAS_A_FRENTE = 14;
    private static final int SEMANAS_PROCURA = 6; // ao salvar, procura a hora do fixo em até 6 semanas (um feriado ou folga não derruba o cadastro)
    private static final String[] DIAS = {"domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"};
    private static final Pattern HM = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");
    private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    public record Entrada(Integer dia, String hm, UUID profissionalId, List<UUID> servicoIds, UUID veiculoId) {
    }

    public record Pedido(List<Entrada> fixos) {
    }

    public record Resposta(PlanoService.AssinaturaDto assinatura, int apagados) {
    }

    private record Candidato(UUID assinaturaId, UUID clienteId, Fixo fixo, LocalDate data, Instant inicio) {
    }

    private final LojaJdbc banco;
    private final JdbcTemplate dono;
    private final Clock relogio;
    private final ObjectMapper json;
    private final AgendaController agenda;
    private final Ocupacao ocupacao;
    private final PlanoService planos;

    public HorariosFixos(LojaJdbc banco, JdbcTemplate dono, Clock relogio, ObjectMapper json, AgendaController agenda, Ocupacao ocupacao, PlanoService planos) {
        this.banco = banco;
        this.dono = dono;
        this.relogio = relogio;
        this.json = json;
        this.agenda = agenda;
        this.ocupacao = ocupacao;
        this.planos = planos;
    }

    private static ErroDeNegocio recusa(String mensagem) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, mensagem);
    }

    private static ErroDeNegocio conflito(String mensagem) {
        return new ErroDeNegocio(HttpStatus.CONFLICT, mensagem);
    }

    // ---------------------------------------------------------------- definir

    /** POST /api/assinaturas/{id}/fixos: troca a lista inteira. */
    public Resposta definir(UUID assinaturaId, List<Entrada> bruto, PlanoService.Autor autor) {
        Instant agora = relogio.instant();
        Loja loja = LojaContext.exigir();
        List<Entrada> lista = bruto == null ? List.of() : bruto;
        int apagados = banco.naLoja(jdbc -> gravar(jdbc, loja, assinaturaId, lista, autor, agora));
        return new Resposta(planos.assinatura(assinaturaId, agora), apagados);
    }

    private int gravar(JdbcTemplate jdbc, Loja loja, UUID assinaturaId, List<Entrada> bruto, PlanoService.Autor autor, Instant agora) {
        List<Map<String, Object>> linhas = jdbc.queryForList("select cliente_id, status, plano_foto::text as foto from assinatura where id = ? for update", assinaturaId);
        if (linhas.isEmpty()) throw new ErroDeNegocio(HttpStatus.NOT_FOUND, "Assinatura não encontrada.");
        if ("cancelada".equals(linhas.get(0).get("status"))) throw conflito("Essa assinatura foi encerrada.");
        UUID clienteId = (UUID) linhas.get(0).get("cliente_id");
        Set<UUID> doPlano = new HashSet<>();
        int intervaloDias;
        try {
            JsonNode foto = json.readTree((String) linhas.get(0).get("foto"));
            for (JsonNode x : foto.path("servicoIds")) doPlano.add(UUID.fromString(x.asText()));
            intervaloDias = foto.path("intervaloDias").asInt(0);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw new IllegalStateException("plano_foto ilegível na assinatura " + assinaturaId);
        }

        // forma da lista
        if (bruto.size() > MAX_FIXOS) throw recusa("No máximo " + MAX_FIXOS + " horários fixos por semana.");
        List<Fixo> novos = new ArrayList<>();
        List<UUID> veiculosDoCliente = Capacidades.usaVeiculo(loja)
                ? jdbc.queryForList("select id from cliente_veiculo where cliente_id = ? order by ordem, criado_em, id", UUID.class, clienteId) : List.of();
        for (Entrada e : bruto) {
            if (e == null) throw recusa("Horário fixo inválido.");
            if (e.dia() == null || e.dia() < 0 || e.dia() > 6) throw recusa("Escolha o dia da semana do horário fixo.");
            if (e.hm() == null || !HM.matcher(e.hm()).matches()) throw recusa("Informe a hora do horário fixo (HH:MM).");
            if (e.profissionalId() == null) throw recusa("Escolha quem atende o horário fixo.");
            List<UUID> ids = e.servicoIds();
            if (ids == null || ids.isEmpty() || ids.size() > 10 || ids.contains(null) || new HashSet<>(ids).size() != ids.size()) throw recusa("Escolha de 1 a 10 serviços do plano para o horário fixo.");
            if (novos.stream().anyMatch(x -> x.dia() == e.dia() && x.hm().equals(e.hm()))) throw recusa("Há dois horários fixos no mesmo dia e hora.");
            UUID veiculo = null;
            if (Capacidades.usaVeiculo(loja)) { // o fixo leva o veículo do cliente (o único que ele tem, ou o escolhido); o plano em si nunca depende de veículo, porte ou box
                if (e.veiculoId() != null) {
                    if (!veiculosDoCliente.contains(e.veiculoId())) throw recusa("Veículo não encontrado nesse cliente.");
                    veiculo = e.veiculoId();
                } else if (veiculosDoCliente.size() == 1) {
                    veiculo = veiculosDoCliente.get(0);
                } else {
                    throw recusa("Escolha o veículo do horário fixo.");
                }
            }
            novos.add(new Fixo(null, e.dia(), e.hm(), e.profissionalId(), List.copyOf(ids), veiculo));
        }

        // cada fixo: quem atende, serviços do plano e ativos, e um dia em que o profissional realmente atende nessa hora
        LocalDate hoje = agora.atZone(BRASIL).toLocalDate();
        for (Fixo f : novos) {
            Integer atende = jdbc.queryForObject("select count(*) from usuario where id = ? and atende and ativo", Integer.class, f.profissionalId());
            if (atende == null || atende == 0) throw recusa("Escolha quem atende o horário fixo.");
            if (!doPlano.containsAll(f.servicoIds())) throw recusa("Os serviços do horário fixo precisam ser serviços do plano.");
            for (UUID s : f.servicoIds()) {
                Integer ativo = jdbc.queryForObject("select count(*) from servico where id = ? and ativo", Integer.class, s);
                if (ativo == null || ativo == 0) throw recusa("Serviço não encontrado ou desativado.");
            }
            boolean achou = false;
            LocalDate dia = proximoDia(f.dia(), hoje);
            for (int k = 0; k < SEMANAS_PROCURA && !achou; k++, dia = dia.plusDays(7)) {
                achou = agenda.planoDoFixo(jdbc, loja, f.profissionalId(), inicioDe(dia, f.hm()), f.servicoIds(), clienteId, f.veiculoId()) != null;
            }
            if (!achou) throw recusa(nomeDe(jdbc, f.profissionalId()) + " não atende " + DIAS[f.dia()] + " às " + f.hm() + ".");
        }

        // o plano pede dias entre um atendimento e outro
        if (intervaloDias > 0 && novos.size() > 1 && menorDistancia(novos) < intervaloDias) {
            throw recusa("O plano pede " + intervaloDias + " dia" + (intervaloDias > 1 ? "s" : "") + " entre um atendimento e outro: afaste os horários fixos.");
        }

        // dois fixos (deste ou de outro assinante) nunca ocupam o mesmo profissional ao mesmo tempo
        List<Fixo> outros = new ArrayList<>();
        List<UUID> clientesDosOutros = new ArrayList<>();
        jdbc.query("select f.id, f.dia, f.hm, f.profissional_id, f.servicos, f.veiculo_id, a.cliente_id from assinatura_fixo f join assinatura a on a.id = f.assinatura_id "
                + "where a.status = 'ativa' and a.id <> ?", rs -> {
                    outros.add(new Fixo(rs.getObject("id", UUID.class), rs.getInt("dia"), rs.getString("hm"), rs.getObject("profissional_id", UUID.class),
                            FixosDoPlano.separa(rs.getString("servicos")), rs.getObject("veiculo_id", UUID.class)));
                    clientesDosOutros.add(rs.getObject("cliente_id", UUID.class));
                }, assinaturaId);
        for (int i = 0; i < novos.size(); i++) {
            for (int j = i + 1; j < novos.size(); j++) {
                if (choca(jdbc, loja, hoje, novos.get(i), clienteId, novos.get(j), clienteId)) throw recusa("Dois horários fixos desse plano se sobrepõem.");
            }
            for (int j = 0; j < outros.size(); j++) {
                if (choca(jdbc, loja, hoje, novos.get(i), clienteId, outros.get(j), clientesDosOutros.get(j))) throw conflito("Esse horário já é fixo de outro assinante. Escolha outro.");
            }
        }

        // troca a lista: o que continua igual mantém o id (e os agendamentos já criados); o que saiu perde os futuros; o que entrou nasce agora
        List<Fixo> antigos = FixosDoPlano.da(jdbc, assinaturaId);
        List<Fixo> finais = new ArrayList<>();
        int apagados = 0;
        for (Fixo a : antigos) {
            if (novos.stream().noneMatch(f -> igual(a, f))) {
                apagados += FixosDoPlano.apagarFuturos(jdbc, assinaturaId, a.id(), agora);
                jdbc.update("delete from assinatura_fixo where id = ?", a.id());
            }
        }
        for (Fixo f : novos) {
            if (antigos.stream().noneMatch(a -> igual(a, f))) {
                jdbc.update("insert into assinatura_fixo (loja_id, assinatura_id, dia, hm, profissional_id, servicos, veiculo_id) values (?::uuid, ?, ?, ?, ?, ?, ?)",
                        loja.id().toString(), assinaturaId, f.dia(), f.hm(), f.profissionalId(), FixosDoPlano.junta(f.servicoIds()), f.veiculoId());
            }
            finais.add(f);
        }
        StringBuilder resumo = new StringBuilder();
        for (Fixo f : finais.stream().sorted(Comparator.comparingInt(Fixo::dia).thenComparing(Fixo::hm)).toList()) {
            resumo.append(resumo.length() == 0 ? "" : ", ").append(DIAS[f.dia()], 0, 3).append(' ').append(f.hm());
        }
        planos.anotar(jdbc, loja.id(), assinaturaId, autor, "horários fixos", finais.isEmpty() ? "nenhum" : resumo.toString(), agora);
        return apagados;
    }

    private static boolean igual(Fixo a, Fixo b) {
        return a.dia() == b.dia() && a.hm().equals(b.hm()) && a.profissionalId().equals(b.profissionalId()) && new HashSet<>(a.servicoIds()).equals(new HashSet<>(b.servicoIds()))
                && java.util.Objects.equals(a.veiculoId(), b.veiculoId());
    }

    /** Menor distância, em dias, entre duas ocorrências de fixos diferentes na semana que se repete (mesmo dia da semana = 0). */
    private static int menorDistancia(List<Fixo> fixos) {
        int min = Integer.MAX_VALUE;
        for (int i = 0; i < fixos.size(); i++) {
            for (int j = i + 1; j < fixos.size(); j++) {
                int d = Math.abs(fixos.get(i).dia() - fixos.get(j).dia());
                min = Math.min(min, Math.min(d, 7 - d));
            }
        }
        return min;
    }

    private boolean choca(JdbcTemplate jdbc, Loja loja, LocalDate hoje, Fixo a, UUID clienteA, Fixo b, UUID clienteB) {
        if (!a.profissionalId().equals(b.profissionalId()) || a.dia() != b.dia()) return false;
        LocalDate dia = proximoDia(a.dia(), hoje);
        Ocupacao.Plano oa = agenda.planoDoFixo(jdbc, loja, a.profissionalId(), inicioDe(dia, a.hm()), a.servicoIds(), clienteA, a.veiculoId());
        Ocupacao.Plano ob = agenda.planoDoFixo(jdbc, loja, b.profissionalId(), inicioDe(dia, b.hm()), b.servicoIds(), clienteB, b.veiculoId());
        if (oa == null || ob == null) return false;
        for (Instant[] x : oa.doProfissional()) {
            for (Instant[] y : ob.doProfissional()) {
                if (x[0].isBefore(y[1]) && y[0].isBefore(x[1])) return true;
            }
        }
        return false;
    }

    private static LocalDate proximoDia(int diaSemana, LocalDate de) {
        LocalDate d = de;
        for (int n = 0; n < 8; n++, d = d.plusDays(1)) if (d.getDayOfWeek().getValue() % 7 == diaSemana) return d;
        return de;
    }

    private static Instant inicioDe(LocalDate dia, String hm) {
        return dia.atTime(LocalTime.parse(hm)).atZone(BRASIL).toInstant();
    }

    private static String nomeDe(JdbcTemplate jdbc, UUID usuarioId) {
        return jdbc.queryForObject("select coalesce(nullif(apelido, ''), nome) from usuario where id = ?", String.class, usuarioId);
    }

    // ---------------------------------------------------------------- materializar (minuto da automação)

    /** Cria o que falta dos horários fixos de uma loja nos próximos 14 dias. Devolve quantos agendamentos nasceram. */
    public int materializar(UUID lojaId, Instant agora) {
        Loja loja = dono.query("select id, slug, nome, tipo, logo, tema_cor, tema_cor2 from loja where id = ?",
                (rs, i) -> new Loja(rs.getObject("id", UUID.class), rs.getString("slug"), rs.getString("nome"), rs.getString("tipo"), rs.getString("logo"), rs.getString("tema_cor"), rs.getString("tema_cor2")),
                lojaId).stream().findFirst().orElse(null);
        if (loja == null) return 0;
        List<Candidato> lista = banco.naLoja(lojaId, jdbc -> candidatos(jdbc, agora));
        int criados = 0;
        for (Candidato c : lista) {
            try {
                Boolean criou = banco.naLoja(lojaId, jdbc -> criar(jdbc, loja, c));
                if (Boolean.TRUE.equals(criou)) criados++;
            } catch (ErroDeNegocio e) {
                String motivo = e.getMessage();
                banco.naLoja(lojaId, jdbc -> avisar(jdbc, loja, c, motivo, agora));
            } catch (DataIntegrityViolationException e) {
                // o par (fixo, dia) já existe: outro minuto (ou outra instância) criou primeiro
            } catch (RuntimeException e) {
                LOG.warn("Horário fixo {} em {} falhou na loja {}: {}", c.fixo().id(), c.data(), lojaId, e.getMessage()); // nunca derruba as outras ocorrências
            }
        }
        banco.naLoja(lojaId, jdbc -> jdbc.update("delete from assinatura_fixo_aviso where criado_em < now() - interval '60 days'"));
        return criados;
    }

    private List<Candidato> candidatos(JdbcTemplate jdbc, Instant agora) {
        List<Candidato> lista = new ArrayList<>();
        List<Map<String, Object>> fixos = jdbc.queryForList("select f.id, f.assinatura_id, a.cliente_id, f.dia, f.hm, f.profissional_id, f.servicos, f.veiculo_id "
                + "from assinatura_fixo f join assinatura a on a.id = f.assinatura_id where a.status = 'ativa'");
        if (fixos.isEmpty()) return lista;
        LocalDate hoje = agora.atZone(BRASIL).toLocalDate();
        Instant limite = agora.plus(Duration.ofDays(DIAS_A_FRENTE));
        for (Map<String, Object> f : fixos) {
            Fixo fixo = new Fixo((UUID) f.get("id"), ((Number) f.get("dia")).intValue(), (String) f.get("hm"), (UUID) f.get("profissional_id"), FixosDoPlano.separa((String) f.get("servicos")), (UUID) f.get("veiculo_id"));
            for (int k = 0; k <= DIAS_A_FRENTE; k++) {
                LocalDate dia = hoje.plusDays(k);
                if (dia.getDayOfWeek().getValue() % 7 != fixo.dia()) continue;
                Instant t = inicioDe(dia, fixo.hm());
                if (!t.isAfter(agora) || t.isAfter(limite)) continue;
                Integer feito = jdbc.queryForObject("select count(*) from agendamento where fixo_id = ? and fixo_data = ?", Integer.class, fixo.id(), java.sql.Date.valueOf(dia));
                if (feito != null && feito > 0) continue; // já criado (ou cancelado de propósito): nunca recria nem duplica
                lista.add(new Candidato((UUID) f.get("assinatura_id"), (UUID) f.get("cliente_id"), fixo, dia, t));
            }
        }
        lista.sort(Comparator.comparing(Candidato::inicio));
        return lista;
    }

    private Boolean criar(JdbcTemplate jdbc, Loja loja, Candidato c) {
        Fixo f = c.fixo();
        Ocupacao.Plano plano = agenda.planoDoFixo(jdbc, loja, f.profissionalId(), c.inicio(), f.servicoIds(), c.clienteId(), f.veiculoId());
        if (plano == null) throw conflito("o profissional não atende nesse horário.");
        if (!ocupacao.conflitos(jdbc, f.profissionalId(), new UUID(0, 0), plano).isEmpty()) throw conflito("o horário já está ocupado por outro cliente.");
        agenda.criarDoFixo(jdbc, loja, c.clienteId(), f.profissionalId(), f.servicoIds(), c.inicio(), f.veiculoId(), c.assinaturaId(), f.id(), c.data());
        return Boolean.TRUE;
    }

    private Boolean avisar(JdbcTemplate jdbc, Loja loja, Candidato c, String motivo, Instant agora) {
        String chave = c.fixo().id() + ":" + c.data();
        int n = jdbc.update("insert into assinatura_fixo_aviso (loja_id, assinatura_id, chave) values (?::uuid, ?, ?) on conflict do nothing", loja.id().toString(), c.assinaturaId(), chave);
        if (n == 0) return Boolean.FALSE; // uma vez por ocorrência
        String nome = jdbc.queryForObject("select coalesce(nullif(apelido, ''), nome) from cliente where id = ?", String.class, c.clienteId());
        String frase = motivo == null || motivo.isBlank() ? "não foi possível agendar" : motivo.substring(0, 1).toUpperCase() + motivo.substring(1);
        String texto = "Horário fixo de " + nome + " em " + DATA.format(c.data()) + " (" + DIAS[c.fixo().dia()] + ") às " + c.fixo().hm() + " não foi criado. " + frase + (frase.matches(".*[.!?]$") ? "" : ".");
        AvisosPainel.criar(jdbc, loja.id(), null, c.fixo().profissionalId(), "fixo", texto);
        planos.anotar(jdbc, loja.id(), c.assinaturaId(), null, "horário fixo", texto, agora);
        return Boolean.TRUE;
    }
}
