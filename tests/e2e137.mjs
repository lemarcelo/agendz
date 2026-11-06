/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Modo da escolha automática do box (G2, V62) na demonstração da estética: seletor em Estabelecimento > Boxes, grava ao mudar, sem rolagem lateral em 390 e 1366 px.
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
    await p.getByTestId('nav-estab').click();
    await p.getByRole('tab', { name: 'Boxes' }).click();
    const sel = p.getByTestId('boxes-modo-select');
    await sel.waitFor();
    assert.equal(await sel.inputValue(), 'livre', 'padrão = mais livre');
    await sel.selectOption('fila');
    await p.getByText('Revezamento: depois de um box').waitFor();
    assert.equal(await sel.inputValue(), 'fila');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral em ' + largura);
    // sobreposição: o seletor não encosta nos botões de cima
    const a = await p.getByTestId('box-salvar').boundingBox();
    const c = await sel.boundingBox();
    assert.ok(c.y >= a.y + a.height, 'seletor abaixo dos botões em ' + largura);
    if (pasta) await p.screenshot({ path: `${pasta}/modo-box-${largura}.png`, fullPage: false });
    await ctx.close();
  }
  assert.deepEqual(erros, []);
  console.log('e2e137 ok');
} finally {
  await b.close();
}
