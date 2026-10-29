/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso de agendamento novo (site real): regra pura, sem tela. O que a pessoa escolheu receber (som, faixa no topo, vibração) fica no aparelho dela
// (cada aparelho decide o seu), e o que é "aviso novo" sai da comparação da lista de avisos do servidor com o que o aparelho já viu.
export const PREFS_PADRAO = Object.freeze({ som: true, aviso: true, vibracao: true });
export const CHAVES_PREFS = Object.freeze(['som', 'aviso', 'vibracao']);

// Bipe sutil: 3 toques curtos e baixos (volume de 0 a 1); a vibração acompanha o mesmo ritmo.
export const BIPE = Object.freeze({ vezes: 3, freq: 880, duracaoMs: 110, pausaMs: 150, volume: 0.05 });
export const VIBRACAO = Object.freeze([120, 90, 120, 90, 120]);
export const DESTAQUE_MS = 9000; // quanto tempo o cartão do agendamento novo fica pulsando
export const FAIXA_MS = 25000;   // quanto tempo a faixa fica no topo se ninguém mexer

// Preferência vinda do navegador nunca é confiável: só vale boolean, o resto volta ao padrão.
export function sanearPrefs(bruto) {
  const o = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {};
  const r = {};
  for (const k of CHAVES_PREFS) r[k] = typeof o[k] === 'boolean' ? o[k] : PREFS_PADRAO[k];
  return r;
}

// Uma chave por loja e por pessoa: dois acessos no mesmo aparelho não misturam as escolhas.
export function chavePrefs(lojaSlug, usuarioId) {
  const limpo = (t) => String(t ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return `agendz-aviso:${limpo(lojaSlug) || 'loja'}:${limpo(usuarioId) || 'eu'}`;
}

// Avisos que ainda não foram vistos neste aparelho e que ninguém marcou como lidos. A primeira consulta só aprende o que já existe (não apita por histórico).
export function avisosNovos(lista, vistos) {
  if (!Array.isArray(lista)) return [];
  const v = vistos instanceof Set ? vistos : new Set();
  return lista.filter((a) => a && typeof a.id === 'string' && !v.has(a.id) && !a.lido);
}

export function textoDaFaixa(novos) {
  if (!Array.isArray(novos) || !novos.length) return '';
  if (novos.length === 1) return String(novos[0].texto || 'Novo aviso na agenda.').slice(0, 200);
  return `${novos.length} avisos novos na agenda.`;
}

// Para onde a faixa leva: o primeiro aviso novo que aponta para um agendamento.
export function alvoDaFaixa(novos) {
  const a = (Array.isArray(novos) ? novos : []).find((x) => x && typeof x.agendamentoId === 'string' && x.agendamentoId);
  return a ? a.agendamentoId : '';
}

// Cartões que pulsam: ids dos agendamentos dos avisos novos (sem repetir, no máximo 20).
export function idsParaDestacar(novos) {
  return [...new Set((Array.isArray(novos) ? novos : []).map((a) => a && a.agendamentoId).filter((x) => typeof x === 'string' && x))].slice(0, 20);
}

// Tira do mapa de destaques o que já venceu.
export function podarDestaques(mapa, agora) {
  const r = {};
  for (const [id, ate] of Object.entries(mapa || {})) if (typeof ate === 'number' && ate > agora) r[id] = ate;
  return r;
}
