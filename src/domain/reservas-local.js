/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Horários que o cliente pediu pelo link, guardados só no navegador dele (sem consultar a agenda): data/hora, serviços e profissional de cada um, mais o nome e o
// telefone para preencher o formulário da próxima vez. A validade vem do próprio horário: passou da hora, o item some; sem nenhum item, o nome e o telefone também
// somem. Puro (recebe o texto guardado e o "agora"); quem lê e grava o localStorage é a página. Nada de token aqui: o acesso a cada horário fica em outra chave.
export const MAX_RESERVAS = 20;
const ID = /^[0-9a-f-]{36}$/i;
const lista = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const txt = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const ts = (v) => (Number.isFinite(v) && v > 0 ? v : null);

export const VAZIO = Object.freeze({ cliente: null, itens: [] });

function itemValido(x) {
  if (!x || typeof x !== 'object' || !ID.test(String(x.id))) return null;
  const inicio = ts(x.inicio);
  if (inicio === null) return null;
  const fim = ts(x.fim) && x.fim > inicio ? x.fim : inicio + 30 * 60000; // sem fim confiável: 30 min
  return { id: String(x.id), inicio, fim, servicos: lista(x.servicos, 10).map((s) => txt(s, 120)).filter(Boolean), profissional: txt(x.profissional, 80) };
}

// Aceita o que veio do navegador (qualquer coisa) e devolve só o que ainda vale em `agora`: horários que ainda não terminaram, em ordem, e o cliente só se sobrou horário.
export function limparReservas(bruto, agora) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const vistos = new Set();
  const itens = lista(b.itens, MAX_RESERVAS * 2).map(itemValido).filter((x) => x && x.fim > agora && !vistos.has(x.id) && vistos.add(x.id)).sort((a, c) => a.inicio - c.inicio).slice(0, MAX_RESERVAS);
  const c = b.cliente && typeof b.cliente === 'object' ? { nome: txt(b.cliente.nome, 60), telefone: txt(b.cliente.telefone, 20) } : null;
  return { cliente: itens.length && c && (c.nome || c.telefone) ? c : null, itens };
}

export const lerReservas = (texto, agora) => { let b = null; try { b = JSON.parse(texto || 'null'); } catch { b = null; } return limparReservas(b, agora); };

export function adicionarReserva(dados, { item, cliente }, agora) {
  const base = limparReservas(dados, agora);
  return limparReservas({ cliente: cliente || base.cliente, itens: [...base.itens.filter((x) => x.id !== (item && item.id)), item] }, agora);
}

export const removerReserva = (dados, id, agora) => limparReservas({ ...dados, itens: (dados && dados.itens ? dados.itens : []).filter((x) => x.id !== id) }, agora);

// Atualiza o horário de um item (remarcou) ou tira os que o servidor diz que não valem mais (cancelado, concluído). `situacao`: [{ id, inicio, fim, ativo }].
export function sincronizarReservas(dados, situacao, agora) {
  const porId = new Map(lista(situacao, 100).filter((s) => s && ID.test(String(s.id))).map((s) => [s.id, s]));
  const itens = (dados && dados.itens ? dados.itens : []).filter((x) => !porId.has(x.id) || porId.get(x.id).ativo !== false).map((x) => { const s = porId.get(x.id); return s && ts(s.inicio) ? { ...x, inicio: s.inicio, fim: ts(s.fim) || x.fim } : x; });
  return limparReservas({ ...dados, itens }, agora);
}
