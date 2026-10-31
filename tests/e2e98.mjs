/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v124: preço = base do serviço × fator do porte. Em Estabelecimento > Portes o dono define o fator e vê a prévia dos serviços (com busca por nome);
// no serviço, a seção "Preço específico por porte" vale no lugar do fator.
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

// 1) serviço só com o preço base: os outros portes saem do fator
await T('nav-servicos').click();
await T('novo-servico').click();
await T('srv-nome').fill('Cera premium');
await T('srv-preco-medio').fill('100'); await T('srv-dur-medio').fill('60');
assert.equal(await T('srv-especifico').count(), 1, 'seção Preço específico por porte');
assert.match(await T('srv-especifico').innerText(), /Preço específico por porte/);
assert.equal(await T('srv-preco-grande').getAttribute('placeholder'), 'Fator: R$ 120,00');
await T('salvar-servico').click(); await T('salvar-servico').waitFor({ state: 'detached' });
assert.match(await p.locator('article', { hasText: 'Cera premium' }).first().innerText(), /R\$\s*90,00 a R\$\s*140,00/, 'faixa = base × fator de cada porte');
ok('serviço: preço base + fator (0,9 a 1,4)');

// 2) fator no porte + prévia com busca
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Portes' }).click();
await T('painel-portes').waitFor();
assert.equal(await T('porte-fator-1').isDisabled(), true, 'o Médio é a base (fator 1)');
assert.equal(await T('porte-fator-1').inputValue(), '1');
await T('porte-fator-0').fill('0,8');
await T('porte-previa-busca').fill('cera prem');
const item = p.locator('[data-testid^="porte-previa-"][data-testid$="-pequeno"]');
assert.equal(await item.count(), 1, 'a busca deixa só o serviço pesquisado');
assert.match(await item.first().innerText(), /R\$\s*80,00/, '100 × 0,8');
await T('porte-fator-0').fill('1,25');
assert.match(await item.first().innerText(), /R\$\s*125,00/, 'a prévia acompanha o fator enquanto se digita');
await T('porte-previa-busca').fill('zzzz');
assert.equal(await T('porte-previa-vazio').count(), 1);
await T('porte-previa-busca').fill('');
assert.ok(await p.locator('[data-testid="porte-previa"] .previa-portes-item').count() >= 1);
ok('porte: fator e prévia dos serviços com busca');

// 3) fator inválido não salva; válido salva
await T('porte-fator-0').fill('11');
await T('porte-salvar').click();
assert.match(await T('portes-erro').innerText(), /fator do porte Pequeno vai de 0,10 a 10/);
await T('porte-fator-0').fill('1,25');
await T('porte-salvar').click(); await p.getByText('Portes salvos.').last().waitFor();
assert.equal(await T('porte-fator-0').inputValue(), '1,25');
ok('porte: fator fora da faixa recusado; salvo');

// 4) preço específico vence o fator
await T('nav-servicos').click();
await p.getByRole('button', { name: 'Editar Cera premium', exact: true }).click();
assert.equal(await T('srv-preco-pequeno').getAttribute('placeholder'), 'Fator: R$ 125,00');
await T('srv-preco-pequeno').fill('77');
await T('salvar-servico').click(); await T('salvar-servico').waitFor({ state: 'detached' });
assert.match(await p.locator('article', { hasText: 'Cera premium' }).first().innerText(), /R\$\s*77,00 a R\$\s*140,00/);
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Portes' }).click();
await T('porte-previa-busca').fill('cera prem');
assert.match(await p.locator('[data-testid^="porte-previa-"][data-testid$="-pequeno"]').first().innerText(), /R\$\s*77,00[\s\S]*preço específico/);
ok('serviço: preço específico por porte vale no lugar do fator');

assert.deepEqual(erros, []);
await b.close();
console.log('e2e98 ok');
