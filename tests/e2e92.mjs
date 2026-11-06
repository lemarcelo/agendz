/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco D no Artifact: a forma de pagamento troca pelo lápis na linha do valor dos Detalhes (menu que abre para baixo); segurar o cartão não abre mais nada;
// a forma atual fica à esquerda do valor; Escape e clique fora fecham só o menu; a troca vale; 390 px sem rolagem lateral, claro e escuro.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

const ok = (m) => console.log('✓', m);
const URL_APP = new URL('../dist/index.html', import.meta.url).href;
const HOJE = new Date('2026-10-12T14:00:00-03:00');
const b = await chromium.launch();
const erros = [];

async function abrir({ w, h, modo }) {
  const touch = w < 700;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(HOJE);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(URL_APP);
  await p.evaluate((m) => document.documentElement.setAttribute('data-theme', m === 'claro' ? 'light' : 'dark'), modo);
  if (touch) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await p.getByTestId('demo-loja-estetica_automotiva').click().catch(() => {});
  return { ctx, p, T: (id) => p.getByTestId(id) };
}
const semRolagem = async (p, onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral: ${onde}`);
const centro = async (loc) => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const segurarMouse = async (p, loc, ms = 650) => { const c = await centro(loc); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up(); await p.waitForTimeout(120); };
const toque = async (p, ctx, loc, { ms = 650, arrastar = 0 } = {}) => {
  const cdp = await ctx.newCDPSession(p); const c = await centro(loc);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await t('touchStart', c.x, c.y);
  if (arrastar) for (let i = 1; i <= 4; i++) { await t('touchMove', c.x, c.y + (arrastar * i) / 4); await p.waitForTimeout(30); }
  await p.waitForTimeout(ms); await t('touchEnd'); await p.waitForTimeout(150);
};

async function lancar(p, T) {
  await T('atender').click();
  const srv = p.locator('[data-testid^="atender-srv-"]').first();
  await srv.check();
  await T('atender-nome').fill('Rita Forma');
  await salvarAtender(p);
  await T('salvar-atender').waitFor({ state: 'detached' });
}
const cartao = (p) => p.locator('.cartao-bloco', { has: p.locator('[data-testid="cartao-cliente"]', { hasText: 'Rita' }) }).first().locator('[data-testid="cartao"]');

for (const [w, h, modo] of [[1360, 860, 'claro'], [390, 780, 'escuro']]) {
  const { ctx, p, T } = await abrir({ w, h, modo });
  await T('demo-davi').click(); await T('agenda-topo').waitFor();
  await lancar(p, T);
  const c = cartao(p); await c.waitFor();

  // segurar o cartão NÃO abre mais a forma de pagamento (bloco D): vale só o clique, que abre os Detalhes
  if (w >= 700) await segurarMouse(p, c); else await toque(p, ctx, c);
  assert.equal(await T('forma-menu').count(), 0, 'segurar o cartão não abre a forma');
  assert.equal(await T('forma-pagamento').count(), 0);
  await p.waitForTimeout(150);
  if (!(await T('gaveta').count())) await c.click();
  await T('gaveta').waitFor();

  // Detalhes: forma atual ao lado do valor e lápis à direita; o menu abre PARA BAIXO
  const linha = T('gaveta').locator('.forma-linha');
  await linha.waitFor();
  assert.match(await T('detalhe-forma').innerText(), /Pix/, 'a forma padrão da loja aparece (Pix)');
  const caixaForma = await T('detalhe-forma').boundingBox(); const caixaValor = await T('detalhe-valor').boundingBox(); const lapis = await T('forma-editar').boundingBox();
  assert.ok(caixaForma.x + caixaForma.width <= caixaValor.x + 1, 'a forma fica à esquerda do valor');
  assert.ok(lapis.x >= caixaValor.x + caixaValor.width - 1, 'o lápis fica à direita do valor');
  assert.ok(lapis.x + lapis.width <= w + 1, 'o lápis cabe na tela');
  assert.equal(await T('forma-menu').count(), 0, 'o menu só abre ao tocar no lápis');
  await T('forma-editar').click(); await T('forma-menu').waitFor();
  const menu = await T('forma-menu').boundingBox();
  assert.ok(menu.y >= lapis.y + lapis.height - 1, 'o menu abre para baixo do botão');
  assert.ok(menu.x >= 0 && menu.x + menu.width <= w + 1, 'o menu cabe na largura');
  assert.equal(await T('forma-pix').getAttribute('aria-checked'), 'true', 'a forma atual vem marcada');
  await semRolagem(p, `forma ${w}`);
  if (process.env.E2E_CAPTURAS) { await p.waitForTimeout(350); await p.screenshot({ path: `${process.env.E2E_CAPTURAS}/d-demo-menu-${w}.png` }); }
  await T('forma-cartao').click(); await T('forma-menu').waitFor({ state: 'detached' });
  assert.match(await T('detalhe-forma').innerText(), /Cartão/, 'a troca aparece ao lado do valor');

  // abrir de novo: Cartão marcado; Escape fecha só o menu (os Detalhes ficam); clique fora também fecha
  await T('forma-editar').click(); await T('forma-menu').waitFor();
  assert.equal(await T('forma-cartao').getAttribute('aria-checked'), 'true', 'a troca ficou');
  assert.equal(await T('forma-pix').getAttribute('aria-checked'), 'false');
  await p.keyboard.press('Escape');
  assert.equal(await T('forma-menu').count(), 0, 'Escape fecha o menu');
  assert.equal(await T('gaveta').count(), 1, 'e os Detalhes continuam abertos');
  await T('forma-editar').click(); await T('forma-menu').waitFor();
  await T('gaveta').locator('h2').first().click();
  assert.equal(await T('forma-menu').count(), 0, 'clique fora fecha o menu');
  ok(`lápis troca a forma de pagamento nos Detalhes (${w} px, ${modo})`);
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, []);
console.log('e2e92 ok');
