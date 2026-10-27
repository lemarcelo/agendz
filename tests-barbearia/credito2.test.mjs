// Decisões do proprietário sobre crédito (12/10/2026): excedente pago com crédito volta direto ao crédito;
// crédito é aplicado mesmo com Pix pendente (o Pix é cancelado); aviso 7 dias antes do crédito vencer.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, financeiro, whatsapp } from '../src/services/api.js';
import { creditoDoCliente, creditosDoCliente, venceEm } from '../src/domain/financeiro.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { chat } from '../src/services/chat.js';

const st = () => store.getState();
const TEL = '(55) 99711-4020';
const CPF = '284.510.937-79';
const DIA = 24 * 3600 * 1000;
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const saldo = () => creditoDoCliente(st(), 'c-marcelo', undefined, store.agora());
function solo() {
  como('alan');
  for (const o of st().agendamentos.filter((x) => x.clienteId === 'c-marcelo' && ['a_confirmar', 'confirmado'].includes(x.status))) assert.ok(agenda.alterarStatus(o.id, 'cancelado').ok);
}
function marcar(n, hora, servicoIds = ['s-maquina', 's-barba'], profissionalId = 'u-kiko') {
  como('alan');
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId, servicoIds, inicio: tsAt(dia(n), hora), status: 'confirmado' });
  assert.ok(r.ok, JSON.stringify(r));
  return r.agendamento;
}
function comCredito() { // R$ 75 de crédito, revisado pelo barbeiro
  solo();
  const a = marcar(9, '10:00');
  const c = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  assert.ok(agenda.alterarStatus(a.id, 'cancelado').ok);
  assert.ok(financeiro.acertarValorPago(a.id, 'credito').ok);
  return a;
}
// Relógio fixo (segunda de manhã): o resultado não depende da hora em que o teste roda.
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); store.reiniciar(); chat.reiniciar(); });

// ---------- excedente pago com crédito ----------
test('horário pago com crédito que passa a valer menos: o excedente volta direto ao crédito, sem "pago a mais"', () => {
  comCredito();
  const b = marcar(10, '10:00'); // 75
  assert.ok(whatsapp.usarCredito(b.id, TEL).ok);
  assert.equal(saldo(), 0);
  const avisosAntes = st().avisosPainel.length;
  como('alan');
  assert.ok(agenda.editarServicos(b.id, ['s-barba']).ok); // 35
  assert.equal(saldo(), 40, 'os R$ 40 do serviço removido voltaram ao crédito');
  assert.ok(!st().avisosPainel.slice(0, st().avisosPainel.length - avisosAntes).some((x) => /pago a mais/i.test(x.texto)) && !st().avisosPainel.some((x) => x.tipo === 'devolver' && x.agendamentoId === b.id));
  assert.ok(st().avisosPainel.some((x) => /voltaram para o crédito/i.test(x.texto)));
  const ag = st().agendamentos.find((x) => x.id === b.id);
  assert.ok(ag.log.some((l) => /voltaram para o crédito do cliente/.test(l.para || '')));
  // continua pago: a cobrança por crédito agora vale 35
  const pago = st().financeiro.cobrancas.filter((c) => c.agendamentoId === b.id && c.status === 'paga' && c.via === 'credito').reduce((t, c) => t + c.valor, 0);
  assert.equal(pago, 35);
  assert.equal(whatsapp.aPagar(b.id, TEL), 0);
});

test('o crédito devolvido pelo excedente mantém a validade original', () => {
  comCredito();
  const original = venceEm(creditosDoCliente(st(), 'c-marcelo')[0]);
  const b = marcar(10, '10:00');
  whatsapp.usarCredito(b.id, TEL);
  como('alan'); agenda.editarServicos(b.id, ['s-barba']);
  assert.equal(venceEm(creditosDoCliente(st(), 'c-marcelo')[0]), original);
});

test('excedente de Pix (dinheiro de verdade) continua pedindo decisão do barbeiro', () => {
  solo();
  const a = marcar(6, '10:00');
  const c = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  assert.ok(agenda.editarServicos(a.id, ['s-barba']).ok);
  assert.equal(saldo(), 0, 'dinheiro pago por Pix não vira crédito sozinho');
  assert.ok(st().avisosPainel.some((x) => /pago a mais/i.test(x.texto)));
});

