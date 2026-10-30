/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço — a parte que mexe no estado: catálogo, assinatura do cliente, mensalidade, encerramento, pedido pelo link e consulta de saldo.
// A conta de atendimentos (cota, acúmulo, adiantamento) mora em planos.js (puro). O saldo é sempre DERIVADO dos agendamentos: não há contador gravado.
// O pagamento da mensalidade é direto com o profissional; aqui só se registra (e, havendo conta da forma, lança a receita no financeiro).
import { AUTOR_SISTEMA, criarAgendamento, ganchos, nextId, registrar, resolverClienteDoAtendimento } from './engine.js';
import { contaDaForma, CATEGORIA_ESTORNO } from './pagamento.js';
import { FORMAS_PAGAMENTO, STATUS, errosServicoIds, formaValida, ocupacao, sobrepoe, telefoneBrasileiro, telefoneNacional, validarHorario } from './rules.js';
import {
  DIAS_FIXOS_A_FRENTE, fimDoPlano, LIMITE_ASSINATURAS, LIMITE_PLANOS, MAX_FIXOS, MAX_PEDIDOS_ABERTOS, MESES_A_FRENTE, MES, abertaDoCliente, assinaturaDoCliente, dividaAoEncerrar, dividaDoCliente, extrato, fotoDoPlano, mesDe, montarPlano,
  pagamentosValidos, rotuloMes, saldoAtual, somaMeses, usoParaAgendamento,
} from './planos.js';
import { ehDoFixo, chaveFixo, menorDistanciaDias, mesmoFixo, ocorrencias, proximoDia, sanearFixos } from './fixos.js';
import { cap } from './tipos.js';
import { limparTexto } from './texto.js';
import { DIA, DIAS_SEMANA, fmtDate, fmtHM, startOfDay, tsAt, ymd } from './time.js';

const falha = (m) => ({ ok: false, erros: [m] });
export const GENERICO_SALDO = 'Não encontramos um plano ativo para esse telefone.';
export const CATEGORIA_MENSALIDADE = 'Planos (mensalidades)';
const LOG_MAX = 200;

const acharPlano = (s, id) => (typeof id === 'string' ? (s.planos || []).find((p) => p.id === id) : null);
const acharAssinatura = (s, id) => (typeof id === 'string' ? (s.assinaturas || []).find((a) => a.id === id) : null);
const autorDe = (u) => ({ id: u?.id, nome: u?.apelido || u?.nome });
function nota(as, autor, acao, detalhe, agora) {
  (as.log ||= []).unshift({ em: agora, autor: autorDe(autor), acao, detalhe: limparTexto(String(detalhe || ''), 300) });
  if (as.log.length > LOG_MAX) as.log.length = LOG_MAX;
}

// ---------- catálogo ----------
// POST /planos  |  PUT /planos/{id}   (quem já assinou mantém a foto do plano de quando contratou)
export function salvarPlano(s, d, autor) {
  s.planos = s.planos || [];
  const atual = d.id ? acharPlano(s, d.id) : null;
  if (d.id && !atual) return falha('Plano não encontrado.');
  if (!d.id && s.planos.length >= LIMITE_PLANOS) return falha(`Limite de ${LIMITE_PLANOS} planos atingido: desative os que não vende mais.`);
  const r = montarPlano(s, d, atual);
  if (!r.ok) return { ok: false, erros: r.erros };
  if (atual) { Object.assign(atual, r.dados); return { ok: true, plano: atual }; }
  const p = { id: nextId(s, 'pl'), ...r.dados, criadoEm: d.agora, autor: autorDe(autor) };
  s.planos.push(p);
  return { ok: true, plano: p };
}

// DELETE /planos/{id}  — nunca contratado: apaga; já contratado: só desativa (a assinatura guarda a foto, mas o histórico fica ligado ao plano)
export function removerPlano(s, id) {
  const p = acharPlano(s, id);
  if (!p) return falha('Plano não encontrado.');
  if ((s.assinaturas || []).some((a) => a.planoId === p.id)) { p.ativo = false; return { ok: true, desativado: true }; }
  s.planos.splice(s.planos.indexOf(p), 1);
  return { ok: true, apagado: true };
}

