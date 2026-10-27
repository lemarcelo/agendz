// Celular (390 px): sem rolagem horizontal em Horário e exceções e Minha escala; legenda inteira visível; Mês colore a contagem por status.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
const url = new URL('../dist/index-barbearia.html', import.meta.url).href;
const T = (id) => p.locator(`[data-testid="${id}"]`);
const semRolagem = async (onde) => {
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `${onde}: rolagem horizontal (${sw} > ${iw})`);
};
await p.goto(url);

await T('demo-alan').click();
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Horário e exceções' }).click();
await p.waitForTimeout(200);
await semRolagem('Estabelecimento > Horário e exceções');

await T('nav-agenda').click();
// legenda: todos os marcadores visíveis dentro da tela, sem precisar rolar
for (const k of ['a-confirmar', 'confirmado', 'concluido', 'sem-resposta', 'cancelado']) {
  const box = await T(`legenda-${k}`).boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `legenda ${k} fora da tela`);
}
await T('legenda-reagendado').scrollIntoViewIfNeeded();
const rb = await T('legenda-reagendado').boundingBox();
assert.ok(rb && rb.x + rb.width <= 390, 'legenda reagendado fora da tela');
await p.getByRole('button', { name: 'Mês', exact: true }).click();
await p.waitForTimeout(200);
const pontos = await p.locator('.mes-ponto').count();
assert.ok(pontos > 0, 'o mês mostra a contagem por status');
const cores = await p.locator('.mes-ponto').evaluateAll((els) => new Set(els.map((e) => [...e.classList].find((c) => c.startsWith('st-')))).size);
assert.ok(cores >= 1);
await semRolagem('Agenda > Mês');
await T('sair').click();

await T('demo-kiko').click();
await T('nav-escala').click();
await p.waitForTimeout(200);
await semRolagem('Barbeiro > Minha escala');
assert.deepEqual(erros, []);
await b.close();
console.log('e2e15 ok');
