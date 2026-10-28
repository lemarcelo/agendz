/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:4a9efb8d88 */
// Comissão do profissional: quanto de cada atendimento fica com ele e quanto com o estabelecimento (puro, exceto `pagarComissao`).
// O profissional só enxerga a parte dele (`relatorioDoProfissional`); a parte do estabelecimento e o valor cheio só aparecem para o proprietário.
import { STATUS, limparTexto, pctComissao } from './rules.js';
import { itensDoAgendamento, produtosDoAgendamento, r2 } from './reports.js';
import { addDays, addMonths, fmtDate, fmtMonthYear, monthStart, startOfDay } from './time.js';
import { salvarLancamento } from './financeiro.js';
import { Rot, rot } from './tipos.js';

// Em que data o atendimento conta para a comissão: a do atendimento, ou (lançamento retroativo cujo período já foi pago) a do lançamento,
// que o põe no PRÓXIMO pagamento em vez de reabrir um mês fechado (`comissaoEm`, definido em `registrarAtendimentoLocal`).
export const dataComissao = (a) => (a.comissaoEm !== undefined && a.comissaoEm !== null ? a.comissaoEm : a.inicio);

const semComissao = (u) => !u || u.papel === 'dono' || u.papel === 'master'; // quem é dono não paga comissão a si mesmo

// Por serviço: base (o que o cliente pagou pelo serviço: valor + acréscimo − cupom), percentual do profissional, comissão e parte do estabelecimento.
export function comissaoDoAgendamento(st, a) {
  const profissional = st.usuarios.find((u) => u.id === a.profissionalId);
  const itens = itensDoAgendamento(st, a).map((i) => {
    const sv = st.servicos.find((x) => x.id === i.id);
    const pct = a.comissoes && a.comissoes[i.id] !== undefined ? a.comissoes[i.id] : pctComissao(st, profissional, sv);
    const base = Math.max(0, r2(i.valor + i.acrescimo - (i.desconto || 0)));
    const comissao = r2((base * pct) / 100);
    return { id: i.id, nome: i.nome, base, pct, comissao, casa: r2(base - comissao) };
  });
  // Produto vendido: comissão só se o produto tinha percentual quando foi adicionado (congelado em `p.pct`); sem percentual, tudo fica com o estabelecimento.
  const produtos = produtosDoAgendamento(st, a).map((p) => {
    const linha = a.produtos.find((x) => x.materialId === p.id) || {};
    const vendedorId = linha.vendedorId || a.profissionalId;
    // Proprietário vendendo: fica tudo com ele (como nos serviços), sem percentual de produto.
    const pct = semComissao(st.usuarios.find((u) => u.id === vendedorId)) ? 100 : linha.pct || 0;
    const comissao = r2((p.valor * pct) / 100);
    return { id: p.id, nome: p.nome, qtd: p.qtd, base: p.valor, pct, comissao, casa: r2(p.valor - comissao), vendedorId };
  });
  const soma = (k) => r2(itens.reduce((t, i) => t + i[k], 0) + produtos.reduce((t, i) => t + i[k], 0));
  return { itens, produtos, base: soma('base'), comissao: soma('comissao'), casa: soma('casa') };
}

