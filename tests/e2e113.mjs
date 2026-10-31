/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B6 no Artifact: cadastrar/promover/rebaixar proprietário pede a senha de quem faz (campo `usr-confirma-senha`); perfil comum não pede; a loja nunca fica sem
// proprietário; remover proprietário exige rebaixar antes. O texto visível diz "Proprietário". 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
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
  await T('demo-davi').click(); await T('nav-equipe').click();
  // cadastrar já como proprietário
  await T('novo-usuario').click();
  await T('usr-nome').fill('Sócia Teste'); await T('usr-apelido').fill('Socia'); await T('usr-cpf').fill('52998224725');
  await T('usr-email').fill('socia@x.com'); await T('usr-senha').fill('1234');
  assert.equal(await T('usr-confirma-senha').count(), 0, `${nome}: perfil comum não pede a senha`);
  await T('usr-papel').selectOption('dono');
  assert.equal(await T('usr-confirma-senha').count(), 1, `${nome}: proprietário pede a senha`);
  assert.match(await T('usr-papel').innerText(), /Proprietário/);
  assert.ok(!/\bDono\b/.test(await p.locator('[role="dialog"], .modal').first().innerText()), `${nome}: texto visível diz proprietário`);
  await semRolagem(p, `${nome}: formulário`);
  await T('salvar-usuario').click(); // sem senha: recusa e o modal continua
  await p.waitForTimeout(150);
  assert.equal(await T('usr-confirma-senha').count(), 1, `${nome}: continua no formulário`);
  assert.match(await p.locator('[role="alert"], .aviso').first().innerText(), /Senha incorreta/);
  await T('usr-confirma-senha').fill('errada'); await T('salvar-usuario').click(); await p.waitForTimeout(150);
  assert.match(await p.locator('[role="alert"], .aviso').first().innerText(), /Senha incorreta/);
  await T('usr-confirma-senha').fill('1234'); await T('salvar-usuario').click();
  await p.waitForTimeout(250);
  assert.equal(await T('usr-confirma-senha').count(), 0, `${nome}: salvou e fechou`);
  assert.match(await p.locator('.card-serv', { hasText: 'Sócia Teste' }).first().innerText(), /Proprietário/, `${nome}: cartão mostra Proprietário`);
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e113 ok');
