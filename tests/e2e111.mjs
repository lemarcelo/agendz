/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B9b (v133): o proprietário escolhe a ordem das etapas e dos campos da tela Atender (Estabelecimento > Regras), separada para agendamento e atendimento feito.
// Padrão = a ordem de hoje; "Usar a ordem da página do cliente" põe Veículo (porte primeiro) antes dos serviços; só o proprietário vê a configuração.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
const ok = (m) => console.log('✓', m);
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(url);
const T = (id) => p.getByTestId(id);
const y = async (id) => (await T(id).first().boundingBox()).y;
const abrirAtender = async () => { await T('nav-agenda').click(); await T('agenda-topo').waitFor(); await T('atender').click(); await T('salvar-atender').waitFor(); };
const fechar = async () => { await p.keyboard.press('Escape'); await T('salvar-atender').waitFor({ state: 'detached' }); };

await T('demo-davi').click(); await T('agenda-topo').waitFor();

// 1. padrão = ordem de hoje da demonstração: Serviços antes de Veículo
await abrirAtender();
assert.ok(await y('atender-lista-servicos') < await y('atender-veiculo'), 'padrão: Serviços vem antes de Veículo');
await fechar();
ok('padrão: a ordem de hoje (Serviços → … → Veículo)');

// 2. a configuração existe só para o proprietário, com os dois tipos de atendimento
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('ordem-atender').waitFor();
await T('ordem-futuro').waitFor(); await T('ordem-local').waitFor();
assert.equal(await T('ordem-local-etapas-sobe-servicos').isDisabled(), true, 'a primeira etapa não sobe');
ok('Estabelecimento > Regras mostra a ordem para agendamento e atendimento feito');

// 3. mover só o atendimento feito: Veículo sobe até o topo; o agendamento (futuro) fica como estava
for (let i = 0; i < 4; i++) { if (await T('ordem-local-etapas-sobe-veiculo').isDisabled()) break; await T('ordem-local-etapas-sobe-veiculo').click(); }
await abrirAtender(); // "Agora" = atendimento feito
assert.ok(await y('atender-veiculo') < await y('atender-lista-servicos'), 'atendimento feito: Veículo agora vem antes dos Serviços');
await fechar();
ok('mudar a ordem do atendimento feito reflete no Atender');

// 4. "página do cliente": Veículo → Serviços e o porte vira o primeiro campo do veículo
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('ordem-pagina-cliente').click();
await abrirAtender();
assert.ok(await y('atender-veiculo') < await y('atender-lista-servicos'), 'Veículo antes dos Serviços');
if (await T('atender-porte').count()) assert.ok(await y('atender-porte') < await y('atender-placa'), 'porte antes da placa');
await fechar();
ok('preset "ordem da página do cliente": Veículo → Serviços, porte primeiro');

// 5. voltar à ordem de fábrica
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('ordem-padrao').click();
await abrirAtender();
assert.ok(await y('atender-lista-servicos') < await y('atender-veiculo'), 'fábrica: Serviços antes de Veículo');
await fechar();
ok('voltar à ordem de fábrica');

// 6. profissional não vê a configuração
await T('sair').click().catch(() => {});
await p.goto(url);
await T('demo-pablo').click(); await T('agenda-topo').waitFor();
assert.equal(await T('nav-estab').count(), 0, 'profissional não abre Estabelecimento');
ok('profissional não tem a configuração');

assert.deepEqual(erros, []);
await b.close();
