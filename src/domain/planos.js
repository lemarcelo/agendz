/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço (puro): catálogo, assinatura do cliente e cota mensal de atendimentos. Não conhece a tela, o relógio nem o motor da agenda.
//
// Regras (spec: prompt-agendz-regras.md, v109):
// - O pagamento é DIRETO com o profissional; o sistema só registra. Os atendimentos do mês só existem depois que o dono registra a mensalidade daquele mês.
// - A cota é derivada dos agendamentos (como o uso do cupom): não há contador. Cada agendamento com `planoUso` gasta 1 atendimento do mês dele.
// - Atendimentos que sobram acumulam para o mês seguinte, até o teto (atendimentos × meses de acúmulo). Passou do que tem: gasta o mês seguinte (adiantamento),
//   até o limite do plano (padrão 1 atendimento a mais) e só num mês já pago. Esgotou tudo: não agenda mais até a próxima mensalidade.
// - Antifraude: crédito só com pagamento registrado; adiantamento limitado; 2 meses sem pagar zeram o saldo acumulado; intervalo mínimo entre atendimentos;
//   atendimento cancelado pelo cliente volta, mas a falta de confirmação consome; cancelar o plano com atendimento adiantado deixa dívida que trava um plano novo.
import { STATUS } from './rules.js';
import { DIA, MESES, startOfDay, ymd } from './time.js';
import { limparTexto } from './texto.js';

export const LIMITE_PLANOS = 20;
export const LIMITE_ASSINATURAS = 1000;
export const MAX_PEDIDOS_ABERTOS = 30; // pedidos pelo link aguardando o dono
export const CORTES_MAX = 31;
export const ADIANTA_PADRAO = 1;
export const ADIANTA_MAX = 3;
export const ACUMULO_PADRAO = 2; // meses de atendimentos que podem acumular
export const ACUMULO_MAX = 6;
export const INTERVALO_PADRAO = 3; // dias mínimos entre dois atendimentos do mesmo plano
export const INTERVALO_MAX = 30;
export const MESES_A_FRENTE = 3; // até quantos meses adiante a mensalidade pode ser registrada
export const MAX_FIXOS = 3;
export const DIAS_FIXOS_A_FRENTE = 14; // o horário fixo vira agendamento com esta antecedência
export const VALIDADE_MAX = 24; // meses de validade do plano (0 = sem prazo)
export const ATRASO_ZERA_MESES = 2; // meses seguidos sem pagar zeram o saldo acumulado
export const SITUACAO = { pendente: 'Aguardando pagamento', ativa: 'Ativa', cancelada: 'Encerrada' };

export const r2 = (n) => Math.round(n * 100) / 100;

// ---------- meses ('AAAA-MM') ----------
export const mesDe = (ts) => ymd(ts).slice(0, 7);
const mi = (m) => { const [y, mo] = m.split('-').map(Number); return y * 12 + mo - 1; };
const doIdx = (i) => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
export const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export const somaMeses = (m, n) => doIdx(mi(m) + n);
export const rotuloMes = (m) => (MES.test(m || '') ? `${MESES[Number(m.slice(5)) - 1]}/${m.slice(0, 4)}` : '');

