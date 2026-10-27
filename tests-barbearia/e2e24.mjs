// Forma de pagamento no atendimento local, lançamentos no financeiro, conciliação em grupo e integração Pix desligada.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index-barbearia.html', import.meta.url).href);
const T = (id) => p.getByTestId(id);
const ok = (m) => console.log('✓', m);

await T('demo-alan').click();
const local = async (forma) => {
  await T('nav-agenda').click();
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  assert.equal(await T('atender-forma').inputValue(), 'pix', 'a forma padrão já vem escolhida');
  if (forma !== 'pix') await T('atender-forma').selectOption(forma);
  await T('salvar-atender').click();
  await T('salvar-atender').waitFor({ state: 'detached' });
};
await local('dinheiro');
await local('pix');
await T('nav-financeiro').click();
await p.getByRole('tab', { name: 'Lançamentos' }).click();
const corpo = await p.locator('main').innerText();
assert.match(corpo, /atendimento local/i);
assert.match(corpo, /Atendimentos \(Dinheiro\)|\(Dinheiro\)/);
ok('atendimento local aparece nos lançamentos com a forma');

// conta aberta ao banco, movimento de entrada somando os dois atendimentos, conciliação em grupo
await p.getByRole('tab', { name: 'Contas' }).click();
await T('of-conectar').click(); await T('of-autorizar').click();
const precos = [...corpo.matchAll(/R\$\s?([\d.]+,\d{2})/g)].map((m) => m[1]);
assert.ok(precos.length >= 2);
await T('nav-mensagens').click(); // o banco simulado só existe na tela Mensagens
await p.getByRole('tab', { name: 'Banco' }).click();
await T('banco-av-valor').fill('80');
await p.locator('select[aria-label="Tipo"]').selectOption('credito');
await p.locator('input[aria-label="Descrição do movimento"]').fill('Pix do dia');
await T('banco-av-ok').click();
await T('nav-financeiro').click();
await p.getByRole('tab', { name: 'Conciliação' }).click();
await p.getByRole('button', { name: /Sincronizar/ }).first().click();
await T('conciliar-grupo').waitFor();
await T('grupo-soma').waitFor();
assert.equal(await T('conciliar-grupo-ok').isDisabled(), true, 'sem marcar nada, não concilia');
if (await T('usar-sugestao').count()) {
  await T('usar-sugestao').first().click();
  assert.equal(await T('conciliar-grupo-ok').isDisabled(), false, 'soma bate: libera');
  await T('conciliar-grupo-ok').click();
  await T('grupo-feito').waitFor();
  await T('desfazer-grupo').first().click();
  assert.equal(await T('grupo-feito').count(), 0);
  ok('conciliação em grupo: sugerida, feita e desfeita');
} else {
  console.log('(sem sugestão: o preço do serviço não soma 80 neste seed; teste manual de seleção)');
  await p.locator('[data-testid^="gl-"]').first().check();
  assert.match(await T('grupo-soma').innerText(), /diferença/);
  ok('conciliação em grupo: soma diferente mostra a diferença');
}

// integração Pix desligada
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Regras' }).click();
await T('regras-pagamento').waitFor();
await p.getByText('Usa integração Pix').click();
await T('nav-financeiro').click();
assert.equal(await p.getByRole('tab', { name: 'Cobranças Pix' }).count(), 0, 'sem integração, sem aba de cobranças Pix');
await p.getByRole('tab', { name: 'Conciliação' }).click();
await T('sem-pix-conciliacao').waitFor();
ok('integração Pix desligada esconde cobrança e bloqueia a conciliação');
console.log('erros', erros);
assert.equal(erros.length, 0, erros.join('\n'));
await b.close();