// ---------- assinatura ----------
// POST /assinaturas   (cliente + plano + mês de início + dia de cobrança; nasce "aguardando pagamento")
export function contratar(s, d, autor, agora) {
  s.assinaturas = s.assinaturas || [];
  const cli = typeof d.clienteId === 'string' ? s.clientes.find((c) => c.id === d.clienteId) : null;
  if (!cli) return falha('Cliente não encontrado.');
  const plano = acharPlano(s, d.planoId);
  if (!plano || plano.ativo === false) return falha('Plano não encontrado ou desativado.');
  if (s.assinaturas.length >= LIMITE_ASSINATURAS) return falha('Limite de assinaturas atingido.');
  if (abertaDoCliente(s, cli.id)) return falha('Esse cliente já tem um plano em andamento. Encerre o atual para contratar outro.');
  if (dividaDoCliente(s, cli.id) > 0) return falha('Esse cliente encerrou um plano com atendimentos adiantados e ainda não quitou. Quite antes de contratar outro.');
  const mesAtual = mesDe(agora);
  const inicioMes = d.inicioMes === undefined || d.inicioMes === null || d.inicioMes === '' ? mesAtual : d.inicioMes;
  if (typeof inicioMes !== 'string' || !MES.test(inicioMes)) return falha('Escolha o mês de início.');
  if (inicioMes < somaMeses(mesAtual, -2) || inicioMes > somaMeses(mesAtual, MESES_A_FRENTE)) return falha(`O mês de início vai de ${rotuloMes(somaMeses(mesAtual, -2))} a ${rotuloMes(somaMeses(mesAtual, MESES_A_FRENTE))}.`);
  const dia = d.diaCobranca === undefined || d.diaCobranca === null || d.diaCobranca === '' ? 5 : Number(d.diaCobranca);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) return falha('O dia de cobrança vai de 1 a 28.');
  const as = {
    id: nextId(s, 'as'), clienteId: cli.id, planoId: plano.id, plano: fotoDoPlano(plano), status: 'pendente', inicioMes, diaCobranca: dia,
    pagamentos: [], divida: 0, dividaQuitada: false, criadoEm: agora, log: [],
  };
  nota(as, autor, 'contratou', `${plano.nome} a partir de ${rotuloMes(inicioMes)}`, agora);
  s.assinaturas.push(as);
  return { ok: true, assinatura: as };
}

// ---------- mensalidade ----------
const lancsDaMensalidade = (s, as, pagId) => s.financeiro.lancamentos.filter((l) => l.origem === 'plano' && l.assinaturaId === as.id && l.pagamentoId === pagId);

// POST /assinaturas/{id}/pagamentos   ({ mes, forma })  — o valor é sempre o do plano contratado
export function registrarPagamento(s, assinaturaId, d, autor, agora) {
  const as = acharAssinatura(s, assinaturaId);
  if (!as) return falha('Assinatura não encontrada.');
  if (as.status === 'cancelada') return falha('Essa assinatura foi encerrada.');
  const mes = d.mes === undefined || d.mes === null || d.mes === '' ? mesDe(agora) : d.mes;
  if (typeof mes !== 'string' || !MES.test(mes)) return falha('Escolha o mês da mensalidade.');
  if (mes < as.inicioMes) return falha(`O plano começa em ${rotuloMes(as.inicioMes)}.`);
  if (mes > somaMeses(mesDe(agora), MESES_A_FRENTE)) return falha(`Só dá para registrar até ${MESES_A_FRENTE} meses à frente.`);
  { const fim = fimDoPlano(as); if (fim && mes > fim) return falha(`O plano vale até ${rotuloMes(fim)}.`); }
  if (pagamentosValidos(as).some((p) => p.mes === mes)) return falha(`A mensalidade de ${rotuloMes(mes)} já está registrada.`);
  const forma = formaValida(d.forma) ? d.forma : null;
  if (!forma) return falha('Escolha como foi pago: Pix, dinheiro ou cartão.');
  const p = { id: nextId(s, 'mp'), mes, valor: as.plano.preco, forma, em: agora, autor: autorDe(autor), estornado: false };
  as.pagamentos.push(p);
  as.status = 'ativa';
  nota(as, autor, 'mensalidade', `${rotuloMes(mes)} · ${FORMAS_PAGAMENTO[forma]}`, agora);
  const conta = contaDaForma(s, forma, null);
  if (conta) {
    const cli = s.clientes.find((c) => c.id === as.clienteId);
    s.financeiro.lancamentos.unshift({
      id: nextId(s, 'f'), tipo: 'credito', descricao: `Mensalidade ${as.plano.nome} · ${rotuloMes(mes)}${cli ? ` · ${cli.apelido || cli.nome}` : ''} (${FORMAS_PAGAMENTO[forma]})`, valor: p.valor, data: startOfDay(agora), categoria: CATEGORIA_MENSALIDADE,
      origem: 'plano', assinaturaId: as.id, pagamentoId: p.id, forma, grupoId: null, contaId: conta.id, conciliado: false, extratoId: null, criadoEm: agora, autor: autorDe(autor),
    });
  }
  return { ok: true, assinatura: as, pagamento: p, lancado: !!conta };
}