// ---------- catálogo ----------
// Valida e normaliza um plano vindo de fora (`d`: nome, descricao, preco, cortes, servicoIds, adianta, acumuloMeses, intervaloDias, ativo).
export function montarPlano(s, d, atual) {
  const erros = [];
  const nome = limparTexto(String(d.nome ?? ''), 60).trim();
  if (nome.length < 2) erros.push('Dê um nome ao plano (2 a 60 letras).');
  const dup = (s.planos || []).some((p) => p.id !== atual?.id && p.nome.toLowerCase() === nome.toLowerCase());
  if (nome && dup) erros.push('Já existe um plano com esse nome.');
  const preco = Number(d.preco);
  if (!Number.isFinite(preco) || preco <= 0 || preco > 99999) erros.push('Informe o valor mensal do plano.');
  const cortes = Number(d.cortes);
  if (!Number.isInteger(cortes) || cortes < 1 || cortes > CORTES_MAX) erros.push(`Atendimentos por mês: de 1 a ${CORTES_MAX}.`);
  const pids = d.produtoIds === undefined || d.produtoIds === null ? [] : d.produtoIds;
  if (!Array.isArray(pids) || pids.length > 10 || new Set(pids).size !== pids.length) erros.push('Escolha até 10 produtos incluídos, sem repetir.');
  else if (pids.some((id) => typeof id !== 'string' || !(s.materiais || []).some((x) => x.id === id && x.tipo === 'produto' && x.ativo !== false))) erros.push('Produto do plano não encontrado.');
  const ids = Array.isArray(d.servicoIds) ? d.servicoIds : [];
  if (!ids.length || ids.length > 10 || new Set(ids).size !== ids.length) erros.push('Escolha de 1 a 10 serviços que o plano inclui, sem repetir.');
  else if (ids.some((id) => typeof id !== 'string' || !s.servicos.some((x) => x.id === id && !x.combo))) erros.push('Serviço do plano não encontrado.');
  const inteiro = (v, padrao, min, max, rot) => {
    if (v === undefined || v === null || v === '') return padrao;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) { erros.push(`${rot}: de ${min} a ${max}.`); return padrao; }
    return n;
  };
  const adianta = inteiro(d.adianta, ADIANTA_PADRAO, 0, ADIANTA_MAX, 'Atendimentos a mais permitidos');
  const acumuloMeses = inteiro(d.acumuloMeses, ACUMULO_PADRAO, 1, ACUMULO_MAX, 'Meses de acúmulo');
  const intervaloDias = inteiro(d.intervaloDias, INTERVALO_PADRAO, 0, INTERVALO_MAX, 'Intervalo entre atendimentos (dias)');
  const validadeMeses = inteiro(d.validadeMeses, 0, 0, VALIDADE_MAX, 'Validade (meses)');
  if (erros.length) return { ok: false, erros };
  return { ok: true, dados: { nome, descricao: limparTexto(String(d.descricao ?? ''), 200).trim(), observacoes: limparTexto(String(d.observacoes ?? ''), 300).trim(), produtoIds: [...pids], validadeMeses, preco: r2(preco), cortes, servicoIds: [...ids], adianta, acumuloMeses, intervaloDias, ativo: d.ativo !== false } };
}

// Cópia do plano como era na hora da contratação: mudar o plano depois não mexe em quem já assinou.
export const fotoDoPlano = (p) => ({ nome: p.nome, preco: p.preco, cortes: p.cortes, servicoIds: [...p.servicoIds], produtoIds: [...(p.produtoIds || [])], validadeMeses: p.validadeMeses || 0, adianta: p.adianta, acumuloMeses: p.acumuloMeses, intervaloDias: p.intervaloDias });

// Último mês em que o plano vale (validade em meses a partir do mês de início); sem validade, null.
export const fimDoPlano = (as) => (as.plano.validadeMeses > 0 && as.inicioMes ? somaMeses(as.inicioMes, as.plano.validadeMeses - 1) : null);

// ---------- uso e cota ----------
// Atendimento gasto: qualquer agendamento do plano que não foi cancelado. Cancelado devolve o atendimento, menos a falta de confirmação de um horário que não nasceu do link
// (o cliente deixou de confirmar; no link quem não confirmou foi o estabelecimento).
export const consomeCorte = (a) => a.status !== STATUS.CANCELADO || (a.motivoCancelamento === 'falta_confirmacao' && a.origem !== 'link');
export const usosDaAssinatura = (s, as) => (s.agendamentos || []).filter((a) => a.planoUso && a.planoUso.assinaturaId === as.id && consomeCorte(a));
export const pagamentosValidos = (as) => (as.pagamentos || []).filter((p) => !p.estornado);

// Linha a linha, mês a mês, desde o primeiro mês pago. `extras`: inícios de agendamentos hipotéticos (para perguntar "dá para agendar mais um?").
export function extrato(s, as, agora, { extras = [], ignoreId = null } = {}) {
  const pag = pagamentosValidos(as);
  if (!pag.length || !as.inicioMes) return { linhas: [], saldo: 0, mesAtual: mesDe(agora) };
  const p = as.plano;
  const mesAtual = mesDe(agora);
  const ini = mi(as.inicioMes);
  const usos = [...usosDaAssinatura(s, as).filter((a) => a.id !== ignoreId).map((a) => a.inicio), ...extras];
  const pagos = new Set(pag.map((x) => x.mes));
  const porMes = new Map();
  for (const t of usos) { const i = Math.max(mi(mesDe(t)), ini); porMes.set(i, (porMes.get(i) || 0) + 1); }
  const fim = Math.min(Math.max(mi(mesAtual), ...[...pagos].map(mi), ...porMes.keys()), ini + 48);
  const teto = p.cortes * p.acumuloMeses;
  const linhas = [];
  let bal = 0;
  let semPagar = 0;
  for (let i = ini; i <= fim; i++) {
    const mes = doIdx(i);
    const pago = pagos.has(mes);
    if (pago) semPagar = 0; else if (i <= mi(mesAtual)) semPagar++;
    const concedidos = pago ? p.cortes : 0;
    bal = Math.min(bal + concedidos, Math.max(teto, bal));
    let zerou = false;
    if (!pago && semPagar >= ATRASO_ZERA_MESES && bal > 0) { bal = 0; zerou = true; } // atraso: o acumulado expira
    const usados = porMes.get(i) || 0;
    bal -= usados;
    const limite = pago ? p.adianta : 0;
    linhas.push({ mes, pago, concedidos, usados, saldoFim: bal, limite, estourou: bal < -limite, zerou });
  }
  return { linhas, saldo: linhas.length ? linhas[linhas.length - 1].saldoFim : 0, mesAtual };
}

