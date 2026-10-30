/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cancelados do dia (30/10): saem da lista e viram uma linha no fim, "Cancelado (N)", que abre os cartões ao tocar.
// Com o filtro "Cancelado" ligado ficam na lista. Computador e celular (390 px). Relógio fixo.
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
  { const it = T('filtro-todos'); if (!(await it.isVisible().catch(() => false))) await T('filtro-abrir').click(); await it.click(); }
  // procura um dia com ao menos 2 cartões ativos (a partir de hoje)
  let achou = false;
  for (let i = 0; i < 30 && !achou; i++) {
    if ((await T('agenda-cartoes').locator('[data-testid="cartao"]').count()) >= 2) achou = true;
    else await p.getByRole('button', { name: 'Próximo', exact: true }).click();
  }
  assert.ok(achou, 'achou um dia com 2 ou mais agendamentos');
  const cartoes = T('agenda-cartoes').locator('[data-testid="cartao"]');
  const antes = await cartoes.count();
  assert.equal(await T('cancelados-dia').count(), 0, 'sem cancelados, a linha não aparece');
  assert.equal(Number(await T('dia-total').innerText()), antes, 'o total do dia conta os ativos');

  const cancelarPrimeiro = async () => {
    await cartoes.first().click();
    await T('acao-cancelar').click(); await T('acao-cancelar-sim').click();
    await p.getByText('Agendamento cancelado.').first().waitFor();
    await p.keyboard.press('Escape').catch(() => {});
  };
  await cancelarPrimeiro();
  await T('cancelados-resumo').waitFor();
  assert.equal((await T('cancelados-resumo').innerText()).replace(/\s+/g, ' ').trim(), 'Cancelado (1)');
  assert.equal(await cartoes.count(), antes - 1, 'o cancelado saiu da lista');
  assert.equal(await T('cancelados-cartoes').count(), 0, 'a linha começa recolhida');
  ok(`${vp.width}px: cancelado vira a linha "Cancelado (1)" no fim`);

  await cancelarPrimeiro();
  assert.equal((await T('cancelados-resumo').innerText()).replace(/\s+/g, ' ').trim(), 'Cancelados (2)');
  await T('cancelados-resumo').click();
  assert.equal(await T('cancelados-cartoes').locator('[data-testid="cartao"]').count(), 2, 'ao tocar, abrem os 2 cartões');
  assert.equal(await T('cancelados-resumo').getAttribute('aria-expanded'), 'true');
  // a linha fica depois dos cartões ativos
  const yAtivos = (await T('agenda-cartoes').boundingBox()).y, yLinha = (await T('cancelados-resumo').boundingBox()).y;
  assert.ok(yLinha > yAtivos, 'a linha fica no fim do dia');
  ok(`${vp.width}px: tocar na linha abre os cartões cancelados`);
  await T('cancelados-resumo').click();
  assert.equal(await T('cancelados-cartoes').count(), 0, 'tocar de novo recolhe');

  // com o filtro "Cancelado", ficam na lista
  await T('legenda-cancelado').click();
  assert.equal(await T('cancelados-dia').count(), 0, 'filtro Cancelado: sem a linha');
  assert.equal(await T('agenda-cartoes').locator('[data-testid="cartao"]').count(), 2, 'filtro Cancelado: os 2 aparecem na lista');
  ok(`${vp.width}px: com o filtro Cancelado os cartões ficam na lista`);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral (${vp.width}px)`);
  await ctx.close();
}
assert.deepEqual(erros, []);
await b.close();
ok('e2e73 completo');
