/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v121: o dono tira a obrigatoriedade de qualquer campo (inclusive placa, modelo, porte e veículo) em Estabelecimento > Regras, no Atender e no link do cliente.
// Estética (Apex, Davi): com a regra marcada o Atender barra; desmarcada, salva sem veículo; no link, sem nenhum dado do veículo o cliente avança.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
const ok = (m) => console.log('✓', m);
async function abrir(viewport = { width: 1280, height: 900 }) {
  const ctx = await b.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(url);
  return { ctx, p, T: (id) => p.getByTestId(id) };
}
async function abrirRegras(p, T) {
  await T('nav-estab').click();
  await p.getByRole('tab', { name: 'Regras' }).click();
}

// 1. estética: regras do Atender e do link
{
  const { ctx, p, T } = await abrir();
  await T('demo-davi').click(); await T('agenda-topo').waitFor();
  await abrirRegras(p, T);
  for (const k of ['veiculo', 'placa', 'modelo', 'porte']) {
    assert.equal(await T(`obrig-local-${k}`).count(), 1, `estética lista ${k} nas regras do atendimento feito`);
    assert.equal(await T(`obrig-futuro-${k}`).count(), 1, `estética lista ${k} nas regras do agendamento`);
  }
  // exige a placa no atendimento feito
  await T('obrig-local-placa').check();
  await T('nav-agenda').click(); await T('agenda-topo').waitFor();
  await T('atender').click();
  await T('atender-srv-s-vitrificacao').check();
  await T('salvar-atender').click();
  await p.getByText(/Informe a placa/).first().waitFor();
  await p.keyboard.press('Escape'); await T('salvar-atender').waitFor({ state: 'detached' });
  ok('regra ligada: o Atender barra sem a placa');

  // tira todas: salva sem nenhum dado do veículo
  await abrirRegras(p, T);
  await T('obrig-local-placa').uncheck();
  for (const k of ['veiculo', 'modelo', 'porte']) if (await T(`obrig-local-${k}`).isChecked()) await T(`obrig-local-${k}`).uncheck();
  await T('nav-agenda').click(); await T('agenda-topo').waitFor();
  await T('atender').click();
  await T('atender-srv-s-vitrificacao').check();
  await T('salvar-atender').click();
  await T('agenda-topo').waitFor();
  assert.equal(await p.getByText(/Informe a placa|Escolha o veículo/).count(), 0, 'sem regra, o atendimento sem veículo salva');
  assert.equal(await T('salvar-atender').count(), 0, 'a janela do Atender fechou');
  ok('regra desligada: Atender salva sem placa, modelo nem porte');

  // link: tira o nome e os dados do veículo
  await abrirRegras(p, T);
  assert.equal(await T('link-nome-obrigatorio').isChecked(), true, 'de fábrica o nome é obrigatório no link');
  for (const k of ['placa', 'modelo', 'porte']) assert.equal(await T(`link-veic-${k}`).isChecked(), true, `de fábrica ${k} é obrigatório no link`);
  await T('link-nome-obrigatorio').uncheck({ force: true });
  for (const k of ['placa', 'modelo', 'porte']) await T(`link-veic-${k}`).uncheck();
  await T('sair').click(); await T('login-id').waitFor();
  await p.evaluate(() => { location.hash = 'agendar'; });
  await T('pagina-publica').waitFor();
  assert.equal(await T('pub-continuar-0').isDisabled(), false, 'sem exigência de veículo o cliente avança direto');
  ok('link: nome e dados do veículo opcionais');

  // só a placa obrigatória: avança só com ela
  await p.evaluate(() => { location.hash = ''; });
  await T('demo-davi').click(); await T('agenda-topo').waitFor();
  await abrirRegras(p, T);
  await T('link-veic-placa').check();
  await T('sair').click(); await T('login-id').waitFor();
  await p.evaluate(() => { location.hash = 'agendar'; });
  await T('pagina-publica').waitFor();
  assert.equal(await T('pub-continuar-0').isDisabled(), true, 'com a placa obrigatória, vazio não avança');
  await T('pub-placa').fill('KLM9N87');
  assert.equal(await T('pub-continuar-0').isDisabled(), false, 'só a placa basta');
  ok('link: só a placa obrigatória');
  await ctx.close();
}

// 2. barbearia: nenhum campo precisa ser obrigatório (nome do link e campos do atendimento)
{
  const { ctx, p, T } = await abrir();
  await T('demo-loja-dalforno').click();
  await T('demo-alan').click(); await T('agenda-topo').waitFor();
  await abrirRegras(p, T);
  assert.equal(await T('obrig-local-placa').count(), 0, 'barbearia não tem campos de veículo');
  assert.equal(await T('link-veiculo-obrigatorio').count(), 0);
  await T('link-nome-obrigatorio').uncheck({ force: true });
  for (const tipo of ['futuro', 'local']) for (const k of ['nome', 'telefone']) if (await T(`obrig-${tipo}-${k}`).count() && await T(`obrig-${tipo}-${k}`).isChecked()) await T(`obrig-${tipo}-${k}`).uncheck();
  ok('barbearia: nome do link e campos do atendimento desmarcáveis');
  await ctx.close();
}

assert.deepEqual(erros, []);
await b.close();
console.log('e2e95 ok');
