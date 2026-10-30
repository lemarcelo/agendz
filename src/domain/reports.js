/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:b45fe3c3a1 */
// Relatórios (puros): faturamento mensal e estoque. No Spring Boot viram consultas agregadas.
import { ATIVOS, STATUS, materiaisDoServico, servicoNoPorte, servicosPorIds } from './rules.js';
import { addMonths, monthStart } from './time.js';
import { descontosDoCupom } from './cupons.js';
import { descontosDoPlano } from './planos.js';

export const r2 = (n) => Math.round(n * 100) / 100;
export const r3 = (n) => Math.round(n * 1000) / 1000;

// Serviços considerados no valor do agendamento: concluído com confirmação dos serviços conta só o que foi feito.
export function itensDoAgendamento(st, a) {
  const ids = a.status === STATUS.CONCLUIDO && a.servicosFeitos ? a.servicosFeitos : a.servicoIds;
  const itens = ids.map((id) => {
    const s = st.servicos.find((x) => x.id === id);
    return { id, nome: s ? s.nome : id, valor: r2((a.precos && Object.hasOwn(a.precos, id) ? a.precos[id] : s && servicoNoPorte(s, a.porte).preco) ?? 0), acrescimo: r2(a.acrescimos?.[id] || 0) };
  });
  // Plano do cliente: os serviços que o plano inclui saem de graça (a mensalidade foi paga direto ao profissional). O cupom só vale para o resto.
  const dp = descontosDoPlano(a.planoUso, itens);
  // Cupom aplicado ao agendamento: o desconto sai do serviço (e é recalculado a cada edição de serviços).
  const d = descontosDoCupom(a.cupom, itens.filter((i) => dp[i.id] === undefined));
  return itens.map((i) => ({ ...i, desconto: r2(dp[i.id] ?? d[i.id] ?? 0), ...(dp[i.id] !== undefined ? { plano: true } : {}) }));
}
// Produtos vendidos no atendimento (materiais do tipo "produto"): quantidade e preço congelados ao adicionar. Não entram em desconto de cupom nem em comissão.
export function produtosDoAgendamento(st, a) {
  return (a.produtos || []).map((p) => {
    const m = st.materiais.find((x) => x.id === p.materialId);
    return { id: p.materialId, nome: m ? m.nome : p.materialId, unidade: m ? m.unidade : 'un', qtd: p.qtd, preco: p.preco, valor: r2(p.qtd * p.preco) };
  });
}
export const totalProdutos = (st, a) => r2(produtosDoAgendamento(st, a).reduce((t, p) => t + p.valor, 0));
export const somaItens = (itens) => ({ servicos: r2(itens.reduce((t, i) => t + i.valor, 0)), acrescimos: r2(itens.reduce((t, i) => t + i.acrescimo, 0)), descontos: r2(itens.reduce((t, i) => t + (i.desconto || 0), 0)) });
export const totalAgendamento = (st, a) => { const s = somaItens(itensDoAgendamento(st, a)); return r2(s.servicos + s.acrescimos - s.descontos); };
export const totalAcrescimos = (a) => r2(Object.values(a.acrescimos || {}).reduce((t, v) => t + Number(v || 0), 0));

// Consumo de materiais de um agendamento (soma dos serviços feitos).
export function consumoDoAgendamento(st, a) {
  const ids = a.servicosFeitos || a.servicoIds;
  const out = {};
  for (const sv of servicosPorIds(st, ids, a.porte)) for (const m of materiaisDoServico(st, sv)) out[m.materialId] = r3((out[m.materialId] || 0) + Number(m.qtd));
  for (const p of a.produtos || []) out[p.materialId] = r3((out[p.materialId] || 0) + Number(p.qtd)); // produtos vendidos saem do estoque junto
  return out;
}