// POST /assinaturas/{id}/pagamentos/{pagId}/estorno   ({ motivo })  — não deixa o plano com mais atendimentos usados do que pagos
export function estornarPagamento(s, assinaturaId, pagId, motivo, autor, agora) {
  const as = acharAssinatura(s, assinaturaId);
  if (!as) return falha('Assinatura não encontrada.');
  const p = (as.pagamentos || []).find((x) => x.id === pagId);
  if (!p || p.estornado) return falha('Mensalidade não encontrada.');
  const m = limparTexto(String(motivo || ''), 200).trim();
  if (m.length < 5) return falha('Diga o motivo do estorno (5 a 200 letras).');
  p.estornado = true;
  const ex = extrato(s, as, agora);
  const ruim = ex.linhas.find((l) => l.estourou);
  if (ruim) { p.estornado = false; return falha(`Há atendimentos usados que dependem da mensalidade de ${rotuloMes(p.mes)}. Cancele esses horários antes de estornar.`); }
  p.estornoEm = agora; p.estornoMotivo = m;
  if (!pagamentosValidos(as).length && as.status === 'ativa') as.status = 'pendente';
  nota(as, autor, 'estorno', `${rotuloMes(p.mes)} · ${m}`, agora);
  const lanc = lancsDaMensalidade(s, as, p.id);
  if (lanc.length) {
    const l0 = lanc[lanc.length - 1];
    s.financeiro.lancamentos.unshift({
      id: nextId(s, 'f'), tipo: 'despesa', descricao: `Estorno da mensalidade ${as.plano.nome} · ${rotuloMes(p.mes)}`, valor: p.valor, data: startOfDay(agora), categoria: CATEGORIA_ESTORNO,
      origem: 'plano', assinaturaId: as.id, pagamentoId: p.id, forma: p.forma, estorno: true, grupoId: null, contaId: l0.contaId, conciliado: false, extratoId: null, criadoEm: agora, autor: autorDe(autor),
    });
  }
  return { ok: true, assinatura: as };
}

// POST /assinaturas/{id}/encerrar   ({ motivo })  — atendimentos adiantados que não foram pagos viram dívida, que trava um plano novo até quitar
export function encerrar(s, assinaturaId, motivo, autor, agora) {
  const as = acharAssinatura(s, assinaturaId);
  if (!as) return falha('Assinatura não encontrada.');
  if (as.status === 'cancelada') return falha('Essa assinatura já foi encerrada.');
  const m = limparTexto(String(motivo || ''), 200).trim();
  if (m.length < 5) return falha('Diga o motivo (5 a 200 letras).');
  const apagados = apagarFixosFuturos(s, as.id, null, agora); // os fixos que ainda não aconteceram saem da agenda e devolvem o atendimento (antes da conta da dívida)
  const divida = dividaAoEncerrar(s, as, agora);
  as.status = 'cancelada'; as.encerradoEm = agora; as.divida = divida; as.dividaQuitada = divida === 0; as.fixos = [];
  nota(as, autor, 'encerrou', `${m}${apagados ? ` · ${apagados} horário${apagados > 1 ? 's' : ''} fixo${apagados > 1 ? 's' : ''} futuro${apagados > 1 ? 's' : ''} removido${apagados > 1 ? 's' : ''}` : ''}${divida > 0 ? ` · ${divida} atendimento${divida > 1 ? 's' : ''} adiantado${divida > 1 ? 's' : ''} sem pagar` : ''}`, agora);
  return { ok: true, assinatura: as, divida, apagados };
}

