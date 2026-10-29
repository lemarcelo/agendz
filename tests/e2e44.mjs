/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Assistente de início (pré-visualização): descrever um serviço próprio na hora, ver na lista, remover, e seguir só com ele (sem marcar o catálogo).
// Computador e celular (390 px), sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Depois dos serviços o assistente passa por Produtos e Comissão (opcionais): estes testes só querem chegar à Equipe.
const passarProdutosEComissao = async (p) => { await p.getByTestId('pa-pular-produtos').click(); };

const ok = (m) => console.log('✓', m);
const base = new URL('../dist/index.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
  const touch = vp.width < 700;
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  await p.goto(`${base}?loja=dalforno`);
  const T = (id) => p.getByTestId(id);
  await T('ver-primeiro-acesso').click();
  await T('pa-proprio').waitFor();
  assert.equal(await T('pa-continuar-servicos').isDisabled(), true);
  // validações na tela
  await T('pa-proprio-adicionar').click();
  assert.match(await T('pa-erro').innerText(), /nome do serviço/);
  await T('pa-proprio-nome').fill('Sobrancelha na linha');
  await T('pa-proprio-preco').fill('abc'); await T('pa-proprio-duracao').fill('15');
  await T('pa-proprio-adicionar').click();
  assert.match(await T('pa-erro').innerText(), /preço/);
  await T('pa-proprio-preco').fill('25,50');
  await T('pa-proprio-adicionar').click();
  await T('pa-proprio-0').waitFor();
  assert.match(await T('pa-proprio-0').innerText(), /Sobrancelha na linha.*25,50.*15 min/s);
  assert.equal(await T('pa-continuar-servicos').isDisabled(), false, 'só o serviço próprio já libera o Continuar');
  assert.match(await T('pa-continuar-servicos').innerText(), /\(1\)/);
  // nome repetido (inclusive o do catálogo) é recusado
  await T('pa-proprio-nome').fill('barba'); await T('pa-proprio-preco').fill('10'); await T('pa-proprio-duracao').fill('10');
  await T('pa-proprio-adicionar').click();
  assert.match(await T('pa-erro').innerText(), /Já existe/);
  // remover e adicionar de novo
  await T('pa-proprio-remover-0').click();
  assert.equal(await T('pa-proprio-0').count(), 0);
  assert.equal(await T('pa-continuar-servicos').isDisabled(), true);
  await T('pa-proprio-nome').fill('Massagem relaxante nos ombros'); await T('pa-proprio-categoria').fill('Cabelo'); await T('pa-proprio-preco').fill('60'); await T('pa-proprio-duracao').fill('40');
  await T('pa-proprio-adicionar').click();
  await T('pa-proprio-0').waitFor();
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral (${vp.width}px)`);
  await T('pa-continuar-servicos').click();
  await passarProdutosEComissao(p); await T('pa-equipe').waitFor();
  assert.match(await T('pa-aviso').innerText(), /1 serviço criado/);
  ok(`${vp.width}px: serviço próprio descrito na hora segue para a equipe`);
  await ctx.close();
}
assert.deepEqual(erros, []);
await b.close();
ok('e2e44 completo');