test('pago em parte por Pix e em parte por crédito: o crédito volta primeiro e o resto pede decisão', () => {
  comCredito(); // R$ 75
  const b = marcar(10, '10:00', ['s-maquina', 's-barba', 's-tesoura']); // 115
  assert.ok(whatsapp.usarCredito(b.id, TEL).ok); // crédito 75, faltam 40
  como('alan');
  const c = financeiro.gerarCobranca(b.id, { cpf: CPF }).cobranca; // diferença de 40
  assert.equal(c.valor, 40);
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  assert.ok(agenda.editarServicos(b.id, ['s-barba']).ok); // vale 35; pagou 115 (75 crédito + 40 Pix) → sobram 80
  assert.equal(saldo(), 75, 'os 75 pagos com crédito voltaram ao crédito');
  assert.ok(st().avisosPainel.some((x) => x.tipo === 'devolver' && /pago a mais/i.test(x.texto)), 'os 5 que sobram do Pix pedem decisão');
});

// ---------- Pix pendente + crédito ----------
test('crédito é aplicado mesmo com Pix pendente: o Pix é cancelado e o painel é avisado', () => {
  comCredito();
  const b = marcar(10, '10:00'); // 75
  const pix = financeiro.gerarCobranca(b.id, { cpf: CPF }).cobranca;
  assert.equal(pix.status, 'pendente');
  assert.equal(whatsapp.creditoUsavel(b.id, TEL), 75, 'a oferta de crédito aparece mesmo com Pix pendente');
  const r = whatsapp.usarCredito(b.id, TEL);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.total, 75); assert.equal(r.falta, 0);
  assert.equal(st().financeiro.cobrancas.find((c) => c.id === pix.id).status, 'cancelada');
  assert.equal(whatsapp.aPagar(b.id, TEL), 0);
  assert.ok(st().avisosPainel.some((x) => /Pix pendente de .* foi cancelado/.test(x.texto)));
});

test('crédito parcial com Pix pendente: cancela o Pix e fica faltando só a diferença', () => {
  comCredito(); // 75
  const b = marcar(10, '10:00', ['s-maquina', 's-barba', 's-tesoura']); // 115
  const pix = financeiro.gerarCobranca(b.id, { cpf: CPF }).cobranca;
  assert.equal(pix.valor, 115);
  const r = whatsapp.usarCredito(b.id, TEL);
  assert.ok(r.ok); assert.equal(r.total, 75); assert.equal(r.falta, 40);
  assert.equal(st().financeiro.cobrancas.find((c) => c.id === pix.id).status, 'cancelada');
  assert.equal(whatsapp.aPagar(b.id, TEL), 40);
});

// ---------- aviso 7 dias antes do vencimento ----------
test('7 dias antes do vencimento o cliente recebe UM aviso no WhatsApp, só se o crédito ainda tiver saldo', () => {
  comCredito();
  const cr = creditosDoCliente(st(), 'c-marcelo')[0];
  const faltam = Math.ceil((venceEm(cr) - store.agora()) / DIA);
  store.avancar((faltam - 8) * DIA); // 8 dias antes: nada
  assert.ok(!st().mensagensCliente.some((m) => m.modeloId === 'm-credito-vencendo'));
  store.avancar(2 * DIA); // 6 dias antes: já passou dos 7
  const av = st().mensagensCliente.filter((m) => m.modeloId === 'm-credito-vencendo');
  assert.equal(av.length, 1);
  assert.match(av[0].texto, /R\$\s*75,00/); assert.match(av[0].texto, /vence/i);
  store.avancar(DIA); // não repete
  assert.equal(st().mensagensCliente.filter((m) => m.modeloId === 'm-credito-vencendo').length, 1);
});

test('crédito já usado inteiro, vencido ou sem saldo não gera aviso de vencimento', () => {
  comCredito();
  const b = marcar(10, '10:00');
  assert.ok(whatsapp.usarCredito(b.id, TEL).ok); // gastou os 75
  store.avancar(58 * DIA);
  assert.ok(!st().mensagensCliente.some((m) => m.modeloId === 'm-credito-vencendo'));
});