// POST /assinaturas/{id}/quitar   — o dono recebeu por fora o que ficou devendo
export function quitarDivida(s, assinaturaId, autor, agora) {
  const as = acharAssinatura(s, assinaturaId);
  if (!as) return falha('Assinatura não encontrada.');
  if (as.status !== 'cancelada' || !(as.divida > 0) || as.dividaQuitada) return falha('Essa assinatura não tem dívida a quitar.');
  as.dividaQuitada = true;
  nota(as, autor, 'quitou', 'Dívida de atendimentos adiantados quitada', agora);
  return { ok: true, assinatura: as };
}

// ---------- pedido pelo link de planos ----------
// POST /publico/planos/pedidos   (nome + telefone + plano; o dono aceita ou recusa — nada vira assinatura sozinho)
export function pedirPlanoPorLink(s, d, agora) {
  if (d.site) return falha('Dados inválidos.'); // isca: gente não preenche
  const plano = acharPlano(s, d.planoId);
  if (!plano || plano.ativo === false) return falha('Plano indisponível.');
  const nome = limparTexto(String(d.nome || ''), 60).trim();
  if (nome.length < 2) return falha('Informe o seu nome.');
  if (!telefoneBrasileiro(d.telefone)) return falha('Informe o telefone com DDD.');
  const tel = telefoneNacional(d.telefone);
  const abertos = (s.pedidosPlano ||= []).filter((x) => x.status === 'novo');
  if (abertos.length >= MAX_PEDIDOS_ABERTOS) return falha('Não estamos recebendo novos pedidos agora. Fale com a loja.');
  if (abertos.some((x) => x.tel === tel && x.planoId === plano.id)) return { ok: true }; // repetido: mesma resposta, sem duplicar
  s.pedidosPlano.unshift({ id: nextId(s, 'pp'), nome, tel, telefone: `55${tel}`, planoId: plano.id, planoNome: plano.nome, status: 'novo', criadoEm: agora });
  if (s.pedidosPlano.length > 300) s.pedidosPlano.length = 300;
  return { ok: true };
}

// POST /planos/pedidos/{id}/aceitar  — acha (ou cria, por nome+telefone) o cliente e abre a assinatura "aguardando pagamento"
export function aceitarPedido(s, id, autor, agora) {
  const p = (s.pedidosPlano || []).find((x) => x.id === id);
  if (!p || p.status !== 'novo') return falha('Pedido não encontrado.');
  const plano = acharPlano(s, p.planoId);
  if (!plano || plano.ativo === false) return falha('O plano desse pedido não está mais à venda.');
  const rc = resolverClienteDoAtendimento(s, { nome: p.nome, telefone: p.telefone }, agora);
  if (!rc.ok) return rc;
  if (!rc.cliente) return falha('Não foi possível cadastrar o cliente desse pedido.');
  const r = contratar(s, { clienteId: rc.cliente.id, planoId: plano.id }, autor, agora);
  if (!r.ok) return r;
  p.status = 'aceito'; p.assinaturaId = r.assinatura.id; p.resolvidoEm = agora;
  return { ok: true, assinatura: r.assinatura };
}
// POST /planos/pedidos/{id}/recusar
export function recusarPedido(s, id, autor, agora) {
  const p = (s.pedidosPlano || []).find((x) => x.id === id);
  if (!p || p.status !== 'novo') return falha('Pedido não encontrado.');
  p.status = 'recusado'; p.resolvidoEm = agora;
  return { ok: true };
}

// ---------- consulta de saldo (cliente, pelo telefone) ----------
// Só o número de atendimentos que restam por plano; nunca nome, CPF, mensalidade nem horários. Sem plano: sempre a mesma resposta.
// GET /publico/planos/saldo?telefone=
export function saldoPorTelefone(s, telefone, agora) {
  if (!telefoneBrasileiro(telefone)) return { ok: true, planos: [], aviso: GENERICO_SALDO };
  const nac = telefoneNacional(telefone);
  const ids = new Set(s.clientes.filter((c) => telefoneNacional(c.telefone) === nac).map((c) => c.id));
  const lista = (s.assinaturas || []).filter((a) => ids.has(a.clienteId) && a.status === 'ativa').map((a) => {
    const v = saldoAtual(s, a, agora);
    return { plano: v.planoNome, mes: v.mes, restantes: v.restantes, cortesPorMes: v.cortesPorMes, pagoMes: v.pagoMes };
  });
  return lista.length ? { ok: true, planos: lista } : { ok: true, planos: [], aviso: GENERICO_SALDO };
}

