// XSS e login: nomes maliciosos são exibidos como texto; bloqueio de login após erros.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
const XSS = '<img src=x onerror="window.__xss=1;alert(1)"><script>window.__xss=2</script>';
await T('demo-davi').click();
await T('nav-clientes').click();
await T('novo-cliente').click();
await T('cli-nome').fill(XSS);
await T('cli-tel').fill('55999990000');
await T('salvar-cliente').click();
await p.waitForTimeout(300);
const corpo = await p.locator('body').innerText();
assert.ok(corpo.includes('<img src=x'), 'o nome deve aparecer como texto');
assert.equal(await p.evaluate(() => window.__xss), undefined, 'script executou');
assert.equal(await p.locator('img[src="x"]').count(), 0, 'tag img foi interpretada');
console.log('✓ nome malicioso aparece como texto, sem executar');
// serviço com nome malicioso
await p.locator('[data-testid="nav-servicos"]').click();
await p.getByRole('button', { name: /novo serviço/i }).click();
await p.locator('input').first().fill(XSS);
await p.waitForTimeout(100);
assert.equal(await p.evaluate(() => window.__xss), undefined);
await p.keyboard.press('Escape');
// login: bloqueio após 5 erros
await T('sair').click().catch(async () => { await p.getByRole('button', { name: /sair/i }).click(); });
for (let i = 0; i < 5; i++) {
  await p.locator('input').first().fill('davi');
  await p.locator('input[type="password"]').fill('errada' + i);
  await p.getByRole('button', { name: /^entrar$/i }).click();
}
await p.locator('input[type="password"]').fill('1234');
await p.getByRole('button', { name: /^entrar$/i }).click();
const txt = await p.locator('body').innerText();
assert.ok(/Muitas tentativas/.test(txt), 'bloqueio não apareceu');
console.log('✓ login bloqueado após 5 erros');
console.log('erros', erros);
assert.deepEqual(erros, []);
await b.close();
