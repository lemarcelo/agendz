/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estética sem box ativo (v120): não se atende, não se agenda e o link do cliente não abre; a barbearia (sem box) não é afetada.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth } from '../src/services/api.js';
import { ERRO_SEM_BOX, semBoxAtivo } from '../src/domain/rules.js';
import { atender } from '../src/domain/engine.js';
import { agendarPorLink, configPublica, horariosPublicos } from '../src/domain/publico.js';
import { addDays, startOfDay } from '../src/domain/time.js';

const AGORA = new Date('2026-10-12T07:00:00-03:00');
test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: AGORA });
  store.reiniciar();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});
const semBoxes = () => { const s = structuredClone(store.getState()); s.estabelecimento.boxes = []; return s; };
const entrada = { profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], nome: 'Caio', telefone: '(53) 99900-1003', veiculo: { placa: 'TST1001', modelo: 'Teste', porte: 'medio' } };

test('semBoxAtivo: só a estética sem nenhum box ativo', () => {
  assert.equal(semBoxAtivo(store.getState()), false);
  assert.equal(semBoxAtivo(semBoxes()), true);
  const so1 = structuredClone(store.getState());
  so1.estabelecimento.boxes = so1.estabelecimento.boxes.map((b, i) => ({ ...b, ativo: i === 0 }));
  assert.equal(semBoxAtivo(so1), false, 'um box ativo basta');
  const todosOff = structuredClone(store.getState());
  todosOff.estabelecimento.boxes = todosOff.estabelecimento.boxes.map((b) => ({ ...b, ativo: false }));
  assert.equal(semBoxAtivo(todosOff), true);
});

test('Atender recusa agora e no futuro, sem gravar nada, e volta ao normal com um box', () => {
  const s = semBoxes();
  const antes = s.agendamentos.length;
  const agora = Date.now();
  for (const inicio of [undefined, agora + 3 * 86400000]) {
    const r = atender(s, { ...entrada, ...(inicio ? { inicio } : {}) }, { id: 'u-davi' }, agora);
    assert.equal(r.ok, false);
    assert.deepEqual(r.erros, [ERRO_SEM_BOX]);
  }
  assert.equal(s.agendamentos.length, antes);
  assert.equal(atender(structuredClone(store.getState()), entrada, { id: 'u-davi' }, agora).ok, true);
});

test('link do cliente: página indisponível, nenhum horário e pedido recusado', () => {
  const normal = store.getState();
  assert.equal(configPublica(normal).ativo, true);
  const s = semBoxes();
  assert.equal(configPublica(s).ativo, false);
  const dia = addDays(startOfDay(Date.now()), 1);
  assert.deepEqual(horariosPublicos(s, { profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], porte: 'medio', dayTs: dia, agora: Date.now() }), []);
  const r = agendarPorLink(s, { ...entrada, inicio: dia + 10 * 3600000 }, Date.now());
  assert.equal(r.ok, false);
});
