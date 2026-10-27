import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-11T22:00:00-03:00')); // data dos testes: sem isso o dia de hoje muda e as datas fixas deixam de bater
const p = await ctx.newPage();
p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
const shot = (n) => p.screenshot({ path: `shots/${n}.png` });
const ok = (m) => console.log('✓', m);

// recuperação de senha
await T('esqueci').click();
await T('rec-cpf').fill('39184726040'); await T('rec-tel').fill('55997011122');
await T('rec-enviar').click();
const codigo = await T('rec-codigo').textContent();
await T('rec-cod-in').fill(codigo); await T('rec-nova').fill('abcd'); await T('rec-concluir').click();
await T('login-id').fill('391.847.260-40'); await T('login-senha').fill('abcd'); await T('login-entrar').click();
await T('filtro-u-davi').waitFor(); ok('recuperar senha (CPF + telefone) e entrar por CPF');

// remarcar pelo painel
await T('evento').first().click();
await T('acao-remarcar').click();
await p.getByRole('button', { name: 'Hora mais' }).click();
await T('status-confirmado').check();
await shot('50-remarcar');
await T('salvar-agendamento').click();
await p.getByText('Reagendado').first().waitFor(); ok('remarcar pelo esteticista gera etiqueta Reagendado');
await T('gaveta').waitFor(); await shot('51-gaveta-reagendado');
// cancelar
await T('acao-cancelar').click(); await T('acao-cancelar-sim').click();
await p.getByText('Agendamento cancelado.').waitFor(); ok('cancelar pelo esteticista');
await p.keyboard.press('Escape');

// folga com impacto
await T('nav-equipe').click();
await p.getByRole('button', { name: 'Escala' }).nth(1).click();
await T('ex-tipo').selectOption('folga');
await T('ex-inicio').fill('2026-10-13');
await T('ex-add').click();
await T('impacto-avisar').waitFor(); await shot('52-impacto'); ok('folga em dia com agendamentos pede destino');
await T('impacto-avisar').click();
await p.getByText('Exceção adicionada à escala.').waitFor(); ok('cliente avisado da folga');
await p.keyboard.press('Escape');

// serviço com notificações próprias
await T('nav-servicos').click();
await p.getByRole('button', { name: 'Editar Polimento comercial' }).click();
await T('notif-proprias').check();
await shot('53-servico'); await p.keyboard.press('Escape');
// estabelecimento: feriados
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Calendário' }).click();
await p.locator('#sw-feriados').click({ force: true });
await T('impacto-cancelar').waitFor(); await shot('54-calendario');
await T('impacto-cancelar').click();
await p.getByText('Calendário de feriados vinculado.').waitFor(); ok('calendário de feriados');
await p.getByRole('tab', { name: 'Horário e exceções' }).click(); await shot('55-escala');
// mensagens: modelo novo inválido
await T('nav-mensagens').click();
await T('novo-modelo').click();
await T('mod-nome').fill('Teste'); await T('mod-corpo').fill('{{1}} chegou');
await shot('56-modelo'); await p.getByText('não pode começar com uma variável').waitFor(); ok('validação de modelo Meta');
await T('salvar-modelo').click();
await p.getByText('não pode começar com uma variável').first().waitFor();
await T('mod-corpo').fill('Olá, {{1}}! Seu pedido está pronto para retirada.');
await T('salvar-modelo').click();
await p.getByText('Modelo salvo.').waitFor(); ok('modelo novo salvo');
console.log('erros', erros);
await b.close();
if (erros.length) process.exit(1);
