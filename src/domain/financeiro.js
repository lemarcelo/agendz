/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:21c339b8f7 */
// Financeiro: lançamentos (despesas e créditos), cobranças Pix, Open Finance e conciliação.
// O "banco" aqui é simulado (s.banco). Em produção, o Open Finance e a API Pix do banco entregam esses movimentos.
import { aposCriar, aposEditarValores, validadoresEdicaoCliente, ganchos, nextId, registrar, enviarAoCliente, avisarPainel, AUTOR_SISTEMA } from './engine.js';
import { cpfFormatado, cpfValido, digitos, gerarBrCode, gerarBrCodeDinamico, lerBrCode } from './pix.js';
import { itensDoAgendamento, produtosDoAgendamento, r2, totalAgendamento } from './reports.js';
import { addMonths, DIA, fmtDate, fmtHM, fmtMoney, monthStart, startOfDay } from './time.js';
import { ERRO_SEM_PIX, momentoCancelamentoPix, notificacoesEfetivas, pixCancelamentoEfetivo, servicosPorIds, usaIntegracaoPix } from './rules.js';
import { rot } from './tipos.js';

const erro = (m) => ({ ok: false, erros: [m] });
const f = (s) => s.financeiro;
const ag = (s, id) => s.agendamentos.find((a) => a.id === id);
const nomeCliente = (s, a) => { if (a.local && !a.clienteId) return a.nomeAvulso || 'Local'; const c = s.clientes.find((x) => x.id === a.clienteId); return c ? c.apelido || c.nome.split(' ')[0] : ''; };
const diasEntre = (a, b) => Math.abs(startOfDay(a) - startOfDay(b)) / DIA;
const nomesIds = (s, ids) => servicosPorIds(s, ids).map((x) => x.nome).join(' + ');

// ---------- contas e grupos de movimentação ----------
// Conta: conta bancária da loja (chave Pix, API Pix e Open Finance próprias).
// Grupo de movimentação: define qual conta é responsável pelo dinheiro que entra (serviços) e sai (despesas).
// O grupo é escolhido no estabelecimento (padrão), no serviço (opcional) e em cada despesa ou crédito.
export const contaDe = (s, id) => f(s).contas.find((c) => c.id === id) || null;
export const grupoDe = (s, id) => f(s).grupos.find((g) => g.id === id) || null;
export const grupoDoServico = (s, sv) => grupoDe(s, sv && sv.grupoMovimentacaoId) || grupoDe(s, s.estabelecimento.grupoMovimentacaoId);
const rotuloConta = (c) => (c ? c.apelido : '—');

export function contaNova(s, d, id) {
  const outra = f(s).contas[0];
  return {
    id, apelido: String(d.apelido).trim(), banco: d.banco, agencia: digitos(d.agencia), conta: String(d.conta).trim(),
    pix: { tipoChave: 'aleatoria', chave: '', recebedor: s.estabelecimento.nome || '', cidade: outra ? outra.pix.cidade : '', validadeH: 24 },
    apiPix: { banco: null, ambiente: 'homologacao', urlBase: '', clientId: '', clientSecret: '', certificadoNome: '', chavePrivadaNome: '', cadeiaNome: '', appKey: '', escopos: [...ESCOPOS_OBRIGATORIOS], webhookUrl: outra ? outra.apiPix.webhookUrl : '', ativa: false, testadoEm: null },
    openFinance: { conectado: false, consentimentoEm: null, validoAte: null, ultimaSync: null },
  };
}

export function salvarConta(s, d) {
  const apelido = String(d.apelido || '').trim();
  if (!apelido) return erro('Dê um nome à conta, por exemplo "Conta principal".');
  if (!BANCOS.includes(d.banco)) return erro('Escolha o banco.');
  if (digitos(d.agencia).length < 3 || digitos(d.conta).length < 4) return erro('Informe a agência e a conta.');
  if (f(s).contas.some((c) => c.id !== d.id && c.apelido.toLowerCase() === apelido.toLowerCase())) return erro('Já existe uma conta com esse nome.');
  if (d.id) {
    const c = contaDe(s, d.id);
    if (!c) return erro('Conta não encontrada.');
    if (c.banco !== d.banco) {
      if (c.apiPix.ativa || c.openFinance.conectado) return erro('Desative a API Pix e desconecte o Open Finance antes de trocar o banco da conta.');
      Object.assign(c.apiPix, { banco: null, clientSecret: '', urlBase: '', appKey: '' });
    }
    Object.assign(c, { apelido, banco: d.banco, agencia: digitos(d.agencia), conta: String(d.conta).trim() });
    return { ok: true, conta: c };
  }
  const c = contaNova(s, d, nextId(s, 'ct'));
  f(s).contas.push(c);
  return { ok: true, conta: c };
}

export function removerConta(s, id) {
  const c = contaDe(s, id);
  if (!c) return erro('Conta não encontrada.');
  if (f(s).contas.length === 1) return erro('É preciso manter ao menos uma conta.');
  const g = f(s).grupos.find((x) => x.contaId === id);
  if (g) return erro(`Esta conta é responsável pelo grupo "${g.nome}". Passe o grupo para outra conta antes de remover.`);
  if (f(s).cobrancas.some((x) => x.contaId === id) || f(s).extrato.some((x) => x.contaId === id) || f(s).lancamentos.some((x) => x.contaId === id)) return erro('Esta conta já tem movimentações e não pode ser removida.');
  f(s).contas = f(s).contas.filter((x) => x.id !== id);
  return { ok: true };
}

export function salvarGrupo(s, d) {
  const nome = String(d.nome || '').trim();
  if (!nome) return erro('Dê um nome ao grupo de movimentação.');
  if (!contaDe(s, d.contaId)) return erro('Escolha a conta responsável pelo grupo.');
  if (f(s).grupos.some((g) => g.id !== d.id && g.nome.toLowerCase() === nome.toLowerCase())) return erro('Já existe um grupo com esse nome.');
  if (d.id) {
    const g = grupoDe(s, d.id);
    if (!g) return erro('Grupo não encontrado.');
    Object.assign(g, { nome, contaId: d.contaId }); // vale daqui para a frente: o que já foi gerado fica na conta de origem
    return { ok: true, grupo: g };
  }
  const g = { id: nextId(s, 'g'), nome, contaId: d.contaId };
  f(s).grupos.push(g);
  return { ok: true, grupo: g };
}

export function usoDoGrupo(s, id) {
  return {
    estabelecimento: s.estabelecimento.grupoMovimentacaoId === id,
    servicos: s.servicos.filter((x) => x.grupoMovimentacaoId === id),
    lancamentos: f(s).lancamentos.filter((x) => x.grupoId === id).length,
  };
}

export function removerGrupo(s, id) {
  const g = grupoDe(s, id);
  if (!g) return erro('Grupo não encontrado.');
  if (f(s).grupos.length === 1) return erro('É preciso manter ao menos um grupo de movimentação.');
  const u = usoDoGrupo(s, id);
  if (u.estabelecimento) return erro('Este é o grupo padrão do estabelecimento. Escolha outro padrão em Estabelecimento antes de remover.');
  if (u.servicos.length) return erro(`Este grupo é usado pelos serviços: ${u.servicos.map((x) => x.nome).join(', ')}. Troque o grupo deles antes de remover.`);
  if (u.lancamentos) return erro('Este grupo já tem lançamentos e não pode ser removido.');
  if (f(s).cobrancas.some((c) => c.grupoId === id)) return erro('Este grupo tem cobranças Pix e não pode ser removido.');
  f(s).grupos = f(s).grupos.filter((x) => x.id !== id);
  return { ok: true };
}

export const BANCOS = ['Sicredi', 'Banrisul', 'Banco do Brasil', 'Caixa Econômica Federal', 'Itaú', 'Bradesco', 'Santander', 'Nubank', 'Banco Inter', 'C6 Bank'];
// Bancos com API Pix (padrão do Banco Central: OAuth 2 com client credentials + certificado digital mTLS + escopos).
// Só o que foi confirmado em documentação vem preenchido; o resto o proprietário copia do portal de desenvolvedores do banco.
export const ESCOPOS_PIX = [['cob.write', 'Criar cobranças'], ['cob.read', 'Consultar cobranças'], ['pix.read', 'Consultar Pix recebidos'], ['webhook.write', 'Cadastrar o aviso de pagamento (webhook)'], ['webhook.read', 'Consultar o webhook']];
export const ESCOPOS_OBRIGATORIOS = ['cob.write', 'cob.read', 'pix.read', 'webhook.write'];
export const BANCOS_API = [
  { id: 'itau', nome: 'Itaú', pixApi: true, extras: [], nota: 'Siga o portal de desenvolvedores do banco: normalmente é preciso contratar a API Pix, gerar o certificado digital e as credenciais.' },
  { id: 'santander', nome: 'Santander', pixApi: true, extras: [], nota: 'Siga o portal de desenvolvedores do banco: contratação da API Pix, certificado digital e credenciais.' },
  { id: 'bradesco', nome: 'Bradesco', pixApi: true, extras: [], nota: 'O Bradesco publica o layout da API Pix. Peça a habilitação ao gerente e gere o certificado e as credenciais no portal.' },
  { id: 'sicredi', nome: 'Sicredi', pixApi: true, urlProducao: 'https://api-pix.sicredi.com.br/api/v2', urlHomologacao: 'https://api-pix-h.sicredi.com.br/api/v2', extras: [], nota: 'Peça a adesão à API Pix na sua cooperativa. As credenciais de homologação são geradas no Internet Banking (Outros Serviços, Acesso à API Pix, Gerar Credenciais). O certificado vem em PEM (.cer), com a chave privada (.key) e a cadeia completa.' },
  { id: 'inter', nome: 'Banco Inter', pixApi: true, extras: [], nota: 'Crie a aplicação no Internet Banking PJ (integrações), baixe o certificado e a chave e anote client ID e secret.' },
  { id: 'bb', nome: 'Banco do Brasil', pixApi: true, extras: [{ id: 'appKey', rotulo: 'Chave de aplicação do desenvolvedor' }], nota: 'Cadastre a aplicação no portal de desenvolvedores do banco. Além do client ID e secret, o banco costuma pedir a chave de aplicação do desenvolvedor.' },
  { id: 'caixa', nome: 'Caixa Econômica Federal', pixApi: true, extras: [], nota: 'A API Pix da Caixa depende de contratação junto à agência. Peça a habilitação e os dados de acesso.' },
  { id: 'nubank', nome: 'Nubank', pixApi: false, extras: [], nota: 'Não encontrei API Pix pública do Nubank para conta PJ: a cobrança Pix existe só no app. Use o Open Finance para conciliar e confirme os pagamentos à mão, ou use um provedor de pagamentos que tenha API Pix.' },
];
export const bancoApi = (nome) => BANCOS_API.find((b) => b.nome === nome || b.id === nome);
export const ROTULO_VIA = { open_finance: 'confirmado pelo banco (Open Finance)', api_pix: 'confirmado pelo banco (API Pix)', manual: 'confirmado manualmente', credito: 'crédito do cliente' };
const slug = (n) => String(n || 'banco').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const CATEGORIAS_DESPESA = ['Aluguel', 'Energia e água', 'Internet e telefone', 'Materiais e produtos', 'Comissões e salários', 'Impostos e taxas', 'Marketing', 'Manutenção', 'Outras despesas'];
export const CATEGORIAS_CREDITO = ['Atendimentos (Pix)', 'Outros créditos'];

