/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:6a8bd750c4 */
import { FOTO_MAX, fotoValida } from '../domain/foto.js';

// Abre qualquer imagem que o aparelho consiga abrir (foto de celular chega grande e às vezes sem tipo informado).
export async function abrirImagem(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    return { img: await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('x')); i.src = url; }), fim: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    if (typeof createImageBitmap === 'function') {
      try { const bmp = await createImageBitmap(arquivo); return { img: bmp, fim: () => bmp.close && bmp.close() }; } catch { /* cai no erro abaixo */ }
    }
    throw new Error('Não consegui abrir essa imagem. Se for foto HEIC do iPhone, envie como JPEG ou PNG.');
  }
}

export const LIMITE_FOTO_MB = 40;
// Foto de rosto: recorta o quadrado do centro e reduz (96 px, depois 80 e 64 se precisar) até caber em FOTO_MAX. Grava só a cópia nova.
export async function prepararFoto(arquivo) {
  if (arquivo.type && !/^image\//.test(arquivo.type)) throw new Error('Escolha uma imagem (PNG, JPEG ou WebP).');
  if (arquivo.size > LIMITE_FOTO_MB * 1024 * 1024) throw new Error(`Imagem grande demais (máximo ${LIMITE_FOTO_MB} MB).`);
  const { img, fim } = await abrirImagem(arquivo);
  try {
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    if (!nw || !nh) throw new Error('Não consegui abrir essa imagem.');
    const lado = Math.min(nw, nh), sx = (nw - lado) / 2, sy = (nh - lado) / 2;
    for (const tam of [96, 80, 64]) {
      const c = document.createElement('canvas'); c.width = tam; c.height = tam;
      c.getContext('2d').drawImage(img, sx, sy, lado, lado, 0, 0, tam, tam);
      for (const [tipo, q] of [['image/webp', 0.82], ['image/jpeg', 0.8], ['image/jpeg', 0.6]]) {
        const u = c.toDataURL(tipo, q);
        if (fotoValida(u)) return u;
      }
    }
    throw new Error(`Não consegui deixar a foto abaixo de ${Math.round(FOTO_MAX / 1400)} KB. Tente outra imagem.`);
  } finally { fim(); }
}

// Foto desenhada na hora (silhueta sobre fundo colorido), só para a demonstração com muitos profissionais.
export function fotoDeExemplo(i) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 96;
  const g = c.getContext('2d');
  const h = (i * 47 + 20) % 360;
  const fundo = g.createLinearGradient(0, 0, 96, 96);
  fundo.addColorStop(0, `hsl(${h} 55% 62%)`); fundo.addColorStop(1, `hsl(${(h + 40) % 360} 60% 38%)`);
  g.fillStyle = fundo; g.fillRect(0, 0, 96, 96);
  g.fillStyle = `hsl(${h} 30% 18%)`;
  g.beginPath(); g.ellipse(48, 100, 36, 34, 0, 0, Math.PI * 2); g.fill(); // ombros
  g.fillStyle = `hsl(${25 + (i % 4) * 6} 45% ${52 - (i % 3) * 8}%)`;
  g.beginPath(); g.arc(48, 40, 19, 0, Math.PI * 2); g.fill(); // rosto
  g.fillStyle = `hsl(${(i * 13) % 40} 25% ${14 + (i % 3) * 6}%)`;
  g.beginPath(); g.arc(48, 33, 19, Math.PI, 0); g.fill(); // cabelo
  return c.toDataURL('image/jpeg', 0.7);
}
