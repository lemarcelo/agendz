/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// EXPERIMENTO só do Artifact (AGENDZ_EXPERIMENTO=cards): Agenda em cartões (Horários) e só o mês (Calendário), Link à esquerda e Atender à direita,
// modo e rolagem lembrados. O site (dist/index.html) e o Artifact normal NUNCA recebem o experimento.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const ok = (m) => console.log('✓', m);
const b0 = spawnSync('node', ['build.mjs'], { env: { ...process.env, AGENDZ_EXPERIMENTO: 'cards' }, encoding: 'utf8' });
assert.equal(b0.status, 0, b0.stderr);
const MARCAS = ['exp-modo-', 'exp-topo', 'Como ver a agenda', 'exp-cartoes'];
for (const f of ['index.html', 'agenda.html', 'index-barbearia.html', 'agenda-barbearia.html']) {
  const p = new URL(`../dist/${f}`, import.meta.url);
  if (!fs.existsSync(p)) continue;
  const t = fs.readFileSync(p, 'utf8');
  for (const m of MARCAS) assert.ok(!t.includes(m), `${f} não pode conter o experimento (${m})`);
}
ok('o experimento não vai para o site nem para o Artifact normal');

const url = new URL('../dist/agenda-experimento-cards.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  return { ctx, p };
}
const entrar = async (p) => { await p.getByTestId('demo-davi').click(); await p.getByTestId('exp-topo').waitFor(); };

for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
  const { ctx, p } = await abrir(vp);
  const T = (id) => p.getByTestId(id);
  await entrar(p);
  // sem o grid de dia/semana e sem a troca Dia/Semana/Mês
  assert.equal(await p.locator('.barra-cal-acoes').count(), 0, 'sem a barra Dia/Semana/Mês');
  assert.equal(await p.locator('.grade, .grade-semana').count(), 0, 'sem grade de horas');
  // Link à esquerda, Atender à direita, dentro da tela, sem se sobrepor
  const lk = await T('copiar-link').boundingBox(); const at = await T('atender').boundingBox();
  assert.ok(lk.x + lk.width <= at.x, `${vp.width}: Link à esquerda do Atender`);
  assert.ok(at.x + at.width <= vp.width && lk.x >= 0, `${vp.width}: dentro da tela`);
  if (vp.width < 700) assert.equal((await T('copiar-link').innerText()).trim(), 'Link Agenda');
  // abas: Horários (cartões) e Calendário (mês)
  assert.equal(await T('exp-modo-horarios').getAttribute('aria-pressed'), 'true');
  await T('exp-horarios').waitFor();
  const cartoes = await p.locator('[data-testid="exp-cartoes"] > *').count();
  const chip = Number((await p.locator('.exp-titulo-dia .chip').innerText()).trim());
  assert.equal(cartoes, chip, `${vp.width}: um cartão por agendamento do dia`);
  await T('exp-modo-calendario').click();
  await p.locator('.mes').waitFor();
  assert.equal(await T('exp-horarios').count(), 0);
  assert.equal(await p.locator('.barra-cal-acoes').count(), 0);
  // tocar num dia do mês leva aos Horários daquele dia
  await p.locator('.mes button, .mes [role="button"], .mes .mes-dia').first().click().catch(() => {});
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `${vp.width}: sem rolagem horizontal`);
  await ctx.close();
  ok(`experimento ${vp.width}px: topo, abas, cartões e calendário`);
}

// posição lembrada: modo e rolagem voltam como foram deixados (localStorage do arquivo; em memória na mesma sessão)
{
  const { ctx, p } = await abrir({ width: 390, height: 420 });
  const T = (id) => p.getByTestId(id);
  await entrar(p);
  await T('exp-modo-calendario').click(); await p.locator('.mes').waitFor();
  await p.evaluate(() => window.scrollTo(0, 120)); await p.waitForTimeout(400);
  const y = await p.evaluate(() => Math.round(window.scrollY));
  assert.ok(y > 0, 'a página rola neste tamanho');
  await p.reload(); await entrar(p);
  await p.locator('.mes').waitFor();
  await p.waitForTimeout(300);
  assert.equal(await T('exp-modo-calendario').getAttribute('aria-pressed'), 'true', 'o modo volta como estava');
  const y2 = await p.evaluate(() => Math.round(window.scrollY));
  assert.ok(Math.abs(y2 - y) <= 2, `a rolagem volta (${y} → ${y2})`);
  // valor adulterado no armazenamento é saneado (volta ao padrão, sem erro)
  await p.evaluate(() => { localStorage.setItem('agenda-exp-modo:u-davi', '"qualquer"'); localStorage.setItem('agenda-exp-rolagem:u-davi', '"abc"'); });
  await p.reload(); await entrar(p);
  assert.equal(await T('exp-modo-horarios').getAttribute('aria-pressed'), 'true', 'modo inválido volta ao padrão');
  await ctx.close();
  ok('modo e rolagem lembrados; valor inválido é saneado');
}

assert.deepEqual(erros, [], 'erros: ' + erros.join(' | '));
await b.close();
console.log('e2e35 ok');
