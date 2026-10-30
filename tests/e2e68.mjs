/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda > Horários no computador: cartões em grade de colunas iguais (mesma largura e mesma altura na mesma linha), sem rolagem lateral, no Artifact e em 390 px
// (uma coluna), claro e escuro; o cartão do dia mostra a data (não a palavra "Hoje"). Artifact: pessoas de exemplo da barbearia.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

const b = await chromium.launch();
const erros = [];
const ok = (m) => console.log('✓', m);

for (const [w, h, modo] of [[1366, 820, 'escuro'], [1920, 1000, 'claro'], [390, 800, 'escuro']]) {
  const touch = w < 700;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  await p.evaluate((m) => document.documentElement.setAttribute('data-theme', m === 'claro' ? 'light' : 'dark'), modo);
  await p.getByTestId('demo-loja-dalforno').click();
  await p.getByTestId('demo-alan').click();
  await p.getByTestId('nav-agenda').click();
  await p.locator('[data-testid="cartao"]').first().waitFor();
  // a demonstração tem um horário no dia: lança mais três (sem dados do cliente, de fábrica nada é obrigatório) para a grade ter o que mostrar
  for (const hora of ['09', '10', '11']) {
    await p.getByTestId('atender').click();
    await p.locator('[data-testid^="atender-srv-"]').first().check();
    await p.getByTestId('atender-quando').click();
    await p.getByTestId('atender-data').fill('2026-10-12');
    await p.getByTestId('hora-h').fill(hora); await p.getByTestId('hora-m').fill('00');
    await salvarAtender(p);
    await p.getByTestId('salvar-atender').waitFor({ state: 'detached' });
  }
  const m = await p.evaluate(() => {
    const lista = [...document.querySelectorAll('[data-testid="cartao"]')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), data: e.querySelector('[data-testid="cartao-data"]')?.textContent || '' }; });
    return { lista, largo: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  assert.ok(m.lista.length >= 2, `${w}: pelo menos dois cartões do dia`);
  assert.ok(!m.largo, `${w}: rolagem lateral`);
  for (const c of m.lista) assert.ok(/^[a-zç]{3} \d\d\/\d\d$/i.test(c.data), `${w}: o cartão do dia mostra a data, não "Hoje": "${c.data}"`);
  const larguras = new Set(m.lista.map((c) => c.w));
  assert.equal(larguras.size, 1, `${w}: todos os cartões com a mesma largura ${[...larguras]}`);
  const linhas = new Map();
  for (const c of m.lista) linhas.set(c.y, [...(linhas.get(c.y) || []), c.h]);
  for (const [y, hs] of linhas) assert.equal(new Set(hs).size, 1, `${w}: cartões da mesma linha (y=${y}) com alturas diferentes ${hs}`);
  if (w >= 1000) { assert.ok(linhas.size < m.lista.length, `${w}: no computador os cartões formam grade (mais de um por linha)`); assert.ok(m.lista[0].w < w * 0.5, `${w}: cartão não ocupa a linha inteira (${m.lista[0].w})`); }
  else assert.equal(linhas.size, m.lista.length, `${w}: no celular uma coluna`);
  ok(`${w} px ${modo}: grade ${[...larguras][0]} px, ${linhas.size} linha(s)`);
  await ctx.close();
}
assert.deepEqual(erros, []);
await b.close();
console.log('e2e68 ok');
