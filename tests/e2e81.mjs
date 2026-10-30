/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Auditoria do Artifact (Serviços e Planos): lista vazia, erros de formulário VISÍVEIS (dentro da janela, também no 390 px), duplo clique (cria uma vez só),
// Escape descarta, remover serviço com e sem histórico (desativa × apaga), plano sem/com assinatura, assinatura sem cliente, mesmo cliente duas vezes,
// mensalidade repetida, plano usado no Atender (saldo com o mês por extenso, total já sem o que o plano cobre, intervalo entre atendimentos) e textos certos.
// Computador e 390 px, tema claro e escuro. Relógio fixo; loja Dalforno (Alan).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const ok = (m) => console.log('✓', m);
const TELAS = [{ nome: 'desktop', w: 1366, h: 820 }, { nome: '390', w: 390, h: 800 }];

async function rodar(tela, tema) {
  const rot = `${tela.nome}/${tema}`;
  const touch = tela.w < 700;
  const ctx = await b.newContext({ viewport: { width: tela.w, height: tela.h }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push(`${rot} PAGE: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(`${rot} ${m.text()}`); });
  p.on('dialog', async (d) => { erros.push(`${rot} DIALOG: ${d.message()}`); await d.dismiss(); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t === 'claro' ? 'light' : 'dark'), tema);
  const T = (id) => p.getByTestId(id);
  await T('demo-loja-dalforno').click(); await T('demo-alan').click(); await T('nav-agenda').click();

  const semRolagem = async (onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${rot}: sem rolagem lateral em ${onde}`);
  const visivel = async (loc, onde) => {
    await loc.waitFor();
    let bx;
    for (let i = 0; i < 20; i++) {
      bx = await loc.boundingBox(); const vp = p.viewportSize();
      if (bx && bx.x >= 0 && bx.x + bx.width <= vp.width + 1 && bx.y >= 0 && bx.y + bx.height <= vp.height + 1) return;
      await p.waitForTimeout(100);
    }
    assert.fail(`${rot}: ${onde} fora da tela ${JSON.stringify(bx)}`);
  };
  const limpar = async () => { for (let i = 0; i < 3 && await p.locator('[role=dialog]').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(120); } };
  const alerta = (texto) => p.locator('[role=dialog] [role=alert]', { hasText: texto });
  const aviso = (texto) => p.locator('[role=status], .toast', { hasText: texto });

  // ---------- SERVIÇOS ----------
  await T('nav-servicos').click();
  const itens = () => p.locator('main li, main article, main .cartao-servico').filter({ hasText: /Código \d+/ });
  const n0 = await itens().count();
  assert.equal(n0, 5, `${rot}: a barbearia começa com 5 serviços`);
  await T('novo-servico').click();
  await T('salvar-servico').click();
  await visivel(alerta('Informe o nome do serviço.'), 'erro: serviço sem nome');
  await T('srv-nome').fill('Servico Teste');
  await T('srv-preco').fill('-5'); await T('salvar-servico').click();
  await visivel(alerta('Informe o preço.'), 'erro: preço negativo');
  await T('srv-preco').fill('30'); await T('srv-dur').fill('0'); await T('salvar-servico').click();
  await visivel(alerta('A duração precisa ser maior que zero'), 'erro: duração zero');
  await T('srv-dur').fill('30'); await T('srv-codigo').fill('1'); await T('salvar-servico').click();
  await visivel(alerta('Já existe serviço com o código 1.'), 'erro: código repetido');
  assert.equal(await itens().count(), n0, `${rot}: serviço recusado não entra na lista`);
  await T('srv-codigo').fill('77');
  await T('salvar-servico').dblclick();
  await T('salvar-servico').waitFor({ state: 'detached' });
  assert.equal(await itens().count(), n0 + 1, `${rot}: duplo clique cria um serviço só`);
  assert.equal(await itens().filter({ hasText: 'Servico Teste' }).count(), 1, `${rot}: o novo aparece uma vez`);
  await visivel(aviso('Serviço salvo.'), 'aviso "Serviço salvo."');
  ok(`${rot}: Serviços: erros na tela (nome, preço, duração, código) e duplo clique cria um só`);

  await T('novo-servico').click(); await T('srv-nome').fill('Rascunho Que Some');
  await limpar();
  assert.equal(await p.getByText('Rascunho Que Some').count(), 0, `${rot}: Escape descarta o serviço novo`);
  await T('novo-servico').click();
  assert.equal(await T('srv-nome').inputValue(), '', `${rot}: serviço novo abre limpo`);
  assert.equal(await p.locator('[role=dialog] [role=alert]').count(), 0, `${rot}: sem erro antigo`);
  await limpar();

  // remover: sem histórico apaga; com histórico só desativa
  await itens().filter({ hasText: 'Servico Teste' }).getByRole('button', { name: 'Editar' }).click();
  await p.getByRole('button', { name: 'Remover', exact: true }).click();
  await visivel(aviso('Serviço removido.'), 'aviso de serviço removido');
  assert.equal(await itens().count(), n0, `${rot}: serviço sem histórico some da lista`);
  await itens().filter({ hasText: 'Corte na máquina' }).getByRole('button', { name: 'Editar' }).click();
  await p.getByRole('button', { name: 'Remover', exact: true }).click();
  await visivel(aviso('O serviço tem histórico e foi desativado.'), 'aviso de serviço desativado');
  assert.equal(await itens().count(), n0, `${rot}: serviço com histórico continua na lista`);
  assert.match(await itens().filter({ hasText: 'Corte na máquina' }).innerText(), /Desativado/, `${rot}: marcado como Desativado`);
  await semRolagem('Serviços');
  await T('nav-agenda').click(); await T('atender').click();
  assert.equal(await p.locator('[data-testid^="atender-srv-"]').count(), 4, `${rot}: o Atender oferece só os 4 ativos`);
  assert.equal(await p.locator('[role=dialog]').getByText('Corte na máquina').count(), 0, `${rot}: o desativado não aparece no Atender`);
  await limpar();
  ok(`${rot}: remover serviço sem histórico apaga; com histórico desativa e some do Atender`);

  // ---------- PLANOS ----------
  await T('nav-planos').click(); await T('tela-planos').waitFor();
  assert.match(await T('tela-planos').innerText(), /Nenhuma assinatura/, `${rot}: sem assinatura diz isso`);
  assert.match(await T('tela-planos').innerText(), /Crie primeiro um plano na aba “Planos”\./, `${rot}: orienta a criar o plano antes`);
  await p.getByRole('tab', { name: 'Planos', exact: true }).click();
  assert.match(await T('tela-planos').innerText(), /Nenhum plano/, `${rot}: sem plano diz isso`);
  await T('novo-plano').click();
  await T('salvar-plano').click();
  await visivel(alerta('Dê um nome ao plano (2 a 60 letras).'), 'erro: plano sem nome');
  await T('plano-nome').fill('Plano A'); await T('salvar-plano').click();
  await visivel(alerta('Informe o valor mensal do plano.'), 'erro: plano sem valor');
  await T('plano-preco').fill('60'); await T('plano-cortes').fill('0'); await T('salvar-plano').click();
  await visivel(alerta('Atendimentos por mês: de 1 a 31.'), 'erro: 0 atendimentos');
  await T('plano-cortes').fill('2'); await T('salvar-plano').click();
  await visivel(alerta('Escolha de 1 a 10 serviços que o plano inclui'), 'erro: plano sem serviço');
  await p.locator('[data-testid^="plano-srv-"]').first().check();
  await T('salvar-plano').dblclick();
  await T('salvar-plano').waitFor({ state: 'detached' });
  assert.equal(await p.locator('[data-testid^="plano-p"]').count(), 1, `${rot}: duplo clique cria um plano só`);
  assert.match(await T('planos-lista').innerText(), /R\$ 60,00\/mês[\s\S]*2 atendimentos por mês/, `${rot}: o plano mostra valor e atendimentos`);
  ok(`${rot}: Planos: lista vazia, erros na tela (nome, valor, atendimentos, serviço) e duplo clique cria um só`);

  // assinatura
  await p.getByRole('tab', { name: 'Assinaturas' }).click();
  await T('nova-assinatura').click();
  await T('salvar-assinatura').click();
  await visivel(alerta('Escolha o cliente.'), 'erro: assinatura sem cliente');
  await T('atender-cliente-abrir').click(); await p.locator('[data-testid^="atender-cliente-c"]').first().click();
  await T('salvar-assinatura').dblclick();
  await T('salvar-assinatura').waitFor({ state: 'detached' });
  assert.equal(await p.locator('[data-testid^="situacao-"]').count(), 1, `${rot}: duplo clique cria uma assinatura só`);
  const id = (await p.locator('[data-testid^="situacao-"]').first().getAttribute('data-testid')).replace('situacao-', '');
  assert.match(await T(`situacao-${id}`).innerText(), /Aguardando/, `${rot}: sem mensalidade, aguardando`);
  await T('nova-assinatura').click();
  await T('atender-cliente-abrir').click(); await p.locator('[data-testid^="atender-cliente-c"]').first().click();
  await T('salvar-assinatura').click();
  await visivel(alerta('Esse cliente já tem um plano em andamento.'), 'erro: mesmo cliente duas vezes');
  await limpar();
  assert.equal(await p.locator('[data-testid^="situacao-"]').count(), 1, `${rot}: segunda assinatura recusada`);
  await T(`pagar-${id}`).click();
  await T('salvar-mensalidade').dblclick();
  await visivel(aviso('Mensalidade de outubro/2026 registrada.'), 'aviso de mensalidade');
  await limpar();
  assert.match(await T(`situacao-${id}`).innerText(), /Ativa/, `${rot}: com mensalidade, ativa`);
  assert.match(await T(`saldo-${id}`).innerText(), /2 de 2/, `${rot}: saldo 2 de 2`);
  await T(`pagar-${id}`).click(); await T('salvar-mensalidade').click();
  await visivel(alerta('A mensalidade de outubro/2026 já está registrada.'), 'erro: mensalidade repetida');
  await limpar();
  assert.match(await T(`saldo-${id}`).innerText(), /2 de 2/, `${rot}: mensalidade repetida não muda o saldo`);
  ok(`${rot}: assinatura sem cliente, duplicada e mensalidade repetida são recusadas com mensagem`);

  // plano usado no Atender
  await T('nav-agenda').click(); await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-cliente-abrir').click(); await p.locator('[data-testid^="atender-cliente-c"]').first().click();
  const saldo = await T('atender-plano-saldo').innerText();
  assert.match(saldo, /Restam 2 atendimentos em outubro\/2026/, `${rot}: saldo com o mês por extenso (era: ${saldo})`);
  assert.doesNotMatch(saldo, /2026-10/, `${rot}: nunca mostra o mês em formato de máquina`);
  const total = await T('atender-total').innerText();
  assert.match(total, /Total: R\$ 0,00 \(o plano cobre R\$ 40,00\)/, `${rot}: o total já desconta o plano (era: ${total})`);
  await T('atender-usar-plano').uncheck();
  assert.match(await T('atender-total').innerText(), /Total: R\$ 40,00/, `${rot}: sem usar o plano, cobra o preço normal`);
  await T('atender-usar-plano').check();
  await T('salvar-atender').click(); await T('salvar-atender').waitFor({ state: 'detached' });
  await limpar();
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-cliente-abrir').click(); await p.locator('[data-testid^="atender-cliente-c"]').first().click();
  assert.match(await T('atender-plano-saldo').innerText(), /Restam 1 atendimento em outubro\/2026/, `${rot}: saldo desce para 1 (singular)`);
  await T('salvar-atender').click();
  await visivel(alerta('Esse plano pede 3 dias entre um corte e outro.'), 'erro: intervalo do plano');
  await limpar();
  await T('nav-planos').click(); await p.getByRole('tab', { name: 'Assinaturas' }).click();
  assert.match(await T(`saldo-${id}`).innerText(), /1 de 2/, `${rot}: saldo na tela de Planos acompanha (1 de 2)`);
  ok(`${rot}: plano no Atender: saldo com mês por extenso, total sem o que o plano cobre, intervalo recusado`);

  // remover plano com assinatura: sai de venda, fica no histórico; encerrar pede motivo
  await p.getByRole('tab', { name: 'Planos', exact: true }).click();
  await p.locator('[data-testid^="plano-remover-"]').first().click();
  await visivel(aviso('Plano com assinaturas: saiu de venda, mas ficou no histórico.'), 'aviso de plano com assinatura');
  assert.match(await T('planos-lista').innerText(), /Fora de venda/, `${rot}: marcado Fora de venda`);
  await p.getByRole('tab', { name: 'Assinaturas' }).click();
  await T(`encerrar-${id}`).click();
  await T('encerrar-motivo').fill('x'); await T('confirmar-encerrar').click();
  await visivel(alerta('Diga o motivo (5 a 200 letras).'), 'erro: encerrar sem motivo');
  await limpar();
  assert.doesNotMatch(await T(`situacao-${id}`).innerText(), /Encerrad/, `${rot}: sem motivo não encerra`);
  await semRolagem('Planos');
  ok(`${rot}: plano com assinatura só sai de venda; encerrar pede motivo`);
  await ctx.close();
}

for (const tela of TELAS) for (const tema of ['claro', 'escuro']) await rodar(tela, tema);
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e81 ok');
