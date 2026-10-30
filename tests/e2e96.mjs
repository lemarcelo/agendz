/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v122: o dono cadastra os portes (tamanhos de veículo) em Estabelecimento > Portes: novo porte, ordem, desativar; o Atender, o cadastro do cliente e o link do cliente usam a lista da loja.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
const ok = (m) => console.log('✓', m);
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(url);
const T = (id) => p.getByTestId(id);

await T('demo-davi').click(); await T('agenda-topo').waitFor();
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Portes' }).click();
await T('painel-portes').waitFor();
assert.equal(await p.locator('[data-testid^="porte-nome-"]').count(), 5);
assert.equal(await T('porte-ativo-1').isDisabled(), true, 'o Médio não desativa');

// novo porte, sobe uma posição, e o erro de nome repetido aparece sem salvar
await T('porte-add').click();
await T('porte-nome-5').fill('Van'); await T('porte-exemplo-5').fill('Ex.: Sprinter');
await T('porte-sobe-5').click();
await T('porte-nome-4').fill('MÉDIO');
await T('porte-salvar').click();
assert.match(await T('portes-erro').innerText(), /duas vezes/);
await T('porte-nome-4').fill('Van');
await T('porte-salvar').click();
await p.getByText('Portes salvos.').last().waitFor();
assert.equal(await T('porte-nome-4').inputValue(), 'Van');
ok('Portes: novo porte com exemplo, ordem e nome repetido recusado');

// o Atender oferece o porte novo; o cadastro do cliente também
await T('nav-agenda').click(); await T('agenda-topo').waitFor();
await T('atender').click();
await T('atender-srv-s-vitrificacao').check();
const opcoes = await T('atender-porte').locator('option').allInnerTexts();
assert.ok(opcoes.includes('Van'), `Atender: ${opcoes.join(', ')}`);
await p.keyboard.press('Escape'); await T('salvar-atender').waitFor({ state: 'detached' });
ok('Atender oferece o porte cadastrado');

// desativar o Van: some das escolhas e do link
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Portes' }).click();
await T('porte-ativo-4').uncheck();
await T('porte-salvar').click(); await p.getByText('Portes salvos.').last().waitFor();
await T('sair').click(); await T('login-id').waitFor();
await p.evaluate(() => { location.hash = 'agendar'; });
await T('pagina-publica').waitFor();
assert.equal(await T('pub-porte-medio').count(), 1);
assert.equal(await p.locator('[data-testid^="pub-porte-"]').count(), 5, 'o link mostra só os portes ativos');
assert.equal(await p.locator('.pub-porte b', { hasText: /^Van$/ }).count(), 0, 'o Van desativado não aparece');
ok('link do cliente: só portes ativos');

assert.deepEqual(erros, []);
await b.close();
console.log('e2e96 ok');
