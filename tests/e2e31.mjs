// Agendz: nome da plataforma no rodapé (login e página do cliente) e tipo de estabelecimento só para leitura em Estabelecimento.
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

// título da aba e rodapé do login: o nome da plataforma, não o da loja
assert.equal(await p.title(), 'Agendz', 'título da aba');
assert.equal((await T('rodape-plataforma').innerText()).trim(), 'Agendz', 'rodapé do login');
assert.ok(!/Agendz/.test(await p.locator('.login-cartao h1').innerText()), 'o título do login é o nome da loja');
console.log('✓ título e rodapé do login');

// tipo da loja: só leitura em Estabelecimento > Dados
await T('demo-davi').click();
await T('nav-estab').click();
const tipo = T('est-tipo');
assert.equal(await tipo.inputValue(), 'Estética automotiva');
assert.ok(await tipo.isDisabled(), 'o tipo não pode ser editado');
console.log('✓ tipo só para leitura');

// o texto da equipe usa o rótulo do tipo (esteticista) e nunca o nome de outra loja
const corpo = await p.locator('body').innerText();
assert.ok(!/barbeiro/i.test(corpo), 'sem rótulo de outro tipo na tela');
console.log('✓ rótulos do tipo');

// página do cliente: rodapé da plataforma e nome da loja no texto
await p.evaluate(() => { location.hash = 'agendar'; });
await T('pagina-publica').waitFor();
assert.equal((await T('rodape-plataforma').innerText()).trim(), 'Agendz', 'rodapé da página do cliente');
console.log('✓ rodapé da página do cliente');

assert.deepEqual(erros, [], 'erros no navegador: ' + erros.join(' | '));
await b.close();
console.log('e2e31 ok');
