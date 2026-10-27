// Atender: botão de calendário (Agora x data), lista de clientes com busca em tempo real e 10 por página, telefone existente sobrescreve o cliente e completa o nome.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index-barbearia.html', import.meta.url).href);
const T = (id) => p.getByTestId(id);
const ok = (m) => console.log('✓', m);

await T('demo-alan').click();
// cadastra 24 clientes para ter mais de uma página
await T('nav-clientes').click();
for (let i = 1; i <= 24; i++) {
  await p.getByRole('button', { name: /Novo cliente/ }).click();
  await p.getByLabel(/^Nome/).first().fill(`Cliente Teste ${String(i).padStart(2, '0')}`);
  await p.getByLabel(/Telefone/).first().fill(`5199000${String(1000 + i)}`);
  await p.getByRole('button', { name: 'Salvar' }).click();
}
await T('nav-agenda').click();
await T('atender').click();

// 1) Quando: "Agora" já marcado; botão de calendário abre data e hora; Agora volta
assert.equal(await T('atender-agora').getAttribute('aria-pressed'), 'true');
assert.equal(await T('atender-data').count(), 0);
await T('atender-quando').click();
await T('atender-data').waitFor();
assert.equal(await T('atender-quando').getAttribute('aria-pressed'), 'true');
await T('atender-data').fill('2026-10-14');
assert.match(await T('atender-tipo').innerText(), /agendamento|futuro/i);
await T('atender-agora').click();
assert.equal(await T('atender-data').count(), 0);
assert.match(await T('atender-tipo').innerText(), /agora/i);
ok('Quando: Agora pré-selecionado e botão de calendário para o futuro');

// 2) lista de clientes: busca em tempo real e 10 por página
await T('atender-cliente-abrir').click();
const itens = () => p.locator('[data-testid^="atender-cliente-"][role=option]').count();
assert.equal(await itens(), 10, 'no máximo 10 por vez');
assert.match(await T('atender-cliente-pag').innerText(), /1–10 de \d+/);
await T('atender-cliente-prox').click();
assert.match(await T('atender-cliente-pag').innerText(), /11–\d+ de/);
await T('atender-cliente-ant').click();
await T('atender-cliente-busca').fill('teste 17');
assert.equal(await itens(), 1, 'filtra enquanto digita');
await T('atender-cliente-busca').fill('51990001024');
assert.equal(await itens(), 1, 'busca pelo telefone');
await T('atender-cliente-busca').fill('xyzxyz');
await T('atender-cliente-vazio').waitFor();
await T('atender-cliente-busca').fill('teste 05');
await p.locator('[data-testid^="atender-cliente-"][role=option]').first().click();
assert.match(await T('atender-cliente-atual').innerText(), /Teste 05/);
assert.equal(await T('atender-nome').inputValue(), 'Cliente Teste 05');
assert.match(await T('atender-telefone').inputValue(), /99000-1005/);
ok('lista de clientes: busca ao vivo e paginação de 10');

// 3) telefone de outro cadastro sobrescreve o cliente escolhido; nome mais completo atualiza o cadastro
await T('atender-telefone').fill('51990001010');
assert.match(await T('atender-cliente-atual').innerText(), /Teste 10/, 'o cliente do telefone passou a ser o do atendimento');
assert.match(await T('atender-vinculo').innerText(), /Teste 10/);
await T('atender-nome').fill('Cliente Teste 10 da Silva');
assert.match(await T('atender-vinculo').innerText(), /será atualizado/);
await p.locator('[data-testid^="atender-srv-"]').first().check();
await T('salvar-atender').click(); await T('salvar-atender').waitFor({ state: 'detached' });
await T('nav-clientes').click();
assert.ok((await p.getByText('Cliente Teste 10 da Silva').count()) >= 1, 'cadastro atualizado com o nome mais completo');
assert.equal(await p.getByText('Cliente Teste 05').count() > 0, true);
ok('telefone existente sobrescreve o cliente e completa o nome do cadastro');
console.log('erros', erros);
assert.deepEqual(erros, []);
await b.close();