// Quem recebe o quê: os serviços (e os produtos que ele mesmo vendeu) são do profissional do atendimento; o produto vendido por outra pessoa
// (atendente, outro profissional) é da comissão dela. Cada parte tem o seu próprio "pago" (`a.comissaoPaga` do profissional; `comissaoPaga` na linha do produto dos demais).
export function partesDoAgendamento(st, a) {
  const c = comissaoDoAgendamento(st, a);
  const mapa = new Map();
  const parte = (quem) => { if (!mapa.has(quem)) mapa.set(quem, { quem, itens: [], produtos: [], base: 0, comissao: 0, casa: 0 }); return mapa.get(quem); };
  if (c.itens.length) parte(a.profissionalId).itens = c.itens;
  for (const p of c.produtos) parte(p.vendedorId).produtos.push(p);
  const out = [...mapa.values()];
  for (const p of out) {
    for (const k of ['base', 'comissao', 'casa']) p[k] = r2([...p.itens, ...p.produtos].reduce((t, i) => t + i[k], 0));
    p.paga = p.quem === a.profissionalId ? !!a.comissaoPaga : p.produtos.every((x) => (a.produtos.find((l) => l.materialId === x.id) || {}).comissaoPaga);
    // Comissão cancelada pelo proprietário (com motivo): vale zero e a parte vira do estabelecimento; o valor original fica em `comissaoOriginal`.
    const canc = p.quem === a.profissionalId ? a.comissaoCancelada : (p.produtos.length && p.produtos.every((x) => (a.produtos.find((l) => l.materialId === x.id) || {}).comissaoCancelada) ? a.produtos.find((l) => l.materialId === p.produtos[0].id).comissaoCancelada : null);
    p.cancelada = !!canc; p.motivoCancelada = canc ? canc.motivo : '';
    if (p.cancelada) { p.comissaoOriginal = p.comissao; p.comissao = 0; p.casa = p.base; }
  }
  return out;
}
const marcarCancelada = (a, parte, info) => {
  if (parte.quem === a.profissionalId) { if (info) a.comissaoCancelada = info; else delete a.comissaoCancelada; return; }
  for (const l of a.produtos || []) if (parte.produtos.some((x) => x.id === l.materialId)) { if (info) l.comissaoCancelada = info; else delete l.comissaoCancelada; }
};
const marcarPaga = (a, parte, flag) => {
  if (parte.quem === a.profissionalId) { a.comissaoPaga = flag; return; }
  for (const l of a.produtos || []) if (parte.produtos.some((x) => x.id === l.materialId)) l.comissaoPaga = flag;
};

export const MAX_DIAS_PERIODO = 366;
// Período da comissão: De/Até (dias inclusive) ou, sem datas, o mês de `mesTs`. Devolve [ini, fim) em ms ou { erro }.
export function intervaloComissao({ mesTs, deTs, ateTs }) {
  if (deTs === undefined || deTs === null || ateTs === undefined || ateTs === null) {
    const ini = monthStart(mesTs); return { ini, fim: addMonths(ini, 1) };
  }
  const ini = startOfDay(deTs); const fim = addDays(startOfDay(ateTs), 1);
  if (!(fim > ini)) return { erro: 'A data final não pode ser antes da inicial.' };
  if (fim - ini > MAX_DIAS_PERIODO * 24 * 3600 * 1000 + 3600 * 1000) return { erro: `O período pode ter no máximo ${MAX_DIAS_PERIODO} dias.` };
  return { ini, fim };
}
const rotuloPeriodo = ({ ini, fim }) => (ini === monthStart(ini) && fim === addMonths(ini, 1) ? fmtMonthYear(ini) : `${fmtDate(ini)} a ${fmtDate(fim - 1)}`);
const doMes = (st, { ini, fim }) => {
  return st.agendamentos.filter((a) => a.status === STATUS.CONCLUIDO && dataComissao(a) >= ini && dataComissao(a) < fim);
};

// Visão do proprietário: por profissional, quanto ele ganhou de comissão, quanto já foi pago e quanto ainda se deve.
export function relatorioComissoes(st, per) {
  const por = new Map();
  for (const a of doMes(st, intervaloComissao(per))) {
    for (const c of partesDoAgendamento(st, a)) {
      const u = st.usuarios.find((x) => x.id === c.quem);
      const x = por.get(c.quem) || { id: c.quem, nome: u ? u.apelido || u.nome : '—', semComissao: semComissao(u), atendimentos: 0, base: 0, comissao: 0, casa: 0, pago: 0, aPagar: 0, linhas: [] };
      x.atendimentos++; x.base = r2(x.base + c.base); x.comissao = r2(x.comissao + c.comissao); x.casa = r2(x.casa + c.casa);
      if (c.paga) x.pago = r2(x.pago + c.comissao); else if (!x.semComissao) x.aPagar = r2(x.aPagar + c.comissao);
      x.linhas.push({ a, ...c });
      por.set(c.quem, x);
    }
  }
  const profissionais = [...por.values()].sort((p, q) => q.comissao - p.comissao);
  const pagaveis = profissionais.filter((b) => !b.semComissao);
  return { profissionais, totais: { comissao: r2(pagaveis.reduce((t, b) => t + b.comissao, 0)), aPagar: r2(pagaveis.reduce((t, b) => t + b.aPagar, 0)), pago: r2(pagaveis.reduce((t, b) => t + b.pago, 0)), casa: r2(profissionais.reduce((t, b) => t + b.casa, 0)) } };
}

