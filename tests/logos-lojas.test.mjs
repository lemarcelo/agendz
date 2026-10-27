/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cada loja cadastrada tem logo própria, válida (PNG/JPEG/WebP até o limite) e diferente das outras.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOJAS_DEMO } from '../src/services/lojas-demo.js';
import { logoValida } from '../src/domain/tema.js';

test('cada loja de demonstração tem logo própria e válida', () => {
  const logos = LOJAS_DEMO.map((l) => l.criar(new Date('2026-10-12T10:00:00-03:00')).estabelecimento.logo);
  logos.forEach((lg, i) => assert.ok(logoValida(lg), `logo inválida em ${LOJAS_DEMO[i].slug}`));
  assert.equal(new Set(logos).size, LOJAS_DEMO.length, 'duas lojas com a mesma logo');
});
