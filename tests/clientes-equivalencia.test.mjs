/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Equivalência simulada × real (F2 parte 2): os MESMOS casos de validação de cliente rodam aqui, na API simulada, e no servidor
// (backend/src/test/java/.../clientes/ClientesEquivalenciaTest.java, no CI). Se uma regra mudar só de um lado, um dos dois testes falha.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, clientes } from '../src/services/api.js';

const fixture = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/clientes.json', import.meta.url), 'utf8'));

test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});

test('há casos suficientes para valer como contrato', () => {
  assert.ok(fixture.casos.length >= 25);
  assert.ok(fixture.casos.some((c) => c.esperado.ok) && fixture.casos.some((c) => !c.esperado.ok));
});

for (const caso of fixture.casos) {
  test(`cliente (simulada) · ${caso.nome}`, () => {
    let r;
    for (const passo of caso.passos) {
      r = clientes.salvar(structuredClone(passo));
      if (passo !== caso.passos[caso.passos.length - 1]) assert.ok(r.ok, `passo anterior deveria dar certo: ${JSON.stringify(r)}`);
    }
    assert.equal(r.ok, caso.esperado.ok, JSON.stringify(r));
    if (!caso.esperado.ok) assert.equal(r.erros[0], caso.esperado.erro);
  });
}
