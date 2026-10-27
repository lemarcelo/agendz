// Cupons e vales no navegador: criar, compartilhar a chave, aplicar no horário, histórico; WhatsApp; cores sem repetir (computador e celular).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', permissions: ['clipboard-read', 'clipboard-write'] });
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
  await T('nav-estab').click();
  await p.getByRole('tab', { name: 'Cupons' }).or(p.getByRole('button', { name: 'Cupons', exact: true })).first().click();
  await T('aba-cupons').waitFor();
  assert.equal(await p.locator('[data-testid="cupons-valendo"] article').count(), 3, `${nome}: 3 cupons de exemplo`);
  assert.match(await T('cupom-chave-cp-lavagem').innerText(), /LAVA-••••-••••/, `${nome}: chave escondida`);
  await T('cupom-ver-cp-lavagem').click();
  assert.equal((await T('cupom-chave-cp-lavagem').innerText()).trim(), 'LAVA-VALE-4M7X');
  await semRolagem(p, `${nome}: cupons`);

  // novo cupom: vale de R$ 10 que já terminou ontem não passa; um válido entra na lista
  await T('novo-cupom').click();
  await T('cupom-nome').fill('Desconto do evento');
  await T('cupom-tipo').selectOption('valor');
  await T('cupom-valor').fill('15');
  await T('cupom-inicio').fill('2026-10-01'); await T('cupom-fim').fill('2026-09-01');
  await T('salvar-cupom').click();
  assert.match(await p.locator('.aviso, [role="alert"]').first().innerText(), /termina antes de começar/);
  await T('cupom-fim').fill('2026-10-31'); await T('cupom-usos').fill('3');
  await T('salvar-cupom').click();
  assert.equal(await p.locator('[data-testid="cupons-valendo"] article').count(), 4, `${nome}: cupom criado`);
  // histórico: começa vazio
  await T('cupons-historico').locator('summary').click();
  assert.match(await T('cupons-historico').innerText(), /vencidos ou encerrados aparecem aqui/);

  // aplicar no agendamento
  await T('nav-agenda').click();
  await p.locator('[data-testid="evento"]').first().click();
  await T('cupom-ag').waitFor();
  await T('cupom-chave-ag').fill('chave-errada-123');
  await T('cupom-aplicar').click();
  assert.match(await T('cupom-ag').innerText(), /Cupom inválido ou indisponível|inválido/i);
  const totalAntes = await T('total-gaveta').innerText();
  await T('cupom-chave-ag').fill('dezp arct 8k3h');
  await T('cupom-aplicar').click();
  await T('linha-desconto').first().waitFor();
  assert.notEqual(await T('total-gaveta').innerText(), totalAntes, `${nome}: total mudou`);
  await T('cupom-retirar').click();
  await T('cupom-chave-ag').waitFor();
  assert.equal(await T('total-gaveta').innerText(), totalAntes, `${nome}: total voltou`);
  await semRolagem(p, `${nome}: ficha com cupom`);
  await p.screenshot({ path: new URL(`../shots/cupom-${nome}.png`, import.meta.url).pathname });
  await ctx.close();
}

// cores diferentes para quem não tem foto (15 esteticistas)
{
  const { ctx, p } = await abrir({ width: 1280, height: 800 });
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click(); await T('nav-equipe').click(); await T('profissionais-exemplo').click();
  await p.waitForTimeout(200);
  const cores = await p.locator('.card-serv .avatar-inicial').evaluateAll((els) => els.map((e) => e.style.background));
  assert.ok(cores.length >= 6);
  assert.equal(new Set(cores).size, cores.length, `cores repetidas: ${cores.join(' | ')}`);
  const todas = await p.locator('.card-serv .avatar').evaluateAll((els) => els.filter((e) => e.classList.contains('avatar-inicial')).length);
  assert.equal(todas, cores.length);
  await ctx.close();
}

await b.close();
assert.deepEqual(erros, []);
console.log('e2e18 ok');
