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
// O seletor de profissionais é único e recolhe ao escolher: abre a lista se estiver fechada e devolve o item.
const filtroProf = async (p, id) => { const it = p.getByTestId(`filtro-${id}`); if (!(await it.isVisible().catch(() => false))) await p.getByTestId('filtro-abrir').click(); return it; };
const b = await chromium.launch();
const erros = [];
const novo = async (w, h, scheme = 'light') => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: scheme });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // relógio fixo: o resultado não depende do dia em que o teste roda
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(new URL('../dist/index-barbearia.html', import.meta.url).href);
  return p;
};
const ok = (m) => console.log('✓', m);
const arq = (nome) => ({ name: nome, mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
// O banco simulado e o chat só existem na tela Mensagens: fecha a gaveta, paga lá e reabre o cartão.
const pagar = async (p, T, nome, cpf, cartao) => {
  await p.locator('[data-testid^=pix-enviar-]').click();
  const codigo = await p.locator('[data-testid^=pix-codigo-] code').innerText();
  await p.keyboard.press('Escape'); await T('nav-mensagens').click();
  await p.getByRole('tab', { name: 'Banco' }).click();
  await T('banco-codigo').fill(codigo); await T('banco-nome').fill(nome); await T('banco-cpf').fill(cpf);
  await T('banco-pagar').click();
  await p.getByRole('tab', { name: 'Conversa' }).click();
  await T('nav-agenda').click();
  await (await irAteCartao(p, cartao)).click();
};
// 1) sem API: configuração nos avisos + cancelar com Pix pago: aviso para devolver e crédito do cliente
{
  const p = await novo(1440, 900);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-alan').click();
  await T('nav-estab').click();
  await p.getByRole('tab', { name: 'Notificações' }).click();
  assert.equal(await T('pixc-modo').inputValue(), 'ultimo_aviso');
  await p.screenshot({ path: 'shots/96-pixc-padrao.png', fullPage: true });
  await T('pixc-modo').selectOption('horas');
  await T('salvar-notifs').click();
  await p.getByText('Notificações salvas.').first().waitFor();
  await p.screenshot({ path: 'shots/97-pixc-horas.png', fullPage: true });
  await T('pixc-modo').selectOption('ultimo_aviso');
  await T('salvar-notifs').click();
  await p.getByText('Notificações salvas.').first().waitFor();
  ok('cancelamento do Pix configurável nos avisos');
  await T('nav-servicos').click();
  await p.getByRole('button', { name: 'Editar Barba Degradê' }).click();
  await T('notif-proprias').check();
  assert.equal(await T('pixc-modo').count(), 1);
  await p.screenshot({ path: 'shots/98-pixc-servico.png', fullPage: true });
  await p.keyboard.press('Escape');
  ok('serviço com avisos próprios tem a sua configuração');

  await T('nav-agenda').click();
  await (await irAteCartao(p, '[data-testid=cartao][title*="14:30 Marcelo"]')).click();
  await T('pix-gerar').click();
  await p.locator('[data-testid^=pix-codigo-]').waitFor();
  const txt = await T('bloco-pagamento').innerText();
  console.log('pendente:', txt.replace(/\s+/g, ' ').slice(0, 300));
  await p.screenshot({ path: 'shots/99-pix-pendente.png' });
  await p.locator('[data-testid^=pix-enviar-]').click();
  await p.locator('[data-testid^=pix-confirmar-]').click();
  await T('confirmar-manual-ok').click();
  await T('pix-pago').waitFor();
  await T('acao-cancelar').click();
  await T('acao-cancelar-sim').click();
  await p.getByText('Agendamento cancelado.').waitFor();
  await T('pix-creditar').waitFor();
  await p.screenshot({ path: 'shots/100-cancelado-pago.png' });
  await p.keyboard.press('Escape'); await T('nav-mensagens').click();
  const msgs = (await T('wa-msgs').innerText()).toLowerCase();
  assert.ok(!msgs.includes('pix devolvido') && !msgs.includes('devolvemos'), 'o sistema não manda nada ao cliente');
  await T('nav-financeiro').click();
  assert.match(await p.locator('main').innerText(), /agendamentos pagos pendentes de análise/);
  await T('nav-avisos').click();
  assert.match(await p.locator('main').innerText(), /Abra o agendamento e escolha/);
  await p.getByRole('button', { name: 'Abrir agendamento' }).first().click();
  await T('manter-credito').click();
  await p.getByText('Valor mantido como crédito. O cliente foi avisado no WhatsApp.').waitFor();
  await T('pix-credito-mantido').waitFor();
  assert.equal(await T('manter-credito').count(), 0);
  assert.equal(await T('pix-diferenca').count(), 0, 'cancelado não mostra "faltam R$"');
  await p.screenshot({ path: 'shots/101-credito-mantido.png' });
  await p.keyboard.press('Escape'); await T('nav-mensagens').click();
  assert.match((await T('wa-msgs').innerText()).toLowerCase(), /crédito de r\$ 40,00/, 'o cliente é avisado do crédito depois da confirmação');
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Cobranças Pix' }).click();
  assert.match(await T('lista-creditos').innerText(), /Disponível/);
  assert.doesNotMatch(await p.locator('main').innerText(), /agendamentos pagos pendentes de análise/);
  await T('nav-clientes').click();
  assert.match(await p.locator('main').innerText(), /Crédito: R\$/);
  ok('cancelar agendamento pago: aviso para devolver; o barbeiro mantém como crédito e o cliente passa a ter saldo');
  console.log('erros', erros);
}
// 2) com API: cancela pendente no banco e devolve sozinho
{
  const p = await novo(1440, 900);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-alan').click();
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Contas' }).click();
  await T('api-client-id').fill('abc12345'); await T('api-client-secret').fill('segredo123');
  await T('api-cert').setInputFiles(arq('s.cer')); await T('api-chave').setInputFiles(arq('a.key')); await T('api-cadeia').setInputFiles(arq('c.pem'));
  await T('api-testar').click();
  await T('api-ativa').waitFor();
  await T('nav-agenda').click();
  // pendente cancelado no banco pelo botão
  await (await filtroProf(p, 'u-kiko')).click();
  await (await irAteCartao(p, '[data-testid=cartao][title*="14:00 Marcelo"]')).click();
  await T('pix-gerar').click();
  await p.locator('[data-testid^=pix-codigo-]').waitFor();
  const cancelar = p.locator('[data-testid^=pix-cancelar-]').first();
  const rot = await cancelar.count() ? await cancelar.innerText() : '(sem botão na gaveta)';
  console.log('botão cancelar na ficha:', rot);
  await p.keyboard.press('Escape');
  // pago e depois agendamento cancelado -> devolve via API
  await (await filtroProf(p, 'u-alan')).click();
  await (await irAteCartao(p, '[data-testid=cartao][title*="14:30 Marcelo"]')).click();
  await T('pix-gerar').click();
  await p.locator('[data-testid^=pix-codigo-]').waitFor();
  await pagar(p, T, 'Marcelo Santos', '284.510.937-79', '[data-testid=cartao][title*="14:30 Marcelo"]');
  await T('acao-cancelar').click();
  await T('acao-cancelar-sim').click();
  await p.getByText('Agendamento cancelado.').waitFor();
  await p.waitForTimeout(300);
  await T('pix-creditar').waitFor();
  await p.screenshot({ path: 'shots/102-cancelado-pago-api.png' });
  await p.keyboard.press('Escape'); await T('nav-mensagens').click();
  const msgs = (await T('wa-msgs').innerText()).toLowerCase();
  assert.ok(!msgs.includes('pix devolvido') && !msgs.includes('devolvemos'), 'nem com a API o sistema devolve ou avisa o cliente');
  // outro agendamento do mesmo cliente mostra qual agendamento pago está pendente de análise
  await T('nav-agenda').click();
  await (await filtroProf(p, 'u-kiko')).click();
  await (await irAteCartao(p, '[data-testid=cartao][title*="14:00 Marcelo"]')).click();
  await T('pix-pendente-analise').waitFor();
  assert.match(await T('pix-pendente-analise').innerText(), /pendente de análise[\s\S]*cancelado/);
  await p.screenshot({ path: 'shots/102b-pendente-analise.png' });
  await p.keyboard.press('Escape');
  await T('nav-avisos').click();
  await p.getByRole('button', { name: 'Abrir agendamento' }).first().click();
  // devolveu pelo banco: lança a despesa (o cliente não recebe mensagem)
  await T('acerto-despesa').click();
  await p.getByText('Despesa lançada. Concilie com a saída do banco.').waitFor();
  await p.keyboard.press('Escape'); await T('nav-mensagens').click();
  assert.ok(!(await T('wa-msgs').innerText()).toLowerCase().includes('crédito de'), 'despesa não avisa o cliente');
  await p.keyboard.press('Escape');
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Lançamentos' }).click();
  assert.match(await p.locator('main').innerText(), /Devolução de Pix/);
  await p.screenshot({ path: 'shots/103-despesa-devolucao.png', fullPage: true });
  ok('com API: cancelar agendamento pago só avisa o painel; o barbeiro lança a despesa da devolução feita no banco');
  console.log('erros', erros);
}
{
  const p = await novo(400, 800, 'dark');
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-alan').click();
  await T('nav-estab').click();
  await p.getByRole('tab', { name: 'Notificações' }).click();
  await T('pixc-modo').selectOption('dias');
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shots/104-pixc-mobile.png', fullPage: true });
  console.log('overflow horizontal', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  console.log('erros', erros);
}
await b.close();
if (erros.length) process.exit(1);
