/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v123: ordem dos serviços no Atender e no link: mais usados primeiro (derivado) ou a ordem manual do dono.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOrdemManual, ordenarServicos, porOrdemManual, usoDosServicos } from '../src/domain/ordem-servicos.js';

const S = (id, ordem, nome = id) => ({ id, nome, ordem });
const AGORA = new Date('2026-10-12T10:00:00-03:00').getTime();
const DIA = 24 * 60 * 60 * 1000;
const ags = [
  { inicio: AGORA - 2 * DIA, status: 'concluido', servicoIds: ['b'] }, { inicio: AGORA - 2 * DIA, status: 'confirmado', servicoIds: ['b', 'c'] }, { inicio: AGORA - 2 * DIA, status: 'cancelado', servicoIds: ['a', 'a'] }, { inicio: AGORA - 2 * DIA, status: 'a_confirmar', servicoIds: ['c'] }, { inicio: AGORA - 2 * DIA, status: 'concluido', servicoIds: ['b'] },
];

test('uso: conta só agendamentos não cancelados', () => {
  const u = usoDosServicos(ags, AGORA);
  assert.deepEqual([u.get('a') || 0, u.get('b'), u.get('c')], [0, 3, 2]);
  assert.equal(usoDosServicos(null).size, 0);
});

test('uso: só os últimos 90 dias contam (v124); o limite é inclusivo e o futuro conta', () => {
  const lista = [
    { inicio: AGORA - 89 * DIA, status: 'concluido', servicoIds: ['a'] },
    { inicio: AGORA - 90 * DIA, status: 'concluido', servicoIds: ['a'] },
    { inicio: AGORA - 90 * DIA - 1, status: 'concluido', servicoIds: ['a', 'b'] },
    { inicio: AGORA - 200 * DIA, status: 'concluido', servicoIds: ['b', 'b', 'b'] },
    { inicio: AGORA + 3 * DIA, status: 'confirmado', servicoIds: ['b'] },
    { status: 'concluido', servicoIds: ['c'] },
  ];
  const u = usoDosServicos(lista, AGORA);
  assert.deepEqual([u.get('a'), u.get('b'), u.get('c')], [2, 1, undefined]);
});

test('ordem manual: ordem crescente, sem ordem depois, empate pela posição', () => {
  assert.deepEqual(porOrdemManual([S('x', 3), S('y', 1), S('z', undefined), S('w', 2)]).map((s) => s.id), ['y', 'w', 'x', 'z']);
});

test('modo uso: mais usados em cima; empate segue a ordem manual; modo manual ignora o uso', () => {
  const l = [S('a', 1), S('b', 2), S('c', 3), S('d', 4)];
  const u = usoDosServicos(ags, AGORA);
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
