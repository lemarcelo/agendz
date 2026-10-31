/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:ea89e3638c */
// Pagamento do atendimento local: a forma (Pix, dinheiro, cartão) gera receitas no financeiro, na conta daquela forma.
// A cada passada do relógio (`tickFinanceiro`) o financeiro compara o valor do atendimento com o que já foi lançado e cobre a diferença:
// valor a mais (produto ou serviço acrescentado depois) vira uma nova receita; valor a menos (retirada, cancelamento) vira um estorno.
// Só registra o que o cliente JÁ pagou: não existe "a receber".
import { ganchos, nextId, registrar, AUTOR_SISTEMA } from './engine.js';
import { contaDe, grupoDe, grupoDoServico } from './financeiro.js';
import { itensDoAgendamento, produtosDoAgendamento, r2, totalAgendamento, totalProdutos } from './reports.js';
import { FORMAS_PAGAMENTO, formaValida, STATUS } from './rules.js';
export { formaEfetiva } from './rules.js';
import { startOfDay } from './time.js';

export const CATEGORIA_ESTORNO = 'Estornos';
export const categoriaDaForma = (forma) => `Atendimentos (${FORMAS_PAGAMENTO[forma]})`;

export const totalDoAtendimento = (st, a) => r2(totalAgendamento(st, a) + totalProdutos(st, a));

// Grupo de movimentação do item mais valioso do atendimento (serviço ou produto); sem grupo próprio, o padrão do estabelecimento.
function grupoDoAtendimento(s, a) {
  let melhor = null;
  for (const it of itensDoAgendamento(s, a)) {
    const v = r2(it.valor + it.acrescimo - (it.desconto || 0));
    if (!melhor || v > melhor.v) melhor = { v, g: grupoDoServico(s, s.servicos.find((x) => x.id === it.id)) };
  }
  for (const p of produtosDoAgendamento(s, a)) {
    if (!melhor || p.valor > melhor.v) { const m = s.materiais.find((x) => x.id === p.id); melhor = { v: p.valor, g: grupoDe(s, m && m.grupoMovimentacaoId) || grupoDe(s, s.estabelecimento.grupoMovimentacaoId) }; }
  }
  return (melhor && melhor.g) || grupoDe(s, s.estabelecimento.grupoMovimentacaoId);
}
// Conta da forma: a escolhida em Estabelecimento; sem escolha, a conta do grupo de movimentação do atendimento.
export function contaDaForma(s, forma, grupo) {
  const id = (s.estabelecimento.contaPorForma || {})[forma];
  return contaDe(s, id) || (grupo && contaDe(s, grupo.contaId)) || null;
}

const lancsDoAtendimento = (s, a) => s.financeiro.lancamentos.filter((l) => l.agendamentoId === a.id && l.origem === 'atendimento');
export const liquidoLancado = (s, a) => r2(lancsDoAtendimento(s, a).reduce((t, l) => t + (l.tipo === 'credito' ? l.valor : -l.valor), 0));

const descricaoAtendimento = (s, a) => {
  const nomes = [...itensDoAgendamento(s, a).map((i) => i.nome), ...produtosDoAgendamento(s, a).map((p) => `${p.qtd}× ${p.nome}`)].join(' + ') || 'atendimento';
  return `${a.nomeAvulso ? `${a.nomeAvulso}: ` : ''}${nomes}`;
};

