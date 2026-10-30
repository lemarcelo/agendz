/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Link de avaliação do cliente (`#avaliar/<token>`): o token vai no fragmento. Na demonstração a loja vai junto (`#avaliar@<loja>/<token>`), como nos outros links.
import { LOJA_TROCAVEL, MODO_DEMO } from '../services/api.js';
import { baseDoLink, montarLinkAvaliar } from '../domain/link-publico.js';

export function linkDaAvaliacao(token, lojaSlug) {
  const base = baseDoLink(window.location);
  const lojaDemo = new URLSearchParams(window.location.search).get('loja');
  const busca = lojaDemo && /^[a-z0-9-]{1,40}$/.test(lojaDemo) && base ? `?loja=${lojaDemo}` : '';
  return montarLinkAvaliar({ base, busca, lojaNoLink: MODO_DEMO && LOJA_TROCAVEL ? lojaSlug : '', token });
}
