/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Link da página de agendamento do cliente: `#agendar`, `#agendar-<id do profissional>` e, só na demonstração (Artifact: não há endereço por loja),
// `…@<slug da loja>` no fim, para o cliente cair na loja de quem enviou e nunca na loja padrão. Só letras, números e hífen.
export const HASH_AGENDAR = /^#agendar(-[\w-]{1,40})?(@[a-z0-9-]{1,40})?$/;

// Lê o hash: devolve null se não for link de agendamento; senão { profissionalId, loja } (vazios quando ausentes).
export function lerHashAgendar(hash) {
  const m = HASH_AGENDAR.exec(String(hash ?? ''));
  if (!m) return null;
  return { profissionalId: m[1] ? m[1].slice(1) : '', loja: m[2] ? m[2].slice(1) : '' };
}

// Monta o link. `lojaNoLink` (slug) só entra quando a loja não vem do endereço (demonstração com seletor).
export function montarLinkAgendamento({ base, busca = '', profissionalId = '', lojaNoLink = '' }) {
  const prof = /^[\w-]{1,40}$/.test(String(profissionalId)) ? `-${profissionalId}` : '';
  const loja = /^[a-z0-9-]{1,40}$/.test(String(lojaNoLink)) ? `@${lojaNoLink}` : '';
  return `${base}${busca}#agendar${prof}${loja}`;
}
