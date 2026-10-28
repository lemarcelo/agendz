/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Os MESMOS casos que o servidor roda em CupomEquivalenciaTest (backend/src/test/resources/equivalencia/cupons.json): quanto cada serviço desconta e como a chave é lida.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descontosDoCupom, normalizarChave } from '../src/domain/cupons.js';

const casos = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/cupons.json', import.meta.url), 'utf8'));

test('descontos: a API simulada e o servidor dão o mesmo desconto em cada serviço', () => {
  assert.ok(casos.descontos.length >= 14, 'fixture carregada');
  for (const c of casos.descontos) {
    const obtido = descontosDoCupom({ tipo: c.tipo, servicoIds: c.servicoIds, percentual: c.percentual, valor: c.valor }, c.itens);
    assert.deepEqual(obtido, c.esperado, c.nome);
  }
});

test('chaves: minúsculas, espaços e hífens a mais são aceitos; 0, O, 1 e I nunca', () => {
  assert.ok(casos.chaves.length >= 10, 'fixture carregada');
  for (const c of casos.chaves) assert.equal(normalizarChave(c.entrada), c.esperado, String(c.entrada));
});
