/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v123: ordem dos serviços — setas subir/descer na lista de Serviços e a regra "Mais usados / Minha ordem" (Estabelecimento > Regras) mudam a ordem do Atender.
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
const nomesDosCartoes = () => p.locator('.card-serv h3').allInnerTexts();
const nomesNoAtender = async () => (await p.locator('[data-testid^="atender-srv-"]').evaluateAll((els) => els.map((e) => e.closest('label')?.innerText.split('\n')[0].trim()))).filter(Boolean);

await T('demo-davi').click(); await T('agenda-topo').waitFor();
await T('nav-servicos').click();
await T('novo-servico').waitFor();
const antes = await nomesDosCartoes();
assert.ok(antes.length >= 3);
assert.equal(await p.locator('[data-testid^="srv-sobe-"]').first().isDisabled(), true, 'o primeiro não sobe');

// desce o primeiro: ele passa a ser o segundo
await p.locator('[data-testid^="srv-desce-"]').first().click();
const depois = await nomesDosCartoes();
assert.equal(depois[1], antes[0]);
assert.equal(depois[0], antes[1]);
ok('Serviços: seta troca o serviço de lugar');

// regra "Minha ordem": o Atender segue a lista de Serviços
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('regras-ordem-servicos').selectOption('manual');
await p.getByText('Ordem dos serviços salva.').last().waitFor();
await T('nav-agenda').click(); await T('agenda-topo').waitFor();
await T('atender').click();
await T('salvar-atender').waitFor();
const noAtender = await nomesNoAtender();
assert.ok(noAtender.length >= 3, `Atender: ${noAtender.join(', ')}`);
assert.equal(noAtender[0].startsWith(depois[0]), true, `primeiro do Atender deveria ser ${depois[0]}, veio ${noAtender[0]}`);
await p.keyboard.press('Escape'); await T('salvar-atender').waitFor({ state: 'detached' });
ok('Atender segue a ordem do dono');

// volta para "Mais usados": a regra fica salva
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('regras-ordem-servicos').selectOption('uso');
await p.getByText('Ordem dos serviços salva.').last().waitFor();
assert.equal(await T('regras-ordem-servicos').inputValue(), 'uso');
ok('Regra Mais usados primeiro');

assert.deepEqual(erros, []);
await b.close();
console.log('e2e97 ok');
