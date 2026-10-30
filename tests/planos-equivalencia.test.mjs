/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Os MESMOS casos que o servidor roda em PlanosEquivalenciaTest (backend/src/test/resources/equivalencia/planos.json): cota, acúmulo, adiantamento, intervalo, atraso, dívida e desconto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avaliar, consome, meses, descontos } from './planos-equivalencia-util.mjs';

const dados = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/planos.json', import.meta.url), 'utf8'));

test('cota: a API simulada e o servidor dão o mesmo extrato, saldo, dívida e permissão de uso', () => {
  assert.ok(dados.casos.length >= 25, 'fixture carregada');
  for (const c of dados.casos) assert.deepEqual(avaliar(c), c.esperado, c.nome);
});

test('quem gasta corte e quem devolve', () => {
  for (const c of dados.consomem) assert.equal(consome(c), c.esperado, JSON.stringify(c));
});

test('meses: soma e rótulo', () => {
  for (const c of dados.meses) assert.deepEqual(meses(c), c.esperado, JSON.stringify(c));
});

test('desconto do plano: só o que ele inclui, valor zero fora, centavos arredondados', () => {
  for (const c of dados.descontos) assert.deepEqual(descontos(c), c.esperado, c.nome);
});