// Visão do próprio profissional: SÓ o que ele recebe. Nada de valor cheio, parte do estabelecimento, percentual nem custo de material.
export function relatorioDoProfissional(st, { mesTs, deTs, ateTs, profissionalId }) {
  const { ini, fim } = intervaloComissao({ mesTs, deTs, ateTs });
  // Atendimentos em que ele tem parte: os dele e as vendas de produto que ele fez em atendimento de outro.
  const doMesTodos = st.agendamentos.filter((a) => (a.status === STATUS.CONCLUIDO ? dataComissao(a) : a.inicio) >= ini && (a.status === STATUS.CONCLUIDO ? dataComissao(a) : a.inicio) < fim);
  const partesDele = (a) => partesDoAgendamento(st, a).filter((p) => p.quem === profissionalId);
  const linhas = doMesTodos.filter((a) => a.status === STATUS.CONCLUIDO).sort((x, y) => x.inicio - y.inicio).flatMap((a) => partesDele(a).map((c) => (
    { id: a.id, inicio: a.inicio, local: !!a.local, clienteId: a.clienteId, nomeAvulso: a.nomeAvulso || '', servicos: [...c.itens.map((i) => i.nome), ...c.produtos.map((p) => `${p.qtd}× ${p.nome}`)], receber: c.comissao, cancelada: c.cancelada, motivoCancelada: c.motivoCancelada, retroativo: !!a.retroativo, paga: c.paga, pagaEm: c.paga ? (c.quem === a.profissionalId ? a.comissaoPaga?.em : (a.produtos.find((l) => c.produtos.some((x) => x.id === l.materialId))?.comissaoPaga?.em)) || null : null }
  )));
  const previstos = doMesTodos.filter((a) => [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status));
  const soma = (l) => r2(l.reduce((t, x) => t + x.receber, 0));
  const prevPartes = previstos.flatMap(partesDele);
  return {
    linhas,
    totais: { atendimentos: linhas.length, receber: soma(linhas), jaPago: soma(linhas.filter((x) => x.paga)), aReceber: soma(linhas.filter((x) => !x.paga)) },
    previsto: { atendimentos: prevPartes.length, receber: r2(prevPartes.reduce((t, c) => t + c.comissao, 0)) },
  };
}

