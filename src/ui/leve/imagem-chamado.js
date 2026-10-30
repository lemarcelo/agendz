/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Prepara uma imagem escolhida para o chamado: abre com o navegador, reduz o maior lado a 1600 px, redesenha num canvas branco e gera um JPEG abaixo de 1,5 MB.
// Redesenhar tira a localização (GPS) e os demais metadados da foto e garante que o que sobe é um JPEG de verdade (nunca SVG nem HTML com nome de imagem).
import { LADO_MAX, MAX_BYTES } from '../../domain/imagem-chamado.js';

const TIPOS_ESCOLHA = /^image\/(png|jpeg|webp)$/;

// Devolve { dados (base64 sem prefixo), previa (data URL) } ou lança Error com a frase para a tela.
export async function prepararImagemChamado(arquivo) {
  if (!arquivo || !TIPOS_ESCOLHA.test(arquivo.type)) throw new Error('Escolha uma imagem PNG, JPEG ou WebP.');
  if (arquivo.size > 25 * 1024 * 1024) throw new Error('A imagem é grande demais (máximo 25 MB).');
  let img;
  try { img = await createImageBitmap(arquivo); } catch { throw new Error('Não consegui abrir essa imagem. Tente outra.'); }
  let escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  for (let volta = 0; volta < 3; volta++) {
    const c = globalThis.document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * escala)); c.height = Math.max(1, Math.round(img.height * escala));
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const url = c.toDataURL('image/jpeg', q);
      const dados = url.slice(url.indexOf(',') + 1);
      if (dados.length * 3 / 4 <= MAX_BYTES * 0.98) return { dados, previa: url };
    }
    escala *= 0.7; // ainda grande: reduz mais e tenta de novo
  }
  throw new Error('Não consegui reduzir essa imagem. Tente outra.');
}