// ---------- consultas ----------
// Uma cobrança por conta envolvida: a atual de cada conta (pendente, senão paga, senão a mais recente).
export const cobrancasDoAgendamento = (st, a) => {
  const todas = st.financeiro.cobrancas.filter((c) => c.agendamentoId === a.id);
  const out = [];
  for (const ct of st.financeiro.contas) {
    const l = todas.filter((c) => c.contaId === ct.id);
    const c = l.find((x) => x.status === 'pendente') || l.find((x) => x.status === 'paga') || l[0];
    if (c) out.push(c);
  }
  return out;
};
export const cobrancaDoAgendamento = (st, a) => {
  const l = cobrancasDoAgendamento(st, a);
  return l.find((c) => c.status === 'pendente') || l.find((c) => c.status === 'paga') || l[0] || null;
};

// Como o atendimento se divide entre as contas: cada serviço (com o seu acréscimo) vai para a conta do seu grupo de movimentação.
export function partesCobranca(s, a) {
  const por = new Map();
  for (const it of itensDoAgendamento(s, a)) {
    const sv = s.servicos.find((x) => x.id === it.id);
    const g = grupoDoServico(s, sv);
    const ct = g && contaDe(s, g.contaId);
    const chave = ct ? ct.id : '?';
    const p = por.get(chave) || { conta: ct, itens: [], valor: 0, maior: -1, grupo: g };
    p.itens.push(it);
    const v = r2(it.valor + it.acrescimo - (it.desconto || 0));
    p.valor = r2(p.valor + v);
    if (v > p.maior) { p.maior = v; p.grupo = g; } // o crédito vai para o grupo do serviço de maior valor da conta
    por.set(chave, p);
  }
  // Produtos vendidos no atendimento entram na cobrança, na conta do grupo do produto (sem grupo próprio, o padrão do estabelecimento).
  for (const pr of produtosDoAgendamento(s, a)) {
    const m = s.materiais.find((x) => x.id === pr.id);
    const g = grupoDe(s, m && m.grupoMovimentacaoId) || grupoDe(s, s.estabelecimento.grupoMovimentacaoId);
    const ct = g && contaDe(s, g.contaId);
    const chave = ct ? ct.id : '?';
    const p = por.get(chave) || { conta: ct, itens: [], valor: 0, maior: -1, grupo: g };
    p.itens.push({ id: pr.id, nome: `${pr.qtd}× ${pr.nome}`, valor: pr.valor, acrescimo: 0, desconto: 0, produto: true });
    p.valor = r2(p.valor + pr.valor);
    if (pr.valor > p.maior) { p.maior = pr.valor; p.grupo = g; }
    por.set(chave, p);
  }
  return [...por.values()];
}

export function resumoFinanceiro(st, { mesTs, contaId }) {
  const ini = monthStart(mesTs);
  const fim = addMonths(ini, 1);
  const doMes = st.financeiro.lancamentos.filter((l) => l.data >= ini && l.data < fim);
  const lancs = doMes.filter((l) => !contaId || l.contaId === contaId);
  const somaDe = (lista, t) => r2(lista.filter((l) => l.tipo === t).reduce((a, l) => a + l.valor, 0));
  const porConta = st.financeiro.contas.map((c) => { const l = doMes.filter((x) => x.contaId === c.id); const cr = somaDe(l, 'credito'); const de = somaDe(l, 'despesa'); return { id: c.id, nome: c.apelido, creditos: cr, despesas: de, saldo: r2(cr - de) }; });
  const porGrupo = st.financeiro.grupos.map((g) => { const l = doMes.filter((x) => x.grupoId === g.id); const cr = somaDe(l, 'credito'); const de = somaDe(l, 'despesa'); return { id: g.id, nome: g.nome, conta: rotuloConta(contaDe(st, g.contaId)), creditos: cr, despesas: de, saldo: r2(cr - de) }; });
  const soma = (t) => r2(lancs.filter((l) => l.tipo === t).reduce((a, l) => a + l.valor, 0));
  const agrupa = (t) => {
    const m = new Map();
    lancs.filter((l) => l.tipo === t).forEach((l) => { const k = String(l.categoria || 'Sem categoria'); m.set(k, r2((m.get(k) || 0) + l.valor)); });
    return [...m.entries()].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  };
  const pend = st.financeiro.cobrancas.filter((c) => c.status === 'pendente' && (!contaId || c.contaId === contaId));
  const creditos = soma('credito');
  const despesas = soma('despesa');
  return {
    ini, lancs, creditos, despesas, saldo: r2(creditos - despesas), porDespesa: agrupa('despesa'), porCredito: agrupa('credito'), porConta, porGrupo,
    pixPendente: { qtd: pend.length, total: r2(pend.reduce((a, c) => a + c.valor, 0)) },
    decisoes: st.financeiro.extrato.filter((e) => (e.status === 'divergente' || e.status === 'a_classificar') && (!contaId || e.contaId === contaId)).length,
  };
}

// ---------- lançamentos manuais ----------
export function salvarLancamento(s, d, autor, agora) {
  const tipo = d.tipo;
  if (!['despesa', 'credito'].includes(tipo)) return erro('Escolha se é despesa ou crédito.');
  const descricao = String(d.descricao || '').trim();
  if (!descricao) return erro('Descreva o lançamento.');
  const valor = r2(Number(d.valor));
  if (!(valor > 0) || !Number.isFinite(valor) || valor > 10000000) return erro('Informe um valor maior que zero.');
  if (descricao.length > 200 || String(d.categoria || '').length > 100) return erro('Descrição ou categoria grande demais.');
  const data = Number(d.data);
  if (!data || Number.isNaN(data)) return erro('Informe a data.');
  // Grupo de movimentação: o que o usuário escolheu; sem escolha, o padrão do estabelecimento. A conta responsável vem do grupo.
  const g = grupoDe(s, d.grupoId || s.estabelecimento.grupoMovimentacaoId);
  if (!g) return erro('Escolha o grupo de movimentação.');
  if (d.id) {
    const l = f(s).lancamentos.find((x) => x.id === d.id);
    if (!l) return erro('Lançamento não encontrado.');
    l.descricao = descricao; l.categoria = d.categoria || '';
    if (l.origem === 'manual' && !l.conciliado) { l.tipo = tipo; l.valor = valor; l.data = startOfDay(data); l.grupoId = g.id; l.contaId = g.contaId; }
    return { ok: true, lancamento: l };
  }
  const l = { id: nextId(s, 'f'), tipo, descricao, valor, data: startOfDay(data), categoria: d.categoria || '', origem: 'manual', grupoId: g.id, contaId: g.contaId, conciliado: false, extratoId: null, criadoEm: agora, autor };
  f(s).lancamentos.unshift(l);
  conciliarLancamento(s, l);
  return { ok: true, lancamento: l };
}

export function removerLancamento(s, id) {
  const l = f(s).lancamentos.find((x) => x.id === id);
  if (!l) return erro('Lançamento não encontrado.');
  if (l.origem !== 'manual') return erro('Esse lançamento veio de um pagamento ou do banco e não pode ser removido.');
  if (l.conciliado) return erro('Esse lançamento já foi conciliado com o banco e não pode ser removido.');
  f(s).lancamentos = f(s).lancamentos.filter((x) => x.id !== id);
  return { ok: true };
}

// Um lançamento novo procura, no extrato já importado, a movimentação do banco correspondente.
function conciliarLancamento(s, l) {
  const ct = contaDe(s, l.contaId);
  if (!ct || !ct.openFinance.conectado) return;
  const e = f(s).extrato.find((x) => x.contaId === l.contaId && x.status === 'a_classificar' && x.tipo === (l.tipo === 'despesa' ? 'debito' : 'credito') && x.valor === l.valor && diasEntre(x.em, l.data) <= 3);
  if (e) { e.status = 'conciliado'; e.lancamentoId = l.id; e.motivo = 'Conciliado com o lançamento manual.'; l.conciliado = true; l.extratoId = e.id; }
}

// ---------- cobranças Pix ----------
export function salvarPix(s, contaId, d) {
  const ct = contaDe(s, contaId);
  if (!ct) return erro('Conta não encontrada.');
  const chave = String(d.chave || '').trim();
  if (!chave) return erro('Informe a chave Pix que recebe os pagamentos.');
  if (!String(d.recebedor || '').trim()) return erro('Informe o nome do recebedor.');
  if (!String(d.cidade || '').trim()) return erro('Informe a cidade.');
  const h = Number(d.validadeH);
  if (!(h >= 1 && h <= 720)) return erro('A validade da cobrança precisa estar entre 1 e 720 horas.');
  Object.assign(ct.pix, { tipoChave: d.tipoChave, chave, recebedor: String(d.recebedor).trim(), cidade: String(d.cidade).trim(), validadeH: h });
  return { ok: true };
}

