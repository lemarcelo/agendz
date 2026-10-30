/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Título do grupo de dia na Agenda: data por extenso, sem a palavra "Hoje"; "Amanhã" continua com prefixo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rotuloDoGrupo, separarCancelados, rotuloCancelados } from '../src/domain/agenda-grupos.js';
import { DIA, startOfDay } from '../src/domain/time.js';

const agora = new Date(2026, 9, 30, 10, 0).getTime();
test('hoje mostra só a data (sem a palavra Hoje)', () => {
  const r = rotuloDoGrupo(startOfDay(agora), agora);
  assert.ok(!/hoje/i.test(r), r);
  assert.match(r, /30/);
});
test('amanhã mantém o prefixo e outros dias só a data', () => {
  assert.match(rotuloDoGrupo(startOfDay(agora) + DIA, agora), /^Amanhã · /);
  assert.ok(!/hoje|amanhã/i.test(rotuloDoGrupo(startOfDay(agora) + 3 * DIA, agora)));
});

test('cancelados do dia saem da lista e ficam à parte, em ordem', () => {
  const l = [{ id: 1, status: 'confirmado' }, { id: 2, status: 'cancelado' }, { id: 3, status: 'concluido' }, { id: 4, status: 'cancelado' }];
  const r = separarCancelados(l);
  assert.deepEqual(r.ativos.map((a) => a.id), [1, 3]);
  assert.deepEqual(r.cancelados.map((a) => a.id), [2, 4]);
});
test('com o filtro "Cancelado" ligado, nada é separado', () => {
  const l = [{ id: 1, status: 'cancelado' }];
  assert.deepEqual(separarCancelados(l, true), { ativos: l, cancelados: [] });
});
test('rótulo da linha: singular e plural com a quantidade', () => {
  assert.equal(rotuloCancelados(1), 'Cancelado (1)');
  assert.equal(rotuloCancelados(3), 'Cancelados (3)');
});
