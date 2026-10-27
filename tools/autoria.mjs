// Marcas de autoria (só roda no build e nas ferramentas; nada daqui vai para o navegador, a não ser o resultado).
// A chave secreta NUNCA fica no projeto: vem da variável AUTORIA_SEGREDO ou do arquivo ../segredo-autoria.txt (fora da pasta).
// Com ela, o dono prova que um arquivo suspeito saiu deste projeto: a assinatura de cada build só pode ser gerada por quem tem a chave.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function lerSegredo(raiz = process.cwd()) {
  if (process.env.AUTORIA_SEGREDO) return process.env.AUTORIA_SEGREDO.trim();
  const f = path.resolve(raiz, '..', 'segredo-autoria.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
}
// Sem chave não existe assinatura: usar uma chave fixa pública deixaria qualquer um forjar uma marca que "verifica". Sem chave, a marca sai com valor aleatório não verificável.
const hmac = (segredo, texto) => (segredo ? crypto.createHmac('sha256', segredo).update(texto).digest('hex') : crypto.randomBytes(32).toString('hex'));

// Zero-width: 0 = U+200B, 1 = U+200C, delimitador = U+2060. Invisível em tela, sobrevive a copiar e colar texto.
const ZERO = '​', UM = '‌', DELIM = '⁠';
export const codificarZw = (hex) => DELIM + [...hex].map((h) => parseInt(h, 16).toString(2).padStart(4, '0')).join('').replace(/0/g, ZERO).replace(/1/g, UM) + DELIM;
export function decodificarZw(texto) {
  const out = [];
  for (const m of texto.matchAll(/⁠([​‌]+)⁠/g)) {
    const bits = m[1].replace(/​/g, '0').replace(/‌/g, '1');
    if (bits.length % 4) continue;
    out.push(bits.match(/.{4}/g).map((b) => parseInt(b, 2).toString(16)).join(''));
  }
  return out;
}

// Um id novo por build (o instante entra no cálculo). A assinatura amarra o id à chave.
export function gerarMarcas({ segredo, versao }) {
  const id = hmac(segredo, `id:${versao}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`).slice(0, 10);
  return { id, sig: hmac(segredo, `assinatura:${id}`).slice(0, 32), zw: codificarZw(id), comChave: !!segredo };
}
export const assinaturaDe = (segredo, id) => (segredo ? hmac(segredo, `assinatura:${id}`).slice(0, 32) : null);
export const tagDeArquivo = (segredo, caminho) => hmac(segredo, `arquivo:${caminho}`).slice(0, 10);
