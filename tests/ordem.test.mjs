// Ordem personalizada (menus, abas, colunas, marcadores) e filtro por marcador da agenda.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aplicarOrdem, chaveOrdem, ehOrdemPadrao, moverPara, moverPasso, sanearOrdem } from '../src/domain/ordem.js';
import { CHAVES_MARCADORES, casaMarcadores, contarMarcadores, marcadoresDe } from '../src/domain/marcadores.js';

const PAD = ['a', 'b', 'c', 'd'];

test('aplicarOrdem: sem ordem salva vale a padrão', () => {
  assert.deepEqual(aplicarOrdem(PAD, []), PAD);
  assert.deepEqual(aplicarOrdem(PAD, null), PAD);
});

test('aplicarOrdem: ordem salva vem primeiro; item novo entra no fim; item que sumiu é ignorado', () => {
  assert.deepEqual(aplicarOrdem(PAD, ['c', 'a']), ['c', 'a', 'b', 'd']);
  assert.deepEqual(aplicarOrdem(['a', 'b', 'c', 'd', 'e'], ['d', 'c', 'b', 'a']), ['d', 'c', 'b', 'a', 'e']);
  assert.deepEqual(aplicarOrdem(['a', 'c'], ['d', 'c', 'b', 'a']), ['c', 'a']);
});

test('aplicarOrdem: itens fixos ficam sempre no fim, mesmo que a ordem salva diga outra coisa', () => {
  assert.deepEqual(aplicarOrdem(['x', 'y', 'acoes'], ['acoes', 'y', 'x'], ['acoes']), ['y', 'x', 'acoes']);
});

test('sanearOrdem: ordem adulterada ou estragada nunca quebra a tela', () => {
  assert.deepEqual(sanearOrdem('texto'), []);
  assert.deepEqual(sanearOrdem({ a: 1 }), []);
  assert.deepEqual(sanearOrdem(['a', 'a', 1, null, '', {}, ['b'], 'b']), ['a', 'b']);
  assert.deepEqual(sanearOrdem(['x'.repeat(61), 'ok']), ['ok']);
  assert.equal(sanearOrdem(Array.from({ length: 500 }, (_, i) => `i${i}`)).length, 40);
  // nada de protótipo poluído virando id
  assert.deepEqual(aplicarOrdem(PAD, ['__proto__', 'constructor', 'toString', 'b']), ['b', 'a', 'c', 'd']);
});

test('moverPara: antes e depois do alvo, sem perder nem duplicar itens', () => {
  assert.deepEqual(moverPara(PAD, 'd', 'a', false), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moverPara(PAD, 'a', 'c', true), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moverPara(PAD, 'b', 'b'), PAD);
  assert.deepEqual(moverPara(PAD, 'zz', 'a'), PAD);
  assert.deepEqual(moverPara(PAD, 'a', 'zz'), PAD);
  const r = moverPara(PAD, 'b', 'd', true);
  assert.deepEqual([...r].sort(), PAD);
});

test('moverPasso: teclado anda um passo, para nas pontas e não passa dos fixos', () => {
  assert.deepEqual(moverPasso(PAD, 'b', -1), ['b', 'a', 'c', 'd']);
  assert.deepEqual(moverPasso(PAD, 'a', -1), PAD);
  assert.deepEqual(moverPasso(PAD, 'd', 1), PAD);
  assert.deepEqual(moverPasso(['x', 'y', 'acoes'], 'y', 1, ['acoes']), ['x', 'y', 'acoes']);
  assert.deepEqual(moverPasso(['x', 'y', 'acoes'], 'acoes', -1, ['acoes']), ['x', 'y', 'acoes']);
});

test('ehOrdemPadrao e chave por usuário', () => {
  assert.equal(ehOrdemPadrao(PAD, [...PAD]), true);
  assert.equal(ehOrdemPadrao(PAD, ['b', 'a', 'c', 'd']), false);
  assert.equal(chaveOrdem('nav', 'u-1'), 'ordem:nav:u-1');
  assert.notEqual(chaveOrdem('nav', 'u-1'), chaveOrdem('nav', 'u-2'));
});

