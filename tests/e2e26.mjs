// Menu do topo sem item escondido em qualquer largura; código de serviço e produto; lupa e ordem dos últimos usados na tela Atender.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index.html', import.meta.url).href);
const T = (id) => p.getByTestId(id);
const ok = (m) => console.log('✓', m);

await T('demo-davi').click();
// 1) menu: todos os itens ficam dentro da tela e nenhum fica cortado, em várias larguras
for (const w of [1440, 1280, 1100, 950, 800, 600, 390]) {
  await p.setViewportSize({ width: w, height: 800 });
  await p.waitForTimeout(80);
  const itens = await p.locator('.nav button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, r: r.right, w: r.width, t: e.dataset.testid }; }));
  assert.ok(itens.length >= 7, 'menu com os itens do proprietário');
  for (const i of itens) assert.ok(i.x >= 0 && i.r <= w + 0.5 && i.w > 20, `${w}px: ${i.t} escondido ou cortado (${Math.round(i.x)}–${Math.round(i.r)})`);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${w}px: sem rolagem horizontal`);
  const rolagem = await p.locator('.nav').evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
  assert.equal(rolagem, true, `${w}px: o menu não precisa de rolagem lateral`);
}
// o último item continua clicável com a janela pequena
await p.setViewportSize({ width: 600, height: 800 });
const nav = await p.locator('.nav button').evaluateAll((els) => els.map((e) => e.dataset.testid));
await T(nav.at(-1)).click();
ok('menu completo e clicável em todas as larguras');
await p.setViewportSize({ width: 1440, height: 900 });

// 2) código no cadastro: serviço e produto novos vêm com o próximo número e dá para trocar
await T('nav-servicos').click();
const codigos = (await p.locator('[data-testid^="srv-cod-"]').allInnerTexts()).map((t) => Number(t.replace(/\D/g, '')));
await T('novo-servico').click();
assert.equal(Number(await T('srv-codigo').inputValue()), Math.max(...codigos) + 1, 'próximo código sugerido');
await T('srv-nome').fill('Sobrancelha'); await T('srv-codigo').fill('77');
await p.getByRole('button', { name: 'Salvar' }).click();
await p.getByText('Código 77').waitFor();
await T('novo-servico').click();
await T('srv-nome').fill('Outro'); await T('srv-codigo').fill('77');
await p.getByRole('button', { name: 'Salvar' }).click();
await p.getByText(/Já existe serviço com o código 77/).waitFor();
await p.getByRole('button', { name: 'Cancelar' }).click();
ok('serviço: código automático, editável e único');
await T('nav-estoque').click();
await p.getByRole('button', { name: /Novo produto/ }).click();
assert.match(await T('mat-codigo').inputValue(), /^\d+$/, 'produto novo já vem com código');
await p.getByRole('button', { name: 'Cancelar' }).click();
ok('produto: código sugerido no cadastro');

// 3) Atender: lupa por nome ou código; os últimos usados sobem
await T('nav-agenda').click();
await T('atender').click();
const ids = async () => p.locator('[data-testid^="atender-srv-"]').evaluateAll((els) => els.map((e) => e.dataset.testid));
const antes = await ids();
await T('atender-lista-servicos-lupa').click();
await T('atender-lista-servicos-busca').fill('barba');
assert.ok((await ids()).length < antes.length && (await ids()).every((i) => /barba/.test(i)), 'filtra pelo nome');
await T('atender-lista-servicos-busca').fill('2');
const porCodigo = await ids();
assert.equal(porCodigo.length, 1, 'filtra pelo código');
await T('atender-lista-servicos-busca').fill('zzzz');
await T('atender-lista-servicos-vazio').waitFor();
await T('atender-lista-servicos-lupa').click(); // fechar limpa a busca
assert.equal((await ids()).length, antes.length);
// atende "Barba" e confere que ela passa para o topo da lista seguinte
await T('atender-srv-s-lav-motor').check();
await salvarAtender(p); await T('salvar-atender').waitFor({ state: 'detached' });
await T('atender').click();
assert.equal((await ids())[0], 'atender-srv-s-lav-motor', 'o último serviço usado vem primeiro');
if (await T('atender-lista-produtos-lupa').count()) { await T('atender-lista-produtos-lupa').click(); await T('atender-lista-produtos-busca').fill('1'); assert.ok(await p.locator('[data-testid^="atender-prod-"]').count() >= 1); }
ok('lupa por nome/código e últimos usados primeiro');
console.log('erros', erros);
assert.deepEqual(erros, []);
await b.close();
