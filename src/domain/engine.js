/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:2a84b5f5c4 */
// Motor: transições de estado do agendamento. Cada função recebe o estado (já clonado pelo armazenamento),
// altera e devolve um resultado. Espelha os casos de uso do futuro back-end.
import {
  ATIVOS, STATUS, comissaoJaPaga, ERRO_COMISSAO_PAGA, formaEfetiva, formatarTelefone, acharConflitos, cadastroPorCpf, somenteDigitos, telefoneNacional, telefoneDoCanal, errosServicoIds, limparTexto, duracaoMin, exigeConfirmacaoServico, identificarCliente, janelaOcupada,
  montarPlano, montarLembretes, notificacoesEfetivas, ocupadoMin, servicosPorIds, servicosDoAg, validarHorario, congelarComissoes, ocupacaoDe, retiradaDe, nomeBox, semBoxAtivo, ERRO_SEM_BOX,
} from './rules.js';
import { assinaturaDoCliente, podeUsar, usoParaAgendamento } from './planos.js';
import { LIMITE_VEICULOS, fotoDoVeiculo, limparVeiculoComRegras, resumoVeiculo, veiculoInformado, veiculoPorPlaca } from './veiculos.js';
import { fmtDate, fmtHM, fmtMoney, HORA, MIN, startOfDay } from './time.js';
import { consumoDoAgendamento, r2, r3, totalAgendamento } from './reports.js';
import { renderizar } from './templates.js';
import { diasDaExcecao } from './schedule.js';
import { cap, rot, voc } from './tipos.js';
import { limitesDoDia, ordemPorFolga, profissionalAutomatico } from './profissional-auto.js';

export const AUTOR_SISTEMA = { tipo: 'sistema', nome: 'Sistema' };
export const autorUsuario = (u) => ({ tipo: 'profissional', nome: u.apelido || u.nome, id: u.id });
export const AUTOR_CLIENTE = (c) => ({ tipo: 'cliente', nome: c.apelido || c.nome, id: c.id });

export const nextId = (s, p) => `${p}${++s.seq}`;
export const ganchos = []; // rotinas extras do tick (financeiro registra a sua)
export const aposCriar = []; // rotinas chamadas depois de criar um agendamento (financeiro avisa de agendamento pago pendente de análise)
export const validadoresEdicaoCliente = []; // regras extras (financeiro) que podem impedir o cliente de alterar os serviços pelo WhatsApp
export const aposEditarValores = []; // rotinas chamadas depois que serviços ou acréscimos de um agendamento mudam (financeiro acerta a cobrança)

export function registrar(s, a, autor, campo, de, para, agora) {
  a.log.push({ id: nextId(s, 'l'), em: agora, autor, campo, de, para });
}

const nomesServicos = (s, a) => servicosDoAg(s, a).map((x) => x.nome).join(' + ');
const clienteDe = (s, a) => s.clientes.find((c) => c.id === a.clienteId);
const profissionalDe = (s, a) => s.usuarios.find((u) => u.id === a.profissionalId);

function valoresModelo(s, a, chave) {
  const c = clienteDe(s, a);
  const nome = c ? c.apelido || c.nome.split(' ')[0] : '';
  const sv = nomesServicos(s, a);
  const b = profissionalDe(s, a);
  const barb = b ? b.apelido || b.nome : '';
  const dt = fmtDate(a.inicio);
  const hr = fmtHM(a.inicio);
  const vei = resumoVeiculo(a.veiculo);
  const usaVei = cap(s.estabelecimento, 'usaVeiculo'); // tipo sem veículo: os modelos não têm a variável do veículo
  switch (chave) {
    case 'carro_pronto': return [nome, vei, sv];
    case 'cancelamento': return [nome, sv, vei, dt, hr];
    case 'falta_confirmacao': return [nome, sv, hr];
    case 'horario_ocupado': return [nome, sv, dt, hr];
    case 'folga': return [nome, dt, sv, hr];
    case 'remarcado': return [nome, sv, dt, hr];
    case 'servicos_alterados': return [nome, dt, hr, sv, fmtMoney(totalAgendamento(s, a))];
    case 'pix_cobranca':
    case 'pix_pago': {
      const cs = (s.financeiro?.cobrancas || []).filter((x) => x.agendamentoId === a.id);
      const c = cs.find((x) => x.status === 'pendente') || cs.find((x) => x.status === 'paga') || cs[0];
      return chave === 'pix_cobranca' ? [nome, sv, c ? fmtMoney(c.valor) : '', c ? c.copiaECola : ''] : [nome, sv, c ? fmtMoney(c.valor) : ''];
    }
    default: return usaVei ? [nome, sv, vei, barb, dt, hr] : [nome, sv, barb, dt, hr]; // confirmação, aviso, lembretes de 24 h e 2 h, pedido recebido e recusado
  }
}

