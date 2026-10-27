// Venda de produto sem serviço no atendimento local, com vendedor (computador e celular).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(url);
  return { ctx, p };
}
const semRolagem = async (p, onde) => {
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `${onde}: rolagem horizontal (${sw} > ${iw})`);
};

for (const [nome, vp, touch] of [['computador', { width: 1280, height: 800 }, false], ['celular', { width: 390, height: 780 }, true]]) {
  const { ctx, p } = await abrir(vp, touch);
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click();
  await T('nav-agenda').click();
  await T('atender').click();
  // sem serviço nem produto: recusa
  await salvarAtender(p);
  assert.match(await p.locator('[role="dialog"], .modal').first().innerText(), /ao menos um serviço ou um produto/i, `${nome}: pede serviço ou produto`);
  // só produto: o vendedor aparece e o esteticista some
  assert.equal(await T('atender-vendedor').count(), 0, `${nome}: sem produto, sem vendedor`);
  await p.locator('[data-testid^="atender-prod-"]').first().fill('2');
  await T('atender-vendedor').waitFor();
  await T('atender-vendedor').selectOption('u-pablo');
  await semRolagem(p, `${nome}: modal venda de produto`);
  // com serviço o esteticista volta; o vendedor padrão é quem está lançando
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-profissional').waitFor();
  assert.match(await T('atender-vendedor').innerText(), /\(eu\)/i, `${nome}: o vendedor padrão sou eu`);
  await p.locator('[data-testid^="atender-srv-"]').first().uncheck();
  await T('atender-vendedor').selectOption('u-pablo');
  await T('atender-profissional').selectOption('u-pablo');
  await salvarAtender(p);
  await T('salvar-atender').waitFor({ state: 'detached' });
  // aparece na agenda como venda de produtos, no dia de hoje, e a gaveta mostra a comissão do vendedor
  await T('filtro-u-pablo').click(); // a venda ficou na coluna do vendedor
  const ev = p.getByTestId('evento').filter({ hasText: 'Venda de produtos' });
  await ev.first().click();
  const g = T('gaveta');
  await g.waitFor();
  const txt = await g.innerText();
  assert.match(txt, /Venda de produtos|Aromatizante/i, `${nome}: mostra o produto`);
  assert.doesNotMatch(await g.locator('dt', { hasText: /^Serviços$/ }).count().then(String), /[1-9]/, `${nome}: sem bloco de serviços`);
  assert.match(await T('a-receber').innerText(), /Pablo[\s\S]*R\$\s*9,00/, `${nome}: comissão de R$ 9,00 para o vendedor`);
  assert.match(await T('a-receber').innerText(), /estabelecimento\s*R\$\s*81,00/, `${nome}: o resto fica com o estabelecimento`);
  await semRolagem(p, `${nome}: gaveta da venda`);
  // dono acrescenta outro produto com outro vendedor? (mesmo produto com vendedor diferente é recusado)
  await T('add-produto-sel').selectOption({ index: 1 });
  await T('add-produto-vendedor').selectOption('u-marcelo');
  await T('add-produto').click();
  assert.match(await p.locator('.toast, [role="status"]').last().innerText().catch(() => ''), /outro vendedor/i, `${nome}: recusa vendedor diferente na mesma linha`);
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, [], 'sem erros no console: ' + erros.join(' | '));
console.log('e2e21 ok');