export function relatorioMensal(st, { mesTs, profissionalId }) {
  const ini = monthStart(mesTs);
  const fim = addMonths(ini, 1);
  const noMes = st.agendamentos.filter((a) => a.inicio >= ini && a.inicio < fim && (!profissionalId || a.profissionalId === profissionalId));
  const nomeB = (id) => { const u = st.usuarios.find((x) => x.id === id); return u ? u.apelido || u.nome : '—'; };
  const linhas = noMes.filter((a) => a.status === STATUS.CONCLUIDO).sort((x, y) => x.inicio - y.inicio).map((a) => {
    const itens = itensDoAgendamento(st, a);
    const s = somaItens(itens);
    const produtos = totalProdutos(st, a);
    return { a, itens, profissional: nomeB(a.profissionalId), ...s, produtos, total: r2(s.servicos + s.acrescimos - s.descontos + produtos) };
  });
  const prev = noMes.filter((a) => [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status));
  const previsto = { atendimentos: prev.length, total: r2(prev.reduce((t, a) => t + totalAgendamento(st, a), 0)) };
  const totais = { atendimentos: linhas.length, servicos: r2(linhas.reduce((t, l) => t + l.servicos, 0)), acrescimos: r2(linhas.reduce((t, l) => t + l.acrescimos, 0)), descontos: r2(linhas.reduce((t, l) => t + l.descontos, 0)), produtos: r2(linhas.reduce((t, l) => t + l.produtos, 0)), total: r2(linhas.reduce((t, l) => t + l.total, 0)) };
  const mapaB = new Map();
  for (const l of linhas) {
    const x = mapaB.get(l.a.profissionalId) || { id: l.a.profissionalId, nome: l.profissional, atendimentos: 0, servicos: 0, acrescimos: 0, total: 0 };
    x.produtos = r2((x.produtos || 0) + l.produtos);
    x.atendimentos++; x.servicos = r2(x.servicos + l.servicos); x.acrescimos = r2(x.acrescimos + l.acrescimos); x.total = r2(x.total + l.total);
    mapaB.set(l.a.profissionalId, x);
  }
  const mapaS = new Map();
  for (const l of linhas) for (const i of l.itens) {
    const x = mapaS.get(i.id) || { id: i.id, nome: i.nome, qtd: 0, valor: 0, acrescimos: 0 };
    x.qtd++; x.valor = r2(x.valor + i.valor); x.acrescimos = r2(x.acrescimos + i.acrescimo);
    mapaS.set(i.id, x);
  }
  const mapaP = new Map();
  for (const l of linhas) for (const p of produtosDoAgendamento(st, l.a)) {
    const x = mapaP.get(p.id) || { id: p.id, nome: p.nome, qtd: 0, valor: 0 };
    x.qtd = r3(x.qtd + p.qtd); x.valor = r2(x.valor + p.valor);
    mapaP.set(p.id, x);
  }
  const ids = new Set(linhas.map((l) => l.a.id));
  const custoMateriais = r2(st.movimentosEstoque.filter((m) => m.agendamentoId && ids.has(m.agendamentoId)).reduce((t, m) => {
    const mat = st.materiais.find((x) => x.id === m.materialId);
    return t - m.delta * (mat?.custo || 0);
  }, 0));
  return { ini, linhas, totais, previsto, porProfissional: [...mapaB.values()].sort((a, b) => b.total - a.total), porServico: [...mapaS.values()].sort((a, b) => b.qtd - a.qtd), porProduto: [...mapaP.values()].sort((a, b) => b.valor - a.valor), custoMateriais, resultado: r2(totais.total - custoMateriais) };
}

export const statusEstoque = (m) => (m.estoque < 0 ? 'negativo' : m.estoque === 0 ? 'zerado' : m.estoque <= (m.minimo || 0) ? 'baixo' : 'ok');

export function relatorioEstoque(st, { mesTs }) {
  const ini = monthStart(mesTs);
  const fim = addMonths(ini, 1);
  const movs = st.movimentosEstoque.filter((m) => m.em >= ini && m.em < fim);
  const itens = st.materiais.map((m) => {
    const mv = movs.filter((x) => x.materialId === m.id);
    const consumo = r3(-mv.filter((x) => x.agendamentoId).reduce((t, x) => t + x.delta, 0));
    const entradas = r3(mv.filter((x) => !x.agendamentoId && x.delta > 0).reduce((t, x) => t + x.delta, 0));
    const ajustes = r3(mv.filter((x) => x.tipo === 'ajuste').reduce((t, x) => t + x.delta, 0));
    return { m, status: statusEstoque(m), consumo, entradas, ajustes, custoConsumo: r2(consumo * (m.custo || 0)), valorEmEstoque: r2(Math.max(0, m.estoque) * (m.custo || 0)) };
  });
  return { ini, itens, movimentos: movs.sort((a, b) => b.em - a.em), custoConsumoTotal: r2(itens.reduce((t, i) => t + i.custoConsumo, 0)), valorTotalEstoque: r2(itens.reduce((t, i) => t + i.valorEmEstoque, 0)), alertas: itens.filter((i) => i.status !== 'ok' && i.m.ativo !== false) };
}
export { ATIVOS };
