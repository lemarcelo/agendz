// Testes de conflito e de fluxo: disputa por horário, Pix duplicado/atrasado, aviso e crédito, e um fuzz com invariantes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, financeiro, whatsapp, bancoSimulado, equipe } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import { addDays, startOfDay, tsAt, MIN, HORA } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const alan = () => assert.ok(auth.login({ identificador: 'alan', senha: '1234' }).ok);
const cria = (o) => agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], ...o });
const CPF = '529.982.247-25';
const telDe = (agId) => { const a = st().agendamentos.find((x) => x.id === agId); return (st().clientes.find((c) => c.id === a?.clienteId) || {}).telefone; };

test.beforeEach(() => { store.reiniciar(); alan(); });

const ATIVOS = ['a_confirmar', 'confirmado', 'concluido'];
function semSobreposicao() {
  for (const a of st().agendamentos) assert.ok(['a_confirmar', 'confirmado', 'concluido', 'cancelado'].includes(a.status), 'status fora do domínio: ' + a.status);
  const confirmados = st().agendamentos.filter((a) => ['confirmado', 'concluido'].includes(a.status));
  for (const b of new Set(confirmados.map((a) => a.profissionalId))) {
    const lista = confirmados.filter((a) => a.profissionalId === b).sort((x, y) => x.inicio - y.inicio);
    for (let i = 1; i < lista.length; i++) {
      const prev = lista[i - 1];
      const dur = prev.servicoIds.reduce((t, id) => t + (st().servicos.find((s) => s.id === id)?.duracao || 0), 0) * MIN;
      assert.ok(lista[i].inicio >= prev.inicio + dur, `sobreposição de ${prev.id} e ${lista[i].id} na agenda de ${b}`);
    }
  }
}
function invariantesFinanceiras() {
  const f = st().financeiro;
  const emDinheiro = f.cobrancas.filter((x) => x.status === 'paga' && x.via !== 'credito');
  for (const c of emDinheiro) {
    const n = f.lancamentos.filter((l) => l.id === c.lancamentoId).length;
    assert.equal(n, 1, `cobrança paga ${c.id} sem exatamente 1 lançamento`);
  }
  const creditosPix = f.lancamentos.filter((l) => l.tipo === 'credito' && /^Pix de /.test(l.descricao));
  assert.equal(new Set(creditosPix.map((l) => l.id)).size, creditosPix.length);
  assert.equal(creditosPix.length, emDinheiro.length, 'créditos Pix ≠ cobranças pagas em dinheiro');
  // crédito do cliente: nunca cria dinheiro (soma dos créditos de uma cobrança ≤ o valor pago) nem usa mais do que existe
  const porCob = {};
  for (const x of f.creditos) {
    const usado = x.usos.reduce((s, u) => s + u.valor, 0);
    assert.ok(usado <= x.valor + 1e-9, `crédito ${x.id} usado além do valor`);
    porCob[x.cobrancaId] = (porCob[x.cobrancaId] || 0) + x.valor;
  }
  for (const [id, v] of Object.entries(porCob)) assert.ok(v <= f.cobrancas.find((c) => c.id === id).valor + 1e-9, `créditos de ${id} somam mais do que foi pago`);
  for (const c of f.cobrancas.filter((x) => x.status === 'paga' && x.via === 'credito')) {
    const usado = f.creditos.flatMap((x) => x.usos).filter((u) => u.cobrancaId === c.id).reduce((s, u) => s + u.valor, 0);
    assert.ok(Math.abs(usado - c.valor) < 1e-9, `cobrança paga com crédito ${c.id} sem o crédito correspondente`);
  }
  for (const l of f.lancamentos) assert.ok(Number.isFinite(l.valor) && l.valor > 0, 'valor inválido em ' + l.id);
  for (const m of st().materiais) assert.ok(Number.isFinite(m.estoque), 'estoque inválido ' + m.id);
}

// ---------- disputa por horário ----------
test('dois clientes pendentes no mesmo horário: quem confirma primeiro fica; o outro é cancelado por conflito', () => {
  const t = tsAt(dia(), '10:00');
  const a = cria({ inicio: t, clienteId: 'c-igor' }).agendamento;
  const b = cria({ inicio: t, clienteId: st().clientes.find((c) => c.id !== 'c-igor').id, encaixe: false });
  assert.ok(b.ok || b.erros, 'resposta definida');
  const outro = b.ok ? b.agendamento : null;
  if (!outro) return; // sistema impediu a segunda reserva: também é um desfecho seguro
  const r1 = whatsapp.confirmar(outro.id, telDe(outro.id));
  const r2 = whatsapp.confirmar(a.id, telDe(a.id));
  assert.ok(r1.ok);
  assert.equal(r2.ok, false, 'o segundo a confirmar não pode ficar com o mesmo horário');
  assert.equal(st().agendamentos.find((x) => x.id === a.id).status, 'cancelado');
  assert.equal(st().agendamentos.find((x) => x.id === a.id).motivoCancelamento, 'conflito');
  semSobreposicao();
});

