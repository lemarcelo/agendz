package br.com.agendz.escala;

import br.com.agendz.erro.ErroDeNegocio;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Expediente da loja e escala do profissional (docs/MAPA-API-SPRING.md, seção 4). Semana: dias 0 (domingo) a 6; cada dia aberto tem de 1 a 6 faixas
 * "HH:MM"–"HH:MM" sem sobreposição. Um atendimento só cabe se estiver INTEIRO dentro de uma faixa da loja E de uma faixa do profissional (se ele tiver escala própria).
 * Sem nenhuma faixa da loja cadastrada, nada é restringido (loja ainda sem expediente). Todas as funções rodam dentro de `LojaJdbc.naLoja` (RLS).
 * Fica para a próxima fatia: exceções (feriado, folga, período fora, horário diferente).
 */
@Component
public class EscalaService {

    public record Faixa(int ini, int fim) {
    }

    /** Um dia no JSON: `faixas` é uma lista de pares ["09:00","12:00"]. Dia fechado ignora as faixas. */
    public record Dia(boolean aberto, List<List<String>> faixas) {
    }

    public record Escala(Map<Integer, Dia> semana) {
    }

    private static final Pattern HORA = Pattern.compile("^(?:[01]\\d|2[0-3]):[0-5]\\d$");
    private static final int MAX_FAIXAS = 6;

