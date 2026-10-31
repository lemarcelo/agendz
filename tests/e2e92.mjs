/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v119 no Artifact: segurar o cartão (mouse e toque de verdade) abre a forma de pagamento; clique curto continua abrindo o agendamento;
// rolar a lista (mexer o dedo) não abre; a troca vale (marcada ao abrir de novo); 390 px sem rolagem lateral, claro e escuro.
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

  // clique curto: abre o agendamento, nunca a forma de pagamento
  await c.click(); await T('gaveta').waitFor(); assert.equal(await T('forma-pagamento').count(), 0, 'clique curto não abre a forma');
  await p.keyboard.press('Escape'); if (await T('gaveta').count()) await p.mouse.click(5, 5);
  await p.waitForTimeout(150);

  // segurar: abre a forma de pagamento e NÃO abre o agendamento
  if (w >= 700) await segurarMouse(p, c); else await toque(p, ctx, c);
  await T('forma-pagamento').waitFor();
  assert.equal(await T('gaveta').count(), 0, 'segurar não abre o agendamento');
  await semRolagem(p, `forma ${w}`);
  const pix = T('forma-pix');
  assert.equal(await pix.getAttribute('aria-pressed'), 'true', 'a forma padrão da loja vem marcada (Pix)');
  await T('forma-cartao').click(); await T('forma-pagamento').waitFor({ state: 'detached' });

  // abrir de novo: Cartão marcado
  if (w >= 700) await segurarMouse(p, c); else await toque(p, ctx, c);
  await T('forma-pagamento').waitFor();
  assert.equal(await T('forma-cartao').getAttribute('aria-pressed'), 'true', 'a troca ficou');
  assert.equal(await T('forma-pix').getAttribute('aria-pressed'), 'false');
  await T('forma-fechar').click(); await T('forma-pagamento').waitFor({ state: 'detached' });

  // segurar pouco (soltou antes) não abre; Esc fecha
  if (w >= 700) { await segurarMouse(p, c, 200); assert.equal(await T('forma-pagamento').count(), 0, 'soltou cedo: nada'); await p.waitForTimeout(200); await T('gaveta').waitFor(); await p.keyboard.press('Escape'); await p.mouse.click(5, 5).catch(() => {}); }
  else { await toque(p, ctx, c, { ms: 650, arrastar: 40 }); assert.equal(await T('forma-pagamento').count(), 0, 'rolar a lista (dedo andou) não abre'); }
  ok(`segurar o cartão troca a forma (${w} px, ${modo})`);
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, []);
console.log('e2e92 ok');