// O que o painel mostra ao escolher o cliente no Atender: plano ativo, quanto resta e quanto ainda pode adiantar.
export function planoDoCliente(s, clienteId, agora) {
  const as = (s.assinaturas || []).find((a) => a.clienteId === clienteId && a.status === 'ativa');
  if (!as) return null;
  const v = saldoAtual(s, as, agora);
  return { assinaturaId: as.id, plano: v.planoNome, servicoIds: [...as.plano.servicoIds], produtoIds: [...(as.plano.produtoIds || [])], restantes: v.restantes, maisPermitidos: v.maisPermitidos, pagoMes: v.pagoMes, atrasado: v.atrasado, mes: v.mes };
}

// ---------- horários fixos do assinante ----------
// Até MAX_FIXOS horários por semana (dia + hora + profissional + serviços do plano). O sistema cria o agendamento de cada um com DIAS_FIXOS_A_FRENTE de
// antecedência (no tick, sem duplicar), pelo mesmo caminho de qualquer agendamento (`validarHorario`/`acharConflitos`) e gastando 1 atendimento do plano.
// Ocupado por outro, sem atendimento ou sem mensalidade: não cria e avisa o dono (uma vez por ocorrência). Reserva: ninguém mais toma esse horário (rules.js `fixoReservado`).
const SEMANAS_PROCURA = 6; // ao salvar, procura a hora do fixo em até 6 semanas (um feriado ou folga não derruba o cadastro)
const porteDoFixo = (s, as, f) => ((s.clientes.find((c) => c.id === as.clienteId) || {}).veiculos || []).find((v) => v.id === f.veiculoId)?.porte;
const porteDeOutro = (s, f) => { for (const a of s.assinaturas || []) if ((a.fixos || []).some((x) => x.id === f.id)) return porteDoFixo(s, a, f); return undefined; };
const diaDoFixo = (s, as, f, agora) => {
  for (let k = 0, dia = proximoDia(f, agora); k < SEMANAS_PROCURA; k++, dia = startOfDay(dia + 7 * DIA + 12 * 3600000)) {
    const o = ocupacao(s, { profissionalId: f.profissionalId, inicio: tsAt(dia, f.hm), servicoIds: f.servicoIds, porte: porteDoFixo(s, as, f) });
    if (o) return { dia, o };
  }
  return null;
};

