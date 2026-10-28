/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atendimento esquecido (dia anterior) e cancelamento da comissão, na tela: motivo obrigatório, ficha com o lançamento, cancelar/restaurar a comissão
// (só o proprietário) e o profissional sem o campo (bloqueado). Computador e celular (390 px). Relógio fixo.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

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
const semRolagem = async (p, onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral em ${onde}`);
const preencherAtender = async (p, T, profissional) => {
  await T('atender').click();
  if ((await T('atender-profissional').count()) && (await T('atender-profissional').isEnabled())) await T('atender-profissional').selectOption(profissional); // o profissional não escolhe: só ele mesmo
  await T('atender-srv-s-lav-simples').check();
  await T('atender-quando').click();
  await T('atender-data').fill('2026-10-11'); await T('hora-h').fill('10'); await T('hora-m').fill('00');
};

for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
  const { ctx, p } = await abrir(vp);
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click(); await T('agenda-topo').waitFor();
  await preencherAtender(p, T, 'u-pablo');
  await T('atender-motivo-retro').waitFor();
  await semRolagem(p, `Atender (${vp.width}px)`);
  await salvarAtender(p);
  await p.getByText('Informe o motivo do lançamento de um dia anterior', { exact: false }).waitFor();
  ok(`${vp.width}px: dia anterior sem motivo é recusado`);
  await T('atender-motivo-retro').fill('Esqueci de lançar ontem');
  await salvarAtender(p);
  await T('atender-motivo-retro').waitFor({ state: 'detached' });
  ok(`${vp.width}px: com o motivo, o atendimento do dia anterior é registrado`);

  if (vp.width >= 1320) {
    // ficha: o lançamento aparece e o proprietário cancela/restaura a comissão (com motivo)
    { const it = T('filtro-u-pablo'); if (!(await it.isVisible().catch(() => false))) await T('filtro-abrir').click(); await it.click(); } // o atendimento é do Pablo
    await p.getByTestId('agenda-modo-horarios').click().catch(() => {});
    await p.getByRole('button', { name: 'Hoje', exact: true }).click();
    await p.getByRole('button', { name: 'Anterior', exact: true }).click();
    await p.locator('[data-testid=cartao]', { hasText: '10:00' }).first().click();
    await T('a-retroativo').waitFor();
    assert.match(await T('a-retroativo').innerText(), /Esqueci de lançar ontem/);
    await T('comissao-cancelar-u-pablo').click();
    await T('comissao-cancelar-ok').click();
    await T('comissao-erro').waitFor();
    await T('comissao-motivo').fill('Cortesia da casa');
    await T('comissao-cancelar-ok').click();
    await T('comissao-cancelada-u-pablo').waitFor();
    assert.match(await T('comissao-cancelada-u-pablo').innerText(), /Cortesia da casa/);
    ok('proprietário cancela a comissão com motivo (obrigatório) e a ficha mostra');
    await T('comissao-restaurar-u-pablo').click();
    await T('comissao-cancelada-u-pablo').waitFor({ state: 'detached' });
    ok('proprietário restaura a comissão');
  }
  await ctx.close();
}

// profissional: não lança dia anterior
{
  const { ctx, p } = await abrir({ width: 1440, height: 900 });
  const T = (id) => p.getByTestId(id);
  await T('demo-pablo').click(); await T('agenda-topo').waitFor();
  await preencherAtender(p, T, 'u-pablo');
  await T('atender-retro-bloqueado').waitFor();
  assert.equal(await T('atender-motivo-retro').count(), 0);
  await salvarAtender(p);
  await p.getByText('proprietário ou a recepção', { exact: false }).first().waitFor();
  ok('profissional: dia anterior bloqueado, com a explicação');
  await ctx.close();
}

await b.close();
assert.deepEqual(erros, [], 'sem erro de página nem diálogo');
ok('e2e42 completo');
