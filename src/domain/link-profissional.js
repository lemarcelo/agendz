/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B3 na DEMONSTRAÇÃO: token do link com profissional, simulado. O servidor de verdade (LinkDoProfissional.java) usa HMAC com segredo da loja; aqui não há
// servidor nem segredo, então a assinatura é só um selo determinístico que reproduz o COMPORTAMENTO (adulterado, vencido, de outra loja e formato errado
// são ignorados, sem dizer o motivo). Não tem valor de segurança. Formato: t + hex(id) + z + 8 hex do vencimento (s) + 22 do selo.
export const VALIDADE_DIAS = 180;
export const TOKEN_DEMO = /^t([0-9a-f]{2,80})z([0-9a-f]{8})([A-Za-z0-9_-]{22})$/;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function selo(texto) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x9e3779b9;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); h3 = Math.imul(h3 ^ c, 2246822519);
    h3 = (h3 << 13) | (h3 >>> 19);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  let n = [h1 >>> 0, h2 >>> 0, h3 >>> 0];
  let saida = '';
  for (let i = 0; i < 22; i++) { const v = n[i % 3]; saida += ALFABETO[(v >>> ((i % 5) * 6)) & 63]; n[i % 3] = Math.imul(v, 1103515245) + 12345 >>> 0; }
  return saida;
}

const hex = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (h) => new TextDecoder().decode(Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16)));

export function montarTokenProfissional({ loja, profissionalId, agora }) {
  if (!/^[\w-]{1,30}$/.test(String(profissionalId))) return '';
  const vence = Math.floor(Number(agora) / 1000) + VALIDADE_DIAS * 86400;
  const corpo = `t${hex(profissionalId)}z${vence.toString(16).padStart(8, '0')}`;
  return corpo + selo(`${loja}|link-prof|${corpo}`);
}

// Devolve o id do profissional ou '' (adulterado, vencido, de outra loja ou fora do formato: tudo igual, sem motivo).
export function conferirTokenProfissional({ loja, token, agora }) {
  const m = TOKEN_DEMO.exec(String(token ?? ''));
  if (!m || m[1].length % 2) return '';
  const corpo = `t${m[1]}z${m[2]}`;
  if (selo(`${loja}|link-prof|${corpo}`) !== m[3]) return '';
  if (parseInt(m[2], 16) < Math.floor(Number(agora) / 1000)) return '';
  try { return deHex(m[1]); } catch { return ''; }
}