// O que ainda pode ser cobrado: conta sem cobrança (valor cheio) ou conta já paga que passou a valer mais (só a diferença, "complementar").
// Atendimento concluído não ganha cobrança complementar.
// `comPendentes`: usado pelo crédito do cliente, que vale mesmo com Pix pendente na conta (o Pix pendente é cancelado quando o crédito é aplicado).
export function partesACobrar(st, a, { comPendentes = false } = {}) {
  const partes = partesCobranca(st, a);
  const ativas = st.financeiro.cobrancas.filter((c) => c.agendamentoId === a.id && (c.status === 'paga' || (!comPendentes && c.status === 'pendente')));
  const out = [];
  for (const p of partes) {
    if (!p.conta) continue;
    if (!ativas.some((c) => c.contaId === p.conta.id)) { out.push({ ...p, aCobrar: p.valor, complementar: false }); continue; }
    const sit = situacaoPorConta(st, a).find((x) => x.contaId === p.conta.id);
    if (sit && sit.pagas.length && (comPendentes || !sit.pendentes.length) && sit.falta > 0 && a.status !== 'concluido') {
      const jaCobrados = new Set(sit.pagas.flatMap((c) => c.servicoIds || []));
      const novos = p.itens.map((i) => i.id).filter((id) => !jaCobrados.has(id));
      out.push({ ...p, aCobrar: sit.falta, complementar: true, servicoIds: novos.length ? novos : p.itens.map((i) => i.id) });
    }
  }
  return out;
}

export function gerarCobranca(s, { agendamentoId, cpf, valor }, autor, agora) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const a = ag(s, agendamentoId);
  if (!a) return erro('Agendamento não encontrado.');
  if (a.status === 'cancelado') return erro('Não dá para cobrar um agendamento cancelado.');
  const partes = partesCobranca(s, a);
  if (partes.some((p) => !p.conta)) return erro('Algum serviço está sem grupo de movimentação com conta definida. Ajuste em Financeiro, aba Grupos.');
  const ativas = f(s).cobrancas.filter((c) => c.agendamentoId === a.id && (c.status === 'pendente' || c.status === 'paga'));
  const faltam = partesACobrar(s, a);
  if (!faltam.length) return erro(ativas.some((c) => c.status === 'pendente') ? 'Já existe uma cobrança Pix pendente para este agendamento.' : 'Este agendamento já foi pago.');
  const semChave = faltam.find((p) => !p.conta.pix.chave);
  if (semChave) return erro(`A conta "${semChave.conta.apelido}" ainda não tem chave Pix. Cadastre em Financeiro, aba Contas.`);
  if (!cpfValido(cpf)) return erro('Informe um CPF válido de quem vai pagar.');
  const informado = !(valor === undefined || valor === '' || valor === null);
  if (informado && faltam.length > 1) return erro('Este atendimento se divide em contas diferentes, então o valor de cada Pix é o dos serviços da conta. Deixe o valor em branco.');
  const criadas = [];
  for (const p of faltam) {
    const v = r2(Number(informado ? valor : p.aCobrar));
    if (!(v > 0) || !Number.isFinite(v) || v > 100000) return erro('Informe um valor maior que zero e de no máximo R$ 100.000,00.');
    criadas.push(emitirCobranca(s, a, p, v, cpf, autor, agora, p.complementar ? { servicoIds: p.servicoIds, complementar: true } : {}));
  }
  const cli = s.clientes.find((x) => x.id === a.clienteId);
  if (cli && !digitos(cli.cpf)) cli.cpf = cpfFormatado(cpf);
  return { ok: true, cobranca: criadas[0], cobrancas: criadas };
}

// Cria a cobrança Pix de uma conta (pendente) e registra no histórico. `complementar`: diferença cobrada depois de o atendimento mudar de valor.
function emitirCobranca(s, a, p, v, cpf, autor, agora, { servicoIds, complementar = false } = {}) {
  const ct = p.conta;
  const id = nextId(s, 'x');
  const viaApi = !!ct.apiPix.ativa;
  // Pela API do banco o identificador (txid) tem de 26 a 35 caracteres e o código é dinâmico (aponta para a cobrança no banco).
  const base = `AGZ${a.id.toUpperCase()}X${id.slice(1)}`;
  const txid = viaApi ? base.padEnd(26, '0').slice(0, 35) : base;
  const c = {
    id, agendamentoId: a.id, clienteId: a.clienteId, cpf: digitos(cpf), valor: v, txid, status: 'pendente', criadaEm: agora, expiraEm: agora + ct.pix.validadeH * 3600000,
    contaId: ct.id, grupoId: p.grupo ? p.grupo.id : null, servicoIds: servicoIds || p.itens.map((i) => i.id),
    emitidaPor: viaApi ? 'api' : 'local', bancoApi: viaApi ? ct.apiPix.banco : null,
    copiaECola: viaApi
      ? gerarBrCodeDinamico({ url: `pix-simulado.${slug(ct.apiPix.banco)}.example/qr/v2/${txid}`, recebedor: ct.pix.recebedor, cidade: ct.pix.cidade })
      : gerarBrCode({ chave: ct.pix.chave, recebedor: ct.pix.recebedor, cidade: ct.pix.cidade, valor: v, txid }),
    enviadaEm: null, pagaEm: null, via: null, pagoPor: null, extratoId: null, avisoPagoEm: null, autor,
    ...(complementar ? { complementar: true } : {}),
  };
  f(s).cobrancas.unshift(c);
  const mais = f(s).contas.length > 1 ? ` na conta "${ct.apelido}"` : '';
  registrar(s, a, autor, 'pagamento', null, `${complementar ? 'Pix complementar' : 'Pix'} de ${fmtMoney(v)} gerado${mais}${viaApi ? ` pela API do ${ct.apiPix.banco}` : ''} (CPF ${cpfFormatado(cpf)})`, agora);
  return c;
}

// Valores das mensagens Pix: sempre os da cobrança (um atendimento pode ter mais de uma, uma por conta).
const valoresPix = (s, a, c, chave) => {
  const nome = nomeCliente(s, a);
  const sv = nomesIds(s, c.servicoIds || a.servicoIds);
  return chave === 'pix_cobranca' ? [nome, sv, fmtMoney(c.valor), c.copiaECola] : [nome, sv, fmtMoney(c.valor)];
};

export function enviarCobranca(s, id, autor, agora) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const c = f(s).cobrancas.find((x) => x.id === id);
  if (!c) return erro('Cobrança não encontrada.');
  if (c.status !== 'pendente') return erro('Só dá para enviar uma cobrança pendente.');
  const a = ag(s, c.agendamentoId);
  const m = enviarAoCliente(s, a, 'pix_cobranca', agora, { origem: `Enviada por ${autor.nome}`, valores: valoresPix(s, a, c, 'pix_cobranca') });
  if (!m) return erro('O modelo de mensagem do Pix não foi encontrado.');
  c.enviadaEm = agora;
  registrar(s, a, autor, 'pagamento', null, 'Pix copia e cola enviado ao cliente pelo WhatsApp', agora);
  return { ok: true, mensagem: m };
}

export function cancelarCobranca(s, id, autor, agora) {
  const c = f(s).cobrancas.find((x) => x.id === id);
  if (!c) return erro('Cobrança não encontrada.');
  if (c.status !== 'pendente') return erro('Só dá para cancelar uma cobrança pendente.');
  const noBanco = c.emitidaPor === 'api';
  if (noBanco && !(contaDe(s, c.contaId) || { apiPix: {} }).apiPix.ativa) return erro(`A API Pix do ${c.bancoApi} está desativada. Reative-a para cancelar esta cobrança no banco.`);
  c.status = 'cancelada';
  registrar(s, ag(s, c.agendamentoId), autor, 'pagamento', 'Pix pendente', noBanco ? `Cobrança cancelada no banco (API do ${c.bancoApi}); o código deixa de valer` : 'Cobrança cancelada', agora);
  return { ok: true };
}

// Confirma o pagamento (Open Finance ou manual). Cria o crédito no financeiro e, se o código foi enviado, avisa o cliente no WhatsApp.
export function confirmarPagamento(s, id, { via, extrato, pagoPor, obs }, autor, agora) {
  const c = f(s).cobrancas.find((x) => x.id === id);
  if (!c) return erro('Cobrança não encontrada.');
  if (c.status === 'paga') return erro('Esta cobrança já foi paga.');
  if (c.status === 'cancelada') return erro('Esta cobrança foi cancelada. Gere uma nova cobrança ou lance o valor recebido em Conciliação.');
  const a = ag(s, c.agendamentoId);
  c.status = 'paga'; c.pagaEm = agora; c.via = via; c.pagoPor = pagoPor || null; c.obs = obs || '';
  const l = { id: nextId(s, 'f'), tipo: 'credito', descricao: `Pix de ${a ? nomeCliente(s, a) : 'cliente'}: ${a ? nomesIds(s, c.servicoIds || a.servicoIds) : ''}`, valor: c.valor, data: startOfDay(agora), categoria: 'Atendimentos (Pix)', origem: 'pix', grupoId: c.grupoId, contaId: c.contaId, agendamentoId: c.agendamentoId, cobrancaId: c.id, conciliado: !!extrato, extratoId: extrato ? extrato.id : null, criadoEm: agora, autor };
  f(s).lancamentos.unshift(l);
  c.lancamentoId = l.id;
  if (extrato) { c.extratoId = extrato.id; extrato.lancamentoId = l.id; extrato.cobrancaId = c.id; }
  if (a) {
    registrar(s, a, autor, 'pagamento', 'Pix pendente', via === 'manual' ? `Pago (confirmado manualmente${obs ? `: ${obs}` : ''})` : `Pago (${ROTULO_VIA[via]})`, agora);
    avisarPainel(s, a, `Pix recebido: ${nomeCliente(s, a)} pagou ${fmtMoney(c.valor)} (${nomesIds(s, c.servicoIds || a.servicoIds)}).`, agora);
    if (c.enviadaEm) { enviarAoCliente(s, a, 'pix_pago', agora, { origem: 'Aviso automático de pagamento', valores: valoresPix(s, a, c, 'pix_pago') }); c.avisoPagoEm = agora; }
  }
  return { ok: true, cobranca: c, lancamento: l };
}

export function confirmarManual(s, id, obs, autor, agora) {
  return confirmarPagamento(s, id, { via: 'manual', obs: String(obs || '').trim() }, autor, agora);
}

