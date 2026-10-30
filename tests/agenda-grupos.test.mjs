/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Título do grupo de dia na Agenda: data por extenso, sem a palavra "Hoje"; "Amanhã" continua com prefixo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rotuloDoGrupo } from '../src/domain/agenda-grupos.js';
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
