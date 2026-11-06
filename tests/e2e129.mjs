/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco C na DEMONSTRAÇÃO (Artifact): cliente criado só com o telefone aparece como "Sem nome" no card (nunca o telefone);
// Detalhes > Editar cliente (lápis) grava o apelido e o card muda; o Atender chama o campo de "Apelido" e lista clientes parecidos ao digitar.
// 1366 e 390 px (fonte larga), sem rolagem lateral. E2E_CAPTURAS=pasta grava as imagens.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { salvarAtender } from './e2e-util.mjs';

const pasta = process.env.E2E_CAPTURAS || '';
if (pasta) mkdirSync(pasta, { recursive: true });
const ok = (m) => console.log('✓', m);
const erros = [];
const b = await chromium.launch();
for (const vp of [{ width: 1366, height: 860 }, { width: 390, height: 800 }]) {
  const touch = vp.width < 700;
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  if (touch) await p.addStyleTag({ content: '* { font-family: "DejaVu Sans", sans-serif !important; }' });
  const T = (id) => p.getByTestId(id);
  const onde = `${vp.width}px`;
  const semRolagem = async (q) => { const l = await p.evaluate(() => ({ d: document.documentElement.scrollWidth, j: window.innerWidth })); assert.ok(l.d <= l.j, `${onde} ${q}: rolagem lateral ${l.d} > ${l.j}`); };
  await T('demo-davi').click();

  // 1) só o telefone: cria o cadastro sem nome
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  assert.match(await p.locator('label.campo', { has: T('atender-nome') }).innerText(), /Apelido/, `${onde}: o campo se chama Apelido`);
  await T('atender-telefone').fill('51 98888-0003');
  await salvarAtender(p); await T('salvar-atender').waitFor({ state: 'detached' });
  // o atendimento local de agora aparece na Agenda do dia
  if (touch && !(await T('nav-agenda').isVisible())) await p.getByRole('button', { name: /menu/i }).first().click().catch(() => {});
  await T('nav-agenda').click();
  const cartao = p.locator('[data-testid="cartao"]', { hasText: 'Sem nome' }).first();
  await cartao.waitFor();
  const txt = await cartao.innerText();
  assert.ok(!/98888|\(51\)/.test(txt), `${onde}: o card não mostra o telefone: ${txt}`);
  await semRolagem('agenda');
  ok(`${onde}: cliente só com telefone aparece como "Sem nome" no card`);

  // 2) Detalhes > Editar cliente
  await cartao.click();
  await T('gaveta').waitFor();
  assert.match(await T('gaveta').locator('h2').first().innerText(), /Sem nome/);
  await T('cliente-editar').click();
  await T('editar-cliente-modal').waitFor();
  assert.equal(await T('editar-cliente-nome').inputValue(), '', 'cadastro sem nome: o campo vem vazio, nunca o telefone');
  if (pasta) await p.screenshot({ path: `${pasta}/c-demo-editar-${vp.width}.png` });
  await semRolagem('editar');
  await p.keyboard.press('Escape');
  assert.equal(await T('editar-cliente-modal').count(), 0, 'Escape fecha só a edição');
  assert.equal(await T('gaveta').count(), 1);
  await T('cliente-editar').click();
  await T('editar-cliente-apelido').fill('Tião da Praça'); await T('editar-cliente-salvar').click();
  await T('editar-cliente-modal').waitFor({ state: 'detached' });
  assert.match(await T('gaveta').locator('h2').first().innerText(), /Tião da Praça/);
  await p.keyboard.press('Escape').catch(() => {});
  if (await T('gaveta').count()) await T('gaveta').getByRole('button', { name: 'Fechar' }).click();
  assert.ok((await p.locator('[data-testid="cartao"]', { hasText: 'Tião da Praça' }).count()) >= 1, `${onde}: o card passa a mostrar o apelido`);
  ok(`${onde}: Editar cliente grava o apelido e o card muda`);

  // 3) Atender lista clientes parecidos ao digitar o apelido
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-nome').fill('Tião');
  await T('atender-achados').waitFor();
  assert.match(await T('atender-achados').innerText(), /Tião da Praça/);
  if (pasta) await p.screenshot({ path: `${pasta}/c-demo-atender-${vp.width}.png` });
  await semRolagem('atender');
  await T('atender-achados').locator('button').first().click();
  assert.match(await T('atender-vinculo').innerText(), /Tião da Praça/);
  ok(`${onde}: Atender lista clientes parecidos ao digitar o apelido`);
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e129 ok');