// O que o cliente (ou o dono) vê agora: atendimentos que restam, quantos pode ainda pedir a mais e até quando está pago.
export function saldoAtual(s, as, agora) {
  const base = { validoAte: fimDoPlano(as), assinaturaId: as.id, planoNome: as.plano.nome, situacao: as.status, cortesPorMes: as.plano.cortes, mes: mesDe(agora) };
  if (as.status !== 'ativa') return { ...base, pagoMes: false, restantes: 0, usadosNoMes: 0, maisPermitidos: 0, pagoAte: null, atrasado: false };
  const ex = extrato(s, as, agora);
  const linha = ex.linhas.filter((l) => mi(l.mes) <= mi(ex.mesAtual)).pop() || ex.linhas[0];
  const pagos = pagamentosValidos(as).map((x) => x.mes).sort();
  const pagoAte = pagos.length ? pagos[pagos.length - 1] : null;
  if (!linha) return { ...base, pagoMes: false, restantes: 0, usadosNoMes: 0, maisPermitidos: 0, pagoAte, atrasado: false };
  const mesCorrente = linha.mes === ex.mesAtual;
  const restantes = mi(linha.mes) > mi(ex.mesAtual) ? 0 : Math.max(0, linha.saldoFim);
  return {
    ...base, pagoMes: mesCorrente && linha.pago, restantes, usadosNoMes: mesCorrente ? linha.usados : 0, maisPermitidos: Math.max(0, linha.saldoFim + linha.limite) - restantes, pagoAte,
    atrasado: !(mesCorrente && linha.pago) && !!pagoAte && mi(pagoAte) < mi(ex.mesAtual),
  };
}

// Dá para agendar mais um atendimento nesse plano em `inicio`? Devolve { ok, erro } ou { ok, adiantado, aviso }.
export function podeUsar(s, as, { inicio, agora, ignoreId = null }) {
  if (!as || as.status !== 'ativa') return { ok: false, erro: 'Esse plano não está ativo.' };
  if (!Number.isFinite(inicio)) return { ok: false, erro: 'Escolha um dia e um horário.' };
  if (!pagamentosValidos(as).length) return { ok: false, erro: 'A mensalidade do plano ainda não foi registrada.' };
  const mes = mesDe(inicio);
  if (mi(mes) < mi(as.inicioMes)) return { ok: false, erro: `O plano começa em ${rotuloMes(as.inicioMes)}.` };
  const fim = fimDoPlano(as);
  if (fim && mi(mes) > mi(fim)) return { ok: false, erro: `O plano vale até ${rotuloMes(fim)}.` };
  const dias = as.plano.intervaloDias;
  if (dias > 0) {
    const dia = startOfDay(inicio);
    const perto = usosDaAssinatura(s, as).some((a) => a.id !== ignoreId && Math.abs(Math.round((startOfDay(a.inicio) - dia) / DIA)) < dias);
    if (perto) return { ok: false, erro: `Esse plano pede ${dias} dia${dias > 1 ? 's' : ''} entre um corte e outro.` };
  }
  const ex = extrato(s, as, agora, { extras: [inicio], ignoreId });
  const ruim = ex.linhas.find((l) => l.estourou);
  if (ruim) {
    if (!ruim.pago) return { ok: false, erro: `Os cortes do plano acabaram. A mensalidade de ${rotuloMes(ruim.mes)} ainda não foi registrada.` };
    if (ruim.mes !== mes) return { ok: false, erro: `Esse horário deixaria o plano sem atendimentos em ${rotuloMes(ruim.mes)}.` };
    return { ok: false, erro: `Os cortes do plano em ${rotuloMes(mes)} acabaram.` };
  }
  const linha = ex.linhas.find((l) => l.mes === mes);
  const adiantado = !!linha && linha.saldoFim < 0;
  const proximo = ex.linhas.find((l) => l.mes === somaMeses(mes, 1));
  return { ok: true, adiantado, aviso: adiantado ? `Esse corte foi adiantado do mês seguinte${proximo ? ` (em ${rotuloMes(proximo.mes)} restam ${Math.max(0, proximo.saldoFim)})` : ''}.` : '' };
}

