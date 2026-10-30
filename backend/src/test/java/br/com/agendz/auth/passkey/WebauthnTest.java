package br.com.agendz.auth.passkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.function.Predicate;
import org.junit.jupiter.api.Test;

/** A conferência de passkey sem Spring nem banco: chave gerada no teste, atestado "none" e assinatura ES256. */
class WebauthnTest {

    private static final String RP = "dalforno.agendz.io";
    private static final String ORIGEM = "https://dalforno.agendz.io";
    private static final Predicate<String> ORIGEM_OK = ORIGEM::equals;
    private static final byte[] DESAFIO = "0123456789abcdef0123456789abcdef".getBytes();

    private final AutenticadorFalso aut = new AutenticadorFalso("credencial-de-teste-0001".getBytes());

    private Webauthn.ClientData cd(String tipo, String desafio, String origem) {
        return new Webauthn.ClientData(tipo, desafio, origem, false);
    }

    private Webauthn.Cadastro cadastrar() {
        return Webauthn.cadastro(RP, DESAFIO, cd("webauthn.create", Webauthn.b64(DESAFIO), ORIGEM), aut.atestado(RP, 0x45), ORIGEM_OK);
    }

    @Test
    void cadastro_valido_devolve_credencial_e_chave() {
        Webauthn.Cadastro c = cadastrar();
        assertThat(c.credencialId()).isEqualTo(aut.credencialId);
        assertThat(c.alg()).isEqualTo(Webauthn.ES256);
        assertThat(c.chavePublicaCose()).isEqualTo(aut.chaveCose());
        assertThat(c.contador()).isZero();
    }

    @Test
    void cadastro_recusa_desafio_origem_rp_e_falta_de_verificacao() {
        assertThatThrownBy(() -> Webauthn.cadastro(RP, DESAFIO, cd("webauthn.create", Webauthn.b64("outro-desafio-qualquer-123456789012".getBytes()), ORIGEM), aut.atestado(RP, 0x45), ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("desafio");
        assertThatThrownBy(() -> Webauthn.cadastro(RP, DESAFIO, cd("webauthn.create", Webauthn.b64(DESAFIO), "https://falso.example"), aut.atestado(RP, 0x45), ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("origem");
        assertThatThrownBy(() -> Webauthn.cadastro(RP, DESAFIO, cd("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM), aut.atestado(RP, 0x45), ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("tipo");
        assertThatThrownBy(() -> Webauthn.cadastro(RP, DESAFIO, cd("webauthn.create", Webauthn.b64(DESAFIO), ORIGEM), aut.atestado("outra-loja.agendz.io", 0x45), ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("rpIdHash");
        assertThatThrownBy(() -> Webauthn.cadastro(RP, DESAFIO, cd("webauthn.create", Webauthn.b64(DESAFIO), ORIGEM), aut.atestado(RP, 0x41), ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("verificação");
        assertThatThrownBy(() -> Webauthn.cadastro(RP, DESAFIO, cd("webauthn.create", Webauthn.b64(DESAFIO), ORIGEM), new byte[] {1, 2, 3}, ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class);
    }

    @Test
    void entrada_valida_aceita_e_o_contador_so_cresce() {
        Webauthn.Cadastro c = cadastrar();
        var a1 = aut.entrada(RP, Webauthn.b64(DESAFIO), ORIGEM, 0x05);
        long n1 = Webauthn.entrada(RP, DESAFIO, cd("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM), a1.clientData(), a1.authData(), a1.assinatura(), c.chavePublicaCose(), c.alg(), 0, ORIGEM_OK);
        assertThat(n1).isEqualTo(1);
        // repetir a mesma resposta (contador igual ao guardado) é recusado: resposta gravada não vale de novo
        assertThatThrownBy(() -> Webauthn.entrada(RP, DESAFIO, cd("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM), a1.clientData(), a1.authData(), a1.assinatura(), c.chavePublicaCose(), c.alg(), n1, ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("contador");
    }

    @Test
    void entrada_recusa_assinatura_adulterada_outra_chave_e_sem_verificacao() {
        Webauthn.Cadastro c = cadastrar();
        var a = aut.entrada(RP, Webauthn.b64(DESAFIO), ORIGEM, 0x05);
        byte[] ruim = a.assinatura().clone();
        ruim[ruim.length - 1] ^= 1;
        assertThatThrownBy(() -> Webauthn.entrada(RP, DESAFIO, cd("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM), a.clientData(), a.authData(), ruim, c.chavePublicaCose(), c.alg(), 0, ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class);
        AutenticadorFalso outro = new AutenticadorFalso("credencial-de-teste-0002".getBytes());
        var b = outro.entrada(RP, Webauthn.b64(DESAFIO), ORIGEM, 0x05);
        assertThatThrownBy(() -> Webauthn.entrada(RP, DESAFIO, cd("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM), b.clientData(), b.authData(), b.assinatura(), c.chavePublicaCose(), c.alg(), 0, ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("assinatura");
        var semUv = aut.entrada(RP, Webauthn.b64(DESAFIO), ORIGEM, 0x01);
        assertThatThrownBy(() -> Webauthn.entrada(RP, DESAFIO, cd("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM), semUv.clientData(), semUv.authData(), semUv.assinatura(), c.chavePublicaCose(), c.alg(), 0, ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("verificação");
        // clientData trocado depois de assinado: a assinatura cobre o hash dele
        byte[] trocado = AutenticadorFalso.clientData("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM + " ");
        assertThatThrownBy(() -> Webauthn.entrada(RP, DESAFIO, cd("webauthn.get", Webauthn.b64(DESAFIO), ORIGEM), trocado, a.authData(), a.assinatura(), c.chavePublicaCose(), c.alg(), 0, ORIGEM_OK))
                .isInstanceOf(Webauthn.Recusa.class).hasMessageContaining("assinatura");
    }

    @Test
    void cbor_recusa_entrada_hostil() {
        assertThatThrownBy(() -> Cbor.ler(new byte[] {(byte) 0x5f, 1}, 0)).isInstanceOf(IllegalArgumentException.class); // tamanho indefinido
        assertThatThrownBy(() -> Cbor.ler(new byte[] {(byte) 0x5a, (byte) 0xff, (byte) 0xff, (byte) 0xff, (byte) 0xff}, 0)).isInstanceOf(IllegalArgumentException.class); // bytes que não existem
        byte[] fundo = new byte[40];
        java.util.Arrays.fill(fundo, (byte) 0x81); // lista dentro de lista, sem fim
        assertThatThrownBy(() -> Cbor.ler(fundo, 0)).isInstanceOf(IllegalArgumentException.class);
    }
}
