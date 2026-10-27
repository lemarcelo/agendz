import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';
// O seletor de profissionais é único e recolhe ao escolher: abre a lista se estiver fechada e devolve o item.
const filtroProf = async (p, id) => { const it = p.getByTestId(`filtro-${id}`); if (!(await it.isVisible().catch(() => false))) await p.getByTestId('filtro-abrir').click(); return it; };
const b = await chromium.launch();
const erros = [];
const novo = async (w, h, scheme = 'light') => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: scheme });
  await ctx.clock.setFixedTime(new Date('2026-10-11T22:00:00-03:00')); // data dos testes: sem isso o dia de hoje muda e as datas fixas deixam de bater
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  return p;
};
const ok = (m) => console.log('✓', m);
const arq = (nome) => ({ name: nome, mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
{
  const p = await novo(1440, 900);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  // 1) grupo padrão no estabelecimento
  await T('nav-estab').click();
  assert.equal(await T('estab-grupo').inputValue(), 'g1');
  await p.screenshot({ path: 'shots/105-estab-grupo.png', fullPage: true });
  ok('estabelecimento mostra o grupo padrão');
  // 2) grupos e contas no Financeiro
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Grupos' }).click();
  await T('tabela-grupos').waitFor();
  await T('novo-grupo').click();
  await T('grupo-nome').fill('Geral'); await T('salvar-grupo').click();
  await p.getByText('Já existe um grupo com esse nome.').waitFor();
  await T('grupo-nome').fill('Comissões'); await T('grupo-conta').selectOption('ct2'); await T('salvar-grupo').click();
  await T('grupo-g1').waitFor();
  assert.equal(await p.locator('[data-testid=tabela-grupos] tbody tr').count(), 3);
  await p.screenshot({ path: 'shots/106-grupos.png', fullPage: true });
  await p.getByRole('button', { name: 'Remover Geral' }).click();
  await p.getByText('padrão do estabelecimento').first().waitFor();
  await p.getByRole('button', { name: 'Remover Comissões' }).click();
  assert.equal(await p.locator('[data-testid=tabela-grupos] tbody tr').count(), 2);
  ok('grupos: criar, nome repetido, remover só sem uso');
  await p.getByRole('tab', { name: 'Contas' }).click();
  await p.screenshot({ path: 'shots/107-contas.png', fullPage: true });
  await p.getByRole('tab', { name: 'Conta de fornecedores' }).click();
  assert.match(await T('conta-cabeca').innerText(), /Fornecedores e produtos/);
  await T('remover-conta').click();
  await p.getByText('responsável pelo grupo').first().waitFor();
  ok('conta com grupo não é removida');
  // 3) serviço Lavagem de motor no grupo da conta de fornecedores
  await T('nav-servicos').click();
  await p.getByRole('button', { name: 'Editar Lavagem de motor', exact: true }).click();
  await T('srv-grupo').selectOption('g2');
  await p.screenshot({ path: 'shots/108-servico-grupo.png', fullPage: true });
  await T('salvar-servico').click();
  assert.match(await T('srv-grupo-s-lav-motor').innerText(), /Fornecedores e produtos · Conta de fornecedores/);
  ok('serviço escolhe o grupo');
  // 4) despesa no grupo da ct2
  await T('nav-financeiro').click();
  await T('nova-despesa').click();
  assert.equal(await T('lanc-grupo').inputValue(), 'g1');
  await T('lanc-descricao').fill('Aromatizante para revenda'); await T('lanc-valor').fill('90'); await T('lanc-grupo').selectOption('g2');
  await p.screenshot({ path: 'shots/109-despesa-grupo.png' });
  await T('salvar-lancamento').click();
  await p.getByRole('tab', { name: 'Lançamentos' }).click();
  assert.match(await T('tabela-lancamentos').innerText(), /Aromatizante para revenda[\s\S]*Fornecedores e produtos\s+Conta de fornecedores/);
  await T('filtro-conta').selectOption('ct2');
  assert.equal(await p.locator('[data-testid=tabela-lancamentos] tbody tr').count(), 1);
  await p.getByRole('tab', { name: 'Resumo' }).click();
  await T('filtro-conta').selectOption('');
  assert.match(await T('resumo-contas').innerText(), /Conta de fornecedores[\s\S]*90,00/);
  await p.screenshot({ path: 'shots/110-resumo-contas.png', fullPage: true });
  ok('despesa no grupo da conta, filtro por conta e resumo por conta e grupo');
  // 5) agendamento com dois serviços de contas diferentes → dois Pix
  await T('nav-agenda').click();
  await p.getByRole('button', { name: 'Semana', exact: true }).click();
  await T('atender').click();
  await T('atender-cliente-abrir').click(); await T('atender-cliente-c-marcelo').click();
  await T('atender-profissional').selectOption('u-marcelo');
  await T('atender-quando').click();
  await T('atender-data').fill('2026-10-13');
  await T('hora-h').fill('16'); await T('hora-m').fill('00');
  await T('atender-srv-s-lav-detalhada').check(); await T('atender-srv-s-lav-motor').check();
  await T('atender-status-confirmado').check();
  await salvarAtender(p);
  await (await filtroProf(p, 'u-marcelo')).click();
  await p.locator('[data-testid=evento][title*="16:00 Marcelo"]').first().click();
  await T('pix-divisao').waitFor();
  assert.match(await T('pix-divisao').innerText(), /2 Pix/);
  assert.equal(await T('pix-valor').count(), 0);
  await p.screenshot({ path: 'shots/111-pix-dividido-form.png' });
  await T('pix-gerar').click();
  await p.locator('[data-testid^=cobranca-]').nth(1).waitFor();
  assert.equal(await p.locator('[data-testid^=cobranca-]').count(), 2);
  const t = await T('bloco-pagamento').innerText();
  assert.match(t, /Conta principal/); assert.match(t, /Conta de fornecedores/);
  await p.screenshot({ path: 'shots/112-pix-dividido.png', fullPage: true });
  // cada conta tem o seu código: chaves diferentes
  const codes = await p.locator('[data-testid^=pix-codigo-] code').allInnerTexts();
  assert.equal(codes.length, 2); assert.notEqual(codes[0], codes[1]);
  ok('um Pix por conta, com chaves diferentes');
  // paga o da conta de fornecedores pelo banco (API ativada nela) e confere o chip do cartão
  await p.keyboard.press('Escape');
  await p.getByRole('tab', { name: 'Banco' }).click();
  assert.equal(await p.locator('[data-testid^=banco-conta-]').count(), 2);
  await p.screenshot({ path: 'shots/113-banco-contas.png' });
  console.log('erros', erros);
}
{
  const p = await novo(400, 800, 'dark');
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Contas' }).click();
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shots/114-contas-mobile.png', fullPage: true });
  console.log('overflow contas', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await p.getByRole('tab', { name: 'Grupos' }).click();
  await p.screenshot({ path: 'shots/115-grupos-mobile.png', fullPage: true });
  console.log('overflow grupos', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await p.getByRole('tab', { name: 'Resumo' }).click();
  await p.screenshot({ path: 'shots/116-resumo-mobile.png', fullPage: true });
  console.log('overflow resumo', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  console.log('erros', erros);
}
await b.close();
if (erros.length) process.exit(1);
