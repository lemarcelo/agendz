/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:620eb6dc04 */
// Foto do profissional: imagem pequena e redonda no calendário, no lugar de cor. Só PNG, JPEG ou WebP em base64 (SVG fica de fora de propósito).
export const FOTO_MAX = 30000; // caracteres do data URL (≈ 22 KB): 96 px de lado cabem folgados
const MAGIA = {
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};
export function fotoValida(url) {
  if (typeof url !== 'string' || url.length > FOTO_MAX) return false;
  const m = url.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m || m[2].length < 24) return false;
  try {
    const bin = atob(m[2].slice(0, 24));
    return MAGIA[m[1]](Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return false; }
}

// Sem foto: cor gerada da própria pessoa (mesma pessoa, mesma cor, sempre). Tom escuro o bastante para o texto branco ter contraste mínimo de 4,5:1.
export function corDaPessoa(chave) {
  let h = 2166136261;
  for (const ch of String(chave || '?')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const matiz = h % 360;
  const luz = [32, 35, 38][(h >>> 9) % 3];
  return `hsl(${matiz} 55% ${luz}%)`;
}

// ---------- cor de quem não tem foto: nunca repetida dentro da equipe ----------
// 36 cores: 12 matizes bem separados (a sequência alterna para que vizinhos fiquem longe no círculo) em 3 rodadas de tom.
// Todas escuras o bastante para a inicial branca ter contraste (mínimo 4,5:1 na rodada 1 e 2; na 3 só entra com equipe enorme).
const MATIZES = [215, 355, 135, 40, 275, 175, 320, 85, 245, 15, 195, 300];
const RODADAS = [{ d: 0, s: 62, l: 38 }, { d: 18, s: 72, l: 27 }, { d: 9, s: 45, l: 33 }];
export const TOTAL_CORES = MATIZES.length * RODADAS.length;
// Contraste da cor com texto branco (WCAG): amarelos e verdes ficam mais escuros até chegar a 4,5:1.
export function contrasteComBranco(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => { const k = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
  return 1.05 / (lum + 0.05);
}
export function corDoSlot(slot) {
  const n = ((Number(slot) || 0) % TOTAL_CORES + TOTAL_CORES) % TOTAL_CORES;
  const r = RODADAS[Math.floor(n / MATIZES.length)];
  const h = (MATIZES[n % MATIZES.length] + r.d) % 360;
  let l = r.l;
  while (l > 14 && contrasteComBranco(h, r.s, l) < 4.5) l--;
  return `hsl(${h} ${r.s}% ${l}%)`;
}
const slotValido = (v) => Number.isInteger(v) && v >= 0 && v < TOTAL_CORES;
// Menor cor ainda não usada por ninguém da equipe (gravada no cadastro ao criar, para não mudar quando alguém sai).
export function proximoSlot(usuarios) {
  const usados = new Set((usuarios || []).map((u) => u.cor).filter(slotValido));
  for (let i = 0; i < TOTAL_CORES; i++) if (!usados.has(i)) return i;
  return (usuarios || []).length % TOTAL_CORES;
}
const cacheCores = new WeakMap();
// id -> cor de cada pessoa da equipe. Quem tem `cor` gravada fica com ela (a primeira, se houver duplicata); quem não tem recebe a menor livre, na ordem da lista.
export function coresDaEquipe(usuarios) {
  const lista = Array.isArray(usuarios) ? usuarios : [];
  if (cacheCores.has(lista)) return cacheCores.get(lista);
  const usados = new Set(); const slot = new Map();
  for (const u of lista) if (slotValido(u.cor) && !usados.has(u.cor)) { usados.add(u.cor); slot.set(u.id, u.cor); }
  for (const u of lista) {
    if (slot.has(u.id)) continue;
    let i = 0; while (i < TOTAL_CORES && usados.has(i)) i++;
    if (i >= TOTAL_CORES) i = slot.size % TOTAL_CORES;
    usados.add(i); slot.set(u.id, i);
  }
  const mapa = new Map([...slot].map(([id, i]) => [id, corDoSlot(i)]));
  cacheCores.set(lista, mapa);
  return mapa;
}
