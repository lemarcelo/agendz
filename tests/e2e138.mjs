/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// G3 (V63) na demonstração da estética: "Boxes permitidos" no cadastro do serviço; marcar um box restringe o serviço e salvar mantém a escolha; 390 e 1366 px sem rolagem lateral.
// E2E_CAPTURAS=<pasta> gera os PNGs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
const pasta = process.env.E2E_CAPTURAS;
try {
  for (const largura of [390, 1366]) {
    const ctx = await b.newContext({ viewport: { width: largura, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });
    await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(url);
    await p.getByTestId('demo-davi').click();
    await p.getByTestId('nav-servicos').click();
    await p.getByRole('button', { name: /^Editar Lavagem simples/ }).click();
    const sec = p.getByTestId('srv-boxes');
    await sec.waitFor();
    assert.match(await sec.innerText(), /Boxes permitidos/);
    await sec.scrollIntoViewIfNeeded();
    // escolhe o Box 2 pelo seletor (busca → clique), salva e reabre: a escolha fica
    await p.getByTestId('srv-boxes-busca').fill('Box 2');
    await p.locator('[data-testid^="srv-boxes-add-"]').first().click();
    assert.equal(await p.locator('[data-testid^="srv-boxes-rem-"]').count(), 1);
    if (pasta) await p.screenshot({ path: `${pasta}/servico-boxes-${largura}.png` });
    await p.getByTestId('salvar-servico').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid=srv-boxes]'));
    await p.getByRole('button', { name: /^Editar Lavagem simples/ }).click();
    await p.getByTestId('srv-boxes').waitFor();
    assert.equal(await p.locator('[data-testid^="srv-boxes-rem-"]').count(), 1, 'a restrição foi salva');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral em ' + largura);
    await ctx.close();
  }
  assert.deepEqual(erros, []);
  console.log('e2e138 ok');
} finally {
  await b.close();
}