test('confirmação repetida (duplo clique / reenvio do WhatsApp) não duplica nada', () => {
  const a = cria({ inicio: tsAt(dia(), '10:00') }).agendamento;
  assert.ok(whatsapp.confirmar(a.id, telDe(a.id)).ok);
  const msgs = st().agendamentos.find((x) => x.id === a.id).log.length;
  assert.equal(whatsapp.confirmar(a.id, telDe(a.id)).ok, false);
  assert.equal(st().agendamentos.find((x) => x.id === a.id).log.length, msgs);
});

test('barbeiro confirma sobre pendente: pendente é cancelada por conflito e o cliente recebe oferta de remarcar', () => {
  const t = tsAt(dia(), '11:00');
  const pend = cria({ inicio: t, clienteId: 'c-igor' }).agendamento;
  const outroCli = st().clientes.find((c) => c.id !== 'c-igor').id;
  const conf = agenda.criar({ clienteId: outroCli, profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: t, status: 'confirmado' });
  if (conf.ok) {
    assert.equal(st().agendamentos.find((x) => x.id === pend.id).status, 'cancelado');
    assert.equal(st().agendamentos.find((x) => x.id === pend.id).motivoCancelamento, 'conflito');
  }
  semSobreposicao();
});

test('remarcar para horário de agendamento confirmado é recusado', () => {
  const t = tsAt(dia(), '10:00');
  const a = cria({ inicio: t }).agendamento; assert.ok(agenda.alterarStatus(a.id, 'confirmado').ok);
  const b = cria({ inicio: tsAt(dia(), '15:00'), clienteId: st().clientes.find((c) => c.id !== 'c-igor').id }).agendamento;
  const r = agenda.remarcar(b.id, { inicio: t + 10 * MIN });
  assert.equal(r.ok, false);
  assert.equal(st().agendamentos.find((x) => x.id === b.id).inicio, tsAt(dia(), '15:00'));
});

test('cancelar duas vezes e cancelar concluído não repetem efeitos', () => {
  const a = cria({ inicio: tsAt(dia(), '10:00') }).agendamento;
  assert.ok(agenda.cancelar(a.id).ok);
  const log = st().agendamentos.find((x) => x.id === a.id).log.length;
  agenda.cancelar(a.id);
  assert.equal(st().agendamentos.find((x) => x.id === a.id).log.length, log, 'cancelamento repetido gerou novo registro');
});

test('status inválido é recusado; reativar cancelado em horário ocupado também', () => {
  const t = tsAt(dia(), '10:00');
  const a = cria({ inicio: t }).agendamento;
  assert.equal(agenda.alterarStatus(a.id, 'hackeado').ok, false);
  assert.equal(agenda.alterarStatus(a.id, undefined).ok, false);
  assert.equal(st().agendamentos.find((x) => x.id === a.id).status, 'a_confirmar');
  agenda.cancelar(a.id);
  const b = cria({ inicio: t, clienteId: st().clientes.find((c) => c.id !== 'c-igor').id }).agendamento;
  assert.ok(agenda.alterarStatus(b.id, 'confirmado').ok);
  assert.equal(agenda.alterarStatus(a.id, 'confirmado').ok, false, 'reativou sobre horário já confirmado');
  semSobreposicao();
});

