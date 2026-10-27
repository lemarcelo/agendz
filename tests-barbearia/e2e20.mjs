// Produtos e serviços adicionados ao atendimento (computador e celular).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// A Agenda mostra um dia por vez (v73): procura o cartão hoje, depois nos dias seguintes e nos anteriores, e devolve o primeiro que achar.
const irAteCartao = async (p, seletor, dias = 21) => {
  const alvo = p.locator(seletor);
  await p.getByTestId('agenda-modo-horarios').click().catch(() => {});
  for (const dir of ['Próximo', 'Anterior']) {
    await p.getByRole('button', { name: 'Hoje', exact: true }).click();
    for (let i = 0; i <= dias; i++) { if (await alvo.count()) return alvo.first(); await p.getByRole('button', { name: dir, exact: true }).click(); }
  }
  throw new Error('cartão não encontrado em ±' + dias + ' dias: ' + seletor);
};

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index-barbearia.html', import.meta.url).href;
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
  await T('demo-alan').click();
  // cadastra um produto novo no Estoque
  await T('nav-estoque').click();
  await T('novo-produto').click();
  assert.equal(await T('mat-tipo').inputValue(), 'produto');
  await T('mat-nome').fill('Shampoo anticaspa');
  await T('mat-preco').fill('30');
  await T('mat-comissao').fill('10');
  assert.match(await T('mat-comissao-reais').innerText(), /R\$\s*3,00/, `${nome}: mostra a comissão em reais ao digitar o percentual`);
  await T('mat-preco').fill('50');
  assert.match(await T('mat-comissao-reais').innerText(), /R\$\s*5,00/, `${nome}: atualiza com o preço`);
  await T('mat-preco').fill('30');
  await T('mat-estoque').fill('6');
  await p.getByRole('button', { name: 'Salvar' }).click();
  assert.match(await T('tabela-materiais').innerText(), /Shampoo anticaspa/);
  assert.match(await T('tabela-materiais').innerText(), /produto/i);
  await semRolagem(p, `${nome}: estoque`);
  // atendimento local com serviço e produto
  await T('nav-agenda').click();
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await p.locator('[data-testid^="atender-prod-"]').first().fill('2');
  await T('atender-profissional').selectOption('u-kiko');
  await semRolagem(p, `${nome}: modal local com produtos`);
  await T('salvar-atender').click();
  await T('salvar-atender').waitFor({ state: 'detached' });
  // ficha de um agendamento existente: adicionar serviço e produto sem mudar o status
  await (await irAteCartao(p, '[data-testid=\"cartao\"]')).click();
  await T('adicionar-itens').waitFor();
  const chipAntes = (await p.locator('.gaveta-status .chip').first().innerText()).trim();
  const servAntes = await T('valores-gaveta').locator('li').count();
  await T('add-servico-sel').selectOption({ index: 1 });
  await T('add-servico').click();
  await p.waitForTimeout(150);
  assert.equal(await T('valores-gaveta').locator('li').count(), servAntes + 1, `${nome}: serviço adicionado`);
  await T('add-produto-sel').selectOption({ index: 1 });
  await T('add-produto-qtd').fill('2');
  await T('add-produto').click();
  await T('produtos-gaveta').waitFor();
  assert.match(await T('total-com-produtos').innerText(), /Total com produtos/);
  assert.equal((await p.locator('.gaveta-status .chip').first().innerText()).trim(), chipAntes, `${nome}: o status não muda`);
  await semRolagem(p, `${nome}: ficha com produtos`);
  // atendimento concluído também recebe serviço e produto
  await p.keyboard.press('Escape');
  const concl = await irAteCartao(p, '[data-testid="cartao"][data-status="verde"]', 30); // os concluídos da demonstração (cadastro de cliente), não o local de hoje
  assert.ok(await concl.count(), `${nome}: achou um atendimento concluído na agenda`);
  {
    await concl.click();
    await T('adicionar-itens').waitFor();
    const n0 = await T('valores-gaveta').locator('li').count();
    await T('add-servico-sel').selectOption({ index: 1 });
    await T('add-servico').click();
    await p.waitForTimeout(150);
    assert.equal(await T('valores-gaveta').locator('li').count(), n0 + 1, `${nome}: serviço adicionado ao concluído`);
    assert.match(await p.locator('.gaveta-status .chip').first().innerText(), /Conclu/i, `${nome}: continua concluído`);
    // status escolhido à mão com o horário já passado: o sistema não desfaz (confirmado não conclui sozinho)
    await p.locator('.mais button.link').click();
    await T('corrigir-status').selectOption('confirmado');
    await p.waitForTimeout(200);
    assert.match(await p.locator('.gaveta-status .chip').first().innerText(), /Confirmado/i, `${nome}: continua confirmado, como escolhido`);
    assert.equal(await T('status-manual').count(), 1, `${nome}: avisa que o status é do usuário`);
  }
  await ctx.close();
}

await b.close();
assert.deepEqual(erros, []);
console.log('e2e20 ok');
