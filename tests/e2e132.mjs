/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// E3 (trocar de plano pagando só a diferença) na demonstração (dist/index.html, Dalforno, Alan), ponta a ponta:
//  o dono cria um plano que RESTRINGE o link (Corte Degradê) e outro com mais serviços (Degradê + Barba), define 20% de desconto na diferença (101% é recusado), assina um cliente e
//  registra a mensalidade; o cliente abre o #agendar, escolhe Barba (fora do plano restrito), digita o telefone e vê o aviso e os planos com mais serviços com a diferença já descontada;
//  escolhe e pede a troca; o dono vê o pedido em Planos > Pedidos, aceita com a forma de pagamento e o cliente passa ao plano novo (o plano antigo fica encerrado).
// Relógio fixo. 1440 e 390 px (fonte larga), sem rolagem lateral. E2E_CAPTURAS=<pasta> grava as imagens.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const url = new URL('../dist/index.html', import.meta.url).href + '?loja=dalforno';
const CAP = process.env.E2E_CAPTURAS;
const b = await chromium.launch();
const erros = [];
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
  const touch = vp.width < 700;
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // segunda-feira
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  const T = (id) => p.getByTestId(id);
  const semRolagem = async (onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral (${vp.width}px) ${onde}`);
  const foto = async (nome) => { if (!CAP) return; await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/e3-demo-${nome}-${vp.width}.png`, fullPage: true }); };
  const aba = async (nome) => { await p.getByRole('tab', { name: nome }).first().click().catch(async () => { await p.getByRole('button', { name: nome }).first().click(); }); };

  await T('demo-alan').click(); await T('agenda-topo').waitFor();
  await T('nav-planos').click(); await T('tela-planos').waitFor();
  await aba('Planos');

  // plano atual: só o Corte Degradê, restringindo o link aos serviços dele
  await T('novo-plano').click();
  await T('plano-nome').fill('Degradê em Dia'); await T('plano-preco').fill('75'); await T('plano-cortes').fill('2');
  await p.locator('[data-testid="plano-srv-s-degrade"]').check();
  await p.locator('label:has([data-testid="plano-restringe"])').click();
  await T('salvar-plano').click();
  await T('planos-lista').getByText('Degradê em Dia').waitFor();
  // plano com mais serviços (Degradê + Barba), mais caro
  await T('novo-plano').click();
  await T('plano-nome').fill('Degradê e Barba'); await T('plano-preco').fill('120'); await T('plano-cortes').fill('4');
  await p.locator('[data-testid="plano-srv-s-degrade"]').check(); await p.locator('[data-testid="plano-srv-s-barba"]').check();
  await T('salvar-plano').click();
  await T('planos-lista').getByText('Degradê e Barba').waitFor();
  // desconto da loja sobre a diferença
  await T('troca-config').waitFor();
  await T('troca-desconto').fill('101'); await T('troca-salvar').click();
  await T('troca-erro').waitFor();
  await T('troca-desconto').fill('20'); await T('troca-salvar').click();
  await T('troca-salvo').waitFor();
  assert.equal(await T('troca-erro').count(), 0, 'o erro some depois de salvar');
  await semRolagem('configuração da troca'); await foto('config');
  ok(`${vp.width}px: planos criados e desconto da troca salvo (101% é recusado)`);

  // assinatura do Marcelo Santos (55 99711-4020) no plano atual + mensalidade
  await aba('Assinaturas');
  await T('nova-assinatura').click();
  const valorAtual = await T('assinatura-plano').evaluate((s) => [...s.options].find((o) => o.textContent.startsWith('Degradê em Dia')).value);
  await T('assinatura-plano').selectOption(valorAtual);
  await T('atender-cliente-abrir').click();
  await T('atender-cliente-c-marcelo').click();
  await T('salvar-assinatura').click();
  const linha = p.locator('[data-testid^="situacao-"]').first();
  await linha.waitFor();
  const idAss = (await linha.getAttribute('data-testid')).replace('situacao-', '');
  await T(`pagar-${idAss}`).click(); await T('salvar-mensalidade').click();
  await p.waitForFunction((i) => /Ativa/.test(document.querySelector(`[data-testid="situacao-${i}"]`)?.textContent || ''), idAss);
  ok(`${vp.width}px: cliente assinou o plano atual e a mensalidade foi registrada`);

  // ---- o cliente no link: Barba está fora do plano restrito, então o link recusa e oferece a troca
  await p.evaluate(() => { location.hash = '#agendar'; });
  await T('pub-aba-agendar').waitFor();
  await T('pub-srv-s-barba').check(); await T('pub-barb-u-alan').click(); await T('pub-continuar-1').click();
  await T('pub-mais-dias').click().catch(() => {});
  await p.locator('[data-testid^="pub-dia-"]').first().click();
  await p.locator('[data-testid^="pub-hora-"]').first().click();
  await T('pub-continuar-2').click();
  await T('pub-nome').fill('Marcelo'); await T('pub-telefone').fill('55997114020');
  await T('pub-plano-restrito').waitFor();
  await T('pub-troca').waitFor();
  assert.match(await T('pub-troca-aviso').innerText(), /só a diferença.*20% de desconto/s);
  const opcao = p.locator('[data-testid^="pub-troca-opcao-"]');
  assert.equal(await opcao.count(), 1, 'só o plano com todos os serviços do atual e mais algum');
  const idPlano = (await opcao.first().getAttribute('data-testid')).replace('pub-troca-opcao-', '');
  assert.equal((await T(`pub-troca-valor-${idPlano}`).innerText()).replace(/\s/g, ' '), 'Você paga só R$ 36,00 neste mês', '(120 − 75) com 20% de desconto');
  assert.ok(!/Degradê em Dia/.test(await T('pub-troca').innerText()), 'nunca o nome do plano atual');
  const larg = await p.evaluate(() => innerWidth);
  for (const alvo of ['pub-troca', 'pub-troca-pedir']) { const bx = await T(alvo).boundingBox(); assert.ok(bx.x >= 0 && bx.x + bx.width <= larg + 1, `${alvo} cabe na tela`); }
  await semRolagem('opções de troca'); await foto('link-opcoes');
  assert.equal(await T('pub-troca-pedir').isDisabled(), true, 'sem escolher o botão não vale');
  await opcao.first().check();
  await foto('link-escolhida');
  await T('pub-troca-pedir').click();
  await T('pub-troca-feito').waitFor();
  assert.equal(await T('pub-troca-pedir').count(), 0);
  await semRolagem('pedido de troca enviado'); await foto('link-feito');
  ok(`${vp.width}px: o link oferece a troca com a diferença descontada e grava o pedido`);

  // ---- o dono vê o pedido e aceita com a forma de pagamento
  await p.evaluate(() => { location.hash = ''; });
  await T('nav-planos').click(); await T('tela-planos').waitFor();
  await aba('Pedidos do link');
  const pedido = p.locator('[data-testid^="pedido-troca-"]').first();
  await pedido.waitFor();
  const txt = (await pedido.innerText()).replace(/\s+/g, ' ');
  assert.match(txt, /quer trocar o plano Degradê em Dia por Degradê e Barba/); assert.match(txt, /R\$ 36,00 \(com 20% de desconto\) só neste mês/);
  await semRolagem('pedido de troca no painel'); await foto('painel-pedido');
  const idPedido = (await pedido.getAttribute('data-testid')).replace('pedido-troca-', '');
  await T(`pedido-forma-${idPedido}`).selectOption('dinheiro');
  await T(`pedido-aceitar-${idPedido}`).click();
  await T(`pedido-troca-${idPedido}`).waitFor({ state: 'detached' });
  await aba('Assinaturas');
  const lista = (await p.locator('[data-testid="tela-planos"]').innerText()).replace(/\s+/g, ' ');
  assert.match(lista, /Degradê e Barba/); assert.match(lista, /Encerrada/); assert.match(lista, /Ativa/);
  await semRolagem('depois da troca'); await foto('painel-depois');
  ok(`${vp.width}px: o dono aceitou a troca: plano antigo encerrado, novo ativo`);
  await ctx.close();
}
assert.deepEqual(erros, [], 'sem erro de página nem diálogo nativo');
await b.close();
console.log('e2e132 ok');
