import test from 'node:test';
import assert from 'node:assert/strict';
import { alternarMulti, escolherUnico, removerUm, sanearSelecao } from '../src/domain/selecao.js';

test('clique troca a seleção, não soma', () => {
  assert.deepEqual(escolherUnico(['a'], 'b'), ['b']);
  assert.deepEqual(escolherUnico(['a', 'b'], 'b'), ['b']);
  assert.deepEqual(escolherUnico([], 'a'), ['a']);
});
test('clique no único marcado desmarca; com mínimo 1 permanece', () => {
  assert.deepEqual(escolherUnico(['a'], 'a'), []);
  assert.deepEqual(escolherUnico(['a'], 'a', 1), ['a']);
});
test('gesto soma e tira sem mexer nos outros', () => {
  assert.deepEqual(alternarMulti(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(alternarMulti(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(alternarMulti([], 'a'), ['a']);
});
test('o mínimo nunca é violado', () => {
  assert.deepEqual(alternarMulti(['a'], 'a', 1), ['a']);
  assert.deepEqual(removerUm(['a'], 'a', 1), ['a']);
  assert.deepEqual(removerUm(['a', 'b'], 'a', 1), ['b']);
  assert.deepEqual(removerUm(['a'], 'x'), ['a']);
});
test('entradas estranhas não quebram nem duplicam', () => {
  assert.deepEqual(escolherUnico(null, 'a'), ['a']);
  assert.deepEqual(escolherUnico('a', 'b'), ['b']);
  assert.deepEqual(sanearSelecao(['x', 'a', 'a', 'b'], ['a', 'b'], 'p'), ['a', 'b']);
  assert.deepEqual(sanearSelecao(['x'], ['a'], 'a'), ['a']);
  assert.deepEqual(sanearSelecao('a', ['a'], 'p'), ['a']);
  assert.deepEqual(sanearSelecao(undefined, [], undefined), []);
});
test('fuzz: sequências aleatórias respeitam o mínimo e não repetem', () => {
  let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ids = ['a', 'b', 'c', 'd'];
  for (const minimo of [0, 1]) {
    let sel = minimo ? ['a'] : [];
    for (let i = 0; i < 500; i++) {
      const id = ids[Math.floor(rnd() * 4)]; const op = Math.floor(rnd() * 3);
      sel = op === 0 ? escolherUnico(sel, id, minimo) : op === 1 ? alternarMulti(sel, id, minimo) : removerUm(sel, id, minimo);
      assert.ok(sel.length >= minimo && new Set(sel).size === sel.length);
    }
  }
});