// ---------- Pix pago e agendamento cancelado: aviso para devolver, ou crédito do cliente ----------
// O sistema não registra devolução. Ele só AVISA o painel para devolver o valor no banco. Se o profissional confirma que o cliente não compareceu,
// o valor fica com a loja como CRÉDITO do cliente (por conta, porque o dinheiro está nela) e pode pagar um atendimento futuro.
// O crédito não gera novo lançamento: a receita já foi lançada quando o Pix foi pago.
const MOTIVOS_CANCELAMENTO = { get profissional() { return `Agendamento cancelado pelo ${rot('profissional')}`; }, // lido a cada uso: segue o tipo da loja
  cliente: 'Agendamento cancelado pelo cliente', conflito: 'Horário ocupado por outro cliente', falta_confirmacao: 'Cancelado por falta de confirmação', folga: 'Cancelado por folga ou feriado' };

const creditos = (s) => (f(s).creditos = f(s).creditos || []);
const restanteDe = (cr) => r2(cr.valor - cr.usos.reduce((t, u) => t + u.valor, 0));
const baixas = (s) => (f(s).baixas = f(s).baixas || []);
// Quanto de uma cobrança já foi acertado com o cliente (virou crédito, despesa de devolução ou foi devolvido por fora).
// Acertar não mexe no que o cliente pagou nem na receita lançada: só diz que aquela parte já não precisa de decisão.
const resolvidoDe = (s, c) => r2(creditos(s).filter((x) => x.cobrancaId === c.id).reduce((t, x) => t + x.valor, 0) + baixas(s).filter((x) => x.cobrancaId === c.id).reduce((t, x) => t + x.valor, 0));
const dinheiroReal = (c) => c.status === 'paga' && c.via !== 'credito'; // paga com crédito não é dinheiro novo na conta

// Crédito vale por 2 meses a partir da confirmação do profissional; depois disso expira (o valor já foi lançado como receita e fica com a loja).
export const VALIDADE_CREDITO_MESES = 2;
export const DIAS_AVISO_VENCIMENTO = 7; // o cliente é avisado 7 dias antes de o crédito vencer
export function somarMeses(ts, n) {
  const d = new Date(ts); const dia = d.getDate();
  d.setMonth(d.getMonth() + n);
  if (d.getDate() !== dia) d.setDate(0); // 31/12 + 2 meses → último dia de fevereiro
  return d.getTime();
}
// O crédito vale até o fim do dia da data informada ao cliente (23:59:59), nunca até a hora exata da confirmação: o texto só mostra a data.
export const fimDoDia = (ts) => { const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime(); };
export const venceEm = (cr) => fimDoDia(cr.expiraEm ?? somarMeses(cr.criadoEm, VALIDADE_CREDITO_MESES));
export const creditoExpirado = (cr, agora) => agora > venceEm(cr);
const restanteAtivo = (cr, agora) => (creditoExpirado(cr, agora) ? 0 : restanteDe(cr));

// Crédito disponível do cliente (de uma conta, ou de todas), sem o que já expirou.
export function creditoDoCliente(st, clienteId, contaId, agora) {
  if (!Number.isFinite(agora)) throw new Error('creditoDoCliente precisa do instante atual (o crédito expira).');
  return r2((((st.financeiro || {}).creditos) || []).filter((x) => x.clienteId === clienteId && (!contaId || x.contaId === contaId)).reduce((t, x) => t + restanteAtivo(x, agora), 0));
}
// Resumo para o cliente (WhatsApp): total disponível e quando vence o que vence primeiro.
export function resumoCreditoDoCliente(st, clienteId, agora) {
  const ativos = creditosDoCliente(st, clienteId).filter((x) => restanteAtivo(x, agora) > 0).sort((x, y) => venceEm(x) - venceEm(y));
  return { total: creditoDoCliente(st, clienteId, null, agora), itens: ativos.map((x) => ({ valor: restanteAtivo(x, agora), venceEm: venceEm(x) })), venceEm: ativos.length ? venceEm(ativos[0]) : null };
}
export const creditosDoCliente = (st, clienteId) => (((st.financeiro || {}).creditos) || []).filter((x) => x.clienteId === clienteId);

// O que o profissional pode manter como crédito neste agendamento, por conta:
// - cancelado: tudo o que o cliente pagou em dinheiro (e ainda não virou crédito);
// - ativo ou concluído que passou a valer menos: só a diferença paga a mais.
export function creditavelDoAgendamento(st, a) {
  const out = [];
  for (const sit of situacaoPorConta(st, a)) {
    const reais = sit.pagas.filter(dinheiroReal).map((c) => ({ c, residual: r2(c.valor - resolvidoDe(st, c)) })).filter((x) => x.residual > 0);
    let alvo = a.status === 'cancelado' ? r2(reais.reduce((t, x) => t + x.residual, 0)) : (sit.falta < 0 ? -sit.falta : 0);
    const partes = [];
    for (const { c, residual } of reais.sort((x, y) => y.c.pagaEm - x.c.pagaEm)) {
      const v = Math.min(residual, alvo);
      if (v > 0) { partes.push({ cobranca: c, valor: v }); alvo = r2(alvo - v); }
    }
    const valor = r2(partes.reduce((t, x) => t + x.valor, 0));
    if (valor > 0) out.push({ contaId: sit.contaId, conta: sit.conta, valor, partes });
  }
  return out;
}

export const DESTINOS_ACERTO = ['credito', 'despesa', 'fora'];

// Agendamentos pagos do cliente que esperam decisão: cancelados com Pix pago, ou que passaram a valer menos (serviço excluído).
export function pendenciasDeAnalise(st, clienteId) {
  return st.agendamentos.filter((a) => a.clienteId === clienteId).map((a) => ({ agendamento: a, creditavel: creditavelDoAgendamento(st, a) }))
    .filter((x) => x.creditavel.length).map((x) => ({ agendamento: x.agendamento, valor: r2(x.creditavel.reduce((t, c) => t + c.valor, 0)) }));
}

// O profissional decide o que fazer com o valor pago que sobrou (agendamento cancelado, ou serviço excluído):
// - credito: o cliente não compareceu (ou fica com a loja); vira crédito dele e ele é avisado no WhatsApp (a confirmação é do profissional);
// - despesa: devolveu pelo banco; lança a despesa "Devoluções", que concilia com a saída do extrato (a saída não soma ao que o cliente pagou);
// - fora: devolveu por fora do sistema; só registra, sem lançamento.
export function acertarValorPago(s, agendamentoId, destino, autor, agora) {
  const a = ag(s, agendamentoId);
  if (!a) return erro('Agendamento não encontrado.');
  if (!DESTINOS_ACERTO.includes(destino)) return erro('Escolha: manter como crédito, lançar despesa ou devolvido por fora.');
  const lista = creditavelDoAgendamento(s, a);
  if (!lista.length) return erro('Não há valor pago a mais neste agendamento para acertar.');
  const cli = s.clientes.find((x) => x.id === a.clienteId);
  if (!cli) return erro('Cliente não encontrado.');
  const motivo = a.status === 'cancelado' ? (a.motivoCancelamento === 'cliente' ? 'Cancelado pelo cliente' : 'Cliente não compareceu') : 'Atendimento passou a valer menos';
  let total = 0;
  for (const it of lista) {
    for (const { cobranca: c, valor } of it.partes) {
      total = r2(total + valor);
      if (destino === 'credito') {
        creditos(s).unshift({ id: nextId(s, 'cr'), clienteId: cli.id, contaId: c.contaId, grupoId: c.grupoId, cobrancaId: c.id, agendamentoId: a.id, valor, motivo, usos: [], criadoEm: agora, expiraEm: somarMeses(agora, VALIDADE_CREDITO_MESES), autor: autor.nome });
        continue;
      }
      const b = { id: nextId(s, 'bx'), tipo: destino, clienteId: cli.id, contaId: c.contaId, cobrancaId: c.id, agendamentoId: a.id, valor, lancamentoId: null, criadoEm: agora, autor: autor.nome };
      if (destino === 'despesa') {
        const l = { id: nextId(s, 'f'), tipo: 'despesa', descricao: `Devolução de Pix: ${nomeCliente(s, a)}`, valor, data: startOfDay(agora), categoria: 'Devoluções', origem: 'devolucao', grupoId: c.grupoId, contaId: c.contaId, cobrancaId: c.id, agendamentoId: a.id, conciliado: false, extratoId: null, criadoEm: agora, autor };
        f(s).lancamentos.unshift(l);
        b.lancamentoId = l.id;
      }
      baixas(s).unshift(b);
    }
  }
  const o = a.status === 'cancelado' ? '' : ' (diferença paga a mais)';
  registrar(s, a, autor, 'pagamento', 'Pago', destino === 'credito' ? `${fmtMoney(total)} mantidos como crédito do cliente${o || (a.motivoCancelamento === 'cliente' ? ' (cancelado pelo cliente)' : ' (não compareceu)')}` : destino === 'despesa' ? `${fmtMoney(total)} devolvidos pelo banco: despesa lançada, aguardando conciliar com a saída do extrato${o}` : `${fmtMoney(total)} devolvidos por fora do sistema${o}`, agora);
  // Decidido: os avisos desta pendência deixam de valer.
  for (const x of s.avisosPainel) if ((x.agendamentoId === a.id && x.tipo === 'devolver') || (x.tipo === 'revisar' && x.pendenteId === a.id)) x.lido = true;
  if (destino === 'credito') {
    enviarAoCliente(s, a, 'credito_registrado', agora, { origem: `Crédito confirmado pelo ${rot('profissional')}`, valores: [nomeCliente(s, a), fmtMoney(total), nomesIds(s, a.servicoIds), fmtMoney(creditoDoCliente(s, cli.id, null, agora)), fmtDate(somarMeses(agora, VALIDADE_CREDITO_MESES))] });
  }
  return { ok: true, total, destino };
}
export const manterComoCredito = (s, agendamentoId, autor, agora) => acertarValorPago(s, agendamentoId, 'credito', autor, agora);