// Cliente só cancela pelo WhatsApp com pelo menos 24 h de antecedência; depois disso, só confirma ou remarca.
export const PRAZO_CANCELAR_MS = 24 * 3600 * 1000;
// `cancelamentoTravado`: o cliente remarcou quando já faltava menos de 24 h; sem isso, bastaria remarcar para uma data distante e cancelar em seguida.
export const clientePodeCancelar = (a, agora) => !!a && [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && !a.cancelamentoTravado && a.inicio - agora >= PRAZO_CANCELAR_MS;
// O botão "Cancelar" é decidido na hora do envio, olhando o prazo: dentro das 24 h a mensagem sai só com Confirmar e Remarcar.
const botoesDoModelo = (m, a, agora) => (m.botoes || []).filter((b) => b !== 'Cancelar' || clientePodeCancelar(a, agora));

export function enviarAoCliente(s, a, chave, agora, extra = {}) {
  if (a && (a.local || !a.clienteId)) return null; // atendimento local e horário sem cliente cadastrado não têm quem avisar
  const modelo = s.modelos.find((m) => m.chave === chave) || s.modelos.find((m) => m.id === chave);
  if (!modelo) return null;
  const msg = {
    id: nextId(s, 'w'), em: agora, agendamentoId: a ? a.id : null, clienteId: a ? a.clienteId : extra.clienteId || null,
    telefone: a ? clienteDe(s, a)?.telefone : extra.telefone, modeloId: modelo.id, modeloNome: modelo.nome, botoes: botoesDoModelo(modelo, a, agora),
    texto: renderizar(modelo, extra.valores || (a ? valoresModelo(s, a, modelo.chave) : [])), origem: extra.origem || 'sistema',
  };
  s.mensagensCliente.unshift(msg);
  return msg;
}

export function avisarPainel(s, a, texto, agora) {
  const aviso = { id: nextId(s, 'p'), em: agora, agendamentoId: a.id, profissionalId: a.profissionalId, texto, lido: false };
  s.avisosPainel.unshift(aviso);
  return aviso;
}

// Agendamento que usa um plano: remarcar ou reativar também precisa caber na cota (outro mês pode não ter corte). Devolve o texto do erro ou null.
function erroDoPlano(s, a, inicio, agora) {
  if (!a.planoUso) return null;
  const as = (s.assinaturas || []).find((x) => x.id === a.planoUso.assinaturaId);
  const pu = podeUsar(s, as, { inicio, agora, ignoreId: a.id });
  return pu.ok ? null : pu.erro;
}

// ---------- criação ----------
// Acréscimo: recurso aposentado (v54). Não se cria nem edita mais; o que já existe em atendimentos antigos continua valendo nos relatórios e na comissão.
export function limparAcrescimos(map, ids) {
  const out = {};
  for (const id of ids) { const n = Number((map || {})[id]); const v = Number.isFinite(n) ? r2(n) : 0; if (v > 0 && v <= 100000) out[id] = v; }
  return out;
}
const textoAcrescimos = (s, map) => Object.entries(map).map(([id, v]) => `${s.servicos.find((x) => x.id === id)?.nome}: ${fmtMoney(v)}`).join(' · ') || 'sem acréscimo';

// Agendamento cujo valor pago já foi acertado (crédito, despesa ou devolvido por fora) não volta a valer: o cliente precisa de um novo agendamento.
const jaCreditado = (s, a) => [...((s.financeiro || {}).creditos || []), ...((s.financeiro || {}).baixas || [])].some((x) => x.agendamentoId === a.id);
const ERRO_DEVOLVIDO = ['O valor pago desse agendamento já foi acertado (crédito ou devolução). Crie um novo agendamento.'];

// Veículo do atendimento: um do cadastro do cliente (`veiculoId`) ou um novo (`veiculo`: placa, modelo, porte…), que entra no cadastro do cliente
// se ele existe. Sem cliente cadastrado (balcão), o veículo fica só na foto do atendimento. NÃO grava nada: devolve `adicionar` para quem for gravar
// (`gravarVeiculo`), só depois de o horário ser aprovado, para um pedido recusado não deixar veículo para trás.
// `exigirVeiculo` (v121): lista do que é obrigatório (`veiculo`, `placa`, `modelo`, `porte`); sem ela vale a regra antiga (tudo). Veículo incompleto (sem placa ou modelo) vale só
// como foto do atendimento: não entra no cadastro do cliente. Nada informado e nada exigido = atendimento sem veículo (preço e duração do médio).
export function resolverVeiculo(s, cliente, { veiculoId, veiculo, exigirVeiculo } = {}) {
  if (!cap(s.estabelecimento, 'usaVeiculo')) return { ok: true, veiculoId: null, veiculo: null, adicionar: null }; // tipo sem veículo (barbearia)
  if (veiculoId !== undefined && veiculoId !== null && veiculoId !== '') {
    const v = typeof veiculoId === 'string' && cliente ? (cliente.veiculos || []).find((x) => x.id === veiculoId) : null;
    if (!v) return { ok: false, erros: ['Veículo não encontrado.'] };
    return { ok: true, veiculoId: v.id, veiculo: fotoDoVeiculo(v), adicionar: null };
  }
  // Sem veículo informado e cliente com um só veículo cadastrado: é esse (o painel e o robô sempre mandam o veículo; isto cobre integrações simples).
  if (!veiculoInformado(veiculo) && cliente && (cliente.veiculos || []).length === 1) { const u = cliente.veiculos[0]; return { ok: true, veiculoId: u.id, veiculo: fotoDoVeiculo(u), adicionar: null }; }
  const l = limparVeiculoComRegras(veiculo, exigirVeiculo);
  if (!l.ok) return { ok: false, erros: [l.erro] };
  if (!l.veiculo) return { ok: true, veiculoId: null, veiculo: null, adicionar: null };
  if (!l.completo) return { ok: true, veiculoId: null, veiculo: l.veiculo, adicionar: null };
  const existente = cliente ? veiculoPorPlaca(cliente, l.veiculo.placa) : null;
  if (existente) return { ok: true, veiculoId: existente.id, veiculo: fotoDoVeiculo(existente), adicionar: null };
  if (cliente && (cliente.veiculos || []).length >= LIMITE_VEICULOS) return { ok: false, erros: [`O cliente já tem ${LIMITE_VEICULOS} veículos cadastrados.`] };
  return { ok: true, veiculoId: null, veiculo: l.veiculo, adicionar: cliente ? l.veiculo : null };
}
// Grava o veículo novo no cadastro do cliente e devolve o id dele (ou o que já existia).
export function gravarVeiculo(s, cliente, rv) {
  if (rv.veiculoId || !rv.adicionar || !cliente) return rv.veiculoId;
  const novo = { id: nextId(s, 've'), ...rv.adicionar };
  cliente.veiculos = [...(cliente.veiculos || []), novo];
  return novo.id;
}

export function criarAgendamento(s, dados, autor, agora) {
  const { clienteId, profissionalId, servicoIds, inicio, origem = 'painel', encaixe = false, boxId } = dados;
  // Horário sem cliente cadastrado (Atender só com nome ou sem nada): fica com o nome avulso, nasce confirmado (ninguém para confirmar) e não manda mensagem.
  const semCliente = !clienteId && dados.semCliente === true;
  if (dados.status !== undefined && !Object.values(STATUS).includes(dados.status)) return { ok: false, erros: ['Status inválido.'] };
  { const e = errosServicoIds(s, servicoIds, { ativos: true }); if (e) return { ok: false, erros: [e] }; }
  const cliente = semCliente ? null : s.clientes.find((c) => c.id === clienteId);
  if (!cliente && !semCliente) return { ok: false, erros: ['Escolha o cliente.'] };
  const rv = resolverVeiculo(s, cliente, dados);
  if (!rv.ok) return { ok: false, erros: rv.erros };
  const v = validarHorario(s, { profissionalId, inicio, servicoIds, porte: rv.veiculo?.porte, boxId, encaixe, origem, agora, clienteId: cliente ? clienteId : undefined });
  if (v.erros.length) return { ok: false, erros: v.erros };
  let usoPlano = null;
  if (dados.assinaturaId) {
    const up = usoParaAgendamento(s, { assinaturaId: dados.assinaturaId, clienteId, servicoIds, inicio, agora });
    if (!up.ok) return { ok: false, erros: [up.erro] };
    usoPlano = up;
  } else if (cliente && (origem === 'link' || origem === 'whatsapp')) {
    // O próprio cliente com plano ativo agenda (link ou WhatsApp): o horário gasta 1 corte do plano quando algum serviço é coberto e as travas deixam (saldo, intervalo, adiantar).
    // Sem corte (ou serviço fora do plano) o agendamento segue normal, pelo preço normal; nunca é recusado por causa do plano.
    const ativa = assinaturaDoCliente(s, clienteId);
    const up = ativa ? usoParaAgendamento(s, { assinaturaId: ativa.id, clienteId, servicoIds, inicio, agora }) : null;
    if (up && up.ok) usoPlano = up;
  }
  const plano = montarPlano({ inicio, servicos: v.servicos, estab: s.estabelecimento, agora });
  const semNotificacoes = notificacoesEfetivas(v.servicos, s.estabelecimento).lista.length === 0;
  const porLink = origem === 'link'; // pedido do cliente pelo link: nasce "Cliente agendou" (a confirmar pelo estabelecimento) e só recebe os lembretes de 24 h e 2 h
  let status = porLink ? STATUS.A_CONFIRMAR : semCliente ? STATUS.CONFIRMADO : dados.status || STATUS.A_CONFIRMAR;
  // O cliente que agenda pelo WhatsApp nasce confirmado quando não há nenhuma notificação configurada.
  if (origem === 'whatsapp') status = semNotificacoes ? STATUS.CONFIRMADO : STATUS.A_CONFIRMAR;
  const a = {
    id: nextId(s, 'a'), clienteId: cliente ? clienteId : null, ...(semCliente ? { nomeAvulso: limparTexto(String(dados.nomeAvulso || ''), 60).trim() } : {}), profissionalId, servicoIds: [...servicoIds], inicio, status, encaixe, reagendado: false, origem,
    veiculoId: gravarVeiculo(s, cliente, rv), veiculo: rv.veiculo, porte: rv.veiculo?.porte, boxId: v.boxId,
    criadoEm: agora, plano: porLink ? [] : status === STATUS.A_CONFIRMAR ? plano : plano.map((p) => ({ ...p, estado: 'pulada' })),
    ...(porLink ? { clienteAgendou: true, lembretes: montarLembretes({ inicio, agora }) } : {}),
    faltaConfirmacao: null, servicosFeitos: null, motivoCancelamento: null, log: [],
    precos: Object.fromEntries(v.servicos.map((x) => [x.id, x.preco])), acrescimos: {}, estoqueBaixado: null,
    ...(usoPlano ? { planoUso: usoPlano.uso } : {}),
  };
  congelarComissoes(s, a, v.servicos);
  registrar(s, a, autor, 'criação', null, `${nomesServicos(s, a)} ${a.veiculo ? `(${resumoVeiculo(a.veiculo)}) ` : ''}em ${fmtDate(inicio)} às ${fmtHM(inicio)}`, agora);
  s.agendamentos.push(a);
  if (status === STATUS.CONFIRMADO || status === STATUS.CONCLUIDO) cancelarPendentesConflitantes(s, a, agora);
  if (usoPlano) registrar(s, a, autor, 'plano', null, `Usa 1 atendimento do plano ${usoPlano.uso.planoNome}${usoPlano.aviso ? ` (${usoPlano.aviso})` : ''}`, agora);
  for (const g of aposCriar) g(s, a, autor, agora);
  tick(s, agora);
  return { ok: true, agendamento: a, avisos: { pendentes: v.pendentes, confirmados: v.confirmados }, ...(usoPlano ? { plano: { nome: usoPlano.uso.planoNome, aviso: usoPlano.aviso, adiantado: usoPlano.adiantado } } : {}) };
}

// Quem confirma primeiro fica com o horário: os pendentes sobrepostos são cancelados.
export function cancelarPendentesConflitantes(s, vencedor, agora) {
  const perdedores = acharConflitos(s, { profissionalId: vencedor.profissionalId, ocup: ocupacaoDe(s, vencedor), ignoreId: vencedor.id })
    .filter((o) => o.status === STATUS.A_CONFIRMAR && !o.encaixe);
  for (const p of perdedores) {
    p.status = STATUS.CANCELADO;
    p.motivoCancelamento = 'conflito';
    registrar(s, p, AUTOR_SISTEMA, 'status', 'A confirmar', 'Cancelado (horário ocupado por outro cliente)', agora);
    enviarAoCliente(s, p, 'horario_ocupado', agora);
  }
  return perdedores;
}

// ---------- ações do cliente (WhatsApp) ----------
export function clienteConfirma(s, id, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  const c = clienteDe(s, a);
  if (a.status === STATUS.CANCELADO) {
    if (a.motivoCancelamento === 'conflito') enviarAoCliente(s, a, 'horario_ocupado', agora);
    return { ok: false, persistir: true, erros: ['O horário já foi ocupado. O cliente recebeu a oferta de remarcar.'] };
  }
  if (a.status !== STATUS.A_CONFIRMAR) return { ok: false, erros: ['Esse agendamento não está aguardando confirmação.'] };
  a.status = STATUS.CONFIRMADO;
  a.faltaConfirmacao = null;
  a.plano.forEach((p) => { if (p.estado === 'pendente') p.estado = 'pulada'; });
  registrar(s, a, AUTOR_CLIENTE(c), 'status', 'A confirmar', 'Confirmado', agora);
  cancelarPendentesConflitantes(s, a, agora);
  return { ok: true, agendamento: a };
}

export function clienteCancela(s, id, agora, canal = 'WhatsApp') {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (![STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status)) return { ok: false, erros: ['Esse agendamento não pode ser cancelado.'] };
  if (!clientePodeCancelar(a, agora)) return { ok: false, erros: ['Esse horário não pode mais ser cancelado por aqui (faltam menos de 24 horas ou ele já foi remarcado dentro desse prazo). Você ainda pode confirmar ou remarcar.'] };
  const c = clienteDe(s, a);
  registrar(s, a, AUTOR_CLIENTE(c), 'status', ROTULOS[a.status], 'Cancelado pelo cliente', agora);
  a.status = STATUS.CANCELADO; a.emServico = null; a.pronto = null;
  a.motivoCancelamento = 'cliente';
  a.faltaConfirmacao = null;
  a.plano.forEach((p) => { if (p.estado === 'pendente') p.estado = 'pulada'; });
  avisarPainel(s, a, `${c ? c.nome : 'Cliente'} cancelou o horário de ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)} pelo ${canal}.`, agora);
  tick(s, agora);
  return { ok: true, agendamento: a };
}

// O cliente altera os serviços do próprio horário pelo WhatsApp. O horário é conferido de novo (mais tempo pode invadir outro agendamento),
// o agendamento volta a "a confirmar" e o cliente recebe a notificação de alteração perguntando se pode confirmar. O painel é avisado.
// Se o valor pago passou a ser maior que o novo total, o financeiro avisa o profissional (acerto com revisão); o cliente nunca estorna sozinho.
export function clienteEditaServicos(s, id, servicoIds, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (![STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) || a.inicio <= agora) return { ok: false, erros: ['Esse horário não pode mais ser alterado.'] };
  if (!Array.isArray(servicoIds) || !servicoIds.length) return { ok: false, erros: ['Escolha ao menos um serviço.'] };
  if (servicoIds.length > 10 || new Set(servicoIds).size !== servicoIds.length) return { ok: false, erros: ['Serviços inválidos.'] };
  { const e = errosServicoIds(s, servicoIds); if (e) return { ok: false, erros: [e] }; }
  const iguais = servicoIds.length === a.servicoIds.length && servicoIds.every((x) => a.servicoIds.includes(x));
  if (iguais) return { ok: false, erros: ['Os serviços continuam os mesmos.'] };
  for (const v of validadoresEdicaoCliente) { const e = v(s, a, servicoIds); if (e) return { ok: false, erros: [e] }; }
  const v = validarHorario(s, { profissionalId: a.profissionalId, inicio: a.inicio, servicoIds, porte: a.porte, boxPreferido: a.boxId, ignoreId: a.id, origem: 'whatsapp', agora });
  if (v.erros.length) return { ok: false, erros: v.erros };
  const c = clienteDe(s, a);
  const antes = nomesServicos(s, a);
  const r = profissionalEditaServicos(s, id, servicoIds, AUTOR_CLIENTE(c), agora);
  if (!r.ok) return r;
  if (a.status !== STATUS.A_CONFIRMAR) { registrar(s, a, AUTOR_CLIENTE(c), 'status', ROTULOS[a.status], ROTULOS[STATUS.A_CONFIRMAR], agora); a.status = STATUS.A_CONFIRMAR; }
  a.faltaConfirmacao = null;
  // A pergunta de confirmação é esta própria notificação (já enviada); os lembretes seguintes são remontados para os serviços novos, para que o cliente
  // que não responder receba os avisos de sempre e o painel o veja como "sem resposta", em vez de o horário ficar sem plano e cair em falta de confirmação calado.
  const novoPlano = montarPlano({ inicio: a.inicio, servicos: servicosDoAg(s, a), estab: s.estabelecimento, agora });
  a.plano = novoPlano.length
    ? novoPlano.map((p, i) => (i === 0 ? { ...p, estado: 'enviada', enviadaEm: agora } : p))
    : [{ idx: 0, tipo: 'pergunta', programado: agora, enviarEm: agora, estado: 'enviada', enviadaEm: agora }];
  enviarAoCliente(s, a, 'servicos_alterados', agora);
  avisarPainel(s, a, `${c ? c.nome : 'Cliente'} alterou os serviços do horário de ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)} pelo WhatsApp: de ${antes} para ${nomesServicos(s, a)}. Aguardando a confirmação dele.`, agora);
  tick(s, agora);
  return { ok: true, agendamento: a };
}

export function clienteRemarca(s, id, novoInicio, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  const podeRemarcar = [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) || (a.status === STATUS.CANCELADO && ['conflito', 'falta_confirmacao'].includes(a.motivoCancelamento));
  if (!podeRemarcar) return { ok: false, erros: ['Esse agendamento não pode ser remarcado.'] };
  if (a.status === STATUS.CANCELADO && jaCreditado(s, a)) return { ok: false, erros: ERRO_DEVOLVIDO };
  const v = validarHorario(s, { profissionalId: a.profissionalId, inicio: novoInicio, servicoIds: a.servicoIds, porte: a.porte, boxPreferido: a.boxId, ignoreId: a.id, origem: 'whatsapp', agora });
  if (v.erros.length) return { ok: false, erros: v.erros };
  { const e = erroDoPlano(s, a, novoInicio, agora); if (e) return { ok: false, erros: [e] }; }
  const c = clienteDe(s, a);
  const semNotificacoes = notificacoesEfetivas(v.servicos, s.estabelecimento).lista.length === 0;
  if ([STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && a.inicio - agora < PRAZO_CANCELAR_MS) a.cancelamentoTravado = true;
  a.boxId = v.boxId;
  aplicarRemarcacao(s, a, novoInicio, semNotificacoes ? STATUS.CONFIRMADO : STATUS.A_CONFIRMAR, AUTOR_CLIENTE(c), agora);
  if (a.status === STATUS.CONFIRMADO) cancelarPendentesConflitantes(s, a, agora);
  tick(s, agora);
  return { ok: true, agendamento: a };
}

export function aplicarRemarcacao(s, a, novoInicio, novoStatus, autor, agora) {
  const antes = a.inicio;
  const sv = servicosDoAg(s, a);
  a.inicio = novoInicio;
  a.reagendado = true; // etiqueta fixa: a data ou a hora mudou
  a.emServico = null; a.pronto = null; // o andamento do carro recomeça no novo horário
  a.faltaConfirmacao = null;
  a.motivoCancelamento = null;
  registrar(s, a, autor, 'data e hora', `${fmtDate(antes)} às ${fmtHM(antes)}`, `${fmtDate(novoInicio)} às ${fmtHM(novoInicio)}`, agora);
  if (a.status !== novoStatus) {
    registrar(s, a, autor, 'status', ROTULOS[a.status], ROTULOS[novoStatus], agora);
    a.status = novoStatus;
  }
  const plano = montarPlano({ inicio: novoInicio, servicos: sv, estab: s.estabelecimento, agora });
  a.plano = novoStatus === STATUS.A_CONFIRMAR ? plano : plano.map((p) => ({ ...p, estado: 'pulada' }));
  if (a.lembretes) a.lembretes = montarLembretes({ inicio: novoInicio, agora }); // os lembretes acompanham o novo horário
}

const ROTULOS = { a_confirmar: 'A confirmar', confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado' };

// ---------- ações do profissional (painel) ----------
export function profissionalRemarca(s, id, { inicio, status, profissionalId, boxId }, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (status !== undefined && !Object.values(STATUS).includes(status)) return { ok: false, erros: ['Status inválido.'] };
  // Concluído já aconteceu: reabra o atendimento (status) antes de mexer no horário. Cancelado só se remarca junto com a reativação
  // (`status` não cancelado), validada no horário NOVO: o antigo pode já ter sido ocupado (cancelado por conflito, por exemplo).
  if (a.status === STATUS.CONCLUIDO) return { ok: false, erros: ['Agendamento concluído não pode ser remarcado.'] };
  if (a.status === STATUS.CANCELADO && (status === undefined || status === STATUS.CANCELADO)) return { ok: false, erros: ['Agendamento cancelado não pode ser remarcado. Reative-o antes.'] };
  if (a.status === STATUS.CANCELADO && jaCreditado(s, a)) return { ok: false, erros: ERRO_DEVOLVIDO };
  const novoProfissional = profissionalId || a.profissionalId;
  const v = validarHorario(s, { profissionalId: novoProfissional, inicio, servicoIds: a.servicoIds, porte: a.porte, boxId, boxPreferido: a.boxId, ignoreId: a.id, encaixe: a.encaixe, origem: 'painel', agora });
  if (v.erros.length) return { ok: false, erros: v.erros };
  { const e = erroDoPlano(s, a, inicio, agora); if (e) return { ok: false, erros: [e] }; }
  if (v.boxId !== a.boxId) {
    registrar(s, a, autor, 'box', nomeBox(s, a.boxId) || null, nomeBox(s, v.boxId), agora);
    a.boxId = v.boxId;
  }
  if (novoProfissional !== a.profissionalId) {
    const de = profissionalDe(s, a);
    a.profissionalId = novoProfissional;
    registrar(s, a, autor, 'profissional', de?.apelido || de?.nome, profissionalDe(s, a)?.apelido, agora);
  }
  aplicarRemarcacao(s, a, inicio, status || a.status, autor, agora);
  if (a.status === STATUS.CONFIRMADO || a.status === STATUS.CONCLUIDO) cancelarPendentesConflitantes(s, a, agora);
  for (const g of aposCriar) g(s, a, autor, agora);
  tick(s, agora);
  return { ok: true, agendamento: a, avisos: { pendentes: v.pendentes, confirmados: v.confirmados } };
}

export function profissionalCancela(s, id, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a || a.status === STATUS.CANCELADO) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (a.clienteAgendou) enviarAoCliente(s, a, 'recusado', agora); // pedido do link que o estabelecimento não confirmou
  registrar(s, a, autor, 'status', ROTULOS[a.status], 'Cancelado', agora);
  a.status = STATUS.CANCELADO; a.emServico = null; a.pronto = null;
  a.motivoCancelamento = 'profissional';
  return { ok: true, agendamento: a };
}

// Correção manual de status (quando algo deu errado).
export function profissionalAlteraStatus(s, id, status, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (!Object.values(STATUS).includes(status)) return { ok: false, erros: ['Status inválido.'] };
  if (a.status === status) return { ok: true, agendamento: a };
  // Reativar um agendamento cancelado precisa de horário livre: senão vira dupla reserva.
  if (a.status === STATUS.CANCELADO && status !== STATUS.CANCELADO) {
    if (jaCreditado(s, a)) return { ok: false, erros: ERRO_DEVOLVIDO };
    const v = validarHorario(s, { profissionalId: a.profissionalId, inicio: a.inicio, servicoIds: a.servicoIds, porte: a.porte, boxPreferido: a.boxId, ignoreId: a.id, encaixe: a.encaixe, origem: 'painel', agora });
    if (v.erros.length) return { ok: false, erros: v.erros };
    { const e = erroDoPlano(s, a, a.inicio, agora); if (e) return { ok: false, erros: [e] }; }
    a.boxId = v.boxId;
  }
  registrar(s, a, autor, 'status', ROTULOS[a.status], ROTULOS[status], agora);
  if (status === STATUS.CANCELADO || status === STATUS.A_CONFIRMAR) { a.emServico = null; a.pronto = null; }
  a.status = status;
  a.motivoCancelamento = status === STATUS.CANCELADO ? 'profissional' : null;
  // Escolha manual depois do horário começar: vale como foi escolhida. O sistema não conclui nem cancela sozinho (nem avisa o cliente); remarcar libera de novo.
  a.statusManual = agora >= a.inicio ? { em: agora, inicio: a.inicio } : null;
  if (status !== STATUS.A_CONFIRMAR) a.faltaConfirmacao = null;
  if (status === STATUS.CONFIRMADO || status === STATUS.CONCLUIDO) cancelarPendentesConflitantes(s, a, agora);
  return { ok: true, agendamento: a };
}

// Cliente de um atendimento (local ou agendamento futuro) a partir de nome e telefone digitados:
// - telefone que já tem cadastro (DDD + número): o cliente do telefone vale, mesmo que outro tenha sido escolhido na lista (com vários no mesmo número, o de mesmo nome ou apelido; senão o primeiro);
// - telefone novo, com ou sem nome: CRIA o cadastro (sem nome, o nome fica igual ao telefone até alguém informar um);
// - só nome, sem telefone: não cria cadastro (fica só no registro do atendimento).
// Nome digitado MAIS COMPLETO que o do cadastro (mais longo e contendo o antigo, ex.: "João" → "João Silva") atualiza o cadastro; cadastro sem nome recebe o digitado.
const semAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function nomeMaisCompleto(antigo, novo) {
  const a = semAcento(antigo), n = semAcento(novo);
  if (!a || n.length <= a.length) return false;
  const tn = n.split(' ');
  return a.split(' ').every((w) => tn.some((x) => x.startsWith(w)));
}
export function acharClientePorTelefone(clientes, telefone, nome) {
  const tel = telefoneNacional(telefone);
  if (!tel) return null;
  const doNumero = clientes.filter((c) => telefoneNacional(c.telefone) === tel);
  const n = String(nome || '').trim().toLowerCase();
  return doNumero.find((c) => n && [c.nome, c.apelido].some((x) => String(x || '').toLowerCase() === n)) || doNumero.find((c) => n && nomeMaisCompleto(c.nome, nome)) || doNumero[0] || null;
}
function atualizaNomeDoCadastro(cli, nomeInf) {
  if (!nomeInf) return;
  if (cli.semNome) { cli.nome = nomeInf; delete cli.semNome; } else if (nomeMaisCompleto(cli.nome, nomeInf)) cli.nome = nomeInf.slice(0, 60);
}
export function resolverClienteDoAtendimento(s, { nome, telefone, clienteId }, agora) {
  const tel = telefoneNacional(telefone);
  if (tel && !(tel.length === 10 || tel.length === 11)) return { ok: false, erros: ['Telefone com DDD e número (10 ou 11 dígitos).'] };
  const nomeInf = String(nome || '').trim();
  if (clienteId) {
    const c = s.clientes.find((x) => x.id === clienteId);
    if (!c) return { ok: false, erros: ['Cliente não encontrado.'] };
    // Telefone digitado de OUTRO cadastro sobrescreve a escolha da lista; telefone vazio ou do próprio cliente mantém a escolha.
    if (!tel || telefoneNacional(c.telefone) === tel) { atualizaNomeDoCadastro(c, nomeInf); return { ok: true, cliente: c }; }
  }
  if (!tel) return { ok: true, cliente: null, nomeAvulso: nomeInf };
  const cli = acharClientePorTelefone(s.clientes, tel, nomeInf);
  if (cli) { atualizaNomeDoCadastro(cli, nomeInf); return { ok: true, cliente: cli }; }
  const novo = { id: nextId(s, 'c'), nome: nomeInf || formatarTelefone(tel), apelido: '', telefone: formatarTelefone(tel), cpf: '', nascimento: '', criadoEm: agora, origemCadastro: 'atendimento', ...(nomeInf ? {} : { semNome: true }) };
  s.clientes.push(novo);
  return { ok: true, cliente: novo, criado: true };
}

// Atendimento local (cliente que chegou no balcão, ou registro de algo que já aconteceu): nasce concluído, para entrar no relatório, no estoque,
// na comissão e no financeiro. Não manda mensagem, não passa por conflito de horário (já aconteceu). `inicio` opcional (passado); sem ele, é agora.
// Cliente: ver `resolverClienteDoAtendimento` (telefone cria cadastro; só nome não).
export function registrarAtendimentoLocal(s, { profissionalId, servicoIds, nome, telefone, clienteId: clienteEscolhido, produtos, vendedorId, formaPagamento, inicio, veiculoId, veiculo, exigirVeiculo, motivoRetroativo, assinaturaId }, autor, agora) {
  const ids = Array.isArray(servicoIds) ? servicoIds : [];
  const temProdutos = Array.isArray(produtos) && produtos.length > 0;
  // Venda de produto sem serviço: vale quando há ao menos um produto; senão continua exigindo ao menos um serviço.
  if (!ids.length && !temProdutos) return { ok: false, erros: ['Escolha ao menos um serviço ou um produto.'] };
  const forma = formaEfetiva(s, formaPagamento);
  if (forma === null) return { ok: false, erros: ['Forma de pagamento inválida.'] };
  if (forma === '') return { ok: false, erros: ['Escolha a forma de pagamento.'] };
  if (ids.length) { const e = errosServicoIds(s, ids, { ativos: true }); if (e) return { ok: false, erros: [e] }; }
  // Vendedor dos produtos: quem vendeu (ganha a comissão do produto). Sem informar, é o próprio profissional; venda só de produto, é quem vendeu.
  let vend = null;
  if (temProdutos) {
    vend = vendedorId || (ids.length ? profissionalId : null);
    if (!vend) return { ok: false, erros: ['Escolha o vendedor.'] };
    if (!vendedorValido(s, vend)) return { ok: false, erros: ['Essa pessoa não pode vender produtos (Equipe > Pode vender produtos).'] };
  }
  // O atendimento fica na coluna de um profissional da agenda. Venda só de produto sem profissional informado vai para o vendedor (se atende) ou para o primeiro que atende.
  let bId = profissionalId;
  if (!ids.length && !s.usuarios.some((u) => u.id === bId && u.atende)) {
    const dele = s.usuarios.find((u) => u.id === vend && u.atende) || s.usuarios.find((u) => u.atende);
    bId = dele ? dele.id : null;
  }
  const b = s.usuarios.find((u) => u.id === bId && u.atende);
  if (!b) return { ok: false, erros: [`Escolha o ${rot('profissional')} que atendeu.`] };
  profissionalId = bId;
  const quando = inicio === undefined || inicio === null ? Math.floor(agora / 60000) * 60000 : Number(inicio);
  if (!Number.isFinite(quando) || quando > agora + 60000) return { ok: false, erros: ['Atendimento que já aconteceu não pode ter data no futuro. Para o futuro, use agendamento.'] };
  if (quando < agora - 400 * 24 * 3600 * 1000) return { ok: false, erros: ['A data do atendimento é antiga demais (máximo de 400 dias atrás).'] };
  // Lançamento de um dia anterior ("esqueci de registrar"): exige o motivo, que fica no histórico. Hoje, mesmo em hora anterior, é atendimento comum.
  const retro = quando < startOfDay(agora);
  const motivoRetro = retro ? limparTexto(String(motivoRetroativo || ''), 300).trim() : '';
  if (retro && motivoRetro.length < 5) return { ok: false, erros: ['Informe o motivo do lançamento de um dia anterior (por que não foi registrado na hora).'] };
  const rc = resolverClienteDoAtendimento(s, { nome, telefone, clienteId: clienteEscolhido }, agora);
  if (!rc.ok) return rc;
  const cli = rc.cliente;
  // Serviço tem preço por porte: o atendimento precisa de um veículo (do cadastro do cliente ou novo). Venda só de produto não precisa.
  const rv = ids.length ? resolverVeiculo(s, cli, { veiculoId, veiculo, exigirVeiculo }) : null;
  if (rv && !rv.ok) return { ok: false, erros: rv.erros };
  const sv = servicosPorIds(s, ids, rv?.veiculo?.porte);
  let usoPlano = null;
  if (assinaturaId) {
    if (!cli) return { ok: false, erros: ['O plano é de um cliente cadastrado: informe o telefone dele.'] };
    const up = usoParaAgendamento(s, { assinaturaId, clienteId: cli.id, servicoIds: ids, inicio: Math.min(quando, Math.floor(agora / 60000) * 60000), agora });
    if (!up.ok) return { ok: false, erros: [up.erro] };
    usoPlano = up;
  }
  const a = {
    ...(usoPlano ? { planoUso: usoPlano.uso } : {}),
    id: nextId(s, 'a'), clienteId: cli ? cli.id : null, nomeAvulso: cli ? '' : rc.nomeAvulso || '', telefoneAvulso: '', local: true, profissionalId, servicoIds: [...ids],
    ...(rv ? { veiculoId: gravarVeiculo(s, cli, rv), veiculo: rv.veiculo, porte: rv.veiculo?.porte } : {}), boxId: null,
    inicio: Math.min(quando, Math.floor(agora / 60000) * 60000), status: STATUS.CONCLUIDO, encaixe: false, reagendado: false, origem: 'local', criadoEm: agora,
    plano: [], faltaConfirmacao: null, servicosFeitos: [...ids], motivoCancelamento: null, log: [],
    precos: Object.fromEntries(sv.map((x) => [x.id, x.preco])), acrescimos: {}, estoqueBaixado: null, pagamento: { forma },
  };
  congelarComissoes(s, a, sv);
  a.produtos = [];
  if (temProdutos) {
    if (produtos.length > 10) return { ok: false, erros: ['No máximo 10 produtos.'] };
    for (const p of produtos) { const r = incluirProduto(s, a, p && p.materialId, p && p.qtd, vend); if (r) return { ok: false, erros: [r] }; }
  }
  const resumo = [ids.length ? nomesServicos(s, a) : '', a.produtos.length ? `venda de ${textoProdutos(s, a)}` : ''].filter(Boolean).join(' + ');
  registrar(s, a, autor, 'criação', null, `Atendimento local: ${resumo}${cli ? ` (cliente ${cli.apelido || cli.nome})` : a.nomeAvulso ? ` (${a.nomeAvulso})` : ''}`, agora);
  if (retro) {
    // Se o período da comissão desse atendimento já foi pago a alguém que participa dele, a comissão entra no PRÓXIMO pagamento (não reabre o mês fechado).
    const quem = [a.profissionalId, ...a.produtos.map((p) => p.vendedorId || a.profissionalId)];
    const fechado = (s.comissoesPagas || []).some((p) => quem.includes(p.profissionalId) && p.mesTs <= a.inicio && a.inicio <= p.ateTs);
    a.retroativo = { motivo: motivoRetro, lancadoEm: agora, proximoPagamento: fechado };
    if (fechado) a.comissaoEm = agora;
    registrar(s, a, autor, 'lançamento retroativo', null, `${motivoRetro}${fechado ? ' · comissão entra no próximo pagamento (o período já foi pago)' : ''}`, agora);
  }
  if (usoPlano) registrar(s, a, autor, 'plano', null, `Usa 1 atendimento do plano ${usoPlano.uso.planoNome}${usoPlano.aviso ? ` (${usoPlano.aviso})` : ''}`, agora);
  s.agendamentos.push(a);
  tick(s, agora);
  return { ok: true, agendamento: a, ...(usoPlano ? { plano: { nome: usoPlano.uso.planoNome, aviso: usoPlano.aviso, adiantado: usoPlano.adiantado } } : {}) };
}

// ---------- Atender: uma ação só para atendimento no balcão, registro do que já aconteceu e agendamento futuro ----------
// Sem data (ou data de agora/passado): atendimento já feito (local, concluído nessa data). Data futura: agendamento (a confirmar ou confirmado).
// O único requisito fixo é ≥1 serviço ou produto; o resto depende dos campos obrigatórios de cada tipo (Estabelecimento > Regras).
export const CAMPOS_ATENDER = { nome: 'nome', telefone: 'telefone', profissional: 'profissional', vendedor: 'vendedor', formaPagamento: 'forma de pagamento', veiculo: 'veículo', placa: 'placa', modelo: 'modelo do veículo', porte: 'porte do veículo' };
export const CAMPOS_DE_VEICULO = ['veiculo', 'placa', 'modelo', 'porte']; // só valem no tipo com veículo (estética) e quando há serviço
export const CAMPOS_OBRIGATORIOS_PADRAO = { futuro: [], local: [] }; // de fábrica nada é obrigatório; o dono marca em Estabelecimento > Regras do atendimento
export const camposObrigatorios = (s, tipo) => {
  const c = (s.estabelecimento.camposObrigatorios || CAMPOS_OBRIGATORIOS_PADRAO)[tipo];
  return Array.isArray(c) ? c : CAMPOS_OBRIGATORIOS_PADRAO[tipo];
};
/**
 * B9c: a loja tirou o campo "quem vai fazer o serviço" → escolhe quem está com a agenda mais livre (domain/profissional-auto.js). Atendimento de agora ou passado: o primeiro da ordem
 * (atendimento local não disputa horário). Agendamento futuro: o primeiro da ordem que cabe no horário (expediente, serviços, sem conflito com a agenda de ninguém).
 * Devolve { ok, profissionalId } ou { ok:false, erros }.
 */
export function escolherProfissionalAuto(s, { inicio, servicoIds, porte, futuro, agora }) {
  const lista = s.usuarios.filter((u) => u.atende);
  if (!lista.length) return { ok: false, erros: ['Nenhum profissional da equipe atende. Marque quem atende em Equipe.'] };
  const ordem = ordemPorFolga(s.agendamentos, lista.map((u) => u.id), limitesDoDia(inicio));
  if (!futuro) return { ok: true, profissionalId: ordem[0] };
  for (const id of ordem) {
    const v = validarHorario(s, { profissionalId: id, inicio, servicoIds, porte, agora });
    if (!v.erros.length && !v.confirmados.length && !v.pendentes.length) return { ok: true, profissionalId: id };
  }
  return { ok: false, erros: ['Nenhum profissional está livre neste horário. Escolha outro horário.'] };
}

export function atender(s, d, autor, agora) {
  if (semBoxAtivo(s)) return { ok: false, erros: [ERRO_SEM_BOX] }; // estética sem box ativo: nem atendimento local nem agendamento (v120)
  const ids = Array.isArray(d.servicoIds) ? d.servicoIds : [];
  const produtos = Array.isArray(d.produtos) ? d.produtos : [];
  if (!ids.length && !produtos.length) return { ok: false, erros: ['Escolha ao menos um serviço ou um produto.'] };
  const futuro = d.inicio !== undefined && d.inicio !== null && Number(d.inicio) > agora + 60000;
  const tipo = futuro ? 'futuro' : 'local';
  if (!d.profissionalId && profissionalAutomatico(s)) {
    const veic = d.veiculo || (d.veiculoId ? (s.clientes.flatMap((c) => c.veiculos || []).find((v) => v.id === d.veiculoId)) : null);
    const esc = escolherProfissionalAuto(s, { inicio: futuro ? Number(d.inicio) : agora, servicoIds: ids, porte: veic && veic.porte, futuro, agora });
    if (!esc.ok) return esc;
    d = { ...d, profissionalId: esc.profissionalId };
  }
  // Campos obrigatórios do tipo: o que o formulário já preencheu por padrão (profissional da agenda, vendedor = quem lança, forma padrão) conta como preenchido.
  const cli = d.clienteId ? s.clientes.find((c) => c.id === d.clienteId) : null;
  if (d.clienteId && !cli) return { ok: false, erros: ['Cliente não encontrado.'] };
  const tem = {
    nome: !!(String(d.nome || '').trim() || (cli && !cli.semNome)),
    telefone: !!(telefoneNacional(d.telefone) || (cli && telefoneNacional(cli.telefone))),
    profissional: !!d.profissionalId,
    vendedor: produtos.length === 0 || !!d.vendedorId,
    formaPagamento: futuro || !!formaEfetiva(s, d.formaPagamento),
  };
  const obrig = camposObrigatorios(s, tipo);
  const exigirVeiculo = obrig.filter((k) => CAMPOS_DE_VEICULO.includes(k)); // conferido por resolverVeiculo (só quando há serviço)
  const faltam = obrig.filter((k) => tem[k] === false).map((k) => CAMPOS_ATENDER[k]);
  if (faltam.length) return { ok: false, erros: [`Preencha ${faltam.length === 1 ? 'o campo obrigatório' : 'os campos obrigatórios'}: ${faltam.join(', ')}.`] };
  if (!futuro) {
    if (d.cupomChave) return { ok: false, erros: ['Cupom só vale em agendamento (data futura).'] };
    const r = registrarAtendimentoLocal(s, { ...d, exigirVeiculo }, autor, agora);
    return r.ok ? { ...r, tipo: 'local' } : r;
  }
  // Futuro: precisa de serviço (duração e horário livre) e de um cliente com telefone (o aviso do horário vai por WhatsApp).
  if (!ids.length) return { ok: false, erros: ['Para agendar um horário futuro, escolha ao menos um serviço. Produto sozinho só no atendimento de agora.'] };
  const status = d.status === undefined || d.status === null || d.status === '' ? STATUS.A_CONFIRMAR : d.status;
  if (![STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(status)) return { ok: false, erros: ['Agendamento futuro nasce a confirmar ou confirmado.'] };
  if (produtos.length > 10) return { ok: false, erros: ['No máximo 10 produtos.'] };
  const rc = resolverClienteDoAtendimento(s, d, agora);
  if (!rc.ok) return rc;
  // Sem telefone (e sem cliente escolhido) não há cadastro: o horário fica com o nome avulso, confirmado e sem aviso por WhatsApp. Só vira obrigatório se a loja marcar.
  const r = criarAgendamento(s, { clienteId: rc.cliente ? rc.cliente.id : null, ...(rc.cliente ? {} : { semCliente: true, nomeAvulso: rc.nomeAvulso }), profissionalId: d.profissionalId, servicoIds: ids, inicio: Number(d.inicio), status, encaixe: !!d.encaixe, origem: 'painel', boxId: d.boxId, veiculoId: d.veiculoId, veiculo: d.veiculo, exigirVeiculo, assinaturaId: d.assinaturaId }, autor, agora);
  if (!r.ok) return r;
  for (const p of produtos) {
    const x = adicionarProdutoAoAgendamento(s, r.agendamento.id, { materialId: p && p.materialId, qtd: p && p.qtd, vendedorId: d.vendedorId }, autor, agora);
    if (!x.ok) return x;
  }
  return { ...r, tipo: 'futuro' };
}

// Quem pode vender: quem tem a marca "Pode vender produtos" em Equipe (todos vêm marcados), menos a conta técnica.
export const vendedorValido = (s, id) => { const u = typeof id === 'string' ? s.usuarios.find((x) => x.id === id) : null; return !!u && u.papel !== 'master' && u.ativo !== false && u.podeVender !== false; };

// Produto = material do tipo "produto", vendido por unidade inteira, com o preço do momento. Devolve o texto do erro ou null.
function incluirProduto(s, a, materialId, qtd, vendedorId) {
  const m = typeof materialId === 'string' ? s.materiais.find((x) => x.id === materialId) : null;
  if (!m || m.tipo !== 'produto' || m.ativo === false) return 'Produto não encontrado.';
  const n = Number(qtd);
  if (!Number.isInteger(n) || n < 1 || n > 999) return 'A quantidade vai de 1 a 999.';
  a.produtos = a.produtos || [];
  const ja = a.produtos.find((p) => p.materialId === m.id);
  const vend = vendedorId || (ja && ja.vendedorId) || a.profissionalId;
  if (!vendedorValido(s, vend)) return 'Essa pessoa não pode vender produtos (Equipe > Pode vender produtos).';
  if (ja && (ja.vendedorId || a.profissionalId) !== vend) return `${m.nome} já está neste atendimento com outro vendedor. Retire e adicione de novo.`;
  const total = (ja ? ja.qtd : 0) + n;
  if (total > 999) return 'A quantidade vai de 1 a 999.';
  // Concluído já baixou o que tinha; o resto precisa existir no estoque. Ainda não concluído: reserva só ao concluir, mas confere se há o suficiente.
  const falta = a.status === STATUS.CONCLUIDO && a.estoqueBaixado ? n : total;
  if (m.estoque < falta) return `Estoque insuficiente de ${m.nome} (restam ${m.estoque}).`;
  // percentual congelado na linha: o do produto (se tem) e, senão, o da pessoa que vendeu (Equipe > Comissão sobre produtos); nenhum dos dois = sem comissão
  const pctVendedor = Number((s.usuarios.find((u) => u.id === vend) || {}).comissaoProdutoPct);
  // Produto que o plano inclui: 1 unidade por atendimento do plano sai de graça (o preço da linha vira 0 e o de tabela fica guardado, como o desconto do serviço;
  // a comissão, que é sobre o valor da linha, acompanha). Passou de 1 unidade, a linha toda volta ao preço normal. O estoque baixa do mesmo jeito.
  const coberto = !!a.planoUso && (a.planoUso.produtosIncluidos || []).includes(m.id) && total === 1;
  if (ja) { ja.qtd = total; if (ja.plano && total > 1) { ja.preco = ja.precoTabela; delete ja.plano; delete ja.precoTabela; } } else a.produtos.push({ materialId: m.id, qtd: n, preco: coberto ? 0 : Number(m.preco) || 0, ...(coberto ? { plano: true, precoTabela: Number(m.preco) || 0 } : {}), pct: Number(m.comissaoPct) > 0 ? Number(m.comissaoPct) : pctVendedor > 0 ? pctVendedor : 0, vendedorId: vend });
  return null;
}

export function adicionarProdutoAoAgendamento(s, id, { materialId, qtd, vendedorId }, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (a.status === STATUS.CANCELADO) return { ok: false, erros: ['Agendamento cancelado não recebe produto.'] };
  if (comissaoJaPaga(a)) return { ok: false, erros: [ERRO_COMISSAO_PAGA] };
  if ((a.produtos || []).length >= 10 && !(a.produtos || []).some((p) => p.materialId === materialId)) return { ok: false, erros: ['No máximo 10 produtos.'] };
  const antes = textoProdutos(s, a);
  const e = incluirProduto(s, a, materialId, qtd, vendedorId);
  if (e) return { ok: false, erros: [e] };
  registrar(s, a, autor, 'produtos', antes, textoProdutos(s, a), agora);
  sincronizarEstoque(s, a, agora);
  for (const g of aposEditarValores) g(s, a, autor, agora);
  return { ok: true, agendamento: a };
}

export function removerProdutoDoAgendamento(s, id, materialId, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (!(a.produtos || []).some((p) => p.materialId === materialId)) return { ok: false, erros: ['Produto não está neste atendimento.'] };
  if (comissaoJaPaga(a)) return { ok: false, erros: [ERRO_COMISSAO_PAGA] };
  const antes = textoProdutos(s, a);
  a.produtos = a.produtos.filter((p) => p.materialId !== materialId);
  registrar(s, a, autor, 'produtos', antes, textoProdutos(s, a), agora);
  sincronizarEstoque(s, a, agora);
  for (const g of aposEditarValores) g(s, a, autor, agora);
  return { ok: true, agendamento: a };
}

const textoProdutos = (s, a) => (a.produtos || []).map((p) => `${p.qtd}× ${s.materiais.find((x) => x.id === p.materialId)?.nome || p.materialId}`).join(', ') || '—';

// Acrescenta serviços a um agendamento ou atendimento local sem mudar o status.
export function adicionarServicosAoAgendamento(s, id, novos, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (a.status === STATUS.CANCELADO) return { ok: false, erros: ['Agendamento cancelado não recebe serviço.'] };
  if (comissaoJaPaga(a)) return { ok: false, erros: [ERRO_COMISSAO_PAGA] };
  if (!Array.isArray(novos) || !novos.length) return { ok: false, erros: ['Escolha ao menos um serviço.'] };
  const ja = novos.find((x) => a.servicoIds.includes(x));
  if (ja) return { ok: false, erros: ['Esse serviço já está no atendimento.'] };
  return profissionalEditaServicos(s, id, [...a.servicoIds, ...novos], autor, agora);
}

export function profissionalEditaServicos(s, id, servicoIds, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a) return { ok: false, erros: ['Agendamento não encontrado.'] };
  if (comissaoJaPaga(a)) return { ok: false, erros: [ERRO_COMISSAO_PAGA] };
  { const e = errosServicoIds(s, servicoIds); if (e) return { ok: false, erros: [e] }; }
  { const novos = servicoIds.filter((x) => !a.servicoIds.includes(x)); const e = errosServicoIds(s, novos.length ? novos : servicoIds.slice(0, 1), { ativos: true }); if (novos.length && e) return { ok: false, erros: [e] }; }
  // Mais tempo de serviço pode estourar o expediente ou invadir outro horário: confere de novo enquanto o agendamento está valendo.
  if ([STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status)) {
    const v = validarHorario(s, { profissionalId: a.profissionalId, inicio: a.inicio, servicoIds, porte: a.porte, boxPreferido: a.boxId, ignoreId: a.id, encaixe: a.encaixe, origem: 'painel', agora });
    if (v.erros.length) return { ok: false, erros: v.erros };
    if (v.boxId !== a.boxId) { registrar(s, a, autor, 'box', nomeBox(s, a.boxId) || null, nomeBox(s, v.boxId), agora); a.boxId = v.boxId; }
  }
  const antes = nomesServicos(s, a);
  const idsAntes = a.servicoIds;
  a.servicoIds = [...servicoIds];
  // Concluído (ou com confirmação do serviço): o que foi feito acompanha a troca; serviço novo entra como feito.
  if (a.servicosFeitos) a.servicosFeitos = [...a.servicosFeitos.filter((x) => servicoIds.includes(x)), ...servicoIds.filter((x) => !idsAntes.includes(x))];
  a.precos = { ...(a.precos || {}) };
  for (const x of servicosPorIds(s, servicoIds, a.porte)) if (a.precos[x.id] === undefined) a.precos[x.id] = x.preco;
  congelarComissoes(s, a, servicosPorIds(s, servicoIds, a.porte));
  const acAntes = textoAcrescimos(s, a.acrescimos || {});
  a.acrescimos = limparAcrescimos(a.acrescimos, servicoIds);
  if (textoAcrescimos(s, a.acrescimos) !== acAntes) registrar(s, a, autor, 'acréscimo', acAntes, textoAcrescimos(s, a.acrescimos), agora);
  registrar(s, a, autor, 'serviços', antes, nomesServicos(s, a), agora);
  for (const g of aposEditarValores) g(s, a, autor, agora);
  return { ok: true, agendamento: a };
}

// Confirmação dos serviços feitos: o profissional marca quais foram feitos antes de concluir.
export function confirmarServico(s, id, feitos, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a || a.status !== STATUS.CONFIRMADO) return { ok: false, erros: [`Só agendamentos confirmados podem ter ${voc('tendoConfirmado')}.`] };
  if (!Array.isArray(feitos) || !feitos.length) return { ok: false, erros: ['Marque ao menos um serviço feito.'] };
  if (new Set(feitos).size !== feitos.length || feitos.some((x) => !a.servicoIds.includes(x))) return { ok: false, erros: ['Os serviços feitos precisam ser os do agendamento, sem repetir.'] };
  a.servicosFeitos = [...feitos];
  const nomes = servicosPorIds(s, feitos, a.porte).map((x) => x.nome).join(' + ');
  registrar(s, a, autor, 'status', 'Confirmado', `Concluído (feito: ${nomes})`, agora);
  a.status = STATUS.CONCLUIDO;
  return { ok: true, agendamento: a };
}

// Modelos que só o sistema envia: a resposta de DDD não tem agendamento e o aviso de crédito registrado reflete um lançamento real (o valor e a validade vêm do livro de créditos).
export const MODELOS_SO_AUTOMATICOS = ['ddd', 'credito_registrado', 'credito_vencendo', 'lembrete_24h', 'lembrete_2h', 'cliente_agendou', 'recusado', 'codigo_acesso'];
export function enviarMensagemDoProfissional(s, id, modeloId, valores, autor, agora) {
  const a = s.agendamentos.find((x) => x.id === id);
  const m = s.modelos.find((x) => x.id === modeloId);
  if (!a || !m) return { ok: false, erros: ['Escolha um modelo de mensagem.'] };
  if (!a.clienteId) return { ok: false, erros: ['Esse horário não tem cliente cadastrado (sem telefone): não há para quem enviar.'] };
  if (MODELOS_SO_AUTOMATICOS.includes(m.chave)) return { ok: false, erros: ['Esse modelo é enviado só pelo sistema.'] };
  const msg = {
    id: nextId(s, 'w'), em: agora, agendamentoId: a.id, clienteId: a.clienteId, telefone: clienteDe(s, a)?.telefone, modeloId: m.id,
    modeloNome: m.nome, botoes: botoesDoModelo(m, a, agora), texto: renderizar(m, valores || valoresModelo(s, a, m.chave)), origem: `Enviada por ${autor.nome}`,
  };
  s.mensagensCliente.unshift(msg);
  return { ok: true, mensagem: msg };
}

export function valoresPadraoModelo(s, a, modelo) {
  return valoresModelo(s, a, modelo.chave);
}

// ---------- WhatsApp: novo agendamento do cliente ----------
// Número novo com CPF de um cadastro existente: não cria cliente nem agenda; abre um pedido para o proprietário/admin autorizar.
// A resposta ao cliente é a mesma em qualquer caso e não diz de quem é o cadastro.
export const LIMITE_PEDIDOS_PENDENTES = 50, LIMITE_PEDIDOS_POR_NUMERO = 3, LIMITE_PEDIDOS_GUARDADOS = 200;
const MSG_VINCULO = 'Antes de concluir, o estabelecimento precisa liberar o seu cadastro. Avisamos assim que for liberado e você poderá agendar.';
function pedirVinculo(s, antigo, { telefone, nome }, agora) {
  const lista = (s.pedidosVinculo ||= []);
  const tel = telefoneNacional(telefone);
  const doNumero = lista.filter((p) => telefoneNacional(p.telefone) === tel);
  if (doNumero.some((p) => p.status === 'recusado' && p.clienteId === antigo.id)) return { ok: false, pendente: 'vinculo', erros: [`O estabelecimento não liberou este número. Fale com a ${rot('loja')}.`] };
  if (doNumero.some((p) => p.status === 'pendente' && p.clienteId === antigo.id)) return { ok: false, pendente: 'vinculo', erros: [MSG_VINCULO] };
  if (doNumero.filter((p) => p.status === 'pendente').length >= LIMITE_PEDIDOS_POR_NUMERO || lista.filter((p) => p.status === 'pendente').length >= LIMITE_PEDIDOS_PENDENTES) {
    return { ok: false, pendente: 'vinculo', erros: [`Não foi possível registrar o pedido agora. Fale com a ${rot('loja')}.`] };
  }
  const p = { id: nextId(s, 'v'), clienteId: antigo.id, telefone: limparTexto(String(telefone), 30), nome: limparTexto(String(nome || ''), 100).trim(), cpf: somenteDigitos(antigo.cpf), em: agora, status: 'pendente' };
  lista.push(p);
  while (lista.length > LIMITE_PEDIDOS_GUARDADOS) { const i = lista.findIndex((x) => x.status !== 'pendente'); if (i < 0) break; lista.splice(i, 1); }
  s.avisosPainel.unshift({ id: nextId(s, 'p'), em: agora, agendamentoId: null, profissionalId: null, tipo: 'vinculo', pedidoId: p.id, lido: false,
    texto: `Pedido de número novo: ${p.nome || 'um contato'} (${p.telefone}) informou o CPF do cadastro de ${antigo.nome}, que está com ${antigo.telefone}. Aprove ou recuse em Clientes.` });
  return { ok: false, persistir: true, pendente: 'vinculo', erros: [MSG_VINCULO] };
}

// Proprietário/admin decide o pedido. Aprovar troca o telefone do cadastro pelo número novo (o antigo fica em `telefonesAnteriores`).
export function decidirVinculo(s, id, aprovar, autor, agora) {
  const p = (s.pedidosVinculo || []).find((x) => x.id === id);
  if (!p) return { ok: false, erros: ['Pedido não encontrado.'] };
  if (p.status !== 'pendente') return { ok: false, erros: ['Esse pedido já foi respondido.'] };
  const encerrar = (status) => {
    p.status = status; p.decididoPor = autor.nome; p.decididoEm = agora;
    for (const a of s.avisosPainel) if (a.pedidoId === p.id) a.lido = true;
  };
  const c = s.clientes.find((x) => x.id === p.clienteId);
  if (aprovar) {
    if (!c || somenteDigitos(c.cpf) !== p.cpf) { encerrar('recusado'); return { ok: false, persistir: true, erros: ['O cadastro mudou desde o pedido (removido ou com outro CPF). O pedido foi encerrado; peça ao cliente para tentar de novo.'] }; }
    if (telefoneNacional(p.telefone).length < 10) { encerrar('recusado'); return { ok: false, persistir: true, erros: ['Telefone do pedido inválido. O pedido foi encerrado.'] }; }
    c.telefonesAnteriores = [...(c.telefonesAnteriores || []), { telefone: c.telefone, ate: agora, autorizadoPor: autor.nome }].slice(-5);
    c.telefone = p.telefone;
  }
  encerrar(aprovar ? 'aprovado' : 'recusado');
  return { ok: true, pedido: p, cliente: c };
}

export const LIMITE_ATIVOS_POR_CLIENTE = 5;
export function clienteAgenda(s, { telefone, nome, cpf, nascimento, profissionalId, servicoIds, inicio, veiculoId, veiculo }, agora) {
  const nacional = telefoneDoCanal(telefone);
  if (!nacional || !s.estabelecimento.ddds.includes(Number(nacional.slice(0, 2)))) {
    enviarAoCliente(s, null, 'ddd', agora, { telefone, valores: [], origem: 'Resposta automática' });
    return { ok: false, persistir: true, bloqueado: 'ddd', erros: ['DDD fora da área de atendimento. O cliente recebeu a mensagem de que não é possível agendar.'] };
  }
  let c = identificarCliente(s.clientes, { telefone, cpf, nome });
  let novo = false;
  if (!c) {
    const antigo = cadastroPorCpf(s.clientes, { telefone, cpf });
    if (antigo) return pedirVinculo(s, antigo, { telefone, nome }, agora);
    if (!String(nome || '').trim()) return { ok: false, erros: ['O cadastro exige o nome ou apelido.'] };
    c = { id: nextId(s, 'c'), nome: limparTexto(String(nome), 100).trim() || 'Cliente', apelido: '', cpf: limparTexto(String(cpf || ''), 20), nascimento: limparTexto(String(nascimento || ''), 10), telefone: limparTexto(String(telefone), 30) };
    s.clientes.push(c);
    novo = true;
  }
  const ativosDoCliente = s.agendamentos.filter((x) => x.clienteId === c.id && [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(x.status) && x.inicio > agora).length;
  if (ativosDoCliente >= LIMITE_ATIVOS_POR_CLIENTE) {
    if (novo) s.clientes.pop();
    return { ok: false, erros: [`Você já tem ${LIMITE_ATIVOS_POR_CLIENTE} horários marcados. Remarque ou aguarde um deles antes de agendar outro.`] };
  }
  const r = criarAgendamento(s, { clienteId: c.id, profissionalId, servicoIds, inicio, origem: 'whatsapp', veiculoId, veiculo }, AUTOR_CLIENTE(c), agora);
  if (!r.ok) {
    if (novo) s.clientes.pop();
    return r;
  }
  return { ...r, cliente: c, clienteNovo: novo };
}

// ---------- folgas e feriados ----------
export function agendamentosAfetados(s, excecao, profissionalId) {
  const dias = new Set(diasDaExcecao(excecao).map((d) => fmtDate(d)));
  if (excecao.tipo === 'horario') return [];
  return s.agendamentos.filter((a) => [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && (!profissionalId || a.profissionalId === profissionalId) && dias.has(fmtDate(a.inicio)));
}

export function resolverAfetados(s, ids, destino, autor, agora) {
  for (const id of ids) {
    const a = s.agendamentos.find((x) => x.id === id);
    if (!a) continue;
    if (destino === 'cancelar') {
      registrar(s, a, autor, 'status', ROTULOS[a.status], 'Cancelado (folga ou feriado)', agora);
      a.status = STATUS.CANCELADO;
      a.motivoCancelamento = 'folga';
    } else {
      enviarAoCliente(s, a, 'folga', agora, { origem: `Enviada por ${autor.nome}` });
      registrar(s, a, autor, 'aviso', null, 'Cliente avisado da folga ou do feriado', agora);
    }
  }
}

// ---------- andamento do carro: "Em serviço" e "Pronto para retirada" ----------
// São marcadores sobre o status "Confirmado" (o status não muda). "Pronto para retirada" avisa o cliente ("seu carro está pronto") uma única vez;
// com o carro pronto o sistema espera a retirada (24 h) em vez de concluir o atendimento sozinho no fim do serviço.
export const PRAZO_RETIRADA_MS = 24 * HORA;
export const aguardandoRetirada = (a, agora) => !!a.pronto && agora < a.pronto.em + PRAZO_RETIRADA_MS;
const doAndamento = (s, id) => {
  const a = s.agendamentos.find((x) => x.id === id);
  if (!a || a.local) return { erro: 'Agendamento não encontrado.' };
  if (a.status !== STATUS.CONFIRMADO) return { erro: 'Só um agendamento confirmado pode ter o andamento do carro marcado.' };
  return { a };
};
export function iniciarServico(s, id, autor, agora) {
  if (!cap(s.estabelecimento, 'prontoParaRetirada')) return { ok: false, erros: ['Esse tipo de estabelecimento não usa o andamento do carro.'] };
  const { a, erro } = doAndamento(s, id);
  if (erro) return { ok: false, erros: [erro] };
  if (a.pronto) return { ok: false, erros: ['O carro já está pronto para retirada.'] };
  if (a.emServico) return { ok: true, agendamento: a };
  a.emServico = { em: agora };
  registrar(s, a, autor, 'andamento', null, 'Em serviço', agora);
  return { ok: true, agendamento: a };
}
export function marcarPronto(s, id, autor, agora) {
  if (!cap(s.estabelecimento, 'prontoParaRetirada')) return { ok: false, erros: ['Esse tipo de estabelecimento não usa o andamento do carro.'] };
  const { a, erro } = doAndamento(s, id);
  if (erro) return { ok: false, erros: [erro] };
  if (a.pronto) return { ok: true, agendamento: a }; // o aviso sai uma vez só (para repetir, o painel envia o modelo "Carro pronto")
  registrar(s, a, autor, 'andamento', a.emServico ? 'Em serviço' : null, 'Pronto para retirada', agora);
  a.pronto = { em: agora };
  const msg = enviarAoCliente(s, a, 'carro_pronto', agora);
  return { ok: true, agendamento: a, mensagem: msg };
}
// Desfaz o marcador (quem marcou sem querer): 'pronto' volta a "Em serviço"; 'emServico' tira o marcador.
export function desmarcarAndamento(s, id, qual, autor, agora) {
  if (!cap(s.estabelecimento, 'prontoParaRetirada')) return { ok: false, erros: ['Esse tipo de estabelecimento não usa o andamento do carro.'] };
  const { a, erro } = doAndamento(s, id);
  if (erro) return { ok: false, erros: [erro] };
  if (qual === 'pronto' && a.pronto) { a.pronto = null; registrar(s, a, autor, 'andamento', 'Pronto para retirada', a.emServico ? 'Em serviço' : null, agora); }
  else if (qual === 'emServico' && a.emServico && !a.pronto) { a.emServico = null; registrar(s, a, autor, 'andamento', 'Em serviço', null, agora); }
  else return { ok: false, erros: ['Esse marcador não está ligado.'] };
  return { ok: true, agendamento: a };
}

// ---------- ações automáticas por horário ----------
// Roda a cada passagem do relógio: notificações, falta de confirmação, cancelamento e conclusão automáticos.
export function tick(s, agora) {
  for (const a of s.agendamentos) {
    const sv = servicosDoAg(s, a);
    const fim = retiradaDe(s, a); // fim do serviço (num serviço de vários dias, a retirada)
    const manual = !!a.statusManual && a.statusManual.inicio === a.inicio; // status escolhido à mão depois do horário: não mexer
    if (a.clienteAgendou && a.status !== STATUS.A_CONFIRMAR) a.clienteAgendou = false; // confirmado, cancelado ou concluído: deixa de ser "Cliente agendou"
    if (a.lembretes) lembrar(s, a, agora);
    if (a.status === STATUS.A_CONFIRMAR) {
      for (const p of a.plano) {
        if (p.estado === 'pendente' && p.enviarEm <= agora && agora < a.inicio) {
          p.estado = 'enviada';
          p.enviadaEm = Math.min(agora, p.enviarEm + 0);
          enviarAoCliente(s, a, p.tipo === 'pergunta' ? 'confirmacao' : 'aviso', p.enviarEm);
        } else if (p.estado === 'pendente' && agora >= a.inicio) {
          p.estado = 'pulada';
        }
      }
      if (agora >= a.inicio && !a.faltaConfirmacao && !manual) {
        a.faltaConfirmacao = { em: a.inicio };
        if (!a.clienteAgendou) enviarAoCliente(s, a, 'falta_confirmacao', a.inicio); // quem pediu pelo link não deixou de confirmar nada: quem não confirmou foi o estabelecimento
        const c = clienteDe(s, a);
        avisarPainel(s, a, `Sem confirmação: ${c ? c.apelido || c.nome : a.nomeAvulso || 'o cliente'} não confirmou o agendamento de ${nomesServicos(s, a)} com ${profissionalDe(s, a)?.apelido || profissionalDe(s, a)?.nome}, marcado para ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}.`, a.inicio);
        registrar(s, a, AUTOR_SISTEMA, 'aviso', null, 'Horário chegou sem confirmação do cliente', a.inicio);
      }
      if (agora >= fim && !manual) {
        registrar(s, a, AUTOR_SISTEMA, 'status', 'A confirmar', 'Cancelado (sem confirmação)', fim);
        a.status = STATUS.CANCELADO;
        a.motivoCancelamento = 'falta_confirmacao';
      }
    } else if (a.status === STATUS.CONFIRMADO && agora >= fim && !manual && !aguardandoRetirada(a, agora) && !exigeConfirmacaoServico(sv, s.estabelecimento)) {
      registrar(s, a, AUTOR_SISTEMA, 'status', 'Confirmado', 'Concluído (automático)', fim);
      a.status = STATUS.CONCLUIDO;
      a.servicosFeitos = [...a.servicoIds];
    }
  }
  for (const a of s.agendamentos) sincronizarEstoque(s, a, agora);
  for (const g of ganchos) g(s, agora);
}

// Lembretes de 24 h e 2 h do cliente que agendou pelo link: só saem se ele aceitou (cliente.lembretes === true) e o horário segue marcado.
// Se vários venceram de uma vez (relógio adiantado), só o mais próximo do horário sai.
function lembrar(s, a, agora) {
  const pend = a.lembretes.filter((l) => l.estado === 'pendente');
  if (!pend.length) return;
  if (![STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) || agora >= a.inicio) { pend.forEach((l) => { l.estado = 'pulada'; }); return; }
  const vencidos = pend.filter((l) => l.enviarEm <= agora);
  vencidos.forEach((l, i) => {
    const ultimo = i === vencidos.length - 1;
    if (ultimo && clienteDe(s, a)?.lembretes === true) { enviarAoCliente(s, a, l.horas === 24 ? 'lembrete_24h' : 'lembrete_2h', l.enviarEm); l.estado = 'enviada'; l.enviadaEm = agora; } else l.estado = 'pulada';
  });
}

// Estoque: o atendimento concluído baixa os materiais dos serviços feitos e os produtos vendidos; se deixar de estar concluído, estorna.
// Se serviços ou produtos mudam depois de concluído (adicionar serviço, vender produto), só a diferença entra ou sai.
function sincronizarEstoque(s, a, agora) {
  const mover = (mid, delta, obs, em) => {
    const m = s.materiais.find((x) => x.id === mid);
    if (!m || !delta) return;
    m.estoque = r3(m.estoque - delta);
    s.movimentosEstoque.unshift({ id: nextId(s, 'e'), em, materialId: mid, tipo: delta > 0 ? 'saida' : 'entrada', delta: -delta, agendamentoId: a.id, obs, autor: AUTOR_SISTEMA, saldo: m.estoque });
  };
  if (a.status === STATUS.CONCLUIDO && !a.estoqueBaixado) {
    const fim = a.inicio + duracaoMin(servicosPorIds(s, a.servicosFeitos || a.servicoIds, a.porte)) * MIN;
    const consumo = consumoDoAgendamento(s, a);
    for (const [mid, q] of Object.entries(consumo)) mover(mid, q, 'Atendimento concluído', Math.min(agora, fim));
    a.estoqueBaixado = consumo;
  } else if (a.status === STATUS.CONCLUIDO && a.estoqueBaixado) {
    const novo = consumoDoAgendamento(s, a);
    const ids = new Set([...Object.keys(novo), ...Object.keys(a.estoqueBaixado)]);
    let mudou = false;
    for (const mid of ids) { const d = r3((novo[mid] || 0) - (a.estoqueBaixado[mid] || 0)); if (d) { mover(mid, d, d > 0 ? 'Serviço ou produto adicionado ao atendimento' : 'Serviço ou produto retirado do atendimento', agora); mudou = true; } }
    if (mudou) a.estoqueBaixado = novo;
  } else if (a.status !== STATUS.CONCLUIDO && a.estoqueBaixado) {
    for (const [mid, q] of Object.entries(a.estoqueBaixado)) mover(mid, -q, 'Estorno: o atendimento deixou de estar concluído', agora);
    a.estoqueBaixado = null;
  }
}

export function movimentarEstoque(s, { materialId, tipo, qtd, obs }, autor, agora) {
  const m = s.materiais.find((x) => x.id === materialId);
  if (!m) return { ok: false, erros: ['Material não encontrado.'] };
  const n = Number(qtd);
  if (!['entrada', 'ajuste'].includes(tipo)) return { ok: false, erros: ['Tipo de movimento inválido.'] };
  if (!Number.isFinite(n) || n > 1e9 || (tipo === 'entrada' && n <= 0) || (tipo === 'ajuste' && n < 0)) return { ok: false, erros: [tipo === 'entrada' ? 'Informe uma quantidade maior que zero.' : 'Informe o novo saldo (zero ou mais).'] };
  const delta = tipo === 'entrada' ? n : r3(n - m.estoque);
  m.estoque = r3(m.estoque + delta);
  s.movimentosEstoque.unshift({ id: nextId(s, 'e'), em: agora, materialId, tipo, delta, agendamentoId: null, obs: obs || (tipo === 'entrada' ? 'Compra / reposição' : 'Ajuste de inventário'), autor, saldo: m.estoque });
  return { ok: true, material: m };
}

export { ATIVOS, ocupadoMin };