export function sincronizarPagamentoLocal(s, a, agora) {
  if (!a.local || !a.pagamento || !formaValida(a.pagamento.forma)) return;
  const alvo = a.status === STATUS.CANCELADO ? 0 : totalDoAtendimento(s, a);
  const jaTem = lancsDoAtendimento(s, a);
  const diff = r2(alvo - liquidoLancado(s, a));
  if (!diff) return;
  if (!jaTem.length && !(alvo > 0)) return;
  const grupo = grupoDoAtendimento(s, a);
  const conta = contaDaForma(s, a.pagamento.forma, grupo);
  if (!conta) return;
  const forma = FORMAS_PAGAMENTO[a.pagamento.forma];
  const credito = diff > 0;
  let desc;
  if (!jaTem.length) desc = `Atendimento local (${forma}): ${descricaoAtendimento(s, a)}`;
  else if (credito) desc = `Complemento do atendimento local (${forma}): ${descricaoAtendimento(s, a)}`;
  else desc = a.status === STATUS.CANCELADO ? `Estorno (${forma}): atendimento local cancelado` : `Estorno (${forma}): atendimento local passou a valer menos`;
  const autorLog = (a.log && a.log[0] && a.log[0].autor) || AUTOR_SISTEMA;
  s.financeiro.lancamentos.unshift({
    id: nextId(s, 'f'), tipo: credito ? 'credito' : 'despesa', descricao: desc, valor: Math.abs(diff), data: startOfDay(jaTem.length ? agora : Math.min(agora, a.inicio)), categoria: credito ? categoriaDaForma(a.pagamento.forma) : CATEGORIA_ESTORNO,
    origem: 'atendimento', agendamentoId: a.id, forma: a.pagamento.forma, ...(credito ? {} : { estorno: true }), grupoId: grupo ? grupo.id : null, contaId: conta.id,
    conciliado: false, extratoId: null, criadoEm: agora, autor: jaTem.length ? AUTOR_SISTEMA : autorLog,
  });
}

function tickPagamentoLocal(s, agora) {
  for (const a of s.agendamentos) if (a.local && a.pagamento) sincronizarPagamentoLocal(s, a, agora);
}
ganchos.push(tickPagamentoLocal);

// v119: trocar a forma de pagamento de um agendamento (segurar o cartão). Vale para futuro e concluído, nunca para cancelado.
// Atendimento local já lançado no financeiro: as receitas e estornos mudam de forma, de conta e de categoria juntos; se alguma já foi conciliada
// com o extrato, recusa (a conciliação é do banco e não se mexe sozinha). Agendamento comum só guarda a escolha. Registra no histórico.
export function trocarFormaDoAgendamento(s, a, forma, autor, agora) {
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (!formaValida(forma)) return { ok: false, erros: ['Forma de pagamento inválida.'] };
  if (a.status === STATUS.CANCELADO) return { ok: false, erros: ['Agendamento cancelado não tem forma de pagamento.'] };
  const antes = a.pagamento && formaValida(a.pagamento.forma) ? a.pagamento.forma : '';
  if (antes === forma) return { ok: true, agendamento: a, igual: true };
  const lancs = a.local ? lancsDoAtendimento(s, a) : [];
  if (lancs.some((l) => l.conciliado)) return { ok: false, erros: ['O pagamento deste atendimento já foi conciliado com o banco. Desfaça a conciliação no Financeiro antes de trocar a forma.'] };
  if (lancs.length) {
    const conta = contaDaForma(s, forma, grupoDoAtendimento(s, a));
    if (!conta) return { ok: false, erros: [`A forma ${FORMAS_PAGAMENTO[forma]} não tem conta configurada. Defina em Estabelecimento > Regras.`] };
    for (const l of lancs) {
      const velha = FORMAS_PAGAMENTO[l.forma] || FORMAS_PAGAMENTO[antes] || '';
      if (velha && typeof l.descricao === 'string') l.descricao = l.descricao.replace(`(${velha})`, `(${FORMAS_PAGAMENTO[forma]})`);
      l.forma = forma; l.contaId = conta.id;
      if (l.tipo === 'credito') l.categoria = categoriaDaForma(forma);
    }
  }
  a.pagamento = { forma };
  registrar(s, a, autor, 'forma de pagamento', antes ? FORMAS_PAGAMENTO[antes] : '(padrão da loja)', FORMAS_PAGAMENTO[forma], agora);
  return { ok: true, agendamento: a };
}
