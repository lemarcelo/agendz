// © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000
// Menu: cada aba tem um ícone próprio (nunca repetido) e o mesmo ícone nas duas telas (Artifact e site real). Não existe aba "Início".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { P } from '../src/ui/icones.js';

const ler = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const abas = (fonte) => [...fonte.matchAll(/\['([a-z]+)', '([^']+)', ([^\]]+)\]/g)].map(([, chave, rotulo, ic]) => ({ chave, rotulo, ic: ic.trim() }));
const real = abas(ler('real/AppReal.jsx').slice(ler('real/AppReal.jsx').indexOf('const itens = []')));
const simulado = abas(ler('App.jsx').slice(ler('App.jsx').indexOf('const itens = [')));

test('cada aba do menu tem ícone próprio, e o ícone existe', () => {
  for (const [nome, lista] of [['site real', real], ['Artifact', simulado]]) {
    assert.ok(lista.length >= 8, `${nome}: achou as abas`);
    const usados = lista.map((a) => a.ic).filter((i) => /^'/.test(i)).map((i) => i.replace(/'/g, ''));
    for (const i of usados) assert.ok(P[i], `${nome}: ícone ${i} não existe`);
    const vistos = new Map();
    for (const a of lista) { if (vistos.has(a.ic)) assert.fail(`${nome}: ${a.rotulo} e ${vistos.get(a.ic)} usam o mesmo ícone (${a.ic})`); vistos.set(a.ic, a.rotulo); }
  }
});

test('a mesma aba tem o mesmo ícone nas duas telas', () => {
  const porRotulo = new Map(simulado.map((a) => [a.rotulo, a.ic]));
  for (const a of real) if (porRotulo.has(a.rotulo) && /^'/.test(a.ic) && /^'/.test(porRotulo.get(a.rotulo))) assert.equal(a.ic, porRotulo.get(a.rotulo), `${a.rotulo}`);
});

test('não existe aba Início no site real', () => {
  assert.equal(real.some((a) => a.chave === 'inicio' || a.rotulo === 'Início'), false);
});
