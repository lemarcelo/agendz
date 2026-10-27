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
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // relógio fixo: o resultado não depende do dia em que o teste roda
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  return p;
};
const ok = (m) => console.log('✓', m);
{
  const p = await novo(1440, 900);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  await T('nav-financeiro').click();
  await p.screenshot({ path: 'shots/80-fin-resumo.png', fullPage: true });
  assert.match(await T('fin-despesas').innerText(), /1\.386,90/);
  await p.getByRole('tab', { name: 'Lançamentos' }).click();
  assert.equal(await p.locator('[data-testid=tabela-lancamentos] tbody tr').count(), 2);
  // nova despesa
  await T('nova-despesa').click();
  await T('lanc-descricao').fill('Internet da loja'); await T('lanc-valor').fill('120'); await T('lanc-categoria').fill('Internet e telefone');
  await T('salvar-lancamento').click();
  assert.equal(await p.locator('[data-testid=tabela-lancamentos] tbody tr').count(), 3);
  // novo crédito
  await T('novo-credito').click();
  await T('lanc-descricao').fill('Venda de pomada'); await T('lanc-valor').fill('35');
  await T('salvar-lancamento').click();
  assert.equal(await p.locator('[data-testid=tabela-lancamentos] tbody tr').count(), 4);
  await p.screenshot({ path: 'shots/81-fin-lancamentos.png', fullPage: true });
  ok('lançar despesa e crédito');
  // conciliação sem open finance
  await p.getByRole('tab', { name: 'Conciliação' }).click();
  await T('ir-conta').waitFor();
  await T('ir-conta').click();
  await T('of-conectar').click();
  await p.screenshot({ path: 'shots/82-fin-consentimento.png' });
  await T('of-autorizar').click();
  await p.getByText('Conectado').first().waitFor();
  await p.screenshot({ path: 'shots/83-fin-conta.png', fullPage: true });
  await p.getByRole('tab', { name: 'Conciliação' }).click();
  assert.equal(await p.locator('[data-testid=ext-a_classificar]').count(), 2);
  await p.screenshot({ path: 'shots/84-fin-conciliacao.png', fullPage: true });
  ok('open finance conecta e concilia');
  // classificar a compra de 320
  await T('ext-classificar').first().click();
  await T('classificar-cat').fill('Materiais e produtos');
  await T('classificar-ok').click();
  assert.equal(await p.locator('[data-testid=ext-a_classificar]').count(), 1);
  ok('classificar movimento do extrato');

  // Pix no agendamento: Marcelo 14:30 de hoje
  await T('nav-agenda').click();
  await (await irAteCartao(p, '[data-testid=cartao][title*="14:30 Marcelo"]')).click();
  await T('pix-cpf').waitFor();
  assert.match(await T('pix-cpf').inputValue(), /284\.510\.937-79/);
  await T('pix-cpf').fill('11111111111');
  await T('pix-gerar').click();
  assert.match(await T('pix-erro').innerText(), /CPF válido/);
  await T('pix-cpf').fill('28451093779');
  await T('pix-gerar').click();
  await p.locator('[data-testid^=pix-codigo-]').waitFor();
  const codigo = await p.locator('[data-testid^=pix-codigo-] code').innerText();
  assert.ok(codigo.startsWith('000201'));
  await p.locator('[data-testid^=pix-enviar-]').click();
  await p.screenshot({ path: 'shots/85-pix-gerado.png' });
  await p.waitForTimeout(300); const msgs = await T('wa-msgs').innerText();
  assert.ok(msgs.toLowerCase().includes('cobrança pix'), 'chat mostra a cobrança');
  assert.ok(msgs.replace(/\s+/g, '').includes(codigo.replace(/\s+/g, '')));
  ok('gera e envia copia e cola ao cliente');
  // paga no banco (aba Banco)
  await p.getByRole('tab', { name: 'Banco' }).click();
  await T('banco-codigo').fill(codigo);
  await T('banco-nome').fill('Marcelo Santos'); await T('banco-cpf').fill('284.510.937-79');
  await p.screenshot({ path: 'shots/86-banco.png' });
  await T('banco-pagar').click();
  assert.match(await T('banco-resultado').innerText(), /confirmou a cobrança sozinha/);
  await p.getByRole('tab', { name: 'Conversa' }).click();
  const m2 = await T('wa-msgs').innerText();
  assert.ok(m2.toLowerCase().includes('pagamento confirmado'), 'aviso de pago no WhatsApp');
  await p.screenshot({ path: 'shots/87-pix-pago.png' });
  assert.ok(await T('pix-pago').isVisible());
  ok('pagamento pelo banco confirma e avisa no WhatsApp');

  // divergente: Marcelo 14:00 (a confirmar) outro dia
  await p.keyboard.press('Escape');
  await (await filtroProf(p, 'u-pablo')).click();
  await (await irAteCartao(p, '[data-testid=cartao][title*="14:00 Marcelo"]')).click();
  await T('pix-cpf').waitFor();
  await T('pix-gerar').click();
  const cod2 = await p.locator('[data-testid^=pix-codigo-] code').innerText();
  await p.getByRole('tab', { name: 'Banco' }).click();
  await T('banco-codigo').fill(cod2); await T('banco-nome').fill('Terceiro'); await T('banco-cpf').fill('503.976.128-77');
  await T('banco-pagar').click();
  assert.match(await T('banco-resultado').innerText(), /autorização/);
  await p.keyboard.press('Escape');
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Conciliação' }).click();
  await p.screenshot({ path: 'shots/88-divergente.png', fullPage: true });
  await T('ext-autorizar').click();
  await p.getByRole('tab', { name: 'Cobranças Pix' }).click();
  assert.equal(await p.locator('[data-testid=tabela-cobrancas] tbody tr .chip-cob-paga').count(), 2);
  await p.screenshot({ path: 'shots/89-cobrancas.png', fullPage: true });
  ok('divergência pede autorização');
  console.log('erros', erros);
}
{
  const p = await novo(400, 800, 'dark');
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  await T('nav-financeiro').click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/90-fin-mobile.png', fullPage: true });
  await p.getByRole('tab', { name: 'Lançamentos' }).click();
  console.log('overflow horizontal', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  // esteticista não vê Financeiro
  await T('sair').click();
  await T('demo-pablo').click().catch(() => {});
  console.log('nav financeiro p/ esteticista:', await T('nav-financeiro').count());
  console.log('erros', erros);
}
await b.close();
if (erros.length) { console.log('ERROS', erros); process.exit(1); }
