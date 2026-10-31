/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Prévia dos preços enquanto o dono define o fator do porte (v124). Puro: não lê nem grava nada; só mostra o que ficaria.
// Preço do serviço no porte = preço específico (definido no serviço) ou preço base (o do Médio) × fator do porte, em 2 casas (mesma conta de `precoNoPorte`).
import { FATOR_MAX, FATOR_MIN, PORTE_PADRAO } from './veiculos.js';

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Fator digitado ("1,25" ou "1.25") → número em 2 casas dentro de 0,10–10, ou null se ainda não vale.
export function fatorDeTexto(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= FATOR_MIN && v <= FATOR_MAX ? r2(v) : null;
  const t = String(v ?? '').trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= FATOR_MIN && n <= FATOR_MAX ? r2(n) : null;
}

// Mostra o fator com vírgula e sem zeros à toa (1,2 · 0,9 · 1).
export const fatorEmTexto = (f) => (Number.isFinite(f) ? String(r2(f)).replace('.', ',') : '');

/**
 * @param servicos [{ id, nome, preco, precos?, ativo? }]  (serviço ativo e comum; combo e inativo ficam de fora)
 * @param portes   [{ id?, nome, fator (número ou texto digitado), ativo }]  a lista que está sendo editada
 * @param busca    texto da pesquisa por nome do serviço (sem acento, sem diferenciar maiúsculas)
 * @param limite   quantos serviços listar (o total que bate com a busca vem em `total`)
 * @returns { total, itens: [{ id, nome, base, linhas: [{ chave, nome, fator, preco, especifico }] }] }
 */
export function previaDosPrecos(servicos, portes, busca = '', limite = 6) {
  const q = semAcento(busca);
  const lista = (servicos || []).filter((s) => s && s.ativo !== false && !s.combo && Number.isFinite(Number(s.preco)) && (!q || semAcento(s.nome).includes(q)));
  const alvo = (portes || []).filter((p) => p && p.ativo !== false && p.id !== PORTE_PADRAO);
  const itens = lista.slice(0, Math.max(0, limite)).map((s) => {
    const base = Number(s.preco);
    const linhas = alvo.map((p, i) => {
      const chave = p.id || `novo-${i}`;
      const e = p.id && s.precos ? s.precos[p.id] : undefined;
      const especifico = e !== undefined && e !== null && e !== '' && Number.isFinite(Number(e)) && Number(e) >= 0;
      const fator = fatorDeTexto(p.fator);
      return { chave, nome: p.nome, fator, especifico, preco: especifico ? r2(Number(e)) : fator === null ? null : r2(base * fator) };
    });
    return { id: s.id, nome: s.nome, base: r2(base), linhas };
  });
  return { total: lista.length, itens };
}
