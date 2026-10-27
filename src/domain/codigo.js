/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:7ea9d7792b */
// Código de serviço e de produto (auto incremento, editável), busca por nome ou código e ordem "últimos usados primeiro".
// Tudo puro: a tela e a API usam as mesmas funções.
import { STATUS } from './rules.js';

export const CODIGO_MAX = 20;
export const codigoValido = (c) => typeof c === 'string' && /^[A-Za-z0-9._-]{1,20}$/.test(c);
export const textoCodigo = (c) => (c === null || c === undefined ? '' : String(c).trim());

// Próximo número: maior código só de dígitos + 1 (códigos com letras não entram na conta). Lista vazia começa em 1.
export function proximoCodigo(lista) {
  let m = 0;
  for (const x of lista) { const c = textoCodigo(x.codigo); if (/^\d{1,9}$/.test(c)) m = Math.max(m, Number(c)); }
  return String(m + 1);
}
// Dois itens não repetem o código (maiúsculas e minúsculas contam como iguais), cada tipo na sua lista.
export const codigoEmUso = (lista, codigo, ignorarId) => lista.some((x) => x.id !== ignorarId && textoCodigo(x.codigo).toLowerCase() === codigo.toLowerCase());
// Dá código aos itens que ainda não têm, na ordem do cadastro.
export function atribuirCodigos(lista) {
  for (const x of lista) if (!textoCodigo(x.codigo)) x.codigo = proximoCodigo(lista);
}

const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Busca por parte do nome (sem acento nem maiúscula) ou pelo código (igual ou começando pelo digitado).
export function casaBusca(item, termo) {
  const t = sem(termo);
  if (!t) return true;
  return sem(item.nome).includes(t) || sem(item.codigo).startsWith(t);
}

// Quando cada item foi usado pela última vez, no histórico visível (sem cancelados).
export function ultimosUsos(agendamentos, tipo) {
  const m = new Map();
  for (const a of agendamentos) {
    if (a.status === STATUS.CANCELADO) continue;
    const ts = a.criadoEm || a.inicio || 0;
    const ids = tipo === 'produto' ? (a.produtos || []).map((p) => p.materialId) : (a.status === STATUS.CONCLUIDO && a.servicosFeitos ? a.servicosFeitos : a.servicoIds || []);
    for (const id of ids) if (ts > (m.get(id) || 0)) m.set(id, ts);
  }
  return m;
}
// Últimos usados primeiro; quem nunca foi usado fica depois, na ordem do cadastro (empate também).
export function porUltimoUso(itens, agendamentos, tipo) {
  const u = ultimosUsos(agendamentos, tipo);
  return itens.map((x, i) => ({ x, i, t: u.get(x.id) || 0 })).sort((a, b) => b.t - a.t || a.i - b.i).map((o) => o.x);
}