// Registra o pagamento da comissão do mês a um profissional: marca os atendimentos como pagos e lança a despesa no financeiro (categoria "Comissões").
export function pagarComissao(s, { profissionalId, mesTs, deTs, ateTs }, autor, agora) {
  const per = intervaloComissao({ mesTs, deTs, ateTs });
  if (per.erro) return { ok: false, erros: [per.erro] };
  const u = s.usuarios.find((x) => x.id === profissionalId);
  if (!u) return { ok: false, erros: [`${Rot('profissional')} não encontrado.`] };
  if (semComissao(u)) return { ok: false, erros: ['O proprietário não recebe comissão: o que ele atende já é dele.'] };
  const abertos = doMes(s, per).flatMap((a) => partesDoAgendamento(s, a).filter((c) => c.quem === profissionalId && !c.paga && !c.cancelada).map((c) => ({ a, c })));
  const valor = r2(abertos.reduce((t, x) => t + x.c.comissao, 0));
  if (!abertos.length || !(valor > 0)) return { ok: false, erros: [`Não há comissão a pagar neste período para esse ${rot('profissional')}.`] };
  const nome = u.apelido || u.nome;
  const l = salvarLancamento(s, { tipo: 'despesa', descricao: `Comissão de ${nome} (${rotuloPeriodo(per)})`, valor, data: agora, categoria: 'Comissões' }, autor, agora);
  if (!l.ok) return l;
  s.comissoesPagas = s.comissoesPagas || [];
  const p = { id: `cm${s.comissoesPagas.length + 1}-${abertos[0].a.id}`, profissionalId, mesTs: per.ini, ateTs: per.fim - 1, valor, agendamentoIds: abertos.map((x) => x.a.id), em: agora, autor: { nome: autor?.nome, id: autor?.id }, lancamentoId: l.lancamento.id };
  s.comissoesPagas.push(p);
  for (const { a, c } of abertos) marcarPaga(a, c, { pagamentoId: p.id, em: agora });
  return { ok: true, valor, atendimentos: abertos.length, pagamento: p };
}

// Cancelar a comissão de um atendimento (só o proprietário; o motivo é obrigatório e fica no histórico). A parte do beneficiário vira do estabelecimento.
// Comissão já paga não se cancela. `quem` = o beneficiário (padrão: o profissional do atendimento; o vendedor de um produto de outra pessoa também tem a dele).
// POST /agendamentos/{id}/comissao/cancelar  { quem?, motivo }
export function cancelarComissao(s, { agendamentoId, quem, motivo }, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === agendamentoId);
  if (!a || a.status === STATUS.CANCELADO) return { ok: false, erros: ['Agendamento não encontrado.'] };
  const alvo = quem || a.profissionalId;
  const parte = partesDoAgendamento(s, a).find((p) => p.quem === alvo);
  if (!parte) return { ok: false, erros: ['Esse atendimento não tem comissão para essa pessoa.'] };
  if (semComissao(s.usuarios.find((u) => u.id === alvo))) return { ok: false, erros: ['O proprietário não recebe comissão: o que ele atende já é dele.'] };
  if (parte.paga) return { ok: false, erros: ['Comissão já paga: não dá para cancelar.'] };
  if (parte.cancelada) return { ok: false, erros: ['A comissão já está cancelada.'] };
  const m = limparTexto(String(motivo || ''), 300).trim();
  if (m.length < 5) return { ok: false, erros: ['Informe o motivo do cancelamento da comissão (pelo menos 5 letras).'] };
  marcarCancelada(a, parte, { motivo: m, em: agora, autor: { nome: autor?.nome, id: autor?.id } });
  a.log.push({ id: `l${++s.seq}`, em: agora, autor, campo: 'comissão', de: nomeCurto(s, alvo), para: `Cancelada: ${m}` });
  return { ok: true, agendamento: a };
}
// Desfaz o cancelamento (enquanto não foi paga: aliás, cancelada nunca é paga). Fica no histórico.
// POST /agendamentos/{id}/comissao/restaurar  { quem? }
export function restaurarComissao(s, { agendamentoId, quem }, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === agendamentoId);
  if (!a || a.status === STATUS.CANCELADO) return { ok: false, erros: ['Agendamento não encontrado.'] };
  const alvo = quem || a.profissionalId;
  const parte = partesDoAgendamento(s, a).find((p) => p.quem === alvo);
  if (!parte || !parte.cancelada) return { ok: false, erros: ['Não há comissão cancelada para restaurar.'] };
  marcarCancelada(a, parte, null);
  a.log.push({ id: `l${++s.seq}`, em: agora, autor, campo: 'comissão', de: `Cancelada: ${parte.motivoCancelada}`, para: `Restaurada (${nomeCurto(s, alvo)})` });
  return { ok: true, agendamento: a };
}
const nomeCurto = (s, id) => { const u = s.usuarios.find((x) => x.id === id); return u ? u.apelido || u.nome : '—'; };
