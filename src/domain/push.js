/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso com o app fechado (v130): funções puras do lado do navegador. Nada aqui toca em rede, storage ou no navegador de verdade:
// quem chama passa `janela` (window/navigator) e recebe texto/dados. O servidor decide quem recebe o quê; aqui só se prepara o pedido.

/** Estado do recurso neste aparelho: 'sem-suporte' | 'bloqueado' | 'desligado'. (Ligado = tem inscrição; quem sabe é o service worker.) */
export function estadoDoPush(janela) {
  const j = janela || {};
  const nav = j.navigator || {};
  if (!('serviceWorker' in nav) || !j.PushManager || !j.Notification) return 'sem-suporte';
  if (j.Notification.permission === 'denied') return 'bloqueado';
  return 'desligado';
}

/** base64url (chave pública VAPID) → bytes, como o `applicationServerKey` pede. Entrada inválida → null. */
export function chaveEmBytes(b64u) {
  if (typeof b64u !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(b64u)) return null;
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4);
  let bin;
  try { bin = globalThis.atob(b64); } catch { return null; }
  if (bin.length !== 65 || bin.charCodeAt(0) !== 4) return null; // ponto P-256 não comprimido
  const out = new Uint8Array(65);
  for (let i = 0; i < 65; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const paraB64u = (buf) => {
  const b = new Uint8Array(buf);
  let t = '';
  for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]);
  return globalThis.btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Inscrição do navegador → corpo do `POST /api/push/inscricoes`. Só endpoint https e as duas chaves; qualquer outra coisa → null. */
export function corpoDaInscricao(sub, aparelho) {
  if (!sub || typeof sub.getKey !== 'function') return null;
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 600) return null;
  const p256dh = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  if (!p256dh || !auth) return null;
  return { endpoint, keys: { p256dh: paraB64u(p256dh), auth: paraB64u(auth) }, aparelho: String(aparelho || '').slice(0, 60) || undefined };
}

/** Mensagem que chega do servidor (JSON) → o que o service worker mostra. Texto sempre limitado; `url` só caminho do próprio site. */
export function lerMensagem(texto) {
  let d = null;
  try { d = JSON.parse(texto); } catch { d = null; }
  const o = d && typeof d === 'object' ? d : {};
  const cortar = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : '');
  const url = typeof o.url === 'string' && /^\/[A-Za-z0-9_\-./?=&#]{0,200}$/.test(o.url) && !o.url.startsWith('//') ? o.url : '/';
  return { titulo: cortar(o.titulo, 80) || 'Agendz', texto: cortar(o.texto, 200), url, tag: cortar(o.tag, 64) || 'agendz', tipo: cortar(o.tipo, 20) };
}
