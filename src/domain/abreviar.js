/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Nome longo em lugar apertado (cartão da agenda): "Marcelo Antonio da Silva Santos" vira "Marcelo S." e, se ainda não couber, "Marcelo…".
// Nome que cabe não muda. O nome inteiro continua disponível no `title` do elemento.
export function abreviarNome(nome, max = 18) {
  const limpo = String(nome ?? '').replace(/\s+/g, ' ').trim();
  const teto = Math.max(4, Math.floor(Number(max)) || 18);
  if (limpo.length <= teto) return limpo;
  const partes = limpo.split(' ');
  if (partes.length > 1) {
    const ultima = partes[partes.length - 1];
    const curto = `${partes[0]} ${ultima.charAt(0).toUpperCase()}.`;
    if (curto.length <= teto) return curto;
  }
  return `${partes[0].slice(0, teto - 1)}…`;
}
