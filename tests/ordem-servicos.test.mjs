/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v123: ordem dos serviços no Atender e no link: mais usados primeiro (derivado) ou a ordem manual do dono.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOrdemManual, ordenarServicos, porOrdemManual, usoDosServicos } from '../src/domain/ordem-servicos.js';

const S = (id, ordem, nome = id) => ({ id, nome, ordem });
const ags = [
  { status: 'concluido', servicoIds: ['b'] }, { status: 'confirmado', servicoIds: ['b', 'c'] }, { status: 'cancelado', servicoIds: ['a', 'a'] }, { status: 'a_confirmar', servicoIds: ['c'] }, { status: 'concluido', servicoIds: ['b'] },
];

test('uso: conta só agendamentos não cancelados', () => {
  const u = usoDosServicos(ags);
  assert.deepEqual([u.get('a') || 0, u.get('b'), u.get('c')], [0, 3, 2]);
  assert.equal(usoDosServicos(null).size, 0);
});

test('ordem manual: ordem crescente, sem ordem depois, empate pela posição', () => {
  assert.deepEqual(porOrdemManual([S('x', 3), S('y', 1), S('z', undefined), S('w', 2)]).map((s) => s.id), ['y', 'w', 'x', 'z']);
});

test('modo uso: mais usados em cima; empate segue a ordem manual; modo manual ignora o uso', () => {
  const l = [S('a', 1), S('b', 2), S('c', 3), S('d', 4)];
  const u = usoDosServicos(ags);
  assert.deepEqual(ordenarServicos(l, 'uso', u).map((s) => s.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ordenarServicos(l, 'manual', u).map((s) => s.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ordenarServicos(l, 'uso', new Map()).map((s) => s.id), ['a', 'b', 'c', 'd'], 'sem uso cai na ordem manual');
  assert.deepEqual(ordenarServicos(l, 'qualquer', u).map((s) => s.id), ['a', 'b', 'c', 'd'], 'modo desconhecido vale o manual');
});

test('aplicarOrdemManual: ids desconhecidos e repetidos são ignorados; os que faltam vão para o fim', () => {
  const l = [S('a', 1), S('b', 2), S('c', 3)];
  const m = aplicarOrdemManual(l, ['c', 'zzz', 'c', 'a']);
  assert.deepEqual([...m.entries()], [['c', 1], ['a', 2], ['b', 3]]);
  assert.deepEqual([...aplicarOrdemManual(l, 'lixo').entries()], [['a', 1], ['b', 2], ['c', 3]]);
});