// Dívida de quem encerrou o plano devendo atendimento adiantado: os usos que passaram do que foi pago.
export function dividaAoEncerrar(s, as, agora) {
  const ex = extrato(s, as, agora);
  return Math.max(0, -ex.saldo);
}

// ---------- ligação com o agendamento ----------
export const coberturaDoPlano = (plano, servicoIds) => servicoIds.filter((id) => plano.servicoIds.includes(id));

// A assinatura que o cliente pode usar: ativa, dele e com ao menos um serviço do plano no agendamento. Devolve { ok, uso, aviso } ou { ok:false, erro }.
export function usoParaAgendamento(s, { assinaturaId, clienteId, servicoIds, inicio, agora, ignoreId = null }) {
  const as = typeof assinaturaId === 'string' ? (s.assinaturas || []).find((x) => x.id === assinaturaId && x.clienteId === clienteId) : null;
  if (!as) return { ok: false, erro: 'Plano não encontrado para esse cliente.' };
  if (!coberturaDoPlano(as.plano, servicoIds).length) return { ok: false, erro: `Nenhum dos serviços escolhidos faz parte do plano ${as.plano.nome}.` };
  const pu = podeUsar(s, as, { inicio, agora, ignoreId });
  if (!pu.ok) return { ok: false, erro: pu.erro };
  return { ok: true, uso: { assinaturaId: as.id, planoNome: as.plano.nome, incluidos: [...as.plano.servicoIds], produtosIncluidos: [...(as.plano.produtoIds || [])], em: agora }, aviso: pu.aviso, adiantado: pu.adiantado };
}

// Itens (de `itensDoAgendamento`) que o plano cobre: saem de graça. O que não é do plano é cobrado normalmente.
export const coberturaDosItens = (uso, itens) => (uso && Array.isArray(uso.incluidos) ? itens.filter((i) => uso.incluidos.includes(i.id) && i.valor > 0).map((i) => i.id) : []);
export function descontosDoPlano(uso, itens) {
  const out = {};
  for (const i of itens) if (coberturaDosItens(uso, itens).includes(i.id)) out[i.id] = r2(i.valor);
  return out;
}

// ---------- visões ----------
export const assinaturaDoCliente = (s, clienteId) => (s.assinaturas || []).find((x) => x.clienteId === clienteId && x.status === 'ativa') || null;
export const abertaDoCliente = (s, clienteId) => (s.assinaturas || []).find((x) => x.clienteId === clienteId && (x.status === 'ativa' || x.status === 'pendente')) || null;
export const dividaDoCliente = (s, clienteId) => (s.assinaturas || []).reduce((t, x) => t + (x.clienteId === clienteId && x.status === 'cancelada' && x.divida > 0 && !x.dividaQuitada ? x.divida : 0), 0);

// Só o que a página pública mostra do catálogo: nada de dado de cliente.
export function planosPublicos(s) {
  return (s.planos || []).filter((p) => p.ativo !== false).map((p) => ({
    id: p.id, nome: p.nome, descricao: p.descricao || '', preco: p.preco, cortes: p.cortes,
    servicos: p.servicoIds.map((id) => s.servicos.find((x) => x.id === id)?.nome).filter(Boolean),
    produtos: (p.produtoIds || []).map((id) => (s.materiais || []).find((x) => x.id === id)?.nome).filter(Boolean), validadeMeses: p.validadeMeses || 0,
  }));
}

// Mensalidades do mês que ainda não foram registradas (assinaturas ativas) — a lista de "a receber" do dono.
export function aReceber(s, agora) {
  const mes = mesDe(agora);
  return (s.assinaturas || []).filter((as) => as.status === 'ativa' && mi(as.inicioMes) <= mi(mes) && !pagamentosValidos(as).some((p) => p.mes === mes));
}
