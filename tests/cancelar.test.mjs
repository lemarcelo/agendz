// Cancelar pelo WhatsApp: só com 24 h ou mais de antecedência. A mensagem de confirmação traz Confirmar e Remarcar, e Cancelar só dentro do prazo.
// A API confere o prazo e o dono do número na hora (o botão pode ter sido enviado quando ainda dava tempo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, financeiro, whatsapp } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { enviarAoCliente } from '../src/domain/engine.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { chat } from '../src/services/chat.js';

const st = () => store.getState();
const H = 3600 * 1000;
const TEL = '(55) 99711-4020'; // telefone do cliente c-marcelo na semente
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
function marcar(n = 5, hora = '10:00', solo = false) {
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada'], inicio: tsAt(dia(n), hora) });
  assert.ok(r.ok, JSON.stringify(r));
  if (!solo) return r.agendamento;
  // o cliente da semente já tem outros horários: tira do caminho para a conversa tratar só deste
  for (const o of st().agendamentos.filter((x) => x.clienteId === 'c-marcelo' && x.id !== r.agendamento.id && ['a_confirmar', 'confirmado'].includes(x.status))) assert.ok(agenda.alterarStatus(o.id, 'cancelado').ok);
  return r.agendamento;
}
const botoesEnviados = (a, agora) => { const s = structuredClone(st()); return enviarAoCliente(s, s.agendamentos.find((x) => x.id === a.id), 'confirmacao', agora).botoes; };
test.beforeEach(() => { reiniciar(); chat.reiniciar(); });

test('mensagem de confirmação: Confirmar + Remarcar + Cancelar com 24 h ou mais; só Confirmar + Remarcar dentro das 24 h', () => {
  const a = marcar(5);
  assert.deepEqual(botoesEnviados(a, a.inicio - 30 * H), ['Confirmar', 'Remarcar', 'Cancelar']);
  assert.deepEqual(botoesEnviados(a, a.inicio - 24 * H), ['Confirmar', 'Remarcar', 'Cancelar'], 'exatamente 24 h ainda vale');
  assert.deepEqual(botoesEnviados(a, a.inicio - 23 * H), ['Confirmar', 'Remarcar']);
  assert.deepEqual(botoesEnviados(a, a.inicio - 2 * H), ['Confirmar', 'Remarcar']);
});

test('cancelar pelo WhatsApp com antecedência: cancela, registra "cancelado pelo cliente" e avisa o painel', () => {
  const a = marcar(5);
  const avisos = st().avisosPainel.length;
  const r = whatsapp.cancelar(a.id, TEL);
  assert.ok(r.ok, JSON.stringify(r));
  const x = st().agendamentos.find((y) => y.id === a.id);
  assert.equal(x.status, 'cancelado'); assert.equal(x.motivoCancelamento, 'cliente');
  assert.ok(st().avisosPainel.length > avisos);
  assert.match(st().avisosPainel[0].texto, /cancelou o horário/);
  assert.ok(x.log.some((h) => /Cancelado pelo cliente/.test(h.para)));
  assert.equal(whatsapp.cancelar(a.id, TEL).ok, false, 'não cancela duas vezes');
});

test('cancelar com menos de 24 h é recusado pela API, mesmo que o botão tenha sido enviado antes', () => {
  const a = marcar(5);
  store.avancar(a.inicio - 20 * H - store.agora());
  const r = whatsapp.cancelar(a.id, TEL);
  assert.equal(r.ok, false); assert.match(r.erros[0], /menos de 24 horas/);
  assert.equal(st().agendamentos.find((y) => y.id === a.id).status !== 'cancelado', true);
});

test('só o dono do número cancela: outro telefone, vazio ou id inexistente recebem erro e nada muda', () => {
  const a = marcar(5);
  for (const tel of ['(51) 98765-4321', '', undefined, '123']) assert.equal(whatsapp.cancelar(a.id, tel).ok, false);
  assert.equal(whatsapp.cancelar('zzz', TEL).ok, false);
  assert.notEqual(st().agendamentos.find((y) => y.id === a.id).status, 'cancelado');
  assert.equal(whatsapp.podeCancelar(a.id, '(51) 98765-4321'), false);
});

test('agendamento concluído ou já cancelado pelo esteticista não é cancelável pelo cliente', () => {
  const a = marcar(5);
  assert.ok(agenda.alterarStatus(a.id, 'cancelado').ok);
  assert.equal(whatsapp.cancelar(a.id, TEL).ok, false);
});

test('cancelado pelo cliente com Pix pago: aviso para decidir (crédito, despesa ou por fora) cita "cancelado pelo cliente"', () => {
  const a = marcar(5);
  const c = financeiro.gerarCobranca(a.id, { cpf: '284.510.937-79' }).cobranca;
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  assert.ok(whatsapp.cancelar(a.id, TEL).ok);
  const av = st().avisosPainel.filter((x) => x.tipo === 'devolver');
  assert.equal(av.length, 1); assert.match(av[0].texto, /cancelado pelo cliente/i);
  assert.ok(financeiro.acertarValorPago(a.id, 'credito').ok);
});

// ---------- conversa ----------
const falar = (t, v) => chat.enviar(t, v);
const ult = () => chat.threadAtual().mensagens.filter((m) => m.de === 'bot').at(-1);

test('chat: "cancelar" pede confirmação e só cancela com "sim"; "não" mantém', () => {
  const a = marcar(5, '10:00', true);
  falar('oi'); falar('cancelar');
  assert.match(ult().texto, /Cancelar o horário de/); assert.match(ult().texto, /1 - Sim, cancelar/);
  falar('2');
  assert.match(ult().texto, /foi mantido/); assert.notEqual(st().agendamentos.find((y) => y.id === a.id).status, 'cancelado');
  falar('cancelar'); falar('1');
  assert.match(ult().texto, /cancelado/); assert.equal(st().agendamentos.find((y) => y.id === a.id).status, 'cancelado');
});

test('chat: com menos de 24 h explica e oferece só remarcar (e confirmar); não cancela', () => {
  const a = marcar(5, '10:00', true);
  store.avancar(a.inicio - 10 * H - store.agora());
  falar('oi'); falar('cancelar');
  assert.match(ult().texto, /menos de 24 horas/);
  assert.ok(ult().botoes.some((b) => b.rotulo === 'Remarcar'));
  assert.ok(!ult().botoes.some((b) => /Cancelar/.test(b.rotulo)));
  assert.notEqual(st().agendamentos.find((y) => y.id === a.id).status, 'cancelado');
});

test('chat: "Meus horários" abre o horário e oferece Cancelar só se faltam 24 h ou mais', () => {
  const a = marcar(5, '10:00', true);
  falar('oi'); falar('2'); // um só horário: abre direto as ações dele
  assert.ok(ult().botoes.some((b) => b.rotulo === 'Cancelar horário'));
  assert.ok(ult().botoes.some((b) => b.rotulo === 'Alterar serviços'));
  store.avancar(a.inicio - 10 * H - store.agora());
  falar('oi'); falar('2');
  assert.ok(!ult().botoes.some((b) => /Cancelar/.test(b.rotulo)));
  assert.ok(ult().botoes.some((b) => b.rotulo === 'Remarcar'));
});

test('chat: o botão Cancelar da mensagem de confirmação pede a confirmação antes de cancelar', () => {
  const a = marcar(5);
  const s = structuredClone(st());
  const m = enviarAoCliente(s, s.agendamentos.find((x) => x.id === a.id), 'confirmacao', store.agora());
  assert.ok(m.botoes.includes('Cancelar'));
});
