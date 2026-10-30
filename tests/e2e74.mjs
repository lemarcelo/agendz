/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço (Artifact): o dono cria um plano, assina um cliente, registra a mensalidade (a assinatura fica ativa, com saldo),
// a página pública #planos lista o plano, recebe o pedido e consulta o saldo por telefone (resposta genérica). Relógio fixo. 1440 e 390 px.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const url = new URL('../dist/index.html', import.meta.url).href + '?loja=dalforno';
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
  await T('demo-alan').click(); await T('agenda-topo').waitFor();
  await T('nav-planos').click(); await T('tela-planos').waitFor();

  // catálogo: novo plano
  await p.getByRole('tab', { name: 'Planos', exact: true }).click().catch(async () => { await p.getByRole('button', { name: 'Planos', exact: true }).click(); });
  await T('novo-plano').click();
  await T('plano-nome').fill('Degradê em Dia');
  await T('plano-preco').fill('75');
  await T('plano-cortes').fill('2');
  await p.locator('[data-testid^="plano-srv-"]').first().check();
  await T('salvar-plano').click();
  await T('planos-lista').getByText('Degradê em Dia').waitFor();
  ok(`${vp.width}px: plano criado no catálogo`);

  // assinatura: cliente + plano; sem mensalidade ainda não é "Ativa"
  await p.getByRole('tab', { name: 'Assinaturas' }).click().catch(async () => { await p.getByRole('button', { name: 'Assinaturas' }).click(); });
  await T('nova-assinatura').click();
  await T('atender-cliente-abrir').click();
  await p.locator('[data-testid^="atender-cliente-c"]').first().click();
  await T('salvar-assinatura').click();
  const linha = p.locator('[data-testid^="situacao-"]').first();
  await linha.waitFor();
  assert.match(await linha.innerText(), /Aguardando/i, 'sem mensalidade, a assinatura espera o pagamento');
  const id = (await linha.getAttribute('data-testid')).replace('situacao-', '');
  await T(`pagar-${id}`).click();
  await T('salvar-mensalidade').click();
  await p.waitForFunction((i) => /Ativa/.test(document.querySelector(`[data-testid="situacao-${i}"]`)?.textContent || ''), id);
  assert.match(await T(`saldo-${id}`).innerText(), /2 de 2/, 'saldo do mês: 2 de 2');
  ok(`${vp.width}px: assinatura criada; mensalidade registrada deixa ativa com saldo 2 de 2`);

  // mensalidade não se repete no mesmo mês
  await T(`pagar-${id}`).click();
  await T('salvar-mensalidade').click();
  assert.ok(await p.getByText(/já|registrad/i).first().isVisible(), 'mesmo mês duas vezes é recusado com aviso');
  await p.keyboard.press('Escape');

  // página pública: o plano aparece e o pedido entra
  await p.evaluate(() => { location.hash = '#planos'; });
  await T('pagina-planos').waitFor();
  await T('planos-publicos').getByText('Degradê em Dia').waitFor();
  await p.locator('[data-testid^="pub-quero-"]').first().click();
  await T('pub-pedido-nome').fill('Visitante Teste');
  await T('pub-pedido-telefone').fill('51988887777');
  await T('pub-pedido-enviar').click();
  await p.getByText(/pedido (enviado|recebido)|recebemos/i).first().waitFor();
  ok(`${vp.width}px: página pública lista o plano e recebe o pedido`);

  // saldo por telefone de quem não tem plano: resposta genérica, sem dado de ninguém
  await T('pub-saldo-telefone').fill('51900000000');
  await T('pub-saldo-consultar').click();
  await T('pub-saldo-nenhum').waitFor();
  assert.equal(await T('pub-saldo-lista').count(), 0);
  ok(`${vp.width}px: consulta de saldo sem plano devolve resposta genérica`);

  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral (${vp.width}px)`);
  await ctx.close();
}
assert.deepEqual(erros, []);
await b.close();
ok('e2e74 completo');
