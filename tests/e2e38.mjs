/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Simulador de WhatsApp (conversa com o robô, mensagens cadastradas e respostas) existe SÓ na tela Mensagens: nas outras telas não há painel nem botão.
// A conversa continua ao sair e voltar; vale para o computador e para o celular (390 px) e para o dono e o profissional.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const url = new URL('../dist/index.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  return { ctx, p };
}
const semWhats = async (p, onde) => {
  assert.equal(await p.getByTestId('wa-painel').count(), 0, `sem painel do WhatsApp em ${onde}`);
  assert.equal(await p.getByTestId('abrir-whats').count(), 0, `sem botão do WhatsApp em ${onde}`);
  assert.equal(await p.locator('.dock').count(), 0, `sem dock em ${onde}`);
};

for (const [vp, usuario] of [[{ width: 1440, height: 900 }, 'davi'], [{ width: 390, height: 780 }, 'davi'], [{ width: 1440, height: 900 }, 'pablo']]) {
  const { ctx, p } = await abrir(vp);
  const T = (id) => p.getByTestId(id);
  await T(`demo-${usuario}`).click();
  await T('agenda-topo').waitFor();
  await semWhats(p, 'Agenda');
  for (const k of ['clientes', 'servicos', 'relatorios', 'estoque', 'financeiro', 'estab', 'equipe', 'escala', 'avisos']) {
    if (!(await T(`nav-${k}`).count())) continue; // o menu depende do perfil
    await T(`nav-${k}`).click(); await p.waitForTimeout(80);
    await semWhats(p, k);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral em ${k}`);
  }
  // Mensagens: aqui (e só aqui) o simulador existe. No computador largo abre sozinho; no celular vem o botão.
  await T('nav-mensagens').click();
  if (vp.width < 700) { await T('abrir-whats').click(); }
  await T('wa-painel').waitFor();
  if (vp.width >= 1320) assert.equal(await T('abrir-whats').count(), 0, 'com o painel aberto não há botão');
  await T('wa-quem').selectOption('p:novo');
  await T('wa-input').fill('oi'); await T('wa-input').press('Enter');
  await p.getByTestId('wa-chips').getByRole('button', { name: 'Agendar horário' }).waitFor();
  // a conversa continua ao sair da tela e voltar
  if (vp.width < 700) await p.locator('button[aria-label="Fechar o WhatsApp"]').click(); // no celular o painel cobre o menu
  await T('nav-agenda').click();
  await semWhats(p, 'Agenda (depois da conversa)');
  await T('nav-mensagens').click();
  if (vp.width < 700) await T('abrir-whats').click();
  await T('wa-painel').waitFor();
  await p.getByTestId('wa-chips').getByRole('button', { name: 'Agendar horário' }).waitFor();
  // fechar o painel na tela Mensagens deixa só o botão (e só ali)
  await p.locator('button[aria-label="Fechar o WhatsApp"]').click();
  await T('abrir-whats').waitFor();
  assert.equal(await T('wa-painel').count(), 0);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'sem rolagem lateral em Mensagens');
  ok(`${usuario} ${vp.width}px: WhatsApp só na tela Mensagens; a conversa continua ao voltar`);
  await ctx.close();
}
console.log('erros', erros);
assert.equal(erros.length, 0, erros.join('\n'));
await b.close();
console.log('e2e38 ok');