// Novo agendamento de cliente que tem agendamento pago esperando decisão: o painel é avisado, dizendo exatamente qual é.
function avisarPendenciasNoNovo(s, a, autor, agora) {
  for (const p of pendenciasDeAnalise(s, a.clienteId).filter((x) => x.agendamento.id !== a.id)) {
    const o = p.agendamento;
    const av = avisarPainel(s, a, `${nomeCliente(s, a)} está agendando, mas tem um agendamento pago pendente de análise: ${nomesIds(s, o.servicoIds)} de ${fmtDate(o.inicio)} às ${fmtHM(o.inicio)} (${o.status === 'cancelado' ? 'cancelado' : 'valor reduzido'}), com ${fmtMoney(p.valor)} a acertar. Abra esse agendamento e escolha: manter como crédito, lançar despesa ou devolvido por fora.`, agora);
    av.tipo = 'revisar'; av.pendenteId = o.id;
  }
}
aposCriar.push(avisarPendenciasNoNovo);

// Usa o crédito do cliente para pagar (no todo ou em parte) o que falta cobrar. Só o crédito da mesma conta paga a parte daquela conta.
// Fica registrado como cobrança "paga" por crédito: não gera lançamento, não vai ao banco e não manda nada ao cliente.
export function usarCredito(s, agendamentoId, autor, agora) {
  const a = ag(s, agendamentoId);
  if (!a) return erro('Agendamento não encontrado.');
  if (a.status === 'cancelado') return erro('Não dá para usar crédito em um agendamento cancelado.');
  const faltam = partesACobrar(s, a, { comPendentes: true }).filter((p) => creditoDoCliente(s, a.clienteId, p.conta.id, agora) > 0);
  if (!faltam.length) return erro('O cliente não tem crédito para o que falta cobrar neste agendamento.');
  let total = 0;
  const pixCancelados = [];
  for (const p of faltam) {
    // Pix pendente da mesma conta: o crédito é aplicado e o Pix, que já não bate com o que falta, é cancelado (no banco também, se for da API).
    for (const pend of f(s).cobrancas.filter((c) => c.agendamentoId === a.id && c.contaId === p.conta.id && c.status === 'pendente')) {
      const r = cancelarCobranca(s, pend.id, autor, agora);
      if (!r.ok) return erro(`Há um Pix pendente que não pôde ser cancelado para aplicar o crédito (${r.erros[0]}).`);
      pixCancelados.push(pend);
    }
    let falta = p.aCobrar;
    const usadoAqui = [];
    for (const cr of creditos(s).filter((x) => x.clienteId === a.clienteId && x.contaId === p.conta.id).sort((x, y) => venceEm(x) - venceEm(y))) { // usa primeiro o que vence primeiro
      const v = Math.min(restanteAtivo(cr, agora), falta);
      if (!(v > 0)) continue;
      usadoAqui.push({ cr, v }); falta = r2(falta - v);
      if (falta <= 0) break;
    }
    const valor = r2(p.aCobrar - falta);
    if (!(valor > 0)) continue;
    const id = nextId(s, 'x');
    const c = {
      id, agendamentoId: a.id, clienteId: a.clienteId, cpf: '', valor, txid: null, status: 'paga', criadaEm: agora, expiraEm: agora, pagaEm: agora, via: 'credito', pagoPor: null, obs: '',
      contaId: p.conta.id, grupoId: p.grupo ? p.grupo.id : null, servicoIds: p.complementar ? p.servicoIds : p.itens.map((i) => i.id), emitidaPor: 'credito', bancoApi: null, copiaECola: '',
      enviadaEm: null, extratoId: null, avisoPagoEm: null, lancamentoId: null, autor: autor.nome, ...(p.complementar ? { complementar: true } : {}),
    };
    f(s).cobrancas.unshift(c);
    for (const { cr, v } of usadoAqui) cr.usos.push({ cobrancaId: c.id, agendamentoId: a.id, valor: v, em: agora });
    total = r2(total + valor);
    registrar(s, a, autor, 'pagamento', null, `Crédito do cliente usado: ${fmtMoney(valor)}${f(s).contas.length > 1 ? ` na conta "${p.conta.apelido}"` : ''}`, agora);
  }
  return { ok: true, total, pixCancelados };
}

// O cliente usa o próprio crédito pelo WhatsApp. O crédito só existe depois que um profissional revisou e confirmou o pagamento (acertarValorPago),
// então o cliente nunca cria crédito sozinho: aqui ele só gasta o que já foi revisado. O que o crédito não cobre fica para pagar separadamente,
// direto à loja (o painel é avisado com o valor que falta).
export const faltaDoAgendamento = (st, a) => r2(partesACobrar(st, a).reduce((t, p) => t + p.aCobrar, 0));
// Quanto do crédito do cliente dá para usar neste agendamento: o crédito é de uma conta, então só abate o que falta cobrar nessa mesma conta.
export function creditoUsavelNoAgendamento(st, a, agora) {
  return r2(partesACobrar(st, a, { comPendentes: true }).reduce((t, p) => t + Math.min(p.aCobrar, creditoDoCliente(st, a.clienteId, p.conta.id, agora)), 0));
}
export function clienteUsaCredito(s, agendamentoId, autor, agora) {
  const a = ag(s, agendamentoId);
  if (!a) return erro('Agendamento não encontrado.');
  if (!['a_confirmar', 'confirmado'].includes(a.status) || a.inicio <= agora) return erro('Só dá para usar o crédito em um horário que ainda vai acontecer.');
  const r = usarCredito(s, agendamentoId, autor, agora);
  if (!r.ok) return r;
  const falta = faltaDoAgendamento(s, a);
  const resta = creditoDoCliente(s, a.clienteId, null, agora);
  const pixTxt = r.pixCancelados && r.pixCancelados.length ? ` O Pix pendente de ${fmtMoney(r.pixCancelados.reduce((x, c) => x + c.valor, 0))} foi cancelado porque o crédito foi aplicado${r.pixCancelados.some((c) => c.enviadaEm) ? ' (ele já tinha sido enviado ao cliente: não pague o código antigo)' : ''}.` : '';
  const av = avisarPainel(s, a, `${nomeCliente(s, a)} usou ${fmtMoney(r.total)} de crédito no horário de ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)} (${nomesIds(s, a.servicoIds)}).${falta > 0 ? ` Faltam ${fmtMoney(falta)}: o cliente combinou pagar a diferença separadamente, direto à ${rot('loja')} (gere a cobrança Pix na ficha).` : ' O agendamento ficou pago com o crédito.'}${pixTxt}`, agora);
  av.tipo = 'credito_usado';
  return { ok: true, total: r.total, falta, resta, pixCancelado: !!(r.pixCancelados && r.pixCancelados.length) };
}

// Agendamento cancelado cujo pagamento foi feito com crédito: o crédito volta inteiro ao cliente (não houve dinheiro novo).
function devolverCreditoUsado(s, a, agora) {
  for (const c of f(s).cobrancas) {
    if (c.agendamentoId !== a.id || c.status !== 'paga' || c.via !== 'credito') continue;
    for (const cr of creditos(s)) cr.usos = cr.usos.filter((u) => u.cobrancaId !== c.id);
    c.status = 'cancelada';
    registrar(s, a, AUTOR_SISTEMA, 'pagamento', 'Pago', `Agendamento cancelado: ${fmtMoney(c.valor)} de crédito voltaram para o cliente`, agora);
  }
}

// ---------- API Pix do banco (uma por conta; o banco é o da conta) ----------
export function salvarApiPix(s, contaId, d) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const ct = contaDe(s, contaId);
  if (!ct) return erro('Conta não encontrada.');
  const b = bancoApi(ct.banco);
  if (!b) return erro(`O ${ct.banco} não está na lista de bancos com API Pix deste sistema. Use o Open Finance e a confirmação manual.`);
  if (!b.pixApi) return erro(b.nota);
  const a = ct.apiPix;
  const mudouBanco = a.banco !== b.nome;
  Object.assign(a, {
    banco: b.nome, ambiente: d.ambiente === 'producao' ? 'producao' : 'homologacao', urlBase: String(d.urlBase || '').trim(), clientId: String(d.clientId || '').trim(),
    certificadoNome: d.certificadoNome || '', chavePrivadaNome: d.chavePrivadaNome || '', cadeiaNome: d.cadeiaNome || '', appKey: String(d.appKey || '').trim(),
    escopos: Array.isArray(d.escopos) ? d.escopos : [], webhookUrl: String(d.webhookUrl || '').trim(), ativa: false, testadoEm: null,
  });
  if (String(d.clientSecret || '').trim()) a.clientSecret = String(d.clientSecret).trim(); // nunca devolvido à tela; em produção fica cifrado no servidor
  else if (mudouBanco) a.clientSecret = '';
  return { ok: true };
}

// Simula a bateria de chamadas que o back-end faz ao banco para validar a integração.
export function testarApiPix(s, contaId, agora) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const ct = contaDe(s, contaId);
  if (!ct) return erro('Conta não encontrada.');
  const a = ct.apiPix;
  const b = bancoApi(a.banco);
  const passos = [];
  const passo = (rotulo, ok, detalhe) => { passos.push({ rotulo, ok, detalhe }); return ok; };
  const seguir = () => passos.every((p) => p.ok);
  if (!b) return { ok: false, erros: ['Salve a configuração antes de testar.'], passos };
  if (!b.pixApi) return { ok: false, erros: [b.nota], passos };
  passo('Endereço da API (HTTPS)', /^https:\/\/\S+$/.test(a.urlBase), /^https:\/\/\S+$/.test(a.urlBase) ? a.urlBase : 'Informe o endereço base da API, começando com https://');
  if (seguir()) passo('Certificado digital (mTLS)', !!a.certificadoNome && !!a.chavePrivadaNome, a.certificadoNome && a.chavePrivadaNome ? `${a.certificadoNome} + ${a.chavePrivadaNome}` : 'Envie o certificado e a chave privada.');
  if (seguir()) passo('Credenciais (POST /oauth/token)', a.clientId.length >= 6 && String(a.clientSecret || '').length >= 6, a.clientId.length >= 6 && String(a.clientSecret || '').length >= 6 ? 'Token recebido (válido por 1 hora)' : 'Informe o client ID e o client secret.');
  if (seguir() && b.extras.length) { const falta = b.extras.filter((x) => !String(a[x.id] || '').trim()); passo(b.extras.map((x) => x.rotulo).join(', '), !falta.length, falta.length ? `Informe: ${falta.map((x) => x.rotulo).join(', ')}.` : 'Informada'); }
  if (seguir()) { const falta = ESCOPOS_OBRIGATORIOS.filter((x) => !a.escopos.includes(x)); passo('Permissões (escopos)', !falta.length, falta.length ? `Habilite também: ${falta.join(', ')}.` : a.escopos.join(', ')); }
  if (seguir()) passo('Chave Pix da conta', !!ct.pix.chave, ct.pix.chave ? 'Chave encontrada na configuração' : 'Cadastre a chave Pix desta conta na seção acima.');
  if (seguir()) passo('Aviso de pagamento (PUT /webhook/{chave})', /^https:\/\/\S+$/.test(a.webhookUrl), /^https:\/\/\S+$/.test(a.webhookUrl) ? `Webhook registrado em ${a.webhookUrl}` : 'O endereço do webhook precisa ser HTTPS, aberto na internet.');
  const ok = seguir();
  a.ativa = ok; a.testadoEm = ok ? agora : null;
  return ok ? { ok: true, passos } : { ok: false, erros: [passos.find((p) => !p.ok).detalhe], passos };
}

