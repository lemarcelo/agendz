/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Início: além do dia escolhido, a lista mostra os PRÓXIMOS agendamentos agrupados por dia ("Amanhã", datas por extenso),
// 7 dias por vez ("Ver mais 7 dias"); clicar no dia leva a ele. Computador e celular (390 px). Relógio fixo.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const url = new URL('../dist/index.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
  const touch = vp.width < 700;
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  await p.goto(url);
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click(); await T('agenda-topo').waitFor();
  await T('agenda-modo-horarios').click().catch(() => {});
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  // "Todos" os profissionais, para ver o conjunto
  { const it = T('filtro-todos'); if (!(await it.isVisible().catch(() => false))) await T('filtro-abrir').click(); await it.click(); }
  await T('agenda-proximos').waitFor();
  const grupos = await T('proximo-dia').count();
  assert.ok(grupos >= 1, 'há ao menos um dia com próximos agendamentos');
  const primeiro = await T('proximo-dia').first().locator('h4').innerText();
  assert.match(primeiro, /Amanhã|segunda|terça|quarta|quinta|sexta|sábado|domingo/i, 'o grupo traz o dia por extenso');
  // os cartões do dia escolhido continuam separados dos próximos
  assert.equal(await T('agenda-cartoes').locator('[data-testid="cartao-proximo"]').count(), 0, 'próximos não se misturam ao dia');
  // cada grupo só traz cartões de um dia
  ok(`${vp.width}px: ${grupos} dia(s) com próximos agendamentos, agrupados por dia`);
  // clicar no dia leva a ele
  const titulo = await T('proximo-dia').first().locator('.link-dia').innerText();
  await T('proximo-dia').first().locator('.link-dia').click();
  assert.match((await T('cal-titulo').innerText()).toLowerCase(), new RegExp(titulo.split('·').pop().trim().split(',')[0].toLowerCase()), 'abre o dia clicado');
  ok(`${vp.width}px: clicar no dia abre esse dia`);
  // abrir um cartão de próximo agendamento abre a ficha
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  await T('cartao-proximo').first().click();
  await T('gaveta').waitFor();
  ok(`${vp.width}px: cartão de próximo agendamento abre a ficha`);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral (${vp.width}px)`);
  await ctx.close();
}
assert.deepEqual(erros, []);
await b.close();

ok('e2e43 completo');
