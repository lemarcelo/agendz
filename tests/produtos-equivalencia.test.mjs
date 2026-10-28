/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Equivalência simulada × real (5d): os MESMOS casos de validação de produto rodam aqui, na API simulada (estoque.salvarMaterial com tipo produto),
// e no servidor (ProdutosEquivalenciaTest, no CI). Nomes e códigos do arquivo não colidem com o que já vem no exemplo da loja.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, estoque } from '../src/services/api.js';

const fixture = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/produtos.json', import.meta.url), 'utf8'));

test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});

test('há casos suficientes para valer como contrato', () => {
  assert.ok(fixture.casos.length >= 20);
  assert.ok(fixture.casos.some((c) => c.esperado.ok) && fixture.casos.some((c) => !c.esperado.ok));
});

for (const caso of fixture.casos) {
  test(`produto (simulada) · ${caso.nome}`, () => {
    const ids = [];
    let r;
    caso.passos.forEach((passo, i) => {
      const corpo = { ...structuredClone(passo.corpo), tipo: 'produto' };
      if (passo.editar) corpo.id = ids[Number(passo.editar.slice(1)) - 1];
      r = estoque.salvarMaterial(corpo);
      ids.push(r.ok ? (r.material ? r.material.id : corpo.id) : null);
      if (i < caso.passos.length - 1) assert.ok(r.ok, `passo ${i + 1} deveria dar certo: ${JSON.stringify(r)}`);
    });
    assert.equal(r.ok, caso.esperado.ok, JSON.stringify(r));
    if (!caso.esperado.ok) assert.equal(r.erros[0], caso.esperado.erro);
    if (caso.esperado.codigosSeguidos) {
      const [a, b] = ids.slice(0, 2).map((id) => Number(store.getState().materiais.find((x) => x.id === id).codigo));
      assert.equal(b, a + 1, 'o código automático avança de um em um');
    }
  });
}