export function desativarApiPix(s, contaId) {
  const ct = contaDe(s, contaId);
  if (!ct) return erro('Conta não encontrada.');
  Object.assign(ct.apiPix, { ativa: false, testadoEm: null });
  return { ok: true };
}

// ---------- Open Finance (uma conexão por conta) ----------
export function conectarOpenFinance(s, contaId, autor, agora) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const ct = contaDe(s, contaId);
  if (!ct) return erro('Conta não encontrada.');
  Object.assign(ct.openFinance, { conectado: true, consentimentoEm: agora, validoAte: agora + 365 * DIA, ultimaSync: null });
  const r = sincronizar(s, contaId, autor, agora);
  return { ok: true, ...r };
}

export function desconectarOpenFinance(s, contaId) {
  const ct = contaDe(s, contaId);
  if (!ct) return erro('Conta não encontrada.');
  Object.assign(ct.openFinance, { conectado: false, consentimentoEm: null, validoAte: null });
  return { ok: true };
}

const novoExtrato = (s, m, origem) => ({ id: nextId(s, 'ex'), contaId: m.contaId, bancoId: m.id, em: m.em, tipo: m.tipo, valor: m.valor, descricao: m.descricao, contraparte: m.contraparte, txid: m.txid || null, e2e: m.e2e || null, origem, status: 'a_classificar', motivo: '', lancamentoId: null, cobrancaId: null });

export function sincronizar(s, contaId, autor, agora) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const ct = contaDe(s, contaId);
  if (!ct) return erro('Conta não encontrada.');
  const of = ct.openFinance;
  if (!of.conectado) return erro('O Open Finance não está conectado nesta conta.');
  if (agora > of.validoAte) return erro('O consentimento do Open Finance venceu. Conecte de novo.');
  let novos = 0; let conciliados = 0; let decisoes = 0;
  for (const m of s.banco.movimentos.filter((x) => x.contaId === contaId && !x.importado && x.em <= agora)) {
    m.importado = true;
    const e = novoExtrato(s, m, 'open_finance');
    f(s).extrato.unshift(e);
    novos++;
    conciliarExtrato(s, e, autor, agora);
    if (e.status === 'conciliado') conciliados++; else decisoes++;
  }
  of.ultimaSync = agora;
  return { ok: true, novos, conciliados, decisoes };
}

const viaDe = (e) => (e.origem === 'webhook' ? 'api_pix' : 'open_finance');

// Cada movimento só é conciliado com o que é da mesma conta: cobranças e lançamentos de outra conta nunca casam.
function conciliarExtrato(s, e, autor, agora) {
  const cpfE = digitos(e.contraparte && e.contraparte.cpf);
  const cobs = f(s).cobrancas.filter((c) => c.contaId === e.contaId);
  if (e.tipo === 'credito') {
    const cob = e.txid ? cobs.find((c) => c.txid === e.txid) : null;
    if (cob) {
      e.cobrancaId = cob.id;
      if (cob.status === 'paga') {
        const l = f(s).lancamentos.find((x) => x.id === cob.lancamentoId);
        if (cob.via === 'manual' && !cob.extratoId && cob.valor === e.valor && l) {
          e.status = 'conciliado'; e.motivo = 'Pagamento já confirmado manualmente; agora conciliado com o banco.'; e.lancamentoId = l.id; l.conciliado = true; l.extratoId = e.id; cob.extratoId = e.id;
        } else { e.status = 'a_classificar'; e.motivo = 'Esta cobrança já estava paga. Pode ser pagamento em duplicidade.'; e.cobrancaId = cob.id; }
        return;
      }
      const motivos = [];
      if (cob.status === 'expirada') motivos.push('a cobrança estava expirada');
      if (cob.status === 'cancelada') motivos.push('a cobrança estava cancelada');
      if (e.valor !== cob.valor) motivos.push(`valor pago ${fmtMoney(e.valor)} diferente do cobrado ${fmtMoney(cob.valor)}`);
      if (cpfE !== cob.cpf) motivos.push('CPF de quem pagou diferente do CPF da cobrança');
      if (motivos.length) { e.status = 'divergente'; e.motivo = `Precisa da sua autorização: ${motivos.join('; ')}.`; return; }
      e.status = 'conciliado'; e.motivo = 'Pix da cobrança confirmado pelo CPF e valor.';
      confirmarPagamento(s, cob.id, { via: viaDe(e), extrato: e, pagoPor: e.contraparte }, AUTOR_SISTEMA, agora);
      return;
    }
    // Sem identificador: tenta pelo CPF e valor de uma cobrança pendente da mesma conta.
    const cand = cobs.filter((c) => c.status === 'pendente' && c.cpf === cpfE && c.valor === e.valor);
    if (cand.length === 1) {
      e.status = 'conciliado'; e.motivo = 'Pix sem identificador, casado pelo CPF e valor da cobrança.';
      confirmarPagamento(s, cand[0].id, { via: viaDe(e), extrato: e, pagoPor: e.contraparte }, AUTOR_SISTEMA, agora);
      return;
    }
  }
  const l = f(s).lancamentos.find((x) => x.contaId === e.contaId && ['manual', 'devolucao'].includes(x.origem) && !x.conciliado && x.tipo === (e.tipo === 'debito' ? 'despesa' : 'credito') && x.valor === e.valor && diasEntre(e.em, x.data) <= 3);
  if (l) { e.status = 'conciliado'; e.lancamentoId = l.id; e.motivo = 'Conciliado com o lançamento manual.'; l.conciliado = true; l.extratoId = e.id; return; }
  e.status = 'a_classificar'; e.motivo = e.tipo === 'debito' ? 'Saída do banco sem lançamento correspondente.' : 'Entrada no banco sem lançamento correspondente.';
}

// Decisões do usuário sobre o extrato.
export function autorizarExtrato(s, id, autor, agora) {
  const e = f(s).extrato.find((x) => x.id === id);
  if (!e || e.status !== 'divergente') return erro('Esse item não está aguardando autorização.');
  const r = confirmarPagamento(s, e.cobrancaId, { via: viaDe(e), extrato: e, pagoPor: e.contraparte, obs: 'autorizado por ' + autor.nome }, autor, agora);
  if (!r.ok) return r;
  // O dinheiro que entrou é o do extrato: se foi diferente do cobrado, o lançamento fica com o valor recebido e a diferença registrada.
  if (e.valor !== r.cobranca.valor) { r.lancamento.valor = e.valor; r.cobranca.valorRecebido = e.valor; r.lancamento.descricao += ` (cobrado ${fmtMoney(r.cobranca.valor)}, recebido ${fmtMoney(e.valor)})`; }
  e.status = 'conciliado'; e.motivo = `Autorizado por ${autor.nome}.`;
  return { ok: true };
}

export function rejeitarExtrato(s, id) {
  const e = f(s).extrato.find((x) => x.id === id);
  if (!e || e.status !== 'divergente') return erro('Esse item não está aguardando autorização.');
  e.status = 'a_classificar'; e.motivo = 'Não foi vinculado à cobrança. Classifique como crédito ou ignore.'; e.cobrancaId = null;
  return { ok: true };
}

// O lançamento criado a partir do extrato fica na conta do movimento; o grupo tem de ser de um grupo dessa conta (padrão: o primeiro dela).
export function classificarExtrato(s, id, { categoria, descricao, grupoId }, autor, agora) {
  const e = f(s).extrato.find((x) => x.id === id);
  if (!e || e.status !== 'a_classificar') return erro('Esse item não está aguardando classificação.');
  const daConta = f(s).grupos.filter((g) => g.contaId === e.contaId);
  const g = grupoId ? daConta.find((x) => x.id === grupoId) : daConta.find((x) => x.id === s.estabelecimento.grupoMovimentacaoId) || daConta[0];
  if (grupoId && !g) return erro('Esse grupo não é da conta deste movimento.');
  const l = { id: nextId(s, 'f'), tipo: e.tipo === 'debito' ? 'despesa' : 'credito', descricao: String(descricao || e.descricao).trim(), valor: e.valor, data: startOfDay(e.em), categoria: categoria || '', origem: 'banco', grupoId: g ? g.id : null, contaId: e.contaId, conciliado: true, extratoId: e.id, criadoEm: agora, autor };
  f(s).lancamentos.unshift(l);
  e.status = 'conciliado'; e.lancamentoId = l.id; e.motivo = 'Lançado a partir do extrato.';
  return { ok: true, lancamento: l };
}

// ---------- conciliação em grupo ----------
// Vários lançamentos (receitas de atendimentos, p. ex.) casam com UMA entrada do banco, ou várias entradas com vários lançamentos, desde que a soma
// dos dois lados seja a mesma. Cada item entra em um só grupo e o grupo pode ser desfeito. Só a mesma conta e o mesmo sentido (entrada ou saída).
const ORIGENS_CONCILIAVEIS = ['manual', 'atendimento', 'devolucao'];
const centavos = (v) => Math.round(Number(v) * 100);
export const lancamentosConciliaveis = (st, contaId, tipoExtrato) => f(st).lancamentos.filter((l) => !l.conciliado && l.contaId === contaId && ORIGENS_CONCILIAVEIS.includes(l.origem) && l.tipo === (tipoExtrato === 'debito' ? 'despesa' : 'credito'));
export const extratosConciliaveis = (st, contaId) => f(st).extrato.filter((e) => e.status === 'a_classificar' && (!contaId || e.contaId === contaId));