// POST /assinaturas/{id}/fixos   ({ fixos: [{ dia, hm, profissionalId, servicoIds }] })  — troca a lista inteira; quem mudou perde os agendamentos futuros que ainda não aconteceram
export function definirFixos(s, assinaturaId, lista, autor, agora) {
  const as = acharAssinatura(s, assinaturaId);
  if (!as) return falha('Assinatura não encontrada.');
  if (as.status === 'cancelada') return falha('Essa assinatura foi encerrada.');
  const r = sanearFixos(lista, MAX_FIXOS);
  if (!r.ok) return falha(r.erro);
  const cliente = s.clientes.find((c) => c.id === as.clienteId);
  const novos = r.fixos;
  // Tipo com veículo: o fixo leva o veículo do cliente (o único que ele tem, ou o escolhido); o plano em si nunca depende de veículo, porte ou box.
  if (cap(s.estabelecimento, 'usaVeiculo')) {
    for (const f of novos) {
      const vs = cliente?.veiculos || [];
      if (f.veiculoId) { if (!vs.some((v) => v.id === f.veiculoId)) return falha('Veículo não encontrado nesse cliente.'); } else if (vs.length === 1) f.veiculoId = vs[0].id;
      else return falha('Escolha o veículo do horário fixo.');
    }
  }
  const janelas = [];
  for (const f of novos) {
    const prof = s.usuarios.find((u) => u.id === f.profissionalId);
    if (!prof || !prof.atende) return falha('Escolha quem atende o horário fixo.');
    if (f.servicoIds.some((id) => !as.plano.servicoIds.includes(id))) return falha('Os serviços do horário fixo precisam ser serviços do plano.');
    const e = errosServicoIds(s, f.servicoIds, { ativos: true });
    if (e) return falha(e);
    const j = diaDoFixo(s, as, f, agora);
    if (!j) return falha(`${prof.apelido || prof.nome} não atende ${DIAS_SEMANA[f.dia].toLowerCase()} às ${f.hm}.`);
    janelas.push({ f, ...j });
  }
  if (as.plano.intervaloDias > 0 && novos.length > 1 && menorDistanciaDias(novos) < as.plano.intervaloDias) return falha(`O plano pede ${as.plano.intervaloDias} dia${as.plano.intervaloDias > 1 ? 's' : ''} entre um atendimento e outro: afaste os horários fixos.`);
  // dois fixos (deste ou de outro assinante) nunca ocupam o mesmo profissional ao mesmo tempo
  const outros = (s.assinaturas || []).filter((x) => x.id !== as.id && x.status === 'ativa').flatMap((x) => x.fixos || []);
  const choca = (a, b) => {
    if (a.profissionalId !== b.profissionalId || a.dia !== b.dia) return false;
    const dia = proximoDia(a, agora);
    const oa = ocupacao(s, { profissionalId: a.profissionalId, inicio: tsAt(dia, a.hm), servicoIds: a.servicoIds, porte: porteDoFixo(s, as, a) });
    const ob = ocupacao(s, { profissionalId: b.profissionalId, inicio: tsAt(dia, b.hm), servicoIds: b.servicoIds, porte: b.id ? porteDeOutro(s, b) : porteDoFixo(s, as, b) });
    return !!oa && !!ob && oa.profissional.some(([x0, x1]) => ob.profissional.some(([y0, y1]) => sobrepoe(x0, x1, y0, y1)));
  };
  for (let i = 0; i < novos.length; i++) {
    for (let j2 = i + 1; j2 < novos.length; j2++) if (choca(novos[i], novos[j2])) return falha('Dois horários fixos desse plano se sobrepõem.');
    if (outros.some((g) => choca(novos[i], g))) return falha('Esse horário já é fixo de outro assinante. Escolha outro.');
  }
  const antigos = as.fixos || [];
  const finais = novos.map((f) => antigos.find((a) => mesmoFixo(a, f)) || { id: nextId(s, 'fx'), ...f });
  let apagados = 0;
  for (const a of antigos) if (!finais.some((f) => f.id === a.id)) apagados += apagarFixosFuturos(s, as.id, a.id, agora);
  as.fixos = finais;
  nota(as, autor, 'horários fixos', finais.length ? finais.map((f) => `${DIAS_SEMANA[f.dia].slice(0, 3)} ${f.hm}`).join(', ') : 'nenhum', agora);
  return { ok: true, assinatura: as, apagados };
}

