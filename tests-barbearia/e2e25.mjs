// Atender: um só botão. Agora, passado e futuro; cadastro automático por telefone; campos obrigatórios configuráveis; clique em horário vazio.
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
const salvar = async () => { await T('salvar-atender').click(); await T('salvar-atender').waitFor({ state: 'detached' }); };
const primeiroServico = () => p.locator('[data-testid^="atender-srv-"]').first().check();

await T('demo-alan').click();
assert.equal(await p.getByRole('button', { name: /Atendimento local|Novo agendamento/ }).count(), 0, 'os dois botões antigos sumiram');
assert.equal(await T('atender').count(), 1);
ok('um só botão Atender');

// 1) agora, sem nenhum dado: só o serviço é obrigatório
await T('atender').click();
assert.match(await T('atender-tipo').innerText(), /agora/i);
await T('salvar-atender').click();
assert.match(await p.locator('[role=dialog], .modal').first().innerText(), /ao menos um serviço ou um produto/i);
await primeiroServico();
assert.match(await T('salvar-atender').innerText(), /Registrar/);
await salvar();
ok('atendimento de agora só com o serviço');

// 2) só o nome não cria cadastro; só o telefone cria
await T('atender').click();
await primeiroServico();
await T('atender-nome').fill('Fulano Sem Fone');
await salvar();
await T('atender').click();
await primeiroServico();
await T('atender-telefone').fill('51 99999-1111');
await salvar();
await T('nav-clientes').click();
assert.equal(await p.getByText('Fulano Sem Fone').count(), 0, 'só nome não cria cadastro');
assert.ok((await p.getByText('(51) 99999-1111').count()) >= 1, 'só telefone cria cadastro');
ok('cadastro nasce só com telefone; nome sozinho não cria');

// 3) data passada vira atendimento concluído; futura vira agendamento (exige nome e telefone)
await T('nav-agenda').click();
await T('atender').click();
await primeiroServico();
await T('atender-quando').click();
await T('atender-data').fill('2026-10-10');
await T('hora-h').fill('10'); await T('hora-m').fill('00');
await T('atender-motivo-retro').fill('Esqueci de lançar ontem');
assert.match(await T('atender-tipo').innerText(), /concluído|registra/i);
assert.match(await T('salvar-atender').innerText(), /Registrar/);
await salvar();
ok('data passada registra atendimento');

await T('atender').click();
await primeiroServico();
await T('atender-quando').click();
await T('atender-data').fill('2026-10-14');
await T('hora-h').fill('10'); await T('hora-m').fill('00');
assert.match(await T('salvar-atender').innerText(), /Agendar/);
await T('salvar-atender').click();
assert.match(await p.locator('[role=dialog], .modal').first().innerText(), /nome|telefone/i, 'agendamento futuro pede nome e telefone');
await T('atender-nome').fill('Beto Futuro');
await T('atender-telefone').fill('51 98888-2222');
await salvar();
await T('nav-clientes').click();
assert.ok((await p.getByText('Beto Futuro').count()) >= 1, 'agendamento futuro cria o cadastro');
ok('data futura agenda e cria o cadastro');

// 4) campos obrigatórios configuráveis (atendimento local: nome)
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('campos-obrigatorios').waitFor();
await T('obrig-local-nome').check();
await T('nav-agenda').click();
await T('atender').click();
await primeiroServico();
await T('salvar-atender').click();
assert.match(await p.locator('[role=dialog], .modal').first().innerText(), /nome/i, 'nome passou a ser obrigatório no atendimento local');
await T('atender-nome').fill('Com Nome');
await salvar();
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('obrig-local-nome').uncheck();
ok('campos obrigatórios configuráveis');

// 5) o botão Atender da Agenda abre o Atender com a data do dia aberto (a grade de horas saiu na v73)
await T('nav-agenda').click();
await T('atender').click();
await T('atender-quando').click();
await T('atender-data').waitFor();
assert.match(await T('atender-data').inputValue(), /^2026-10-/);
await p.getByRole('button', { name: 'Cancelar' }).click();
ok('Atender abre com a data do dia');

console.log('erros', erros);
assert.deepEqual(erros, []);
await b.close();
