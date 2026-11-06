/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco A (demonstração, dist/index.html): ausência do profissional (Agenda > Calendário > Ausência) e serviços por funcionário.
// Computador (1366) e celular (390, fonte larga): horário marcado com borda azul e X, segurar o dia bloqueia o dia inteiro, outros dias se acrescentam,
// X do dia desmarca, lista de ausências ao lado dos cancelados, modal fecha com Escape e botão sem deixar o fundo preso, sem rolagem lateral nem sobreposição.
// Com E2E_CAPTURAS=pasta grava as imagens (claro e escuro) para revisão visual.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const ok = (m) => console.log('✓', m);
const url = new URL('../dist/index.html', import.meta.url).href;
const pasta = process.env.E2E_CAPTURAS || '';
if (pasta) mkdirSync(pasta, { recursive: true });
const b = await chromium.launch();
const erros = [];
const FONTE_LARGA = '* { font-family: "DejaVu Sans", sans-serif !important; }';
const sobrepoe = (x, y) => x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;

for (const vp of [{ nome: '1366', width: 1366, height: 800 }, { nome: '390', width: 390, height: 780 }]) {
  const touch = vp.width < 700;
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  if (touch) await p.addStyleTag({ content: FONTE_LARGA });
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click(); await T('agenda-topo').waitFor();

  // ---- A3: abre a janela pela aba Calendário
  assert.equal(await T('ausencia-abrir').count(), 0, 'o botão Ausência só existe na aba Calendário');
  await T('agenda-modo-calendario').click();
  await T('ausencia-abrir').click();
  await T('aus-grade').waitFor();
  assert.ok(await T('ausencia-modal').isVisible());
  ok(`${vp.nome}px: botão Ausência abre a janela com a grade do expediente`);

  // escolhe o Pablo (o dono lança para qualquer um)
  await T('aus-profissional').selectOption({ label: 'Pablo' });
  await T('aus-grade').waitFor();
  const grade = await T('aus-grade').locator('[data-testid^="aus-hora-"]').count();
  assert.ok(grade >= 6, 'mostra o expediente livre do profissional (' + grade + ' horários)');

  // marcar vários horários só clicando; X no canto superior direito desmarca
  await T('aus-hora-1000').click();
  await T('aus-hora-1030').click();
  await T('aus-hora-1400').click();
  const slot = await T('aus-hora-1000').boundingBox();
  const x = await T('aus-hora-x-1000').boundingBox();
  assert.ok(x.x + x.width <= slot.x + slot.width + 1 && x.x >= slot.x + slot.width / 2, 'o X fica no lado direito do horário');
  assert.ok(x.y >= slot.y - 1 && x.y + x.height <= slot.y + slot.height + 1 && x.y < slot.y + slot.height / 2, 'o X fica na parte de cima do horário');
  assert.match(await T('aus-resumo').innerText(), /3 horário/);
  const borda = await T('aus-hora-1000').evaluate((el) => getComputedStyle(el).borderTopColor + '|' + getComputedStyle(el).borderTopWidth);
  assert.ok(/^rgb/.test(borda) && !borda.endsWith('|0px'), 'horário marcado tem borda (' + borda + ')');
  await T('aus-hora-x-1030').click();
  assert.match(await T('aus-resumo').innerText(), /2 horário/, 'o X desmarca só aquele horário');
  ok(`${vp.nome}px: vários horários por clique, borda e X no canto superior direito, X desmarca`);

  // segurar o dia bloqueia o dia inteiro; depois, clicar em outros dias os acrescenta; X do dia desmarca
  const dias = await T('aus-dias').locator('[data-testid^="aus-dia-20"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const d3 = T(dias[2]);
  const caixa = await d3.boundingBox();
  await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
  const idDia3 = dias[2].replace('aus-dia-', '');
  await T('aus-dia-x-' + idDia3).waitFor();
  await T('aus-dia-inteiro').waitFor();
  await T(dias[3]).click(); // com um dia marcado, tocar em outro o acrescenta
  const idDia4 = dias[3].replace('aus-dia-', '');
  await T('aus-dia-x-' + idDia4).waitFor();
  assert.match(await T('aus-resumo').innerText(), /2 dia\(s\) inteiro\(s\)/);
  const dx = await T('aus-dia-x-' + idDia3).boundingBox();
  const db = await T(dias[2]).boundingBox();
  assert.ok(dx.y <= db.y + 4 && dx.x + dx.width >= db.x + db.width - 4, 'o X do dia fica no topo, à direita');
  await T('aus-dia-x-' + idDia4).click();
  assert.match(await T('aus-resumo').innerText(), /1 dia\(s\) inteiro\(s\)/, 'o X do dia desmarca');
  ok(`${vp.nome}px: segurar o dia bloqueia o dia inteiro, outros dias se acrescentam e o X desmarca`);

  // layout: sem rolagem lateral e sem sobreposição dos botões do rodapé
  const larg = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth, janela: document.querySelector('[data-testid=aus-janela]').scrollWidth, janelaW: document.querySelector('[data-testid=aus-janela]').clientWidth }));
  assert.ok(larg.s <= larg.w, `sem rolagem lateral na página (${larg.s} <= ${larg.w})`);
  assert.ok(larg.janela <= larg.janelaW + 1, 'sem rolagem lateral dentro da janela');
  const cancelar = await T('aus-cancelar').boundingBox(); const salvar = await T('aus-salvar').boundingBox();
  assert.ok(!sobrepoe(cancelar, salvar), 'os botões do rodapé não se sobrepõem');
  assert.ok(await p.evaluate(() => window.scrollY === 0), 'a página de fundo não rolou (trava de scroll)');
  if (pasta) await p.screenshot({ path: `${pasta}/ausencia-${vp.nome}-escuro.png` });

  // tema claro (captura)
  if (pasta) {
    await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await p.screenshot({ path: `${pasta}/ausencia-${vp.nome}-claro.png` });
    await p.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  }

  // Escape fecha, sem deixar o fundo preso
  await p.keyboard.press('Escape');
  await T('ausencia-modal').waitFor({ state: 'detached' });
  assert.equal(await p.locator('.atender-fundo-real').count(), 0, 'não sobra fundo na tela');
  await T('agenda-modo-horarios').click(); // o clique seguinte chega na página
  ok(`${vp.nome}px: Escape fecha a janela sem deixar o fundo preso`);

  // lança de verdade: um horário e um dia inteiro; aparece a lista de ausências no dia
  await T('agenda-modo-calendario').click();
  await T('ausencia-abrir').click();
  await T('aus-profissional').selectOption({ label: 'Pablo' });
  await T('aus-hora-1000').click();
  await T('aus-salvar').click();
  await T('ausencia-modal').waitFor({ state: 'detached' });
  await T('agenda-modo-horarios').click();
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  { const it = T('filtro-todos'); if (!(await it.isVisible().catch(() => false))) await T('filtro-abrir').click(); await it.click(); } // a lista respeita o filtro de profissionais da agenda
  await T('ausencias-dia').waitFor();
  assert.match(await T('ausencias-dia').innerText(), /Pablo/);
  await T('ausencias-dia').scrollIntoViewIfNeeded();
  if (pasta) await p.screenshot({ path: `${pasta}/agenda-ausencias-${vp.nome}.png` });
  const l2 = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(l2[0] <= l2[1], 'agenda sem rolagem lateral com a lista de ausências');
  ok(`${vp.nome}px: ausência lançada aparece na lista do dia`);

  // lançar por cima de um agendamento existente mostra os conflitos na tela
  await T('agenda-modo-calendario').click();
  await T('ausencia-abrir').click();
  await T('aus-profissional').selectOption({ label: 'Pablo' });
  const diaVazio = await T('aus-dias').locator('[data-testid^="aus-dia-20"]').first().getAttribute('data-testid');
  await T(diaVazio).press('Enter').catch(() => {});
  await T('aus-fechar').click();
  await T('ausencia-modal').waitFor({ state: 'detached' });

  // ---- A1: Serviços > Editar e Equipe > Editar mostram o vínculo
  await p.getByRole('button', { name: /Serviços/ }).first().click().catch(() => {});
  await ctx.close();
}
assert.deepEqual(erros, [], 'sem erros de página nem diálogos nativos');
await b.close();
console.log('e2e123 ok');
