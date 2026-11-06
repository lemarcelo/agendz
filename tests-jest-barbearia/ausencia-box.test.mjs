/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ausência do box (G2) na barbearia: o tipo não usa box, então não há o que lançar (mesma capacidade `usaRecursoFisico` da estética).
import { test, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, ausenciasBox } from '../src/services/api.js';

beforeEach(() => { store.reiniciar(); assert.ok(auth.login({ identificador: 'alan', senha: '1234' }).ok); });

test('barbearia não usa box: ausência de box é recusada', () => {
  const r = ausenciasBox.criar('bx1', Date.now() + 86400000, Date.now() + 2 * 86400000);
  assert.equal(r.ok, false);
});