export function conciliarEmGrupo(s, { extratoIds, lancamentoIds }, autor, agora) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const lista = (v) => Array.isArray(v) && v.length >= 1 && v.length <= 50 && v.every((x) => typeof x === 'string') && new Set(v).size === v.length;
  if (!lista(extratoIds) || !lista(lancamentoIds)) return erro('Escolha ao menos um item do banco e um lançamento (sem repetir).');
  const exs = extratoIds.map((id) => f(s).extrato.find((x) => x.id === id));
  const lcs = lancamentoIds.map((id) => f(s).lancamentos.find((x) => x.id === id));
  if (exs.some((e) => !e || e.status !== 'a_classificar')) return erro('Algum item do banco não está aguardando conciliação.');
  if (lcs.some((l) => !l || l.conciliado || !ORIGENS_CONCILIAVEIS.includes(l.origem))) return erro('Algum lançamento já foi conciliado ou não pode ser conciliado com o banco.');
  const contaId = exs[0].contaId; const tipo = exs[0].tipo;
  if (exs.some((e) => e.contaId !== contaId || e.tipo !== tipo)) return erro('Os itens do banco precisam ser da mesma conta e do mesmo sentido (todos entradas ou todos saídas).');
  if (lcs.some((l) => l.contaId !== contaId || l.tipo !== (tipo === 'debito' ? 'despesa' : 'credito'))) return erro('Os lançamentos precisam ser da mesma conta do banco e do mesmo sentido (receitas para entradas, despesas para saídas).');
  const somaE = exs.reduce((t, e) => t + centavos(e.valor), 0); const somaL = lcs.reduce((t, l) => t + centavos(l.valor), 0);
  if (somaE !== somaL) return erro(`Os valores não batem: banco ${fmtMoney(somaE / 100)}, lançamentos ${fmtMoney(somaL / 100)} (diferença de ${fmtMoney(Math.abs(somaE - somaL) / 100)}).`);
  f(s).conciliacoes = f(s).conciliacoes || [];
  const g = { id: nextId(s, 'cg'), contaId, tipo, extratoIds: [...extratoIds], lancamentoIds: [...lancamentoIds], valor: r2(somaE / 100), em: agora, autor: { nome: autor?.nome, tipo: autor?.tipo } };
  f(s).conciliacoes.unshift(g);
  for (const e of exs) { e.status = 'conciliado'; e.conciliacaoId = g.id; e.motivo = `Conciliado em grupo com ${lcs.length} ${lcs.length === 1 ? 'lançamento' : 'lançamentos'}.`; }
  for (const l of lcs) { l.conciliado = true; l.conciliacaoId = g.id; l.extratoId = extratoIds[0]; }
  return { ok: true, conciliacao: g };
}

export function desfazerConciliacao(s, id) {
  if (!usaIntegracaoPix(s)) return erro(ERRO_SEM_PIX);
  const g = (f(s).conciliacoes || []).find((x) => x.id === id);
  if (!g) return erro('Conciliação não encontrada.');
  for (const e of f(s).extrato.filter((x) => x.conciliacaoId === id)) { e.status = 'a_classificar'; e.conciliacaoId = null; e.motivo = e.tipo === 'debito' ? 'Saída do banco sem lançamento correspondente.' : 'Entrada no banco sem lançamento correspondente.'; }
  for (const l of f(s).lancamentos.filter((x) => x.conciliacaoId === id)) { l.conciliado = false; l.conciliacaoId = null; l.extratoId = null; }
  f(s).conciliacoes = f(s).conciliacoes.filter((x) => x.id !== id);
  return { ok: true };
}

// Sugestões: para cada item do banco, o menor grupo de lançamentos da mesma conta, a até 2 dias de diferença, que soma exatamente o valor.
export function sugestoesConciliacao(st, contaId) {
  const usados = new Set(); const out = [];
  for (const e of extratosConciliaveis(st, contaId).sort((a, b) => a.em - b.em)) {
    const cand = lancamentosConciliaveis(st, e.contaId, e.tipo).filter((l) => !usados.has(l.id) && diasEntre(e.em, l.data) <= 2 && centavos(l.valor) <= centavos(e.valor))
      .sort((a, b) => diasEntre(e.em, a.data) - diasEntre(e.em, b.data)).slice(0, 14);
    const alvo = centavos(e.valor); let melhor = null;
    const busca = (i, soma, esc) => {
      if (soma === alvo) { if (!melhor || esc.length < melhor.length) melhor = [...esc]; return; }
      if (i >= cand.length || soma > alvo || (melhor && esc.length + 1 >= melhor.length)) return;
      esc.push(cand[i]); busca(i + 1, soma + centavos(cand[i].valor), esc); esc.pop();
      busca(i + 1, soma, esc);
    };
    busca(0, 0, []);
    if (melhor && melhor.length) { melhor.forEach((l) => usados.add(l.id)); out.push({ extratoId: e.id, lancamentoIds: melhor.map((l) => l.id), valor: e.valor }); }
  }
  return out;
}

export function ignorarExtrato(s, id) {
  const e = f(s).extrato.find((x) => x.id === id);
  if (!e || !['a_classificar', 'divergente'].includes(e.status)) return erro('Esse item não pode ser ignorado.');
  e.status = 'ignorado'; e.motivo = 'Ignorado pelo usuário.';
  return { ok: true };
}

// ---------- o banco (simulado) ----------
export function bancoPagarPix(s, { codigo, nome, cpf, valor }, agora) {
  const p = lerBrCode(codigo);
  if (!p.ok) return erro('Código Pix inválido. Copie o código completo.');
  let cob = null;
  let ct = null;
  if (p.chave) {
    ct = f(s).contas.find((c) => c.pix.chave === p.chave);
    if (!ct) return erro(`Esse código não é de nenhuma chave Pix desta ${rot('loja')}.`);
  } else {
    cob = f(s).cobrancas.find((c) => c.txid === p.txid && c.emitidaPor === 'api');
    if (!cob) return erro('O banco não reconheceu esse código Pix.');
    if (cob.status === 'cancelada' || cob.status === 'expirada') return erro('Esta cobrança foi cancelada ou expirou no banco e não pode mais ser paga.');
    if (cob.status === 'paga') return erro('Esta cobrança já foi paga.');
    ct = contaDe(s, cob.contaId);
  }
  const v = r2(Number(valor === undefined || valor === '' ? (p.valor ?? (cob && cob.valor)) : valor));
  if (!(v > 0)) return erro('Informe o valor do pagamento.');
  return bancoLancar(s, { contaId: ct.id, tipo: 'credito', valor: v, descricao: 'Pix recebido', nome: nome || 'Pagador', cpf, txid: p.txid }, agora);
}

export function bancoLancar(s, { contaId, tipo, valor, descricao, nome, cpf, txid }, agora) {
  const ct = contaDe(s, contaId || (f(s).contas[0] || {}).id);
  if (!ct) return erro('Escolha a conta.');
  const v = r2(Number(valor));
  if (!(v > 0) || !Number.isFinite(v) || v > 10000000) return erro('Informe um valor maior que zero e de no máximo R$ 10.000.000,00.');
  if (!['credito', 'debito'].includes(tipo)) return erro('Escolha crédito ou débito.');
  const m = { id: nextId(s, 'bk'), contaId: ct.id, em: agora, tipo, valor: v, descricao: String(descricao || (tipo === 'credito' ? 'Pix recebido' : 'Débito')).trim(), contraparte: { nome: nome || '', cpf: digitos(cpf) }, txid: txid || null, e2e: `E${String(agora).slice(-10)}${s.seq}`, importado: false };
  s.banco.movimentos.unshift(m);
  const cob = txid ? f(s).cobrancas.find((c) => c.txid === txid && c.contaId === ct.id) : null;
  // 1) API Pix: o banco avisa na hora (webhook) os pagamentos das cobranças criadas por ela.
  if (ct.apiPix.ativa && cob && cob.emitidaPor === 'api') {
    m.importado = true;
    const e = novoExtrato(s, m, 'webhook');
    f(s).extrato.unshift(e);
    conciliarExtrato(s, e, AUTOR_SISTEMA, agora);
    return { ok: true, movimento: m, conta: ct, canal: 'webhook', extrato: e };
  }
  // 2) Open Finance: o extrato é importado e conciliado.
  if (ct.openFinance.conectado && agora <= ct.openFinance.validoAte) {
    const sync = sincronizar(s, ct.id, AUTOR_SISTEMA, agora);
    return { ok: true, movimento: m, conta: ct, canal: sync.ok ? 'open_finance' : null, extrato: f(s).extrato.find((e) => e.bancoId === m.id) || null };
  }
  return { ok: true, movimento: m, conta: ct, canal: null, extrato: null };
}

// ---------- automação ----------
// Momento em que o Pix pendente deve ser cancelado, pela configuração dos avisos (vale a configuração vigente do serviço ou do estabelecimento).
export function prazoCancelamentoPix(s, c) {
  const a = ag(s, c.agendamentoId);
  if (!a) return null;
  const sv = servicosPorIds(s, a.servicoIds, a.porte);
  const { lista } = notificacoesEfetivas(sv, s.estabelecimento);
  const t = momentoCancelamentoPix(pixCancelamentoEfetivo(sv, s.estabelecimento), lista, a.inicio);
  return t && t > c.criadaEm ? t : null; // cobrança criada depois do prazo só vale até expirar
}

// ---------- valor do atendimento mudou depois de haver cobrança ----------
// Situação de cada conta: quanto o atendimento vale hoje, quanto o cliente já pagou (sem o que virou crédito) e o que falta (negativo = pagou a mais).
export function situacaoPorConta(st, a) {
  const partes = partesCobranca(st, a);
  const todas = st.financeiro.cobrancas.filter((c) => c.agendamentoId === a.id);
  const contas = new Set([...partes.map((p) => p.conta && p.conta.id), ...todas.map((c) => c.contaId)].filter(Boolean));
  const out = [];
  for (const contaId of contas) {
    const p = partes.find((x) => x.conta && x.conta.id === contaId) || null;
    const cobs = todas.filter((c) => c.contaId === contaId);
    const pagas = cobs.filter((c) => c.status === 'paga');
    const pendentes = cobs.filter((c) => c.status === 'pendente');
    const esperado = p ? p.valor : 0;
    const liquido = r2(pagas.reduce((t, c) => t + c.valor - resolvidoDe(st, c), 0));
    out.push({ contaId, conta: contaDe(st, contaId), parte: p, esperado, pagas, pendentes, liquido, falta: r2(esperado - liquido) });
  }
  return out;
}

