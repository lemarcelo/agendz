import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// A Agenda mostra um dia por vez (v73): procura o cartão hoje, depois nos dias seguintes e nos anteriores, e devolve o primeiro que achar.
const irAteCartao = async (p, seletor, dias = 21) => {
  const alvo = p.locator(seletor);
  await p.getByTestId('agenda-modo-horarios').click().catch(() => {});
  for (const dir of ['Próximo', 'Anterior']) {
    await p.getByRole('button', { name: 'Hoje', exact: true }).click();
    for (let i = 0; i <= dias; i++) { if (await alvo.count()) return alvo.first(); await p.getByRole('button', { name: dir, exact: true }).click(); }
  }
  throw new Error('cartão não encontrado em ±' + dias + ' dias: ' + seletor);
};
const b = await chromium.launch();
const erros = [];
const novoCtx = async (w, h, scheme = 'light') => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: scheme });
  await ctx.clock.setFixedTime(new Date('2026-10-11T22:00:00-03:00')); // data dos testes: sem isso o dia de hoje muda e as datas fixas deixam de bater
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(new URL('../dist/index-barbearia.html', import.meta.url).href);
  return p;
};
const ok = (m) => console.log('✓', m);
const chips = (p) => p.locator('[data-testid=wa-chips]');

// ---------- desktop: confirmação pelo WhatsApp e conflito ----------
{
  const p = await novoCtx(1440, 900);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  const shot = (n) => p.screenshot({ path: `shots/${n}.png` });
  await T('demo-alan').click();
  // avisos de conflito no formulário (pendente) — Marcelo a confirmar na terça 14:00 com Kiko
  await p.getByTestId('agenda-modo-horarios').click();
  await T('atender').click();
  await T('atender-cliente-abrir').click(); await T('atender-cliente-c-igor').click();
  await T('atender-profissional').selectOption('u-kiko');
  // data da terça 13/10
  await T('atender-quando').click();
  await T('atender-data').fill('2026-10-13');
  await T('hora-h').fill('14'); await T('hora-m').fill('15');
  await T('atender-srv-s-tesoura').check();
  await p.waitForTimeout(100);
  await T('aviso-pendente').waitFor(); await shot('21-form-conflito'); ok('aviso vermelho de conflito com pendente');
  // sobre confirmado: Alan segunda 10:00 confirmado
  await T('atender-profissional').selectOption('u-alan');
  await T('atender-data').fill('2026-10-12'); await T('hora-h').fill('10'); await T('hora-m').fill('10');
  await p.waitForTimeout(100);
  await T('erro-horario').waitFor(); ok('bloqueia sobre confirmado');
  await T('atender-encaixe').check();
  await T('aviso-confirmado').waitFor(); await shot('22-form-encaixe'); ok('encaixe mostra aviso e libera');
  await T('salvar-atender').click();
  await p.waitForTimeout(300);
  await irAteCartao(p, '[data-testid=cartao]:has-text("encaixe"), [data-testid=cartao]'); ok('encaixe salvo');
  // seletor de hora: setas
  await T('atender').click();
  await T('atender-quando').click();
  await T('hora-h').fill('09'); await T('hora-m').fill('00');
  await p.getByRole('button', { name: 'Hora mais' }).click();
  assert.equal(await T('hora-h').inputValue(), '10');
  await p.getByRole('button', { name: 'Minutos mais' }).click();
  assert.equal(await T('hora-m').inputValue(), '10'); ok('seletor de hora tipo despertador');
  await p.keyboard.press('Escape');

  // Marcelo confirma pelo WhatsApp quando chega a pergunta
  await T('nav-mensagens').click(); // o simulador de WhatsApp só existe na tela Mensagens
  await T('wa-quem').selectOption('c:c-marcelo');
  await p.getByRole('tab', { name: 'Relógio' }).click();
  for (let i = 0; i < 14; i++) { const t = await T('relogio').textContent(); if (/12\/10\/2026 às (17|18|19|2)/.test(t) || /13\/10/.test(t)) break; await T('proximo-evento').click(); }
  await p.getByRole('tab', { name: 'Conversa' }).click();
  await shot('23-wa-pergunta');
  assert.ok(await T('wa-btn-Confirmar').count(), 'pergunta com botão Confirmar'); ok('pergunta de confirmação chega no chat com botão');
  assert.ok(await T('wa-btn-Remarcar').count(), 'a pergunta também oferece Remarcar');
  await T('wa-btn-Confirmar').first().click();
  await p.getByText('Horário confirmado ✅').first().waitFor(); ok('cliente confirma e card muda');
  await shot('24-confirmado');
  // sem resposta → falta de confirmação
  await p.getByRole('tab', { name: 'Relógio' }).click();
  await T('proximo-evento').click(); await T('proximo-evento').click(); await T('proximo-evento').click();
  await shot('25-relogio-depois');
  await T('nav-avisos').click();
  await shot('26-avisos');
  await p.close();
}

// ---------- celular ----------
{
  const p = await novoCtx(400, 800);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  const shot = (n) => p.screenshot({ path: `shots/${n}.png` });
  await shot('30-m-login');
  await T('demo-alan').click();
  await shot('31-m-agenda');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'sem rolagem horizontal na agenda'); ok('sem rolagem horizontal (agenda)');
  await p.getByTestId('agenda-modo-calendario').click(); await shot('32-m-mes');
  await p.getByTestId('agenda-modo-horarios').click();
  await p.getByRole('button', { name: 'Próximo' }).click(); await shot('33-m-dia');
  await (await irAteCartao(p, '[data-testid=\"cartao\"]')).click(); await shot('34-m-gaveta'); await p.keyboard.press('Escape');
  await T('atender').click(); await shot('35-m-form'); await p.keyboard.press('Escape');
  assert.equal(await T('abrir-whats').count(), 0, 'fora da tela Mensagens não há botão do WhatsApp');
  await T('nav-mensagens').click(); await T('abrir-whats').click(); await shot('36-m-whats');
  for (const k of ['clientes', 'servicos', 'estab', 'equipe', 'mensagens']) {
    if (await p.locator('.dock').count()) await p.locator('.dock button[aria-label="Fechar o WhatsApp"]').click();
    await T(`nav-${k}`).click(); await p.waitForTimeout(100);
    const o = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(o, false, `rolagem horizontal em ${k}`);
  }
  ok('sem rolagem horizontal nas telas de cadastro'); await shot('37-m-mensagens');
  await p.close();
}

// ---------- escuro ----------
{
  const p = await novoCtx(1440, 900, 'dark');
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-alan').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: 'shots/40-escuro.png' });
  await (await irAteCartao(p, '[data-testid=\"cartao\"]')).click(); await p.screenshot({ path: 'shots/41-escuro-gaveta.png' });
  await p.close();
}
console.log('erros', erros);
await b.close();
if (erros.length) process.exit(1);
