/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Divisão dos testes de navegador entre os jobs do CI (tools/lote-e2e.mjs `fatiar`): cada teste cai em exatamente uma fatia, a divisão pelo peso
// (tempo) é equilibrada e igual em todos os jobs, e teste novo (sem peso) não quebra nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fatiar } from '../tools/lote-e2e.mjs';

const nomes = Array.from({ length: 12 }, (_, k) => `e2e${k + 1}.mjs`);
const pesos = { 'tests/e2e1.mjs': 100, 'tests/e2e2.mjs': 10, 'tests/e2e3.mjs': 10, 'tests/e2e4.mjs': 10, 'tests/e2e5.mjs': 10, 'tests/e2e6.mjs': 10, 'tests/e2e7.mjs': 10, 'tests/e2e8.mjs': 10, 'tests/e2e9.mjs': 10, 'tests/e2e10.mjs': 10 };
const soma = (l) => l.reduce((t, f) => t + (pesos[`tests/${f}`] ?? 10), 0);

test('sem fração, devolve todos; fração inválida falha', () => {
  assert.deepEqual(fatiar(nomes, undefined, 'tests', pesos), nomes);
  for (const ruim of ['0/3', '4/3', 'a/b', '1/0']) assert.throws(() => fatiar(nomes, ruim, 'tests', pesos), /E2E_FRACAO/, ruim);
});

test('cada teste cai em exatamente uma fatia, na ordem original, e a divisão é a mesma toda vez', () => {
  for (const n of [1, 2, 3, 5]) {
    const fatias = Array.from({ length: n }, (_, k) => fatiar(nomes, `${k + 1}/${n}`, 'tests', pesos));
    assert.deepEqual(fatias.flat().sort(), [...nomes].sort(), `n=${n}`);
    for (const f of fatias) assert.deepEqual(f, nomes.filter((x) => f.includes(x)), 'ordem original');
    assert.deepEqual(fatias, Array.from({ length: n }, (_, k) => fatiar(nomes, `${k + 1}/${n}`, 'tests', pesos)));
  }
});

test('o teste mais pesado fica sozinho numa fatia e as demais se equilibram (teste novo vale a mediana)', () => {
  const f = [1, 2, 3].map((i) => fatiar(nomes, `${i}/3`, 'tests', pesos));
  assert.deepEqual(f.find((x) => x.includes('e2e1.mjs')), ['e2e1.mjs']);
  const cargas = f.map(soma).sort((a, b) => a - b);
  assert.ok(cargas[2] - cargas[1] <= 100 && cargas[1] - cargas[0] <= 10, `cargas ${cargas}`);
  const outras = f.filter((x) => !x.includes('e2e1.mjs')).map(soma);
  assert.ok(Math.abs(outras[0] - outras[1]) <= 10, `fatias leves desiguais ${outras}`);
});

test('sem nenhum peso conhecido, todas as fatias ficam com quantidade parecida', () => {
  const f = [1, 2, 3].map((i) => fatiar(nomes, `${i}/3`, 'tests', {}));
  assert.deepEqual(f.map((x) => x.length), [4, 4, 4]);
});
