/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Abreviação de nomes longos no cartão da agenda (src/domain/abreviar.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { abreviarNome } from '../src/domain/abreviar.js';

test('nome que cabe não muda; espaços sobrando saem', () => {
  assert.equal(abreviarNome('Kiko'), 'Kiko');
  assert.equal(abreviarNome('  Alan   Dalforno '), 'Alan Dalforno');
  assert.equal(abreviarNome('', 10), '');
  assert.equal(abreviarNome(null), '');
});
test('nome longo vira primeiro nome + inicial do último; sobrenome em minúscula vira maiúscula', () => {
  assert.equal(abreviarNome('Marcelo Antonio da Silva Santos', 18), 'Marcelo S.');
  assert.equal(abreviarNome('Ana Beatriz de oliveira', 12), 'Ana O.');
});
test('primeiro nome sozinho grande demais é cortado com reticências, no limite', () => {
  const r = abreviarNome('Maximiliano Bartolomeu', 8);
  assert.equal(r.length, 8); assert.ok(r.endsWith('…'));
  assert.equal(abreviarNome('Inconstitucionalissimamente', 10), 'Inconstit…');
});
test('limite absurdo vira o padrão ou o mínimo', () => {
  assert.equal(abreviarNome('Marcelo Antonio da Silva Santos', 0), 'Marcelo S.');
  assert.equal(abreviarNome('Marcelo Antonio da Silva Santos', 1), 'Mar…');
});
