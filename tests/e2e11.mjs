// Cliente com número novo e CPF já cadastrado: o WhatsApp pede autorização; só o proprietário/admin libera na tela de Clientes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { waServico, waVeiculoExistente, waVeiculoNovo } from './e2e-util.mjs';
const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
const chip = (nome) => p.locator('[data-testid=wa-chips]').getByRole('button', { name: nome });
const ultimaDoBot = () => p.locator('[data-testid=wa-msgs] .wa-linha.bot .wa-balao').last().innerText();
async function profissionalSeHouver() { await p.waitForTimeout(200); if (/Com qual esteticista/.test(await ultimaDoBot())) await p.locator('[data-testid=wa-chips] button').first().click(); }

// 1) o cliente chega por um número novo e informa o CPF do Igor (o simulador de WhatsApp fica dentro do painel logado)
await T('demo-davi').click();
await T('nav-mensagens').click(); // o simulador de WhatsApp só existe na tela Mensagens
await T('wa-quem').selectOption('p:novo');
await T('wa-input').fill('oi'); await T('wa-input').press('Enter');
await chip('Agendar horário').click();
await waVeiculoNovo(p);
await waServico(p, 'Lavagem detalhada', 'Lavagem');
await p.locator('[data-testid=wa-chips] button').first().click();
await p.locator('[data-testid=wa-chips] button').first().click();
await profissionalSeHouver();
await p.getByText('qual é o seu nome ou apelido').first().waitFor();
await T('wa-input').fill('Igor'); await T('wa-input').press('Enter');
await T('wa-input').fill('50397612877'); await T('wa-input').press('Enter');
await chip('Pular').click();
await chip('Sim, agendar').click();
await p.getByText(/precisa liberar o seu cadastro/).first().waitFor();
assert.equal(await p.getByText(/Agendado!/).count(), 0, 'não pode agendar antes da autorização');
const corpoWa = await T('wa-msgs').innerText();
assert.ok(!/Filipin/.test(corpoWa), 'a conversa não pode revelar o dono do CPF');
console.log('✓ número novo com CPF existente fica aguardando liberação');

// 2) esteticista não vê os pedidos
await T('sair').click();
await T('demo-pablo').click();
await T('nav-clientes').click();
assert.equal(await T('pedidos-vinculo').count(), 0, 'esteticista não deve ver pedidos');
await T('sair').click();

// 3) proprietário vê o pedido, o aviso e aprova
await T('demo-davi').click();
await T('nav-clientes').click();
await T('pedidos-vinculo').waitFor();
const card = await T('pedidos-vinculo').innerText();
assert.ok(/Igor Filipin/.test(card) && /503\.\*\*\*\.\*\*\*-77/.test(card), card);
assert.ok(!/503\.976/.test(card), 'CPF completo não pode aparecer');
await p.locator('[data-testid^=aprovar-]').first().click();
await p.getByText(/Quem usa o número novo passa a ter acesso/).waitFor();
await T('confirmar-vinculo').click();
await p.waitForTimeout(300);
const tabela = await p.locator('table').innerText();
assert.ok(/antes: \(54\) 99633-8812/.test(tabela), tabela);
assert.equal(await p.locator('[data-testid^=aprovar-]').count(), 0);
console.log('✓ proprietário aprova na tela de Clientes e o telefone antigo fica registrado');

// 4) agora o cliente consegue agendar pelo número novo
await T('nav-mensagens').click(); // o simulador de WhatsApp só existe na tela Mensagens
await T('wa-input').fill('oi'); await T('wa-input').press('Enter');
await p.waitForTimeout(200);
await chip('Agendar horário').click();
await waVeiculoExistente(p);
await waServico(p, 'Lavagem detalhada', 'Lavagem');
await p.locator('[data-testid=wa-chips] button').first().click();
await p.locator('[data-testid=wa-chips] button').first().click();
await profissionalSeHouver();
await chip('Sim, agendar').click();
await p.getByText(/Agendado/).first().waitFor();
console.log('✓ depois de liberado, o cliente agenda pelo número novo');
console.log('erros', erros);
assert.equal(erros.length, 0, erros.join('\n'));
await b.close();
