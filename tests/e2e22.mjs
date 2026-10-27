// Agenda: escolha única de esteticista (clicar troca, não soma) e padrão de quem está logado.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// O seletor de profissionais é único e recolhe ao escolher: abre a lista se estiver fechada e devolve o item.
const filtroProf = async (p, id) => { const it = p.getByTestId(`filtro-${id}`); if (!(await it.isVisible().catch(() => false))) await p.getByTestId('filtro-abrir').click(); return it; };

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(url);
const T = (id) => p.getByTestId(id);
const marcados = async () => { await filtroProf(p, 'u-davi'); return p.locator('.seletor-item[aria-selected="true"]').count(); };

await T('demo-davi').click();
await T('filtro-abrir').waitFor();
assert.equal(await (await filtroProf(p, 'u-davi')).getAttribute('aria-pressed'), 'true', 'abre na agenda de quem está logado');
assert.equal(await marcados(), 1);
assert.equal(await T('filtro-qualquer').count(), 0, 'não existe "Qualquer"');
await (await filtroProf(p, 'u-pablo')).click();
assert.equal(await (await filtroProf(p, 'u-pablo')).getAttribute('aria-pressed'), 'true');
assert.equal(await (await filtroProf(p, 'u-davi')).getAttribute('aria-pressed'), 'false', 'trocou, não somou');
await (await filtroProf(p, 'u-marcelo')).click();
assert.equal(await marcados(), 1, 'sempre um só');
assert.equal(await (await filtroProf(p, 'u-marcelo')).getAttribute('aria-pressed'), 'true');
await (await filtroProf(p, 'u-marcelo')).click();
assert.equal(await (await filtroProf(p, 'u-marcelo')).getAttribute('aria-pressed'), 'true', 'clicar de novo no mesmo não desmarca');
// escolha lembrada
await T('sair').click();
await p.goto(url);
await T('demo-davi').click();
assert.equal(await (await filtroProf(p, 'u-marcelo')).getAttribute('aria-pressed'), 'true', 'a escolha continua');
// esteticista logado: só a própria agenda
await T('sair').click();
await T('demo-pablo').click();
await T('filtro-u-pablo').waitFor();
assert.equal(await p.locator('[data-testid^="filtro-u-"]').count(), 1);
await b.close();
assert.deepEqual(erros, [], 'sem erros no console: ' + erros.join(' | '));
console.log('e2e22 ok');