// Regra por status do agendamento, quando serviços ou acréscimos mudam. O sistema NUNCA envia cobrança ao cliente por conta própria e não
// registra devolução: só avisa o painel. Cobrar a diferença é uma ação do profissional (Pagamento > "Gerar Pix da diferença").
// - concluído (e cancelado): nada. Não cobra, não avisa ninguém.
// - a confirmar e confirmado: Pix pendente desatualizado é cancelado (o painel é avisado para gerar outro, se já tinha sido enviado);
//   pagou a mais: aviso ao painel para devolver a diferença no banco ou mantê-la como crédito; pagou a menos: aviso com o valor que falta.
// Conta sem nenhuma cobrança ainda: nada a acertar, o fluxo normal cobra o valor atual.
// Horário pago com crédito que passou a valer menos (serviço removido): o excedente volta direto ao crédito do cliente, sem decisão do profissional
// (não houve dinheiro novo na conta). Tira das cobranças por crédito mais recentes primeiro; a validade do crédito é a original.
function devolverExcedenteDeCredito(s, a, sit, excedente, autor, agora) {
  let devolvido = 0;
  for (const c of sit.pagas.filter((x) => x.via === 'credito').sort((x, y) => y.pagaEm - x.pagaEm)) {
    const tirar = Math.min(r2(excedente - devolvido), c.valor);
    if (!(tirar > 0)) break;
    let resta = tirar;
    for (const cr of creditos(s)) {
      for (const u of [...cr.usos].reverse().filter((x) => x.cobrancaId === c.id)) {
        if (!(resta > 0)) break;
        const v = Math.min(u.valor, resta);
        u.valor = r2(u.valor - v); resta = r2(resta - v);
        if (!(u.valor > 0)) cr.usos.splice(cr.usos.indexOf(u), 1);
      }
    }
    c.valor = r2(c.valor - tirar);
    if (!(c.valor > 0)) c.status = 'cancelada';
    devolvido = r2(devolvido + tirar);
  }
  if (devolvido > 0) {
    registrar(s, a, autor, 'pagamento', 'Pago', `Valor do atendimento diminuiu: ${fmtMoney(devolvido)} pagos com crédito voltaram para o crédito do cliente`, agora);
    avisarPainel(s, a, `${nomeCliente(s, a)}: o atendimento passou a valer menos e ${fmtMoney(devolvido)} que estavam pagos com crédito voltaram para o crédito dele (validade original). Nada a fazer.`, agora);
  }
  return devolvido;
}

export function acertarAposEdicao(s, a, autor, agora) {
  if (!['a_confirmar', 'confirmado'].includes(a.status)) return;
  for (const sit of situacaoPorConta(s, a)) {
    const { pagas, pendentes } = sit;
    let { falta } = sit;
    if (!pagas.length && !pendentes.length) continue;
    if (falta < 0 && pagas.some((c) => c.via === 'credito')) falta = r2(falta + devolverExcedenteDeCredito(s, a, sit, -falta, autor, agora));
    if (falta > 0 && pendentes.length === 1 && pendentes[0].valor === falta) continue; // a pendente já cobra o que falta
    const nomeConta = f(s).contas.length > 1 && sit.conta ? ` da conta "${sit.conta.apelido}"` : '';
    let bloqueada = false;
    for (const c of pendentes) {
      const r = cancelarCobranca(s, c.id, autor, agora);
      if (!r.ok) { bloqueada = true; avisarPainel(s, a, `Ajuste manual: o valor do atendimento de ${nomeCliente(s, a)} mudou, mas o Pix pendente de ${fmtMoney(c.valor)}${nomeConta} não pôde ser cancelado (${r.erros[0]})`, agora); }
      else if (c.enviadaEm) avisarPainel(s, a, `O valor do atendimento de ${nomeCliente(s, a)} mudou e o Pix de ${fmtMoney(c.valor)}${nomeConta}, que já tinha sido enviado, foi cancelado. Gere e envie outro, se for cobrar.`, agora);
    }
    if (bloqueada) continue;
    if (falta > 0 && pagas.length) {
      avisarPainel(s, a, `Diferença a cobrar: o atendimento de ${nomeCliente(s, a)} passou a valer mais${nomeConta} e faltam ${fmtMoney(falta)}. Nada foi enviado ao cliente; gere o Pix da diferença na ficha do agendamento, se for cobrar.`, agora);
    } else if (falta < 0) {
      // Um aviso por valor: editar de novo sem mudar a diferença não repete o aviso.
      const avisados = (a.avisoAMais = a.avisoAMais || {});
      if (avisados[sit.contaId] === -falta) continue;
      avisados[sit.contaId] = -falta;
      const av = avisarPainel(s, a, `Pago a mais: ${nomeCliente(s, a)} pagou ${fmtMoney(-falta)} além do que o atendimento vale agora${nomeConta}. Na ficha do agendamento, escolha: manter como crédito do cliente, lançar despesa (devolvido pelo banco) ou devolvido por fora.`, agora);
      av.tipo = 'devolver';
    }
  }
}
aposEditarValores.push(acertarAposEdicao);
// Horário pago (ou em parte) com crédito não muda de serviços pelo cliente: o crédito usado teria de voltar com revisão do profissional.
validadoresEdicaoCliente.push((s, a) => (f(s).cobrancas.some((c) => c.agendamentoId === a.id && c.status === 'paga' && c.via === 'credito')
  ? `Esse horário foi pago com crédito. Para alterar os serviços, fale com a ${rot('loja')}.` : null));

function tickFinanceiro(s, agora) {
  for (const c of f(s).cobrancas) {
    if (c.status !== 'pendente') continue;
    const a = ag(s, c.agendamentoId);
    const prazo = prazoCancelamentoPix(s, c);
    const ct = contaDe(s, c.contaId);
    const podeCancelar = c.emitidaPor !== 'api' || !!(ct && ct.apiPix.ativa);
    if (a && a.status === 'cancelado') { c.status = 'cancelada'; registrar(s, a, AUTOR_SISTEMA, 'pagamento', 'Pix pendente', 'Cobrança cancelada (agendamento cancelado)', agora); }
    else if (agora >= c.expiraEm) { c.status = 'expirada'; if (a) registrar(s, a, AUTOR_SISTEMA, 'pagamento', 'Pix pendente', 'Cobrança expirada', c.expiraEm); }
    else if (prazo && agora >= prazo && podeCancelar) {
      c.status = 'cancelada';
      if (a) registrar(s, a, AUTOR_SISTEMA, 'pagamento', 'Pix pendente', c.emitidaPor === 'api' ? `Cobrança cancelada no banco (API do ${c.bancoApi}) pela configuração dos avisos` : 'Cobrança cancelada pela configuração dos avisos', prazo);
    }
  }
  // Crédito vencido: registra uma vez no histórico do agendamento de origem e deixa de valer (não aparece para o cliente nem paga nada).
  for (const cr of creditos(s)) {
    if (cr.expirouEm || !creditoExpirado(cr, agora)) continue;
    cr.expirouEm = venceEm(cr);
    const sobra = restanteDe(cr);
    const a = ag(s, cr.agendamentoId);
    if (sobra > 0 && a) registrar(s, a, AUTOR_SISTEMA, 'pagamento', 'Crédito', `Crédito de ${fmtMoney(sobra)} expirou em ${fmtDate(venceEm(cr))} sem ser usado`, venceEm(cr));
  }
  // Aviso ao cliente 7 dias antes de o crédito vencer (às 9h desse dia): uma vez por crédito, só se ainda houver saldo e se o crédito
  // já existia antes dessa data (crédito novo já traz a validade na mensagem de "crédito registrado").
  for (const cr of creditos(s)) {
    if (cr.avisoVencimentoEm || cr.expirouEm || creditoExpirado(cr, agora) || !(restanteDe(cr) > 0)) continue;
    const d = new Date(venceEm(cr)); d.setDate(d.getDate() - DIAS_AVISO_VENCIMENTO); d.setHours(9, 0, 0, 0);
    if (agora < d.getTime() || cr.criadoEm >= d.getTime()) continue;
    const cli = (s.clientes || []).find((x) => x.id === cr.clienteId);
    cr.avisoVencimentoEm = agora;
    if (!cli) continue;
    enviarAoCliente(s, null, 'credito_vencendo', agora, { clienteId: cli.id, telefone: cli.telefone, origem: 'Aviso: crédito perto de vencer', valores: [cli.apelido || cli.nome, fmtMoney(creditoDoCliente(s, cli.id, null, agora)), fmtDate(venceEm(cr))] });
  }
  // Agendamento cancelado: Pix pago em dinheiro gera UM aviso para devolver; pago com crédito devolve o crédito ao cliente.
  for (const c of f(s).cobrancas) {
    if (c.status !== 'paga') continue;
    const a = ag(s, c.agendamentoId);
    if (!a || a.status !== 'cancelado') continue;
    if (c.via === 'credito') { devolverCreditoUsado(s, a, agora); continue; }
    if (c.avisoCancelamentoEm || !(r2(c.valor - resolvidoDe(s, c)) > 0)) continue;
    c.avisoCancelamentoEm = agora;
    const motivo = MOTIVOS_CANCELAMENTO[a.motivoCancelamento] || 'Agendamento cancelado';
    registrar(s, a, AUTOR_SISTEMA, 'pagamento', 'Pago', `Agendamento cancelado com Pix pago de ${fmtMoney(c.valor)}: decida: crédito, despesa ou devolvido por fora`, agora);
    const av = avisarPainel(s, a, `${motivo}: ${nomeCliente(s, a)} já tinha pago ${fmtMoney(c.valor)} por Pix. Abra o agendamento e escolha: manter como crédito (se o cliente não compareceu ou cancelou), lançar despesa (devolvido pelo banco) ou devolvido por fora.`, agora);
    av.tipo = 'devolver';
  }
}
ganchos.push(tickFinanceiro);
export { fmtDate };
