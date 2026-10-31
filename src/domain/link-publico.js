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
  return `${base}${buscaComLoja(busca, lojaNoLink)}#agendar${prof}${loja}`;
}

// v126: na demonstração a loja vai DUAS vezes no link (`?loja=<slug>` e `#…@<slug>`): se um redirecionamento ou o quadro do Artifact perder o fragmento,
// a parte `?loja=` ainda leva o cliente à loja certa (nunca à padrão). `busca` já preenchida (a página já veio com `?loja=`) fica como está.
export function buscaComLoja(busca = '', lojaNoLink = '') {
  return !busca && /^[a-z0-9-]{1,40}$/.test(String(lojaNoLink)) ? `?loja=${lojaNoLink}` : busca;
}

// Endereço do Artifact publicado: reserva para quando a página roda num quadro sem endereço próprio (`about:srcdoc`, origem 'null'), onde origem + caminho
// não dariam um link que o cliente consiga abrir. Em http(s) vale o endereço real da página.
export const LINK_ARTEFATO = 'https://claude.ai/artifact/JVXrYoWFyrxi3nAEfo28QQ';

// Base do link (sem ?loja= e sem #): `loc` = window.location.
export function baseDoLink(loc = {}) {
  const proto = String(loc.protocol ?? '');
  const origem = String(loc.origin ?? '');
  if (proto === 'http:' || proto === 'https:') return origem && origem !== 'null' ? `${origem}${loc.pathname ?? '/'}` : LINK_ARTEFATO;
  if (proto === 'file:') return String(loc.pathname ?? ''); // abrir o arquivo direto (teste local)
  return LINK_ARTEFATO;
}

// Página pública de planos (`#planos`, e na demonstração `#planos@<loja>`): o cliente vê os planos, pede um e consulta o saldo.
export const HASH_PLANOS = /^#planos(@[a-z0-9-]{1,40})?$/;
export function lerHashPlanos(hash) {
  const m = HASH_PLANOS.exec(String(hash ?? ''));
  return m ? { loja: m[1] ? m[1].slice(1) : '' } : null;
}
export function montarLinkPlanos({ base, busca = '', lojaNoLink = '' }) {
  const loja = /^[a-z0-9-]{1,40}$/.test(String(lojaNoLink)) ? `@${lojaNoLink}` : '';
  return `${base}${buscaComLoja(busca, lojaNoLink)}#planos${loja}`;
}

// Página de avaliação do cliente (`#avaliar/<token>`, na demonstração `#avaliar@<loja>/<token>`). O token pessoal (48 hex, um por agendamento) vai no
// FRAGMENTO, nunca na URL que o servidor vê nem em log. Sem token no formato certo não é link de avaliação.
export const HASH_AVALIAR = /^#avaliar(@[a-z0-9-]{1,40})?\/([0-9a-f]{48})$/;
export function lerHashAvaliar(hash) {
  const m = HASH_AVALIAR.exec(String(hash ?? ''));
  return m ? { loja: m[1] ? m[1].slice(1) : '', token: m[2] } : null;
}
export function montarLinkAvaliar({ base, busca = '', lojaNoLink = '', token }) {
  const loja = /^[a-z0-9-]{1,40}$/.test(String(lojaNoLink)) ? `@${lojaNoLink}` : '';
  return `${base}${buscaComLoja(busca, lojaNoLink)}#avaliar${loja}/${token}`;
}
