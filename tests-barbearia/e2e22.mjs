// Agenda: escolha única de barbeiro (clicar troca, não soma) e padrão de quem está logado.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index-barbearia.html', import.meta.url).href;
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(url);
const T = (id) => p.getByTestId(id);
const marcados = () => p.locator('.filtros .filtro[aria-pressed="true"]').count();

await T('demo-alan').click();
await T('filtro-u-alan').waitFor();
assert.equal(await T('filtro-u-alan').getAttribute('aria-pressed'), 'true', 'abre na agenda de quem está logado');
assert.equal(await marcados(), 1);
assert.equal(await T('filtro-qualquer').count(), 0, 'não existe "Qualquer"');
await T('filtro-u-kiko').click();
assert.equal(await T('filtro-u-kiko').getAttribute('aria-pressed'), 'true');
assert.equal(await T('filtro-u-alan').getAttribute('aria-pressed'), 'false', 'trocou, não somou');
await T('filtro-u-tailuan').click();
assert.equal(await marcados(), 1, 'sempre um só');
assert.equal(await T('filtro-u-tailuan').getAttribute('aria-pressed'), 'true');
await T('filtro-u-tailuan').click();
assert.equal(await T('filtro-u-tailuan').getAttribute('aria-pressed'), 'true', 'clicar de novo no mesmo não desmarca');
// escolha lembrada
await T('sair').click();
await p.goto(url);
await T('demo-alan').click();
assert.equal(await T('filtro-u-tailuan').getAttribute('aria-pressed'), 'true', 'a escolha continua');
// barbeiro logado: só a própria agenda
await T('sair').click();
await T('demo-kiko').click();
await T('filtro-u-kiko').waitFor();
assert.equal(await p.locator('[data-testid^="filtro-u-"]').count(), 1);
await b.close();
assert.deepEqual(erros, [], 'sem erros no console: ' + erros.join(' | '));
console.log('e2e22 ok');