// ---------- marcadores ----------
const H = 3600000;
const agora = new Date('2026-10-12T12:00:00-03:00').getTime();
const ag = (o) => ({ id: 'x', status: 'a_confirmar', inicio: agora + 48 * H, plano: [{ estado: 'agendada' }], ...o });

test('marcadoresDe: um por status; remarcado ganha também "reagendado"', () => {
  assert.deepEqual(marcadoresDe(ag({}), agora), ['a-confirmar']);
  assert.deepEqual(marcadoresDe(ag({ status: 'confirmado' }), agora), ['confirmado']);
  assert.deepEqual(marcadoresDe(ag({ status: 'concluido' }), agora), ['concluido']);
  assert.deepEqual(marcadoresDe(ag({ status: 'cancelado' }), agora), ['cancelado']);
  assert.deepEqual(marcadoresDe(ag({ plano: [{ estado: 'enviada' }] }), agora), ['sem-resposta']);
  assert.deepEqual(marcadoresDe(ag({ status: 'confirmado', reagendado: true }), agora), ['confirmado', 'reagendado']);
});

test('contarMarcadores e casaMarcadores: filtro por caso', () => {
  const lista = [ag({ id: '1' }), ag({ id: '2', status: 'confirmado', reagendado: true }), ag({ id: '3', status: 'cancelado' }), ag({ id: '4', status: 'confirmado' })];
  const c = contarMarcadores(lista, agora);
  assert.equal(c.confirmado, 2); assert.equal(c.reagendado, 1); assert.equal(c['a-confirmar'], 1); assert.equal(c.cancelado, 1);
  assert.deepEqual(lista.filter((a) => casaMarcadores(a, [], agora)).length, 4, 'sem escolha mostra tudo');
  assert.deepEqual(lista.filter((a) => casaMarcadores(a, ['confirmado'], agora)).map((a) => a.id), ['2', '4']);
  assert.deepEqual(lista.filter((a) => casaMarcadores(a, ['reagendado'], agora)).map((a) => a.id), ['2']);
  assert.deepEqual(lista.filter((a) => casaMarcadores(a, ['cancelado', 'a-confirmar'], agora)).map((a) => a.id), ['1', '3']);
  assert.equal(lista.filter((a) => casaMarcadores(a, ['qualquer-coisa'], agora)).length, 4, 'chave desconhecida é ignorada, não esconde a agenda');
  assert.deepEqual(Object.keys(c), CHAVES_MARCADORES);
});

// ---------- tela ----------
test('a tela usa a ordem só com contexto fixo do código e nunca coloca html vindo de fora', () => {
  const src = (f) => fs.readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
  const hook = src('ordem.jsx');
  assert.ok(!/dangerouslySetInnerHTML|innerHTML|eval\(/.test(hook));
  assert.match(hook, /sanearOrdem/, 'ordem lida do navegador passa por sanearOrdem');
  assert.match(hook, /querySelectorAll\(`\[data-ordem="\$\{contexto\}"\]`\)/);
  // toda tabela do painel (com cabeçalho) usa o componente que deixa mover colunas
  for (const f of ['Cadastros.jsx', 'Estoque.jsx', 'Financeiro.jsx', 'Relatorios.jsx']) {
    const t = src(f);
    assert.ok(!/<thead>/.test(t), `${f}: tabela com cabeçalho deve usar <Tabela> (colunas reordenáveis)`);
  }
  // toda lista de abas do painel pode ser reordenada
  for (const f of ['Estabelecimento.jsx', 'Estoque.jsx', 'Financeiro.jsx']) {
    for (const m of src(f).matchAll(/<Abas [^>]*>/g)) assert.match(m[0], /ordem="/, `${f}: <Abas> sem ordem`);
  }
});
