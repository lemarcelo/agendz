// A loja (e portanto o tipo, os dados e a marca) vem do endereço; endereço desconhecido não cai em loja padrão; sem logo = ícone do tipo.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const base = new URL('../dist/index.html', import.meta.url).href;
async function abrir(qs = '') {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(base + qs); return p;
}

// ?loja=dalforno: barbearia, sem seletor, marca = ícone (nunca a logo da Apex)
let p = await abrir('?loja=dalforno');
let T = (id) => p.getByTestId(id);
assert.equal(await p.locator('html').getAttribute('data-tipo'), 'barbearia');
assert.match(await p.locator('.login-cartao h1').innerText(), /Dalforno/);
assert.equal(await T('demo-tipos').count(), 0, 'loja decidida pelo endereço não oferece seletor');
assert.equal(await T('logo-marca').count(), 0, 'sem logo da Apex na barbearia');
assert.ok(await T('marca-icone').count(), 'ícone da marca do tipo');
console.log('✓ ?loja=dalforno');

// ?loja=offbox: outra barbearia, nome próprio
p = await abrir('?loja=offbox'); T = (id) => p.getByTestId(id);
assert.equal(await p.locator('html').getAttribute('data-tipo'), 'barbearia');
assert.match(await p.locator('.login-cartao h1').innerText(), /Offbox/);
assert.ok(!/Dalforno/.test(await p.locator('body').innerText()), 'sem rastro da Dalforno');
console.log('✓ ?loja=offbox');

// ?loja=apex: estética com a logo dela
p = await abrir('?loja=apex'); T = (id) => p.getByTestId(id);
assert.equal(await p.locator('html').getAttribute('data-tipo'), 'estetica_automotiva');
assert.ok(await T('logo-marca').count(), 'a Apex mostra a logo dela');
assert.equal(await T('demo-tipos').count(), 0);
console.log('✓ ?loja=apex');

// loja inexistente: tela de erro, sem dado de ninguém
p = await abrir('?loja=nao-existe'); T = (id) => p.getByTestId(id);
await T('loja-nao-encontrada').waitFor();
const txt = await p.locator('body').innerText();
assert.ok(!/Apex|Dalforno|Davi|Alan/.test(txt), 'não mostra dado de loja nenhuma');
console.log('✓ loja inexistente');

// sem pista no endereço: seletor da demonstração; cada loja guarda o próprio estado e a marca muda junto
p = await abrir(); T = (id) => p.getByTestId(id);
await T('demo-davi').click();
await T('nav-clientes').click();
const nClientesApex = await p.locator('tbody tr').count();
await p.evaluate(() => { location.hash = ''; });
await T('sair').click();
await T('demo-loja-dalforno').click();
assert.equal(await T('logo-marca').count(), 0, 'trocar de loja troca a marca');
assert.ok(await T('marca-icone').count());
await T('demo-alan').click();
await T('nav-servicos').click();
// o menu Serviços usa o ícone do tipo (tesoura) e o da estética usa pincel: compara o desenho do ícone
const iconeBarb = await p.getByTestId('nav-servicos').locator('svg path').first().getAttribute('d');
await T('sair').click();
await T('demo-loja-apex').click();
await T('demo-davi').click();
const iconeEst = await p.getByTestId('nav-servicos').locator('svg path').first().getAttribute('d');
assert.notEqual(iconeBarb, iconeEst, 'ícone do menu Serviços por tipo');
await T('nav-clientes').click();
assert.equal(await p.locator('tbody tr').count(), nClientesApex, 'a Apex voltou com os mesmos dados (estado por loja)');
console.log('✓ seletor da demonstração: marca, ícone e dados por loja');

assert.deepEqual(erros, [], 'erros no navegador: ' + erros.join(' | '));
await b.close();
console.log('e2e33 ok');
