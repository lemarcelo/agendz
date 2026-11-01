package br.com.agendz.publico;

import br.com.agendz.auth.Recaptcha;
import br.com.agendz.cifra.Cifra;
import br.com.agendz.erro.ErroDeNegocio;
import br.com.agendz.tenant.Loja;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * reCAPTCHA do autoatendimento do cliente (B4): só aparece quando o IP já pediu demais (nunca no primeiro pedido). A tela manda a prova no cabeçalho
 * `X-Captcha`; sem as chaves do Google configuradas nada muda. A contagem é a mesma do freio de `LimitePublico` (o limite duro de 429 continua valendo).
 * Prova que falta ou falha = 428 e um registro mínimo no contador de barrados (sem dado pessoal).
 */
@Component
public class CaptchaDoLink {

    public static final String MENSAGEM = "Confirme que você não é um robô para continuar.";

    private final Recaptcha recaptcha;
    private final LimitePublico limite;
    private final BarradosDoLink barrados;
    private final Cifra cifra;

    public CaptchaDoLink(Recaptcha recaptcha, LimitePublico limite, BarradosDoLink barrados, Cifra cifra) {
        this.recaptcha = recaptcha;
        this.limite = limite;
        this.barrados = barrados;
        this.cifra = cifra;
    }

    /**
     * `chaveFreio` é a chave do freio de IP da própria rota (a mesma que `LinkPublicoService` conta). Com `suave` ou mais pedidos na janela, a rota
     * passa a exigir a prova.
     */
    public void exigirSeSuspeito(Loja loja, String ip, String chaveFreio, int suave, Duration janela, String prova) {
        if (!recaptcha.ativo()) return;
        if (limite.quantos(chaveFreio + ":" + loja.id() + ":" + ip, janela) < suave) return;
        if (recaptcha.valido(prova)) return;
        barrados.registrar(loja.id(), BarradosDoLink.Motivo.CAPTCHA, cifra.hash(loja.id(), "ip", ip), null);
        throw new ErroDeNegocio(HttpStatus.PRECONDITION_REQUIRED, MENSAGEM);
    }
}
