// Ausência do box (G2) na demonstração da estética: lançar em Estabelecimento > Boxes, aparecer na lista, remover; 390 e 1366 px sem rolagem lateral.
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
    await p.getByTestId('ausencia-box').waitFor();
    assert.equal(await p.getByTestId('ausencia-box-vazia').count(), 1, 'começa sem ausência');
    await p.getByTestId('ausencia-box-de').fill('2026-10-14');
    await p.getByTestId('ausencia-box-ate').fill('2026-10-16');
    await p.getByTestId('ausencia-box-motivo').fill('Manutenção do compressor');
    await p.getByTestId('ausencia-box-registrar').click();
    await p.getByTestId('ausencia-box-aviso').waitFor();
    assert.equal(await p.getByTestId('ausencia-box-vazia').count(), 0);
    assert.match(await p.getByTestId('ausencia-box-lista').innerText(), /14\/10 a 16\/10.*Manutenção do compressor/);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral em ' + largura);
    if (pasta) { await p.getByTestId('ausencia-box').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${pasta}/g2-ausencia-box-${largura}.png` }); }
    // erro nesta tela não vaza para outra aba
    await p.getByTestId('ausencia-box-de').fill('2026-10-20');
    await p.getByTestId('ausencia-box-ate').fill('2026-10-18');
    await p.getByTestId('ausencia-box-registrar').click().catch(() => {});
    await p.getByRole('tab', { name: 'Dados' }).click();
    assert.equal(await p.getByTestId('ausencia-box-erro').count(), 0, 'erro some ao trocar de aba');
    await p.getByRole('tab', { name: 'Boxes' }).click();
    await p.locator('[data-testid^="ausencia-box-remover-"]').first().click();
    await p.getByTestId('ausencia-box-vazia').waitFor();
    await ctx.close();
  }
  assert.deepEqual(erros, []);
  console.log('Ausência do box (demonstração): lançar, listar e remover passaram (390 e 1366).');
} finally { await b.close(); }
