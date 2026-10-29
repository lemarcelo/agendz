package br.com.agendz.configuracao;

import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.seguranca.Permissoes;
import br.com.agendz.tenant.Loja;
import br.com.agendz.tenant.LojaContext;
import br.com.agendz.tenant.LojaJdbc;
import br.com.agendz.validacao.Texto;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endereço e localização (GPS) da loja, configurados em Estabelecimento depois de iniciar o uso (o assistente de início não pede).
 * GET/PUT /api/estabelecimento/local. Dois interruptores, ambos desligados de fábrica: `enderecoNoLink` (mostra o endereço na página de agendamento do cliente)
 * e `localizacaoNoWhatsapp` (a mensagem de WhatsApp com o link de agendamento leva o link do mapa). Quem edita: o proprietário ou quem tem a seção `estabelecimento`.
 * Todos que usam a agenda leem `localizacaoWhatsappUrl` (o link que vai na mensagem do WhatsApp; só existe com o interruptor ligado); quem não edita não lê mais nada.
 * O link do mapa é montado aqui (`https://maps.google.com/?q=lat,lng`): o WhatsApp o reconhece e mostra o cartão do mapa.
 */
@RestController
public class LocalDaLoja {

    /** Valores gravados (null = não informado). */
    public record Local(String logradouro, String numero, String complemento, String bairro, String cidade, String uf, String cep, boolean enderecoNoLink,
                        BigDecimal latitude, BigDecimal longitude, boolean localizacaoNoWhatsapp) {
        public boolean temEndereco() {
            return logradouro != null && cidade != null;
        }

        public boolean temLocalizacao() {
            return latitude != null && longitude != null;
        }

        /** "Rua A, 10 - Sala 2 - Centro - São Paulo/SP - CEP 01000-000" (só o que foi informado). */
        public String enderecoTexto() {
            if (!temEndereco()) return null;
            StringBuilder s = new StringBuilder(logradouro);
            if (numero != null) s.append(", ").append(numero);
            if (complemento != null) s.append(" - ").append(complemento);
            if (bairro != null) s.append(" - ").append(bairro);
            s.append(" - ").append(cidade);
            if (uf != null) s.append('/').append(uf);
            if (cep != null) s.append(" - CEP ").append(cep, 0, 5).append('-').append(cep, 5, 8);
            return s.toString();
        }

        /** Link do mapa pelas coordenadas (preferido: é o ponto exato). */
        public String mapaPorCoordenadas() {
            return temLocalizacao() ? String.format(Locale.ROOT, "https://maps.google.com/?q=%s,%s", latitude.toPlainString(), longitude.toPlainString()) : null;
        }

        /** Link do mapa: pelas coordenadas, se houver; senão busca pelo endereço. */
        public String mapaUrl() {
            if (temLocalizacao()) return mapaPorCoordenadas();
            String t = enderecoTexto();
            return t == null ? null : "https://www.google.com/maps/search/?api=1&query=" + URLEncoder.encode(t, StandardCharsets.UTF_8);
        }
    }

    public record Resposta(String logradouro, String numero, String complemento, String bairro, String cidade, String uf, String cep, Boolean enderecoNoLink,
                           BigDecimal latitude, BigDecimal longitude, Boolean localizacaoNoWhatsapp, String enderecoTexto, String localizacaoUrl, String localizacaoWhatsappUrl) {
    }

    public record Corpo(String logradouro, String numero, String complemento, String bairro, String cidade, String uf, String cep, Boolean enderecoNoLink,
                        BigDecimal latitude, BigDecimal longitude, Boolean localizacaoNoWhatsapp) {
    }

    private static final Local VAZIO = new Local(null, null, null, null, null, null, null, false, null, null, false);

    private final LojaJdbc banco;
    private final Permissoes permissoes;

    public LocalDaLoja(LojaJdbc banco, Permissoes permissoes) {
        this.banco = banco;
        this.permissoes = permissoes;
    }

    /** Local gravado da loja atual (dentro de uma transação já aberta). */
    public static Local ler(JdbcTemplate jdbc) {
        List<Local> l = jdbc.query("select endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, endereco_no_link, "
                        + "latitude, longitude, localizacao_no_whatsapp from configuracao_loja",
                (rs, i) -> new Local(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getBoolean(8),
                        rs.getBigDecimal(9), rs.getBigDecimal(10), rs.getBoolean(11)));
        return l.isEmpty() ? VAZIO : l.get(0);
    }

    private static Resposta completa(Local c) {
        return new Resposta(c.logradouro(), c.numero(), c.complemento(), c.bairro(), c.cidade(), c.uf(), c.cep(), c.enderecoNoLink(), c.latitude(), c.longitude(),
                c.localizacaoNoWhatsapp(), c.enderecoTexto(), c.mapaPorCoordenadas(), c.localizacaoNoWhatsapp() ? c.mapaPorCoordenadas() : null);
    }

