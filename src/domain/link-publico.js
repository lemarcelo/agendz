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
  return `${base}${buscaComLoja(busca, lojaNoLink, `agendar${prof}`)}#agendar${prof}${loja}`;
}

// v126: na demonstração a loja vai DUAS vezes no link (`?loja=<slug>` e `#…@<slug>`): se um redirecionamento ou o quadro do Artifact perder o fragmento,
// a parte `?loja=` ainda leva o cliente à loja certa (nunca à padrão). v129: a PÁGINA também vai na busca (`&ir=agendar`, `&ir=agendar-<profissional>`, `&ir=planos`,
// `&ir=avaliar/<token>`): o relato era "abre o login" (a loja certa, mas sem a página), porque o quadro do Artifact joga fora o fragmento. Só na demonstração
// (`lojaNoLink` preenchido); no site real o link é só o `#…`. `busca` já preenchida (a página já veio com `?loja=`) ganha o `ir` se ainda não tiver.
export function buscaComLoja(busca = '', lojaNoLink = '', ir = '') {
  if (!/^[a-z0-9-]{1,40}$/.test(String(lojaNoLink))) return busca;
  const vai = IR_VALIDO.test(String(ir)) ? `ir=${ir}` : '';
  if (!busca) return `?loja=${lojaNoLink}${vai ? `&${vai}` : ''}`;
  if (!vai || /[?&]ir=/.test(busca)) return busca;
  return `${busca}${busca.includes('?') ? '&' : '?'}${vai}`;
}

export const IR_VALIDO = /^(agendar(-[\w-]{1,40})?|planos|avaliar\/[0-9a-f]{48})$/;

// O hash que vale agora: o do endereço; se o fragmento se perdeu (hash vazio) e a busca traz `ir`, refaz o hash a partir dela (com a loja de `?loja=`).
// Só devolve hash de página pública conhecida. Chamado na carga da página (depois, só o `hashchange` real manda).
export function hashEfetivo(hash = '', busca = '') {
  const h = String(hash ?? '');
  if (h && h !== '#') return h;
  let ir = '', slug = '';
  try { const q = new URLSearchParams(String(busca ?? '')); ir = q.get('ir') || ''; slug = q.get('loja') || ''; } catch { return h; }
  if (!IR_VALIDO.test(ir)) return h;
  const loja = /^[a-z0-9-]{1,40}$/.test(slug) ? `@${slug}` : '';
  const m = /^(agendar(?:-[\w-]{1,40})?|planos|avaliar)(\/[0-9a-f]{48})?$/.exec(ir);
  if (!m) return h;
  const novo = `#${m[1]}${loja}${m[2] || ''}`;
  return lerHashAgendar(novo) || lerHashPlanos(novo) || lerHashAvaliar(novo) ? novo : h;
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
  return `${base}${buscaComLoja(busca, lojaNoLink, 'planos')}#planos${loja}`;
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
  return `${base}${buscaComLoja(busca, lojaNoLink, `avaliar/${token}`)}#avaliar${loja}/${token}`;
}
