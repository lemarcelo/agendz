/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B9c: o proprietário tira o campo "quem vai fazer o serviço" (Estabelecimento > Regras): o campo some do Atender e do link do cliente, e o atendimento é salvo sem escolher.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

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

// padrão: o campo aparece
await T('atender').click(); await T('salvar-atender').waitFor();
assert.equal(await T('atender-profissional').count(), 1);
await p.keyboard.press('Escape'); await T('salvar-atender').waitFor({ state: 'detached' });
ok('padrão: o Atender pergunta quem faz o serviço');

// liga a regra
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('regras-profissional-auto').check({ force: true });
await p.getByText('O app escolhe quem faz o serviço.').last().waitFor();

// Atender sem o campo e salvando sem escolher
await T('nav-agenda').click(); await T('agenda-topo').waitFor();
await T('atender').click(); await T('salvar-atender').waitFor();
assert.equal(await T('atender-profissional').count(), 0, 'o campo some');
await T('atender-srv-s-vitrificacao').check();
await salvarAtender(p);
await T('salvar-atender').waitFor({ state: 'detached' });
ok('Atender sem o campo salva e o app escolhe quem atende');

// desliga: o campo volta
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('regras-profissional-auto').uncheck({ force: true });
await p.getByText('Quem faz o serviço volta a ser escolhido na tela.').last().waitFor();
await T('nav-agenda').click(); await T('agenda-topo').waitFor();
await T('atender').click(); await T('salvar-atender').waitFor();
assert.equal(await T('atender-profissional').count(), 1);
ok('desligada: o campo volta');

assert.deepEqual(erros, []);
await b.close();
console.log('e2e110 ok');
