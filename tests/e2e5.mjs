import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';
const b = await chromium.launch();
const erros = [];
const novo = async (w, h, scheme = 'light') => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: scheme });
  await ctx.clock.setFixedTime(new Date('2026-10-11T22:00:00-03:00')); // data dos testes: sem isso o dia de hoje muda e as datas fixas deixam de bater
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  return p;
};
const ok = (m) => console.log('✓', m);
{
  const p = await novo(1440, 900);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  // novo agendamento com acréscimo
  await T('atender').click();
  await T('atender-cliente-abrir').click(); await T('atender-cliente-c-igor').click();
  await T('atender-profissional').selectOption('u-davi');
  await T('atender-quando').click();
  await T('atender-data').fill('2026-10-14');
  await T('hora-h').fill('09'); await T('hora-m').fill('00');
  await T('atender-srv-s-lav-detalhada').check();
  const resumo = await T('atender-total').innerText();
  assert.doesNotMatch(resumo, /Acr/, 'não existe mais acréscimo');
  ok('form sem acréscimo');
  await salvarAtender(p);
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/71-apos-salvar.png' });
  // abrir ficha
  await p.locator('[data-testid=evento][title^="09:00 Igor"][title*="Lavagem detalhada"]').first().click();
  const g = await T('valores-gaveta').innerText();
  console.log(g);
  assert.doesNotMatch(g, /Acr/);
  await p.screenshot({ path: 'shots/72-gaveta.png' });
  ok('ficha sem acréscimo');
  await p.keyboard.press('Escape');
  // relatório
  await T('nav-relatorios').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/73-relatorio.png', fullPage: true });
  console.log(await T('rel-total').innerText(), await T('rel-qtd').innerText());
  const tot = Number((await T('rel-total').innerText()).replace(/[^\d,]/g, '').replace(',', '.'));
  assert.ok(tot > 0);
  const antes = await T('rel-qtd').innerText();
  await T('rel-profissional').selectOption('u-pablo');
  const depois = await T('rel-qtd').innerText();
  console.log('qtd todos', antes, 'pablo', depois);
  assert.ok(Number(depois) <= Number(antes));
  await p.screenshot({ path: 'shots/74-relatorio-pablo.png', fullPage: true });
  ok('relatório + filtro esteticista');
  // estoque
  await T('nav-estoque').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/75-estoque.png', fullPage: true });
  const s0 = await T('saldo-mt-shampoo').innerText();
  await T('entrada-mt-shampoo').click();
  await T('mov-qtd').fill('100');
  await T('salvar-mov').click();
  const s1 = await T('saldo-mt-shampoo').innerText();
  console.log('pomada', s0, '->', s1);
  assert.equal(Number(s1) - Number(s0), 100);
  ok('entrada de estoque');
  await T('novo-material').click();
  await T('mat-nome').fill('Talco'); await T('mat-estoque').fill('50');
  await T('salvar-material').click();
  await p.getByText('Talco').first().waitFor();
  await p.getByRole('tab', { name: 'Relatório de estoque' }).click();
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shots/76-rel-estoque.png', fullPage: true });
  ok('cadastro de material + relatório de estoque');
  // serviço com materiais
  await T('nav-servicos').click();
  await p.getByRole('button', { name: /Editar/ }).first().click();
  await T('add-material').click();
  await p.screenshot({ path: 'shots/77-servico-materiais.png' });
  ok('editor de materiais no serviço');
  console.log('erros', erros);
}
{
  const p = await novo(400, 800, 'dark');
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  await p.waitForTimeout(300);
  const menu = p.getByRole('button', { name: /menu/i }).first();
  if (await menu.count()) await menu.click();
  await T('nav-relatorios').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/78-rel-mobile-dark.png', fullPage: true });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log('overflow horizontal', sw);
  console.log('erros', erros);
}
await b.close();
if (erros.length) { console.log('ERROS', erros); process.exit(1); }
