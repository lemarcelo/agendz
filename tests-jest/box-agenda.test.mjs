/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */

// G4 (estética): quem ocupa a agenda é o BOX. O profissional só recebe a comissão e não bloqueia por outro carro (a ausência dele ainda vale).
// Barbearia não muda: o profissional continua sendo o recurso (coberto em tests-jest-barbearia).
import { test, jest, beforeEach, afterEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda } from '../src/services/api.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
let placa = 0;
const vei = () => ({ placa: `BOX${1000 + ++placa}`, modelo: 'Modelo Teste', porte: 'medio' });
const criar = (o) => agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculo: vei(), status: 'confirmado', ...o });

beforeEach(() => {
  jest.useRealTimers();
  jest.useFakeTimers({ doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar();
  auth.logout();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});
afterEach(() => { jest.useRealTimers(); });

test('o mesmo profissional atende carros em boxes diferentes ao mesmo tempo; o box ocupado é que barra', () => {
  const d = dia(8);
  const a = criar({ inicio: tsAt(d, '10:00') });
  const b = criar({ clienteId: 'c-igor', inicio: tsAt(d, '10:00') });
  assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
  assert.equal(a.agendamento.profissionalId, b.agendamento.profissionalId);
  assert.notEqual(a.agendamento.boxId, b.agendamento.boxId);
  const c = criar({ clienteId: 'c-jon', inicio: tsAt(d, '10:00') });
  assert.ok(c.ok, 'o terceiro box ainda está livre');
  const e = criar({ clienteId: 'c-marcelo', inicio: tsAt(d, '10:10') });
  assert.equal(e.ok, false);
  assert.match(e.erros[0], /boxes estão ocupados/);
});

test('outro profissional também usa um box livre no mesmo horário', () => {
  const d = dia(8);
  assert.ok(criar({ inicio: tsAt(d, '10:00') }).ok);
  const outro = criar({ clienteId: 'c-igor', profissionalId: 'u-marcelo', inicio: tsAt(d, '10:00') });
  assert.ok(outro.ok, 'há outros boxes livres, com outro profissional');
  const [b1, b2, b3] = st().estabelecimento.boxes.map((b) => b.id);
  assert.ok(b1 && b2 && b3);
});

test('o profissional ocupado em outro box não bloqueia o horário de um box livre', () => {
  const d = dia(9);
  const ok = criar({ inicio: tsAt(d, '10:00') });
  assert.ok(ok.ok);
  const v = agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d, '10:00'), servicoIds: ['s-lav-simples'], porte: 'medio' });
  assert.deepEqual(v.erros, [], 'o profissional ocupado em outro box não bloqueia');
});