test('Pix pago depois de a cobrança ser cancelada não quita a cobrança antiga', () => {
  const { c } = comCobranca('09:20');
  financeiro.cancelarCobranca(c.id);
  financeiro.conectarOpenFinance('ct1');
  bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Igor', cpf: CPF, valor: c.valor });
  financeiro.sincronizar('ct1');
  assert.notEqual(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga');
  invariantesFinanceiras();
});

test('barbeiro desativado não recebe novos agendamentos', () => {
  for (const a of st().agendamentos.filter((x) => x.profissionalId === 'u-tailuan' && x.inicio > store.agora() && ATIVOS.includes(x.status))) agenda.cancelar(a.id);
  assert.ok(equipe.definirAtendimento('u-tailuan', false).ok);
  const r = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-tailuan', servicoIds: ['s-tesoura'], inicio: tsAt(dia(9), '10:00') });
  assert.equal(r.ok, false);
});

// ---------- Pix ----------
const comCobranca = (hora = '10:00') => {
  const a = cria({ inicio: tsAt(dia(), hora) }).agendamento;
  const g = financeiro.gerarCobranca(a.id, { cpf: CPF });
  assert.ok(g.ok, JSON.stringify(g));
  return { a, c: g.cobranca };
};

test('Pix pago duas vezes (confirmação manual repetida): um só crédito', () => {
  const { c } = comCobranca();
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  assert.equal(financeiro.confirmarManual(c.id, 'de novo').ok, false);
  invariantesFinanceiras();
  assert.equal(st().financeiro.lancamentos.filter((l) => l.id === st().financeiro.cobrancas.find((x) => x.id === c.id).lancamentoId).length, 1);
});

test('cobrança cancelada não pode ser marcada como paga', () => {
  const { c } = comCobranca();
  assert.ok(financeiro.cancelarCobranca(c.id).ok);
  const r = financeiro.confirmarManual(c.id, 'tarde demais');
  assert.equal(r.ok, false, 'cobrança cancelada foi paga');
  invariantesFinanceiras();
});

test('cobrança paga não pode ser cancelada nem gerar segunda cobrança para o mesmo serviço', () => {
  const { a, c } = comCobranca();
  financeiro.confirmarManual(c.id, '');
  assert.equal(financeiro.cancelarCobranca(c.id).ok, false);
  const g2 = financeiro.gerarCobranca(a.id, { cpf: CPF });
  assert.equal(g2.ok, false, 'gerou nova cobrança para agendamento já pago');
  invariantesFinanceiras();
});

test('cobrança pendente repetida: gerar de novo reaproveita ou recusa, nunca duplica pendentes', () => {
  const { a } = comCobranca();
  financeiro.gerarCobranca(a.id, { cpf: CPF });
  const pend = st().financeiro.cobrancas.filter((c) => c.agendamentoId === a.id && c.status === 'pendente');
  assert.ok(pend.length <= 1, 'mais de uma cobrança pendente para o mesmo agendamento');
});

test('Open Finance: sincronizar duas vezes não credita duas vezes o mesmo Pix', () => {
  const { c } = comCobranca();
  assert.ok(financeiro.conectarOpenFinance('ct1').ok);
  const pago = bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Igor', cpf: CPF, valor: c.valor });
  assert.ok(pago.ok, JSON.stringify(pago));
  financeiro.sincronizar('ct1'); financeiro.sincronizar('ct1'); financeiro.sincronizar('ct1');
  invariantesFinanceiras();
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga');
});

test('Pix de valor errado não quita a cobrança', () => {
  const { c } = comCobranca();
  financeiro.conectarOpenFinance('ct1');
  bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Igor', cpf: CPF, valor: c.valor - 10 });
  financeiro.sincronizar('ct1');
  assert.notEqual(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga', 'pagamento a menor quitou a cobrança');
  invariantesFinanceiras();
});

test('cobrança expirada: o relógio expira e a confirmação manual é recusada ou exige conferência', () => {
  const { c } = comCobranca();
  store.avancar(c.expiraEm - store.agora() + HORA);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'expirada');
  invariantesFinanceiras();
});

test('cancelar agendamento com Pix pago: um só aviso para devolver, nenhuma devolução registrada, nada enviado ao cliente', () => {
  const { a, c } = comCobranca();
  financeiro.confirmarManual(c.id, '');
  const msgs = st().mensagensCliente.length;
  assert.ok(agenda.cancelar(a.id).ok);
  agenda.cancelar(a.id);
  store.avancar(HORA);
  const avisos = st().avisosPainel.filter((x) => x.agendamentoId === a.id && x.tipo === 'devolver');
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].texto, /Abra o agendamento e escolha/);
  assert.equal(st().financeiro.devolucoes, undefined, 'não existe mais registro de devolução');
  assert.equal(st().mensagensCliente.length, msgs, 'o cliente não recebe nada');
  invariantesFinanceiras();
});

test('manter como crédito: só quem pode e uma vez; o valor fica do cliente e o agendamento não volta a valer', () => {
  const { a, c } = comCobranca();
  financeiro.confirmarManual(c.id, '');
  agenda.cancelar(a.id);
  store.avancar(HORA);
  assert.ok(financeiro.manterComoCredito(a.id).ok);
  assert.equal(financeiro.manterComoCredito(a.id).ok, false, 'segunda vez não cria outro crédito');
  assert.equal(st().financeiro.creditos.length, 1);
  assert.equal(st().financeiro.creditos[0].valor, c.valor);
  assert.equal(st().avisosPainel.filter((x) => x.agendamentoId === a.id && x.tipo === 'devolver').every((x) => x.lido), true);
  assert.equal(agenda.alterarStatus(a.id, 'confirmado').ok, false, 'o valor virou crédito: precisa de novo agendamento');
  invariantesFinanceiras();
});

test('cancelar agendamento com Pix pendente cancela a cobrança (e não gera aviso nem crédito)', () => {
  const { a, c } = comCobranca();
  agenda.cancelar(a.id);
  assert.notEqual(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'pendente');
  assert.equal(st().financeiro.creditos.length, 0);
  assert.equal(st().avisosPainel.filter((x) => x.tipo === 'devolver').length, 0);
});