// Agendamentos fixos que ainda não aconteceram (a confirmar ou confirmados, no futuro): saem da agenda. Atendimento feito, em serviço ou cancelado nunca é tocado.
// Se já há cobrança ou produto lançado nele, em vez de apagar fica cancelado (o atendimento volta do mesmo jeito). Devolve quantos foram tirados.
function apagarFixosFuturos(s, assinaturaId, fixoId, agora) {
  const cobrado = (a) => (s.financeiro?.cobrancas || []).some((c) => c.agendamentoId === a.id) || (a.produtos || []).length > 0;
  const alvo = (a) => a.fixoId && a.planoUso?.assinaturaId === assinaturaId && (!fixoId || a.fixoId === fixoId) && a.inicio > agora && [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && !a.emServico && !a.pronto;
  const lista = s.agendamentos.filter(alvo);
  for (const a of lista.filter(cobrado)) { a.status = STATUS.CANCELADO; a.motivoCancelamento = 'plano_fixo'; registrar(s, a, AUTOR_SISTEMA, 'status', 'Confirmado', 'Cancelado (horário fixo do plano removido)', agora); }
  const sai = new Set(lista.filter((a) => !cobrado(a)).map((a) => a.id));
  if (sai.size) s.agendamentos = s.agendamentos.filter((a) => !sai.has(a.id));
  return lista.length;
}

let emFixos = false; // criar o agendamento roda o tick de novo: sem isso o gancho entraria nele mesmo
const avisarFixo = (s, as, fx, cli, t, motivo, agora) => {
  const chave = chaveFixo(fx.id, t);
  if ((as.fixosAvisos ||= []).includes(chave)) return;
  as.fixosAvisos.push(chave); if (as.fixosAvisos.length > 100) as.fixosAvisos.shift();
  const nome = cli.apelido || cli.nome;
  const texto = `Horário fixo de ${nome} em ${fmtDate(t)} (${DIAS_SEMANA[fx.dia].toLowerCase()}) às ${fmtHM(t)} não foi criado. ${String(motivo).replace(/^./, (c) => c.toUpperCase())}${/[.!?]$/.test(motivo) ? '' : '.'}`;
  s.avisosPainel.unshift({ id: nextId(s, 'p'), em: agora, agendamentoId: null, profissionalId: fx.profissionalId, tipo: 'fixo', texto, lido: false });
  nota(as, AUTOR_SISTEMA, 'horário fixo', texto, agora);
};

// Gancho do tick: cria o que falta dos horários fixos dos próximos DIAS_FIXOS_A_FRENTE dias, em ordem de data (o atendimento do plano é gasto na ordem). Devolve quantos criou.
export function materializarFixos(s, agora) {
  if (emFixos) return 0;
  const ativas = (s.assinaturas || []).filter((as) => as.status === 'ativa' && (as.fixos || []).length);
  if (!ativas.length) return 0;
  emFixos = true;
  let criados = 0;
  try {
    for (const as of ativas) {
      const cli = s.clientes.find((c) => c.id === as.clienteId);
      if (!cli) continue;
      const lista = as.fixos.flatMap((fx) => ocorrencias(fx, agora, agora + DIAS_FIXOS_A_FRENTE * DIA).map((t) => ({ fx, t }))).sort((a, b) => a.t - b.t);
      for (const { fx, t } of lista) {
        if (s.agendamentos.some((a) => ehDoFixo(a, fx, t))) continue; // já criado (ou cancelado de propósito): nunca recria nem duplica
        const v = validarHorario(s, { profissionalId: fx.profissionalId, inicio: t, servicoIds: fx.servicoIds, porte: porteDoFixo(s, as, fx), origem: 'painel', agora, clienteId: cli.id });
        if (v.pendentes.length || v.confirmados.length) { avisarFixo(s, as, fx, cli, t, 'o horário já está ocupado por outro cliente.', agora); continue; }
        if (v.erros.length) { avisarFixo(s, as, fx, cli, t, v.erros[0], agora); continue; }
        const r = criarAgendamento(s, { clienteId: cli.id, profissionalId: fx.profissionalId, servicoIds: fx.servicoIds, ...(fx.veiculoId ? { veiculoId: fx.veiculoId } : {}), inicio: t, origem: 'painel', status: STATUS.CONFIRMADO, assinaturaId: as.id }, AUTOR_SISTEMA, agora);
        if (!r.ok) { avisarFixo(s, as, fx, cli, t, String(r.erros[0] || 'não foi possível agendar'), agora); continue; }
        r.agendamento.fixoId = fx.id; r.agendamento.fixoData = ymd(t);
        registrar(s, r.agendamento, AUTOR_SISTEMA, 'fixo', null, 'Horário fixo semanal do plano', agora);
        criados++;
      }
    }
  } finally { emFixos = false; }
  return criados;
}
ganchos.push(materializarFixos);

// ---------- agendar pelo link com plano ----------
// GET /publico/planos/uso?telefone=&servicoIds=&inicio=  — a tela do cliente avisa "este horário usa um atendimento do seu plano" ANTES de pedir.
// Só um sim ou não: nunca nome do plano, saldo, valor ou dado de outra pessoa; sem plano, sem saldo ou serviço fora do plano é a mesma resposta.
export function usoDoPlanoPorTelefone(s, { telefone, servicoIds, inicio }, agora) {
  const nao = { ok: true, usaPlano: false };
  if (!telefoneBrasileiro(telefone) || !Number.isFinite(inicio) || errosServicoIds(s, servicoIds, { ativos: true })) return nao;
  const nac = telefoneNacional(telefone);
  for (const c of s.clientes.filter((x) => telefoneNacional(x.telefone) === nac)) {
    const as = assinaturaDoCliente(s, c.id);
    if (as && usoParaAgendamento(s, { assinaturaId: as.id, clienteId: c.id, servicoIds, inicio, agora }).ok) return { ok: true, usaPlano: true };
  }
  return nao;
}