    @GetMapping("/api/estabelecimento/local")
    @PreAuthorize("@perm.pode(authentication, 'estabelecimento') or @perm.pode(authentication, 'agenda')")
    public Resposta obter(Authentication quem) {
        Local c = banco.naLoja(LocalDaLoja::ler);
        if (permissoes.pode(quem, "estabelecimento")) return completa(c);
        // quem só usa a agenda recebe apenas o link para o WhatsApp, e só com o envio ligado
        return new Resposta(null, null, null, null, null, null, null, null, null, null, null, null, null, c.localizacaoNoWhatsapp() ? c.mapaPorCoordenadas() : null);
    }

    @PutMapping("/api/estabelecimento/local")
    @PreAuthorize("hasRole('DONO') or @perm.pode(authentication, 'estabelecimento')")
    public Resposta gravar(@RequestBody Corpo c) {
        Loja loja = LojaContext.exigir();
        if (c == null) throw ruim("Informe o endereço e a localização.");
        String logradouro = texto(c.logradouro(), 120, "A rua"), numero = texto(c.numero(), 20, "O número"), complemento = texto(c.complemento(), 60, "O complemento");
        String bairro = texto(c.bairro(), 60, "O bairro"), cidade = texto(c.cidade(), 60, "A cidade");
        String uf = texto(c.uf(), 2, "O estado");
        if (uf != null) {
            uf = uf.toUpperCase(Locale.ROOT);
            if (!uf.matches("^[A-Z]{2}$")) throw ruim("O estado deve ter 2 letras (ex.: SP).");
        }
        String cep = c.cep() == null ? null : c.cep().replaceAll("[^0-9]", "");
        if (cep != null && cep.isEmpty()) cep = null;
        if (cep != null && cep.length() != 8) throw ruim("O CEP deve ter 8 números.");
        if ((logradouro == null) != (cidade == null)) throw ruim("Para guardar o endereço, informe pelo menos a rua e a cidade.");
        if ((c.latitude() == null) != (c.longitude() == null)) throw ruim("Informe latitude e longitude juntas (ou deixe as duas vazias).");
        BigDecimal lat = c.latitude() == null ? null : c.latitude().setScale(6, RoundingMode.HALF_UP);
        BigDecimal lng = c.longitude() == null ? null : c.longitude().setScale(6, RoundingMode.HALF_UP);
        if (lat != null && (lat.abs().compareTo(new BigDecimal("90")) > 0 || lng.abs().compareTo(new BigDecimal("180")) > 0)) throw ruim("Localização inválida: latitude de -90 a 90 e longitude de -180 a 180.");
        boolean noLink = Boolean.TRUE.equals(c.enderecoNoLink()), noWhats = Boolean.TRUE.equals(c.localizacaoNoWhatsapp());
        if (noLink && logradouro == null) throw ruim("Informe o endereço (rua e cidade) para mostrá-lo no link de agendamento.");
        if (noWhats && lat == null) throw ruim("Informe a localização (latitude e longitude) para enviá-la no WhatsApp.");
        Local novo = new Local(logradouro, numero, complemento, bairro, cidade, uf, cep, noLink, lat, lng, noWhats);
        banco.naLoja(jdbc -> jdbc.update("insert into configuracao_loja (loja_id, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep, "
                        + "endereco_no_link, latitude, longitude, localizacao_no_whatsapp) values (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "on conflict (loja_id) do update set endereco_logradouro = excluded.endereco_logradouro, endereco_numero = excluded.endereco_numero, endereco_complemento = excluded.endereco_complemento, "
                        + "endereco_bairro = excluded.endereco_bairro, endereco_cidade = excluded.endereco_cidade, endereco_uf = excluded.endereco_uf, endereco_cep = excluded.endereco_cep, "
                        + "endereco_no_link = excluded.endereco_no_link, latitude = excluded.latitude, longitude = excluded.longitude, localizacao_no_whatsapp = excluded.localizacao_no_whatsapp, atualizado_em = now()",
                loja.id().toString(), logradouro, numero, complemento, bairro, cidade, uf, cep, noLink, lat, lng, noWhats));
        return completa(novo);
    }

    private static String texto(String v, int max, String nome) {
        if (v == null) return null;
        String t = Texto.limpar(v);
        if (t.isEmpty()) return null;
        if (t.length() > max) throw ruim(nome + " pode ter até " + max + " letras.");
        return t;
    }

    private static ErroDeNegocio ruim(String m) {
        return new ErroDeNegocio(HttpStatus.BAD_REQUEST, m);
    }
}
