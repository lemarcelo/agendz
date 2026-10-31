/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estrela do cartão com nota (v134): quando a nota aparece, quando fica escondida (anônima sem a regra do Admin; oculta para quem não é o dono) e o contraste
// do número dentro da estrela nas cores de cada nota, no tema escuro e no claro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avaliacaoDoCartao, avaliacaoDoPainel, rotuloDaNota } from '../src/domain/avaliacoes.js';
import { contraste } from '../src/domain/tema.js';

const base = (extra = {}, regras = {}) => ({ regrasPlataforma: regras, avaliacoes: [{ id: 'av1', agendamentoId: 'ag1', nota: 4, texto: 'Ficou ótimo', em: 1000, anonimo: false, oculta: false, ...extra }] });

test('avaliado com nota: devolve nota e comentário; sem avaliação: null', () => {
  assert.deepEqual(avaliacaoDoCartao(base(), 'ag1'), { nota: 4, texto: 'Ficou ótimo', em: 1000, escondida: false, anonima: false });
  assert.equal(avaliacaoDoCartao(base(), 'outro'), null);
  assert.equal(avaliacaoDoCartao({}, 'ag1'), null);
  for (const n of [1, 2, 3, 4, 5]) assert.equal(avaliacaoDoCartao(base({ nota: n }), 'ag1').nota, n);
});

test('anônima com a regra desligada: o cartão NÃO mostra nota nem texto (só "avaliado")', () => {
  const r = avaliacaoDoCartao(base({ anonimo: true }), 'ag1');
  assert.deepEqual(r, { nota: 0, texto: '', em: null, escondida: true, anonima: true });
  assert.ok(!JSON.stringify(r).includes('Ficou'), 'o comentário não vaza');
  // regra ligada pelo Admin: aparece
  assert.equal(avaliacaoDoCartao(base({ anonimo: true }, { avaliacaoMostraAnonimo: true }), 'ag1').nota, 4);
});

test('oculta: só o dono vê a nota; os outros veem apenas "avaliado"', () => {
  const s = base({ oculta: true });
  assert.equal(avaliacaoDoCartao(s, 'ag1', { verOculta: true }).nota, 4);
  const outro = avaliacaoDoCartao(s, 'ag1');
  assert.equal(outro.escondida, true); assert.equal(outro.nota, 0); assert.equal(outro.texto, '');
});

test('nota fora de 1..5 vira "sem nota" (nunca pinta cor nem número)', () => {
  for (const n of [0, 6, -1, 2.5, '4', null]) assert.equal(avaliacaoDoCartao(base({ nota: n }), 'ag1').nota, 0);
  for (const n of [0, 6, '3', null]) assert.equal(avaliacaoDoPainel({ nota: n, texto: 'x' }), null);
  assert.deepEqual(avaliacaoDoPainel({ nota: 5, texto: 'Top', em: 7 }), { nota: 5, texto: 'Top', em: 7, escondida: false, anonima: false });
  assert.equal(avaliacaoDoPainel(null), null);
});

test('rótulos', () => {
  assert.equal(rotuloDaNota(1), '1 estrela'); assert.equal(rotuloDaNota(5), '5 estrelas'); assert.equal(rotuloDaNota(0), 'sem nota');
});

test('cores por nota: o número dentro da estrela tem contraste ≥ 4,5 no escuro e no claro, e as cinco cores são diferentes', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const bloco = (ini) => { const i = css.indexOf(ini); return css.slice(i, css.indexOf('}', i)); };
  for (const [nome, ini] of [['escuro', ':root {'], ['claro', ':root[data-theme="light"] {']]) {
    const b = bloco(ini);
    const fg = /--nota-fg:\s*(#[0-9a-fA-F]{6})/.exec(b)[1];
    const cores = [1, 2, 3, 4, 5].map((n) => /--nota-N:\s*(#[0-9a-fA-F]{6})/.source && new RegExp(`--nota-${n}:\\s*(#[0-9a-fA-F]{6})`).exec(b)[1]);
    assert.equal(new Set(cores).size, 5, `${nome}: cores repetidas`);
    cores.forEach((c, i) => assert.ok(contraste(c, fg) >= 4.5, `${nome}: nota ${i + 1} (${c}) com texto ${fg}: contraste ${contraste(c, fg).toFixed(2)}`));
  }
});