    static int minutos(String texto) {
        if ("24:00".equals(texto)) return 1440;
        if (texto == null || !HORA.matcher(texto).matches()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Horário inválido: use HH:MM");
        return Integer.parseInt(texto.substring(0, 2)) * 60 + Integer.parseInt(texto.substring(3, 5));
    }

    static String texto(int minutos) {
        return String.format("%02d:%02d", minutos / 60, minutos % 60);
    }

    /** Valida e normaliza (faixas ordenadas). Devolve sempre os 7 dias; dia ausente ou fechado = sem faixas. */
    public static Map<Integer, List<Faixa>> validar(Escala e) {
        Map<Integer, List<Faixa>> saida = vazia();
        if (e == null || e.semana() == null) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Informe a semana");
        for (Map.Entry<Integer, Dia> entrada : e.semana().entrySet()) {
            Integer dia = entrada.getKey();
            if (dia == null || dia < 0 || dia > 6) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Dia da semana inválido (0 a 6)");
            Dia d = entrada.getValue();
            if (d == null || !d.aberto()) continue;
            List<List<String>> bruto = d.faixas() == null ? List.of() : d.faixas();
            if (bruto.isEmpty()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Dia aberto precisa de ao menos um horário");
            if (bruto.size() > MAX_FAIXAS) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "No máximo " + MAX_FAIXAS + " faixas por dia");
            List<Faixa> faixas = new ArrayList<>();
            for (List<String> par : bruto) {
                if (par == null || par.size() != 2) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "Cada faixa tem início e fim");
                int ini = minutos(par.get(0));
                int fim = minutos(par.get(1));
                if (ini >= fim) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "O início da faixa precisa ser antes do fim");
                faixas.add(new Faixa(ini, fim));
            }
            faixas.sort(Comparator.comparingInt(Faixa::ini));
            for (int i = 1; i < faixas.size(); i++) {
                if (faixas.get(i).ini() < faixas.get(i - 1).fim()) throw new ErroDeNegocio(HttpStatus.BAD_REQUEST, "As faixas do mesmo dia não podem se sobrepor");
            }
            saida.put(dia, faixas);
        }
        return saida;
    }

    private static Map<Integer, List<Faixa>> vazia() {
        Map<Integer, List<Faixa>> m = new LinkedHashMap<>();
        for (int d = 0; d < 7; d++) m.put(d, new ArrayList<>());
        return m;
    }

    public static boolean temFaixa(Map<Integer, List<Faixa>> semana) {
        return semana.values().stream().anyMatch((l) -> !l.isEmpty());
    }

    public static Escala paraJson(Map<Integer, List<Faixa>> semana) {
        Map<Integer, Dia> m = new LinkedHashMap<>();
        for (int d = 0; d < 7; d++) {
            List<Faixa> fs = semana.getOrDefault(d, List.of());
            m.put(d, new Dia(!fs.isEmpty(), fs.stream().map((f) -> List.of(texto(f.ini()), texto(f.fim()))).toList()));
        }
        return new Escala(m);
    }

    /** Escala gravada: do profissional (`usuarioId`) ou a da loja (`null`). */
    public Map<Integer, List<Faixa>> ler(JdbcTemplate jdbc, UUID usuarioId) {
        Map<Integer, List<Faixa>> saida = vazia();
        String sql = "select dia, ini_min, fim_min from escala_faixa where usuario_id " + (usuarioId == null ? "is null" : "= ?") + " order by dia, ini_min";
        Object[] args = usuarioId == null ? new Object[0] : new Object[]{usuarioId};
        jdbc.query(sql, (rs) -> {
            saida.get(rs.getInt("dia")).add(new Faixa(rs.getInt("ini_min"), rs.getInt("fim_min")));
        }, args);
        return saida;
    }

    /** Troca a escala inteira (apaga e grava de novo na mesma transação). Semana sem faixa nenhuma só apaga. */
    public void gravar(JdbcTemplate jdbc, UUID lojaId, UUID usuarioId, Map<Integer, List<Faixa>> semana) {
        if (usuarioId == null) jdbc.update("delete from escala_faixa where usuario_id is null");
        else jdbc.update("delete from escala_faixa where usuario_id = ?", usuarioId);
        for (Map.Entry<Integer, List<Faixa>> e : semana.entrySet()) {
            for (Faixa f : e.getValue()) {
                jdbc.update("insert into escala_faixa (loja_id, usuario_id, dia, ini_min, fim_min) values (?::uuid, ?, ?, ?, ?)",
                        lojaId.toString(), usuarioId, e.getKey(), f.ini(), f.fim());
            }
        }
    }

    /**
     * O profissional atende de `inicio` até `fim`? O atendimento inteiro precisa caber numa faixa do mesmo dia (no fuso da loja).
     * `soEntrada` (serviço de vários dias): só o minuto de entrada precisa estar dentro de uma faixa.
     */
    public boolean atende(JdbcTemplate jdbc, UUID profissionalId, Instant inicio, Instant fim, boolean soEntrada) {
        Map<Integer, List<Faixa>> loja = ler(jdbc, null);
        if (!temFaixa(loja)) return true;
        Map<Integer, List<Faixa>> prof = ler(jdbc, profissionalId);
        ZonedDateTime local = inicio.atZone(Fuso.BRASIL);
        int dia = local.getDayOfWeek().getValue() % 7; // segunda = 1 ... domingo = 7 → 0
        int ini = local.getHour() * 60 + local.getMinute();
        int fimMin = soEntrada ? ini + 1 : ini + (int) Duration.between(inicio, fim).toMinutes();
        boolean naLoja = cabe(loja.get(dia), ini, fimMin);
        boolean noProfissional = !temFaixa(prof) || cabe(prof.get(dia), ini, fimMin);
        return naLoja && noProfissional;
    }

    /**
     * Mesma regra de {@link #atende}, para quem já leu as escalas (o link do cliente testa dezenas de horários por dia sem reler o banco):
     * `dia` 0 = domingo; minutos desde 00:00. Loja sem expediente cadastrado = não restringe (quem chama decide se isso oferece horário).
     */
    public static boolean cabeNoDia(Map<Integer, List<Faixa>> loja, Map<Integer, List<Faixa>> prof, int dia, int ini, int fim) {
        if (!temFaixa(loja)) return true;
        boolean naLoja = cabe(loja.get(dia), ini, fim);
        boolean noProfissional = !temFaixa(prof) || cabe(prof.get(dia), ini, fim);
        return naLoja && noProfissional;
    }

    /** Faixas em que o profissional trabalha no dia: as dele, ou as da loja se ele não tem escala própria. */
    public static List<Faixa> faixasDoDia(Map<Integer, List<Faixa>> loja, Map<Integer, List<Faixa>> prof, int dia) {
        return temFaixa(prof) ? prof.get(dia) : loja.get(dia);
    }

    /** Serviço de vários dias não passa de 10 dias de expediente (como `MAX_DIAS_SERVICO` do simulador). */
    public static final int MAX_DIAS_SERVICO = 10;

    /**
     * Blocos em que há trabalho para um serviço de `minutos` que começa em `inicio` (espelho de `blocosDeTrabalho`, src/domain/schedule.js): só conta o tempo em que a loja
     * E o profissional estão abertos; a entrada precisa cair dentro de uma faixa. Devolve null se a entrada não é horário de trabalho ou se o serviço não termina em
     * {@link #MAX_DIAS_SERVICO} dias. Loja sem expediente cadastrado não restringe: um bloco contínuo.
     */
    public List<Instant[]> blocos(JdbcTemplate jdbc, UUID profissionalId, Instant inicio, int minutos) {
        Map<Integer, List<Faixa>> loja = ler(jdbc, null);
        if (!temFaixa(loja)) return List.of(new Instant[]{inicio, inicio.plus(Duration.ofMinutes(minutos))});
        Map<Integer, List<Faixa>> prof = ler(jdbc, profissionalId);
        List<Instant[]> blocos = new ArrayList<>();
        int falta = minutos;
        java.time.LocalDate dia0 = inicio.atZone(Fuso.BRASIL).toLocalDate();
        for (int i = 0; i < MAX_DIAS_SERVICO && falta > 0; i++) {
            java.time.LocalDate dia = dia0.plusDays(i);
            int dow = dia.getDayOfWeek().getValue() % 7;
            for (Faixa f : cruzar(loja.get(dow), temFaixa(prof) ? prof.get(dow) : loja.get(dow))) {
                Instant a = dia.atStartOfDay(Fuso.BRASIL).plusMinutes(f.ini()).toInstant();
                Instant b = dia.atStartOfDay(Fuso.BRASIL).plusMinutes(f.fim()).toInstant();
                Instant de = a.isAfter(inicio) ? a : inicio;
                if (!de.isBefore(b)) continue;
                if (blocos.isEmpty() && !de.equals(inicio)) return null; // a entrada precisa ser em horário de trabalho
                long cabe = Duration.between(de, b).toMinutes();
                int usa = (int) Math.min(cabe, falta);
                blocos.add(new Instant[]{de, de.plus(Duration.ofMinutes(usa))});
                falta -= usa;
                if (falta <= 0) break;
            }
        }
        return falta > 0 || blocos.isEmpty() ? null : blocos;
    }

    /** Interseção de duas listas de faixas do mesmo dia (ordenada). */
    static List<Faixa> cruzar(List<Faixa> a, List<Faixa> b) {
        List<Faixa> saida = new ArrayList<>();
        for (Faixa x : a) {
            for (Faixa y : b) {
                int ini = Math.max(x.ini(), y.ini());
                int fim = Math.min(x.fim(), y.fim());
                if (ini < fim) saida.add(new Faixa(ini, fim));
            }
        }
        saida.sort(Comparator.comparingInt(Faixa::ini));
        return saida;
    }

    private static boolean cabe(List<Faixa> faixas, int ini, int fim) {
        return faixas.stream().anyMatch((f) -> f.ini() <= ini && fim <= f.fim());
    }
}