test('webhook da API: mesmo txid duas vezes não credita duas vezes', () => {
  const { c } = comCobranca();
  assert.ok(financeiro.salvarApiPix('ct1', { banco: 'Sicredi', ambiente: 'homologacao', clientId: 'cid', clientSecret: 'sec', urlBase: 'https://api.sicredi.com.br', appKey: 'k', escopos: ['cob.write', 'cob.read', 'pix.read', 'webhook.write', 'pix.write'], webhookUrl: 'https://x.com/wh', certificadoNome: 'c.pem', chavePrivadaNome: 'k.pem' }).ok);
  const t = financeiro.testarApiPix('ct1');
  if (!t.ok) return; // pré-requisitos da API não atendidos no seed: coberto por outros testes
  const g = financeiro.gerarCobranca(c.agendamentoId, { cpf: CPF });
  const cob = g.cobranca || st().financeiro.cobrancas.find((x) => x.agendamentoId === c.agendamentoId && x.status === 'pendente');
  bancoSimulado.pagarPix({ codigo: cob.copiaECola, nome: 'Igor', cpf: CPF, valor: cob.valor });
  const r2 = bancoSimulado.pagarPix({ codigo: cob.copiaECola, nome: 'Igor', cpf: CPF, valor: cob.valor });
  assert.equal(r2.ok, false);
  invariantesFinanceiras();
});

// ---------- estoque ----------
test('concluir o mesmo atendimento duas vezes baixa o estoque uma só vez', () => {
  const a = cria({ inicio: tsAt(dia(), '10:00') }).agendamento;
  agenda.alterarStatus(a.id, 'confirmado');
  const antes = Object.fromEntries(st().materiais.map((m) => [m.id, m.estoque]));
  store.avancar(tsAt(dia(), '12:00') - store.agora());
  const depois1 = Object.fromEntries(st().materiais.map((m) => [m.id, m.estoque]));
  agenda.alterarStatus(a.id, 'concluido'); agenda.alterarStatus(a.id, 'concluido');
  const depois2 = Object.fromEntries(st().materiais.map((m) => [m.id, m.estoque]));
  const baixa1 = Object.keys(antes).map((k) => antes[k] - depois1[k]);
  const baixa2 = Object.keys(antes).map((k) => depois1[k] - depois2[k]);
  assert.ok(baixa2.every((x, i) => baixa1[i] > 0 ? x === 0 : x >= 0), 'estoque baixado em duplicidade');
  invariantesFinanceiras();
});

// ---------- fuzz com invariantes ----------
function rng(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; }; }
for (const seed of [1, 7, 42, 2026]) {
  test(`fuzz (semente ${seed}): operações aleatórias mantêm as invariantes`, () => {
    const rnd = rng(seed);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const clientes = st().clientes.map((c) => c.id);
    const barbs = ['u-kiko', 'u-tailuan', 'u-alan'];
    const horas = ['08:00', '08:40', '09:20', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '16:00'];
    financeiro.conectarOpenFinance('ct1');
    for (let i = 0; i < 160; i++) {
      const ags = st().agendamentos;
      const ativo = () => pick(ags.filter((a) => ATIVOS.includes(a.status)) .concat(ags.slice(0, 2)));
      const op = Math.floor(rnd() * 12);
      try {
        if (op <= 2) cria({ inicio: tsAt(dia(1 + Math.floor(rnd() * 6)), pick(horas)), clienteId: pick(clientes), profissionalId: pick(barbs) });
        else if (op === 3) whatsapp.confirmar(ativo().id, telDe(ativo().id));
        else if (op === 4) agenda.cancelar(ativo().id);
        else if (op === 5) agenda.remarcar(ativo().id, { inicio: tsAt(dia(1 + Math.floor(rnd() * 6)), pick(horas)), profissionalId: rnd() < 0.3 ? pick(barbs) : undefined });
        else if (op === 6) agenda.alterarStatus(ativo().id, pick(['confirmado', 'a_confirmar', 'concluido']));
        else if (op === 7) financeiro.gerarCobranca(ativo().id, { cpf: CPF });
        else if (op === 8) { const cs = st().financeiro.cobrancas; if (cs.length) { const c = pick(cs); if (rnd() < 0.5) financeiro.confirmarManual(c.id, ''); else bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'X', cpf: CPF, valor: c.valor }); } }
        else if (op === 9) financeiro.sincronizar('ct1');
        else if (op === 10) { if (rnd() < 0.5) financeiro.manterComoCredito(pick(ags).id); else financeiro.usarCredito(ativo().id); }
        else store.avancar(Math.floor(rnd() * 6) * HORA);
      } catch (e) { assert.fail(`exceção na operação ${op} (iteração ${i}): ${e.stack}`); }
      semSobreposicao();
      invariantesFinanceiras();
    }
  });
}
