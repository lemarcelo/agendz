/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:6420a43f9d */
// Pix: validação de CPF, código "copia e cola" (BR Code do Banco Central) e leitura do código.
export const digitos = (s) => String(s || '').replace(/\D/g, '');

export function cpfValido(cpf) {
  const c = digitos(cpf);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { let t = 0; for (let i = 0; i < n; i++) t += Number(c[i]) * (n + 1 - i); const r = (t * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export const cpfMascarado = (cpf) => { const c = digitos(cpf); return c.length === 11 ? `${c.slice(0, 3)}.***.***-${c.slice(9)}` : ''; };
export const cpfFormatado = (cpf) => digitos(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
const limpo = (s, n) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, n);

// Em produção, o código vem da API do banco/PSP (cobrança imediata com o CPF do pagador). Aqui geramos um BR Code
// estático válido, com valor e identificador (txid), que qualquer app de banco entende.
export function gerarBrCode({ chave, recebedor, cidade, valor, txid }) {
  let p = tlv('00', '01') + tlv('01', '12') + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', chave)) + tlv('52', '0000') + tlv('53', '986');
  if (valor > 0) p += tlv('54', Number(valor).toFixed(2));
  p += tlv('58', 'BR') + tlv('59', limpo(recebedor, 25) || 'RECEBEDOR') + tlv('60', limpo(cidade, 15) || 'CIDADE') + tlv('62', tlv('05', limpo(txid, 25).replace(/ /g, '') || '***'));
  p += '6304';
  return p + crc16(p);
}

// Pix dinâmico: o código aponta para a cobrança no banco (URL), sem chave nem valor dentro do código.
export function gerarBrCodeDinamico({ url, recebedor, cidade }) {
  let p = tlv('00', '01') + tlv('01', '12') + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('25', url)) + tlv('52', '0000') + tlv('53', '986');
  p += tlv('58', 'BR') + tlv('59', limpo(recebedor, 25) || 'RECEBEDOR') + tlv('60', limpo(cidade, 15) || 'CIDADE') + tlv('62', tlv('05', '***'));
  p += '6304';
  return p + crc16(p);
}

function lerTlv(t) {
  const out = {};
  let i = 0;
  while (i + 4 <= t.length) {
    const id = t.slice(i, i + 2);
    const n = Number(t.slice(i + 2, i + 4));
    if (Number.isNaN(n)) return null;
    out[id] = t.slice(i + 4, i + 4 + n);
    i += 4 + n;
  }
  return out;
}

export function lerBrCode(codigo) {
  const c = String(codigo || '').replace(/[\r\n]+/g, '').trim();
  if (c.length < 30) return { ok: false };
  const crcOk = crc16(c.slice(0, -4)) === c.slice(-4).toUpperCase();
  const top = lerTlv(c);
  if (!top || !top['26']) return { ok: false };
  const conta = lerTlv(top['26']) || {};
  const adic = top['62'] ? lerTlv(top['62']) : {};
  const url = conta['25'] || null;
  const txid = url ? url.split('/').pop() : adic && adic['05'];
  return { ok: crcOk, chave: conta['01'] || null, url, valor: top['54'] ? Number(top['54']) : null, txid, recebedor: top['59'], cidade: top['60'] };
}
