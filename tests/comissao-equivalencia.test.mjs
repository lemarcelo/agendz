/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Equivalência simulada × real: a ordem da comissão (serviço > funcionário > estabelecimento) vem do mesmo arquivo que o servidor executa (ComissaoEquivalenciaTest).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pctComissao } from '../src/domain/rules.js';

const fixture = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/comissao.json', import.meta.url), 'utf8'));

test('há casos suficientes para valer como contrato', () => {
  assert.ok(fixture.casos.length >= 15);
});

for (const c of fixture.casos) {
  test(`comissão (simulada) · ${c.nome}`, () => {
    const st = { estabelecimento: { comissaoPadrao: c.estabelecimento.comissaoPadrao } };
    assert.equal(pctComissao(st, c.usuario, c.servico), c.esperado);
  });
}
