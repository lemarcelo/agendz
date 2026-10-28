/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Assistente de início (pré-visualização) com Produtos e Comissão (5d-3), nas duas lojas de exemplo (barbearia e estética), no computador e no celular
// (390 px), sem rolagem lateral: sugestões por tipo, validações na tela, comissão geral, comissão por pessoa (usar a geral ou percentual próprio).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const base = new URL('../dist/index.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
for (const loja of ['dalforno', 'apex']) {
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
    const touch = vp.width < 700;
    const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR' });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    const T = (id) => p.getByTestId(id);
    const semRolagem = async (onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `rolagem lateral em ${onde} (${loja}, ${vp.width}px)`);
    await p.goto(`${base}?loja=${loja}`);
    await T('ver-primeiro-acesso').click();
    await T('pa-servicos').waitFor();
    for (const e of ['servicos', 'produtos', 'comissao', 'equipe', 'expediente', 'pronto']) assert.equal(await T(`pa-etapa-${e}`).count(), 1, `etapa ${e}`);
    await semRolagem('etapas');

    // Produtos: sugestões do tipo, nada marcado, Continuar travado
    await T('pa-pular-servicos').click();
    await T('pa-produtos').waitFor();
    const itens = p.locator('[data-testid^="pa-prod-item-"]');
    assert.ok((await itens.count()) >= 4, 'sugestões de produto do tipo');
    assert.equal(await p.locator('[data-testid^="pa-prod-marcar-"]:checked').count(), 0, 'nada vem marcado');
    assert.equal(await T('pa-continuar-produtos').isDisabled(), true);
    const primeiro = (await itens.first().getAttribute('data-testid')).replace('pa-prod-item-', '');
    await T(`pa-prod-marcar-${primeiro}`).check();
    await T(`pa-prod-preco-${primeiro}`).fill('49,90'); await T(`pa-prod-comissao-${primeiro}`).fill('150');
    await T('pa-continuar-produtos').click();
    assert.match(await T('pa-erro').innerText(), /comissão/);
    await T(`pa-prod-comissao-${primeiro}`).fill('10'); await T(`pa-prod-estoque-${primeiro}`).fill('3');
    // produto próprio: validações e lista
    await T('pa-prod-adicionar').click();
    assert.match(await T('pa-erro').innerText(), /nome do produto/);
    await T('pa-prod-nome').fill('Gel fixador'); await T('pa-prod-novo-preco').fill('abc');
    await T('pa-prod-adicionar').click();
    assert.match(await T('pa-erro').innerText(), /preço/);
    await T('pa-prod-novo-preco').fill('20');
    await T('pa-prod-adicionar').click();
    await T('pa-prod-proprio-0').waitFor();
    assert.match(await T('pa-prod-proprio-0').innerText(), /Gel fixador.*20,00/s);
    await T('pa-prod-nome').fill('gel FIXADOR'); await T('pa-prod-novo-preco').fill('5');
    await T('pa-prod-adicionar').click();
    assert.match(await T('pa-erro').innerText(), /Já existe/);
    assert.match(await T('pa-continuar-produtos').innerText(), /\(2\)/);
    await semRolagem('produtos');
    await T('pa-continuar-produtos').click();
    await T('pa-comissao').waitFor();
    assert.match(await T('pa-aviso').innerText(), /2 produtos criados/);

    // Comissão geral: 0 a 100
    await T('pa-comissao-geral').fill('');
    await T('pa-continuar-comissao').click();
    assert.match(await T('pa-erro').innerText(), /0 a 100/);
    await T('pa-comissao-geral').fill('120');
    await T('pa-continuar-comissao').click();
    assert.match(await T('pa-erro').innerText(), /0 a 100/);
    assert.equal(await T('pa-comissao-geral').inputValue(), '120');
    await T('pa-comissao-geral').fill('40');
    await semRolagem('comissão');
    await T('pa-continuar-comissao').click();
    await T('pa-equipe').waitFor();
    assert.match(await T('pa-aviso').innerText(), /definida em 40%/);

    // Equipe: usar a geral (mostra o valor) ou percentual próprio
    assert.match(await T('pa-comissao-modo-0').innerText(), /40%/);
    assert.equal(await T('pa-comissao-pct-0').count(), 0);
    await T('pa-nome-0').fill('Zé Maria');
    await T('pa-comissao-modo-0').selectOption('propria');
    await T('pa-comissao-pct-0').waitFor();
    await T('pa-criar-acessos').click();
    assert.match(await T('pa-erro').innerText(), /comissão de “Zé Maria”/);
    await T('pa-comissao-pct-0').fill('25,5');
    await semRolagem('equipe');
    await T('pa-criar-acessos').click();
    await T('pa-acessos').waitFor();
    await T('pa-anotei').click();
    await T('pa-expediente').waitFor();
    ok(`${loja} ${vp.width}px: produtos, comissão geral e comissão por pessoa no assistente`);
    await ctx.close();
  }
}
await b.close();
assert.deepEqual(erros, [], 'erros de página');
