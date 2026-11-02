/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// reCAPTCHA v2 ("Não sou um robô") do site real (B4). Só aparece quando o servidor pede (resposta 428) e a loja tem a chave do site (`loja.captchaChave`, pública).
// O script do Google é carregado só nessa hora; a prova (token de uso único) vai no cabeçalho X-Captcha (cliente) ou no corpo do login e é jogada fora depois do envio.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS terminam em `-real`.
import React, { useEffect, useRef, useState } from 'react';
import { Aviso } from '../leve/mini.jsx';

const SCRIPT = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=agendzCaptchaPronto';
let promessa = null;

function carregarGoogle() {
  if (globalThis.grecaptcha && typeof globalThis.grecaptcha.render === 'function') return Promise.resolve(globalThis.grecaptcha);
  if (promessa) return promessa;
  promessa = new Promise((resolve, reject) => {
    globalThis.agendzCaptchaPronto = () => resolve(globalThis.grecaptcha);
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true; s.defer = true;
    s.onerror = () => { promessa = null; reject(new Error('captcha')); };
    document.head.appendChild(s);
  });
  return promessa;
}

/** Caixa do reCAPTCHA. `aoMudar(token)` recebe o token ao resolver e '' ao expirar ou falhar. Troque a `key` para começar uma caixa nova. */
export function Captcha({ chave, aoMudar }) {
  const alvo = useRef(null);
  const [falha, setFalha] = useState(false);
  useEffect(() => {
    let vivo = true;
    setFalha(false);
    carregarGoogle().then((g) => {
      if (!vivo || !alvo.current) return;
      g.render(alvo.current, { sitekey: chave, callback: (t) => aoMudar(typeof t === 'string' ? t : ''), 'expired-callback': () => aoMudar(''), 'error-callback': () => aoMudar('') });
    }).catch(() => { if (vivo) setFalha(true); });
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="captcha-real" data-testid="captcha">
      <div ref={alvo} />
      {falha && <Aviso tipo="erro" data-testid="captcha-falha">Não foi possível carregar a verificação. Confira a internet e tente de novo.</Aviso>}
    </div>
  );
}

/**
 * Estado do reCAPTCHA de uma tela. `verificar(resposta)` devolve true (e passa a mostrar a caixa) quando o servidor respondeu 428; `gasta()` descarta a prova
 * depois de um envio (ela só vale uma vez) e recomeça a caixa. `widget` é o elemento a pôr na tela (null enquanto não for pedido ou sem chave da loja).
 */
export function useCaptcha(chave) {
  const [pedido, setPedido] = useState(false);
  const [prova, setProva] = useState('');
  const [rodada, setRodada] = useState(0);
  const verificar = (r) => {
    if (r && r.status === 428 && chave) { setPedido(true); return true; }
    return false;
  };
  const gasta = () => { setProva(''); setRodada((x) => x + 1); };
  const widget = pedido && chave ? <Captcha key={rodada} chave={chave} aoMudar={setProva} /> : null;
  return { prova, pedido, widget, verificar, gasta };
}
