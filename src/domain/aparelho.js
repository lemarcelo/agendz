/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aparelho confiável (v125, B8): nome curto do aparelho a partir do navegador ("Celular Android · Chrome"). Puro: recebe o texto do navegador e devolve texto.
// Só serve de nome para a pessoa reconhecer o aparelho na lista de Meu perfil; nada aqui identifica ou autoriza ninguém (o servidor decide pelo token).

const limpar = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 400);

/** A pessoa está num celular? (para sugerir "aparelho" em vez de "rede" na pergunta do login) */
export function ehCelular(userAgent) {
  const ua = limpar(userAgent);
  return /iPhone|iPod|Android.*Mobile|Mobile.*Android|Windows Phone/i.test(ua);
}

function aparelhoDe(ua) {
  if (/iPhone|iPod/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Celular Android' : 'Tablet Android';
  if (/Windows Phone/i.test(ua)) return 'Celular Windows';
  if (/Windows/i.test(ua)) return 'Computador Windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  if (/Linux|X11/i.test(ua)) return 'Computador Linux';
  return '';
}

function navegadorDe(ua) {
  if (/Edg(e|A|iOS)?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Firefox\/|FxiOS/i.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  return '';
}

/** "Celular Android · Chrome", "iPhone · Safari"… ; sem pistas vira "Este aparelho". Sempre texto simples de até 60 caracteres. */
export function rotuloDoAparelho(userAgent) {
  const ua = limpar(userAgent);
  const partes = [aparelhoDe(ua), navegadorDe(ua)].filter(Boolean);
  return partes.length ? partes.join(' · ').slice(0, 60) : 'Este aparelho';
}
