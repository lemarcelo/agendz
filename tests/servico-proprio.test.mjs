/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Assistente de início: o dono descreve serviços próprios na hora. O adaptador da pré-visualização valida igual ao servidor (nome 2-80, preço 0-100000,
// duração inteira 1-14400, até 20) e conta repetidos (sem diferenciar maiúsculas) como "já existiam"; nada é gravado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { criarAdaptadorDemo } from '../src/services/onboarding-demo.js';

test('serviço próprio: validações e contagem', async () => {
  reiniciar();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const a = criarAdaptadorDemo({});
  const antes = JSON.stringify(store.getState().servicos);
  for (const ruim of [{ nome: '', preco: 10, duracaoMin: 20 }, { nome: 'A', preco: 10, duracaoMin: 20 }, { nome: 'x'.repeat(81), preco: 10, duracaoMin: 20 },
    { nome: 'Ok', preco: -1, duracaoMin: 20 }, { nome: 'Ok', preco: 100001, duracaoMin: 20 }, { nome: 'Ok', preco: 10, duracaoMin: 0 }, { nome: 'Ok', preco: 10, duracaoMin: 1.5 }]) {
    assert.equal((await a.servicos([], [ruim])).ok, false, JSON.stringify(ruim));
  }
  assert.equal((await a.servicos([], Array.from({ length: 21 }, (_, i) => ({ nome: `Serviço ${i}`, preco: 1, duracaoMin: 1 })))).ok, false, 'no máximo 20');
  const r = await a.servicos([], [{ nome: 'Película de farol', preco: 120, duracaoMin: 90 }]);
  assert.deepEqual(r.resultado, { criados: 1, jaExistiam: 0 });
  const r2 = await a.servicos([], [{ nome: 'PELÍCULA DE FAROL'.toLowerCase(), preco: 1, duracaoMin: 1 }, { nome: 'Outro', preco: 5, duracaoMin: 5 }]);
  assert.deepEqual(r2.resultado, { criados: 1, jaExistiam: 1 });
  assert.equal(JSON.stringify(store.getState().servicos), antes, 'a pré-visualização não grava nada');
});
