/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Imagens do chamado de suporte: limites e conferência pelo CONTEÚDO (a mesma regra do servidor: PNG, JPEG ou WebP; SVG, GIF, HTML e PDF nunca). Funções puras,
// sem navegador: a redução da imagem (canvas) mora em ui/leve/imagem-chamado.js. Os números são os do servidor (Anexos.java / ImagensDoChamado.java).
export const MAX_IMAGENS = 3;
export const MAX_BYTES = 1_500_000;
export const MAX_TOTAL = 4_000_000;
export const LADO_MAX = 1600; // maior lado depois de reduzir, em pixels

// PNG, JPEG ou WebP pelos primeiros bytes (Uint8Array); '' para qualquer outra coisa.
export function tipoPorConteudo(b) {
  if (!b || b.length < 12) return '';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}

// Bytes de um texto base64 (sem prefixo data:). Texto que não é base64 devolve null.
export function bytesDeBase64(s) {
  if (typeof s !== 'string' || !s || s.length > MAX_BYTES * 4 / 3 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  try {
    const t = globalThis.atob(s);
    const b = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
    return b;
  } catch { return null; }
}

// Lista de imagens em base64 → { ok: true, anexos } com tipo e tamanho, ou { ok: false, erro }. Mesmos limites do servidor.
export function conferirImagens(lista) {
  const l = Array.isArray(lista) ? lista : [];
  if (l.length > MAX_IMAGENS) return { ok: false, erro: `Até ${MAX_IMAGENS} imagens por mensagem.` };
  let total = 0;
  const anexos = [];
  for (const s of l) {
    if (typeof s === 'string' && s.length > MAX_BYTES * 4 / 3 + 8) return { ok: false, erro: 'Imagem grande demais. O limite é 1,5 MB por imagem.' };
    const b = bytesDeBase64(s);
    if (!b) return { ok: false, erro: 'Imagem inválida.' };
    if (b.length > MAX_BYTES) return { ok: false, erro: 'Imagem grande demais. O limite é 1,5 MB por imagem.' };
    const tipo = tipoPorConteudo(b);
    if (!tipo) return { ok: false, erro: 'Só imagens PNG, JPEG ou WebP.' };
    total += b.length;
    if (total > MAX_TOTAL) return { ok: false, erro: 'As imagens passam de 4 MB no total.' };
    anexos.push({ tipo, tamanho: b.length, dados: s });
  }
  return { ok: true, anexos };
}

// Resumo de anexo que vem do servidor (nunca bytes): id, tipo e tamanho saneados.
export function lerResumoAnexo(a) {
  a = a && typeof a === 'object' ? a : {};
  const tipo = ['image/png', 'image/jpeg', 'image/webp'].includes(a.tipo) ? a.tipo : '';
  const id = typeof a.id === 'string' && /^[0-9a-f-]{8,40}$/i.test(a.id) ? a.id : typeof a.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(a.id) ? a.id : '';
  return tipo && id ? { id, tipo, tamanho: Number.isInteger(a.tamanho) && a.tamanho > 0 ? a.tamanho : 0 } : null;
}
