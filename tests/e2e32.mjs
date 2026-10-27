// Demonstração: seletor de tipo na tela de login. Barbearia sem veículo/box e com tema próprio; voltar para a estética recria a loja de exemplo.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(url);
const T = (id) => p.getByTestId(id);
const tipoHtml = () => p.evaluate(() => document.documentElement.getAttribute('data-tipo'));

// padrão: estética (Apex), com o seletor visível
assert.equal(await tipoHtml(), 'estetica_automotiva');
assert.equal(await T('demo-loja-apex').getAttribute('aria-pressed'), 'true');
assert.match(await p.locator('.login-cartao h1').innerText(), /Apex/);
console.log('✓ padrão: estética');

// barbearia: loja nova, rótulos, sem veículo e sem box
await T('demo-loja-dalforno').click();
assert.match(await p.locator('.login-cartao h1').innerText(), /Barbearia Dalforno/);
assert.equal(await tipoHtml(), 'barbearia');
await T('demo-alan').click();
await T('nav-agenda').waitFor();
await T('atender').click();
await T('atender-lista-servicos').waitFor();
await T('atender-srv-s-tesoura').check();
assert.equal(await T('atender-veiculo').count(), 0, 'Atender sem campos de veículo');
assert.equal(await T('atender-box').count(), 0, 'Atender sem box');
await p.keyboard.press('Escape');
await T('nav-clientes').click();
const cab = await p.locator('table.tabela thead th').allTextContents();
assert.ok(!cab.includes('Veículos'), 'sem coluna de veículos: ' + cab.join('|'));
await T('nav-estab').click();
const abas = await p.locator('.abas button').allTextContents();
assert.ok(!abas.includes('Boxes'), 'sem aba de boxes: ' + abas.join('|'));
assert.equal(await T('est-tipo').inputValue(), 'Barbearia');
assert.ok(await T('est-tipo').isDisabled(), 'o tipo não muda depois de criado');
const corpo = await p.locator('body').innerText();
assert.ok(!/esteticista|veículo|\bbox\b/i.test(corpo), 'nenhum rótulo de estética na barbearia');
console.log('✓ barbearia: loja nova, sem veículo nem box, tipo só leitura');

// a escolha fica gravada no navegador
await p.reload();
assert.equal(await tipoHtml(), 'barbearia');
assert.match(await p.locator('.login-cartao h1').innerText(), /Barbearia Dalforno/);
console.log('✓ escolha lembrada ao recarregar');

// volta para a estética
await T('demo-loja-apex').click();
assert.match(await p.locator('.login-cartao h1').innerText(), /Apex/);
assert.equal(await tipoHtml(), 'estetica_automotiva');
console.log('✓ volta para a estética');

assert.deepEqual(erros, [], 'erros no navegador: ' + erros.join(' | '));
await b.close();
console.log('e2e32 ok');
