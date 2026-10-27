import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { waServico, waVeiculoNovo } from './e2e-util.mjs';
const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + fs.readFileSync('dist/agenda.html', 'utf8') + '</body></html>';
fs.writeFileSync('dist/index.html', html);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // relógio fixo: o teste não depende do dia da semana em que roda
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
const T = (id) => p.locator(`[data-testid="${id}"]`);
const ultimaDoBot = () => p.locator('[data-testid=wa-msgs] .wa-linha.bot .wa-balao').last().innerText();
async function profissionalSeHouver() { await p.waitForTimeout(200); if (/Com qual esteticista/.test(await ultimaDoBot())) await p.locator('[data-testid=wa-chips] button').first().click(); }
const shot = (n) => p.screenshot({ path: `shots/${n}.png` });
let passos = 0;
const ok = (msg) => { passos++; console.log('✓', msg); };

await p.goto(new URL('../dist/index.html', import.meta.url).href);
// login errado e certo
await T('login-id').fill('davi'); await T('login-senha').fill('errada'); await T('login-entrar').click();
await p.getByText('Usuário ou senha incorretos.').waitFor(); ok('login recusa senha errada');
await T('login-senha').fill('1234'); await T('login-entrar').click();
await T('filtro-u-davi').waitFor(); ok('login do dono por apelido');

// vista Dia
await p.getByRole('button', { name: 'Dia', exact: true }).click();
await p.getByRole('button', { name: 'Próximo' }).click();
await shot('03-dia');
assert.ok((await T('cartao').count()) >= 1); ok('vista dia lista cartões do dia');
// mês
await p.getByRole('button', { name: 'Mês', exact: true }).click();
await shot('04-mes'); ok('vista mês');
// semana → clicar evento → gaveta
await p.getByRole('button', { name: 'Semana', exact: true }).click();
await T('evento').first().click();
await T('gaveta').waitFor(); await shot('05-gaveta'); ok('gaveta abre ao clicar no evento');
await p.keyboard.press('Escape');

// filtro por esteticista
await T('filtro-u-pablo').click();
const evs = await T('evento').evaluateAll((els) => els.length);
assert.ok(evs >= 1); ok('filtro por esteticista');
await T('filtro-u-davi').click();

// novo agendamento pelo painel: conflito com pendente
await T('atender').click();
await T('atender-cliente-abrir').click(); await T('atender-cliente-c-igor').click();
await T('atender-profissional').selectOption('u-pablo');
await T('atender-srv-s-lav-simples').check();
await T('atender-quando').click();
{ const d = new Date(Date.now() + 8 * 86400000); while (d.getDay() !== 3) d.setDate(d.getDate() + 1); await T('atender-data').fill(d.toLocaleDateString('sv-SE')); await T('hora-h').fill('10'); await T('hora-m').fill('00'); }
await shot('06-form');
await T('salvar-atender').click();
await p.waitForTimeout(300);
await shot('07-apos-salvar'); ok('agendamento criado pelo painel');

// WhatsApp: conversa completa de cliente novo
await T('wa-quem').selectOption('p:novo');
await T('wa-input').fill('oi'); await T('wa-input').press('Enter');
await p.locator('[data-testid=wa-chips]').getByRole('button', { name: 'Agendar horário' }).click(); // o menu já aparece no primeiro contato
await waVeiculoNovo(p);
await waServico(p, 'Lavagem detalhada', 'Lavagem');
await shot('08-wa-dias');
await p.locator('[data-testid=wa-chips] button').first().click(); // dia
await p.locator('[data-testid=wa-chips] button').first().click(); // hora
await shot('09-wa-profissionais');
await profissionalSeHouver();
await p.getByText('qual é o seu nome ou apelido').first().waitFor(); // o cadastro só é pedido no fim
await T('wa-input').fill('Beto'); await T('wa-input').press('Enter');
await p.locator('[data-testid=wa-chips]').getByRole('button', { name: 'Pular' }).click();
await p.locator('[data-testid=wa-chips]').getByRole('button', { name: 'Pular' }).click();
await p.locator('[data-testid=wa-chips]').getByRole('button', { name: 'Sim, agendar' }).click();
await p.getByText(/Agendado!/).first().waitFor(); await shot('10-wa-agendado'); ok('fluxo WhatsApp: cliente novo agenda');

// API log
await p.getByRole('tab', { name: 'Chamadas à API' }).click();
await p.getByText('/whatsapp/agendamentos').first().waitFor(); await shot('11-api'); ok('chamadas à API aparecem');
await p.getByRole('tab', { name: 'Relógio' }).click();
await shot('12-relogio');
// avançar até a pergunta de confirmação
for (let i = 0; i < 6; i++) { if (await T('proximo-evento').isEnabled()) { await T('proximo-evento').click(); } }
await p.getByRole('tab', { name: 'Conversa' }).click();
await shot('13-wa-modelos');
const temConfirmar = await T('wa-btn-Confirmar').count();
console.log('botões Confirmar no chat:', temConfirmar);

// DDD fora do RS
await T('wa-quem').selectOption('p:fora');
await T('wa-input').fill('oi'); await T('wa-input').press('Enter');
await p.getByText('não é possível realizar agendamentos').first().waitFor(); ok('DDD bloqueado');

// outras telas
for (const [k, n] of [['clientes', '14-clientes'], ['servicos', '15-servicos'], ['estab', '16-estab'], ['equipe', '17-equipe'], ['mensagens', '18-mensagens'], ['avisos', '19-avisos']]) { await T(`nav-${k}`).click(); await p.waitForTimeout(150); await shot(n); }
ok('todas as telas abrem');

// esteticista só vê a própria agenda
await T('sair').click();
await T('demo-pablo').click();
await T('filtro-u-pablo').waitFor();
assert.equal(await T('filtro-u-davi').count(), 0); ok('esteticista vê só o próprio filtro');
await shot('20-profissional');
console.log('passos', passos, 'erros', erros);
await b.close();
if (erros.length) process.exit(1);
