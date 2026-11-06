package br.com.agendz.publico;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import br.com.agendz.cifra.Cifra;
import br.com.agendz.cifra.CifraProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** B3: token assinado do link com profissional. Unitário (sem banco): valida, e ignora sem motivo o vencido, o adulterado, o de outra loja e o mal formado. */
class LinkDoProfissionalTest {

    private static final Instant AGORA = Instant.parse("2026-11-09T12:00:00Z");
    private static final String CHAVE = "chave-de-teste-com-mais-de-trinta-e-dois-caracteres-aaaa";
    private static final String PEPPER = "pepper-de-teste-com-mais-de-trinta-e-dois-caracteres-bbb";
    private final Cifra cifra = new Cifra(new CifraProperties(CHAVE, PEPPER));
    private final LinkDoProfissional links = new LinkDoProfissional(cifra, Clock.fixed(AGORA, ZoneOffset.UTC));
    private final UUID loja = UUID.randomUUID();
    private final UUID prof = UUID.randomUUID();

    private LinkDoProfissional em(Instant quando) {
        return new LinkDoProfissional(cifra, Clock.fixed(quando, ZoneOffset.UTC));
    }

    @Test
    void tokenValidoDevolveOProfissionalDaMesmaLoja() {
        String t = links.emitir(loja, prof);
        assertEquals(62, t.length());
        assertEquals(prof, links.validar(loja, t).orElseThrow());
        assertEquals(prof, em(AGORA.plus(Duration.ofDays(179))).validar(loja, t).orElseThrow(), "dentro da validade");
    }

    @Test
    void vencidoVoltaVazio() {
        String t = links.emitir(loja, prof);
        assertTrue(em(AGORA.plus(LinkDoProfissional.VALIDADE).plusSeconds(5)).validar(loja, t).isEmpty());
    }

    @Test
    void outraLojaVoltaVazio() {
        String t = links.emitir(loja, prof);
        assertTrue(links.validar(UUID.randomUUID(), t).isEmpty());
    }

    @Test
    void adulteradoVoltaVazio() {
        String t = links.emitir(loja, prof);
        String outroProf = links.emitir(loja, UUID.randomUUID());
        assertTrue(links.validar(loja, outroProf.substring(0, 40) + t.substring(40)).isEmpty(), "id trocado com a assinatura antiga");
        String estendido = t.substring(0, 32) + "ffffffff" + t.substring(40);
        assertTrue(links.validar(loja, estendido).isEmpty(), "vencimento estendido à mão");
        char ultimo = t.charAt(t.length() - 1);
        assertTrue(links.validar(loja, t.substring(0, t.length() - 1) + (ultimo == 'A' ? 'B' : 'A')).isEmpty(), "assinatura alterada");
    }

    @Test
    void malFormadoVoltaVazio() {
        for (String ruim : new String[] {null, "", "x", prof.toString(), "a".repeat(61), "a".repeat(63), "<script>alert(1)</script>"}) {
            assertTrue(links.validar(loja, ruim).isEmpty(), String.valueOf(ruim));
        }
    }

    @Test
    void tokenNaoTrazDadoPessoal() {
        String t = links.emitir(loja, prof);
        assertTrue(t.matches("^[0-9a-f]{40}[A-Za-z0-9_-]{22}$"), "só o id do profissional (em hex), o vencimento e a assinatura");
        assertFalse(t.contains(prof.toString()), "o id não aparece com hífens");
    }
}
