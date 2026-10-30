/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Prepara a logo escolhida pelo dono (Artifact e site real): módulo neutro, sem API nem hooks (o site real não pode importar os do Artifact).
import { LOGO_MAX, coresDominantes, logoValida } from '../domain/tema.js';
import { LIMITE_FOTO_MB, abrirImagem } from './imagem.js';

// Lê o arquivo, reduz para caber (até 384 px), acha as duas cores dominantes e devolve { logo, cores }.
// Foto de celular é grande (10 MB ou mais) e às vezes chega sem tipo informado: aceita qualquer imagem que o aparelho consiga abrir e
// sempre grava uma imagem nova (PNG, WebP ou JPEG) desenhada por nós, nunca o arquivo original.
export async function prepararLogo(arquivo) {
  if (arquivo.type && !/^image\//.test(arquivo.type)) throw new Error('Escolha uma imagem (PNG, JPEG ou WebP).');
  if (arquivo.size > LIMITE_FOTO_MB * 1024 * 1024) throw new Error(`Imagem grande demais (máximo ${LIMITE_FOTO_MB} MB).`);
  const { img, fim } = await abrirImagem(arquivo);
  try {
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    if (!nw || !nh) throw new Error('Não consegui abrir essa imagem.');
    let lado = 384;
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      const f = Math.min(1, lado / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * f)), h = Math.max(1, Math.round(nh * f));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
      const candidatos = [c.toDataURL('image/png'), c.toDataURL('image/webp', 0.9), c.toDataURL('image/jpeg', 0.88)].filter((u) => /^data:image\/(png|webp|jpeg);base64,/.test(u) && logoValida(u));
      const melhor = candidatos.sort((a, b) => a.length - b.length)[0];
      if (melhor) {
        const p = document.createElement('canvas'); p.width = 48; p.height = 48;
        const px = p.getContext('2d'); px.drawImage(img, 0, 0, 48, 48);
        return { logo: melhor, cores: coresDominantes(px.getImageData(0, 0, 48, 48).data) };
      }
      lado = Math.round(lado * 0.7);
    }
    throw new Error(`Não consegui deixar a imagem abaixo de ${Math.round(LOGO_MAX / 1400)} KB. Tente uma imagem mais simples.`);
  } finally { fim(); }
}
