/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço, fase 2 (Artifact, Dalforno, Alan): "Usar modelo" preenche o formulário sem gravar; horários fixos do assinante viram agendamento
// com 14 dias de antecedência e ficam reservados (o link do cliente não oferece); o cliente com plano é avisado "este horário usa um atendimento do seu plano"
// ao agendar pelo link e o corte é gasto. Estética não tem modelos. Relógio fixo. 1440 e 390 px, sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const base = new URL('../dist/index.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
const TEL = '(51) 98123-4567';
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
  const touch = vp.width < 700;
  const novo = async (loja) => {
    const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // segunda-feira
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(`${base}?loja=${loja}`);
    return { ctx, p, T: (id) => p.getByTestId(id) };
  };
  const semRolagem = async (p, onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral (${vp.width}px) ${onde}`);

  // ---- estética: modelos próprios, nada gravado ao usar
  {
    const { ctx, p, T } = await novo('apex');
    await T('demo-davi').click(); await T('agenda-topo').waitFor();
    await T('nav-planos').click(); await T('tela-planos').waitFor();
    await p.getByRole('tab', { name: 'Planos', exact: true }).click().catch(async () => { await p.getByRole('button', { name: 'Planos', exact: true }).click(); });
    await T('novo-plano').waitFor();
    await T('plano-usar-modelo').click(); await T('modelos-lista').waitFor();
    assert.equal(await p.locator('[data-testid^="modelo-pl-"]').count(), 3, 'estética tem 3 modelos');
    await semRolagem(p, 'modelos da estética');
    await p.locator('[data-testid^="modelo-usar-"]').first().click();
    assert.ok((await T('plano-nome').inputValue()).length > 0, 'o modelo preenche o formulário');
    await semRolagem(p, 'formulário do modelo da estética');
    await p.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(await p.locator('[data-testid^="plano-editar-"]').count(), 0, 'usar modelo não grava');
    ok(`${vp.width}px: estética mostra 3 modelos e não grava`);
    await ctx.close();
  }

  const { ctx, p, T } = await novo('dalforno');
  await T('demo-alan').click(); await T('agenda-topo').waitFor();

  // ---- 1. modelo: preenche e não grava
  await T('nav-planos').click(); await T('tela-planos').waitFor();
  await p.getByRole('tab', { name: 'Planos', exact: true }).click().catch(async () => { await p.getByRole('button', { name: 'Planos', exact: true }).click(); });
  await T('plano-usar-modelo').click();
  await T('modelos-lista').waitFor();
  assert.equal(await p.locator('[data-testid^="modelo-pl-"]').count(), 4);
  const lista = await T('modelos-lista').innerText();
  for (const n of ['Degradê em Dia', 'Navalhado Premium', 'Visual Completo', 'Barbeiro VIP']) assert.ok(lista.includes(n), n);
  await semRolagem(p, 'lista de modelos');
  await T('modelo-usar-pl-barbeiro-vip').click();
  assert.equal(await T('plano-nome').inputValue(), 'Barbeiro VIP');
  assert.equal(await T('plano-preco').inputValue(), '165');
  assert.equal(await T('plano-cortes').inputValue(), '4');
  assert.ok(await p.locator('[data-testid^="plano-srv-"]:checked').count() >= 2, 'serviços da casa já marcados');
  await semRolagem(p, 'formulário do modelo');
  await p.getByRole('button', { name: 'Cancelar' }).click();
  assert.equal(await p.locator('[data-testid^="plano-editar-"]').count(), 0, 'cancelar não grava nada');
  await T('plano-usar-modelo').click(); await T('modelo-usar-pl-barbeiro-vip').click();
  await T('salvar-plano').click();
  await T('planos-lista').getByText('Barbeiro VIP').waitFor();
  ok(`${vp.width}px: "Usar modelo" preenche, cancelar não grava, salvar cria o plano`);

  // ---- 2. cliente novo + assinatura paga
  await T('nav-clientes').click();
  await T('novo-cliente').click();
  await T('cli-nome').fill('Rafael Assinante'); await T('cli-tel').fill('51981234567');
  await T('salvar-cliente').click();
  await T('nav-planos').click(); await T('tela-planos').waitFor();
  await p.getByRole('tab', { name: 'Assinaturas' }).click().catch(async () => { await p.getByRole('button', { name: 'Assinaturas' }).click(); });
  await T('nova-assinatura').click();
  await T('atender-cliente-abrir').click();
  await T('atender-cliente-busca').fill('Rafael');
  await p.locator('[data-testid^="atender-cliente-c"]').first().click();
  await T('salvar-assinatura').click();
  const linha = p.locator('[data-testid^="situacao-"]').first(); await linha.waitFor();
  const id = (await linha.getAttribute('data-testid')).replace('situacao-', '');
  await T(`pagar-${id}`).click(); await T('salvar-mensalidade').click();
  await p.waitForFunction((i) => /Ativa/.test(document.querySelector(`[data-testid="situacao-${i}"]`)?.textContent || ''), id);
  assert.match(await T(`saldo-${id}`).innerText(), /4 de 4/);

  // ---- 3. horário fixo: terça 10:00 → vira agendamento, gasta corte, aviso de limite de 3
  await T(`fixos-${id}`).click();
  await T('fixo-add').click();
  await T('fixo-dia-0').selectOption('2');
  await T('fixo-hm-0').fill('11:00');
  await semRolagem(p, 'horários fixos');
  await T('fixo-add').click(); await T('fixo-add').click();
  assert.equal(await T('fixo-add').count(), 0, 'no máximo 3 horários fixos');
  await T('fixo-remover-2').click(); await T('fixo-remover-1').click();
  await T('salvar-fixos').click();
  await T(`fixos-resumo-${id}`).waitFor();
  assert.match(await T(`fixos-resumo-${id}`).innerText(), /ter 11:00/);
  assert.match(await T(`saldo-${id}`).innerText(), /2 de 4/, 'duas terças dentro de 14 dias gastaram 2 cortes');
  ok(`${vp.width}px: horário fixo salvo cria 2 agendamentos (14 dias) e gasta 2 cortes`);

  // o agendamento aparece na agenda, marcado como horário fixo
  await T('nav-agenda').click(); await T('agenda-topo').waitFor();
  await T('agenda-modo-horarios').click().catch(() => {});
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  { const it = T('filtro-todos'); if (!(await it.isVisible().catch(() => false))) await T('filtro-abrir').click(); await it.click(); }
  await T('agenda-proximos').waitFor();
  await T('cartao-proximo').filter({ hasText: 'Rafael' }).first().click();
  await T('gaveta').waitFor();
  assert.match(await T('gaveta').innerText(), /horário fixo do plano/);
  await p.keyboard.press('Escape');

  // ---- 4. link do cliente: horário fixo reservado não é oferecido; aviso do plano; corte gasto
  await p.evaluate(() => { location.hash = '#agendar'; });
  await T('pub-aba-agendar').waitFor();
  await T('pub-srv-s-degrade').check(); await T('pub-barb-u-alan').click(); await T('pub-continuar-1').click();
  // 27/10 (terça) é depois dos 14 dias: o fixo ainda não virou agendamento, mas o horário já é do assinante
  await T('pub-mais-dias').click().catch(() => {});
  await T('pub-dia-2026-10-27').click();
  assert.equal(await T('pub-hora-1100').count(), 0, 'o horário fixo do assinante não aparece no link');
  assert.ok(await p.locator('[data-testid^="pub-hora-"]').count() > 0, 'o resto do dia segue livre');
  ok(`${vp.width}px: o link não oferece o horário fixo do assinante`);
  await T('pub-dia-2026-10-26').click(); // segunda: a 6 dias da terça 20/10, respeita os 5 dias entre atendimentos do plano
  await p.locator('[data-testid^="pub-hora-"]').first().click();
  await T('pub-continuar-2').click();
  await T('pub-nome').fill('Rafael Assinante'); await T('pub-telefone').fill('51981234567');
  await T('pub-usa-plano').waitFor();
  assert.match(await T('pub-usa-plano').innerText(), /usa um atendimento do seu plano/);
  const txt = await T('pub-usa-plano').innerText(); assert.ok(!/165|R\$/.test(txt), 'sem valor da mensalidade');
  await semRolagem(p, 'aviso do plano');
  await T('pub-enviar').click();
  await T('pub-feito-plano').waitFor();
  assert.match(await T('pub-feito-plano').innerText(), /atendimento do seu plano/);
  // quem não tem plano não vê o aviso
  await T('pub-novo').click();
  await T('pub-srv-s-degrade').check(); await T('pub-barb-u-alan').click(); await T('pub-continuar-1').click();
  await T('pub-dia-2026-10-17').click();
  await p.locator('[data-testid^="pub-hora-"]').first().click();
  await T('pub-continuar-2').click();
  await T('pub-nome').fill('Visitante'); await T('pub-telefone').fill('51970001111');
  await p.waitForTimeout(300);
  assert.equal(await T('pub-usa-plano').count(), 0);
  ok(`${vp.width}px: link avisa o atendimento do plano só para quem tem plano, e o corte é gasto`);

  // ---- 5. de volta ao painel: saldo 1 de 4 e encerrar apaga os fixos futuros
  await p.evaluate(() => { location.hash = ''; });
  await T('nav-planos').click(); await T('tela-planos').waitFor();
  await p.getByRole('tab', { name: 'Assinaturas' }).click().catch(async () => { await p.getByRole('button', { name: 'Assinaturas' }).click(); });
  assert.match(await T(`saldo-${id}`).innerText(), /1 de 4/, '4 - 2 fixos - 1 pelo link');
  await T(`encerrar-${id}`).click(); await T('encerrar-motivo').fill('cliente mudou de cidade'); await T('confirmar-encerrar').click();
  await p.waitForFunction((i) => /Encerrad/.test(document.querySelector(`[data-testid="situacao-${i}"]`)?.textContent || ''), id);
  await T('nav-agenda').click(); await T('agenda-topo').waitFor();
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  await T('agenda-proximos').waitFor();
  assert.equal(await T('cartao-proximo').filter({ hasText: 'horário fixo' }).count(), 0);
  const fixosRestantes = await T('cartao-proximo').filter({ hasText: 'Rafael' }).count();
  assert.ok(fixosRestantes <= 1, 'só sobra o pedido do link (a confirmar); os fixos futuros saíram');
  ok(`${vp.width}px: encerrar o plano apaga os fixos futuros`);
  await semRolagem(p, 'fim');
  await ctx.close();
}
assert.deepEqual(erros, []);
await b.close();
ok('e2e77 completo');
