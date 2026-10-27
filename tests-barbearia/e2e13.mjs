// Cliente cancela pelo WhatsApp (só com 24 h ou mais): opção em "Meus horários", confirmação e aviso no painel; a lista de opções fica toda clicável.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // relógio fixo: o resultado não depende da hora em que o teste roda
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index-barbearia.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
const chip = (nome) => p.locator('[data-testid=wa-chips]').getByRole('button', { name: nome });

await T('demo-alan').click();
await T('nav-mensagens').click(); // o simulador de WhatsApp só existe na tela Mensagens
await T('wa-quem').selectOption('c:c-marcelo');
await T('wa-input').fill('oi'); await T('wa-input').press('Enter');
await chip('Meus horários').click();
await chip(/\d\d\/\d\d \d\d:\d\d/).last().click(); // o mais distante da lista (sempre dentro do prazo de cancelamento)
await chip('Cancelar horário').waitFor();
console.log('✓ o horário escolhido oferece Cancelar quando faltam 24 h ou mais');
await chip('Cancelar horário').click();
await p.getByText(/Cancelar o horário de/).first().waitFor();
await chip('Não, manter').click();
await p.getByText('o horário foi mantido').first().waitFor();
console.log('✓ "Não, manter" não cancela');
await T('wa-input').fill('cancelar'); await T('wa-input').press('Enter');
await p.getByText(/Qual horário você quer cancelar|Cancelar o horário de/).first().waitFor();
if (await p.getByText('Qual horário você quer cancelar?').count()) await p.locator('[data-testid=wa-chips] button').first().click();
await chip('Sim, cancelar').click();
await p.getByText(/cancelado\. Quando quiser/).first().waitFor();
console.log('✓ cliente cancela com confirmação');
await T('nav-avisos').click();
await p.getByText(/cancelou o horário/).first().waitFor();
console.log('✓ o painel é avisado do cancelamento');
assert.deepEqual(erros, [], erros.join('\n'));
await b.close();
