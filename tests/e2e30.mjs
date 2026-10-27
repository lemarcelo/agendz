// Apex: tema escuro por padrão, link do cliente com veículo e porte, serviço de vários dias, box, "Em serviço" e "Pronto para retirada",
// veículos do cliente, serviços por porte, boxes e celular (390 px) sem rolagem horizontal.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pubVeiculo, salvarAtender } from './e2e-util.mjs';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(url);
  return { ctx, p };
}
const ok = (m) => console.log('✓', m);
const semRolagem = async (p, onde) => { const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(sw <= iw, `${onde}: rolagem horizontal (${sw} > ${iw})`); };
const fundo = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
async function abrirEvento(p, nome) {
  await p.getByTestId('agenda-modo-horarios').click();
  const ev = p.locator('[data-testid=cartao]', { hasText: nome }).first();
  for (let i = 0; i < 3 && !(await ev.count()); i++) { await p.getByRole('button', { name: /Próxim/ }).first().click(); }
  await ev.click();
}
const dinheiro = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));

// ================= computador =================
{
  const { ctx, p } = await abrir({ width: 1440, height: 900 });
  const T = (id) => p.getByTestId(id);

  // tema: escuro por padrão (mesmo com o sistema em claro), claro só por escolha, e a escolha fica lembrada
  assert.equal(await p.evaluate(() => document.documentElement.getAttribute('data-theme')), null, 'sem data-theme = escuro');
  assert.equal(await fundo(p), 'rgb(13, 15, 18)', 'o login já abre no escuro');
  assert.ok(await T('logo-marca').count(), 'a logo da Apex aparece já na entrada');
  assert.equal(await p.locator('.marca-pico, .marca-texto').count(), 0, 'sem o ícone de A em texto');
  await T('demo-davi').click();
  assert.equal(await fundo(p), 'rgb(13, 15, 18)');
  await T('alternar-tema').click();
  assert.equal(await fundo(p), 'rgb(241, 244, 248)', 'tema claro opcional');
  await p.reload(); await T('demo-davi').click();
  assert.equal(await fundo(p), 'rgb(241, 244, 248)', 'a escolha do tema é lembrada');
  await T('alternar-tema').click();
  assert.equal(await fundo(p), 'rgb(13, 15, 18)');
  ok('tema escuro por padrão, claro opcional e lembrado');

  // veículos do cliente: placa inválida é recusada; válida salva e aparece na lista
  await T('nav-clientes').click();
  await p.getByRole('button', { name: 'Editar Igor' }).first().click();
  await T('cli-veiculo-add').click();
  const n = await p.locator('.veiculo-linha').count() - 1; // último (o novo)
  await T(`cli-v-placa-${n}`).fill('XX9'); await T(`cli-v-modelo-${n}`).fill('Fusca'); await T(`cli-v-porte-${n}`).selectOption('pequeno');
  await T('salvar-cliente').click();
  assert.match(await p.locator('[role="dialog"], .modal').first().innerText(), /placa inválida/i, 'placa inválida recusada');
  await T(`cli-v-placa-${n}`).fill('FUS1A23');
  await T('salvar-cliente').click();
  await T('salvar-cliente').waitFor({ state: 'detached' });
  assert.match(await p.locator('.principal').innerText(), /Fusca[\s\S]*FUS1A23|FUS1A23[\s\S]*Fusca/);
  ok('cadastro do cliente: veículo com placa validada');

  // serviço por porte: muda o preço da pickup e vê a faixa no cartão; combo e "vários dias" aparecem
  await T('nav-servicos').click();
  await p.getByRole('button', { name: 'Editar Lavagem simples', exact: true }).click();
  await T('srv-preco-pickup').fill('99');
  await T('srv-preco-pequeno').fill('48');
  await T('salvar-servico').click();
  await T('salvar-servico').waitFor({ state: 'detached' });
  assert.match(await p.locator('article', { hasText: 'Lavagem simples' }).first().innerText(), /R\$\s*48,00 a R\$\s*99,00/, 'faixa de preço por porte');
  assert.match(await p.locator('.principal').innerText(), /Combo/);
  assert.match(await p.locator('.principal').innerText(), /Vários dias/);
  ok('serviços: preço e duração por porte, combo e vários dias');

  // boxes: adicionar, salvar, nome repetido recusado
  await T('nav-estab').click();
  await p.getByRole('tab', { name: 'Boxes' }).click();
  await T('box-add').click();
  await T('box-nome-3').fill('Box 3'); // repete o nome do terceiro
  await T('box-salvar').click();
  assert.match(await T('boxes-erro').innerText(), /mesmo nome/i);
  await T('box-nome-3').fill('Box 4');
  await T('box-salvar').click();
  await p.getByText('Boxes salvos.').first().waitFor();
  ok('boxes: adicionar e nome repetido recusado');

  // Atender: veículo novo, serviço de vários dias (Polimento técnico, pickup) em data futura
  await T('nav-agenda').click();
  await T('atender').click();
  await p.locator('[data-testid="atender-cliente-abrir"]').click(); await T('atender-cliente-c-marcelo').click();
  await T('atender-profissional').selectOption('u-davi');
  await T('atender-quando').click();
  await T('atender-data').fill('2026-10-15'); await T('hora-h').fill('09'); await T('hora-m').fill('00');
  await T('atender-srv-s-vitrificacao').check();
  // Marcelo tem 2 veículos: precisa escolher; a escolha de "Outro veículo" abre o formulário
  await T('atender-veiculo-sel').selectOption('novo');
  await T('atender-placa').fill('PIK1C45'); await T('atender-modelo').fill('Hilux'); await T('atender-porte').selectOption('pickup');
  assert.match(await T('atender-porte-info').innerText(), /pickup/i);
  const totalPickup = dinheiro(await T('atender-total').innerText());
  await T('atender-porte').selectOption('pequeno');
  const totalPequeno = dinheiro(await T('atender-total').innerText());
  assert.ok(totalPickup > totalPequeno, `preço muda com o porte (${totalPickup} > ${totalPequeno})`);
  await T('atender-porte').selectOption('pickup');
  assert.match(await p.locator('.msg-ok', { hasText: /retirada prevista/i }).first().innerText(), /retirada prevista/i, 'serviço de vários dias mostra a retirada');
  await T('salvar-atender').click();
  await T('salvar-atender').waitFor({ state: 'detached' });
  ok('Atender: veículo novo, porte muda o preço e o serviço de vários dias mostra a retirada');

  // ficha: veículo, box e retirada; Iniciar serviço e Pronto para retirada
  await p.evaluate(() => { location.hash = ''; });
  await abrirEvento(p, 'Hilux');
  await T('gaveta').waitFor();
  assert.match(await T('ficha-veiculo').innerText(), /Hilux[\s\S]*PIK-?1C45|PIK1C45/);
  assert.match(await T('ficha-box').innerText(), /Box \d/);
  assert.match(await T('ficha-retirada').innerText(), /retirada prevista/i);
  assert.equal(await T('marcar-pronto').count(), 0, 'agendamento ainda não confirmado não tem andamento');
  await p.getByRole('button', { name: 'Confirmar' }).first().click().catch(() => {});
  await p.keyboard.press('Escape');
  ok('ficha mostra veículo, box e retirada');

  // pedido pelo link com veículo: o cliente escolhe o porte e vê preços do porte
  await p.evaluate(() => { location.hash = 'agendar'; });
  await T('pagina-publica').waitFor();
  await T('pub-placa').fill('abc'); assert.equal(await T('pub-continuar-0').isDisabled(), true, 'placa incompleta não avança');
  await T('pub-placa').fill('KLM9N87'); await T('pub-modelo').fill('Strada');
  assert.equal(await T('pub-continuar-0').isDisabled(), true, 'sem porte não avança');
  await T('pub-porte-pickup').click(); await T('pub-continuar-0').click();
  const precoPickup = dinheiro(await p.locator('label.pub-item', { hasText: 'Lavagem simples' }).locator('.pub-preco').innerText());
  assert.equal(precoPickup, 99, 'preço da pickup que o dono acabou de definir');
  await T('pub-trocar-veiculo').click(); await T('pub-porte-pequeno').click(); await T('pub-continuar-0').click();
  assert.equal(dinheiro(await p.locator('label.pub-item', { hasText: 'Lavagem simples' }).locator('.pub-preco').innerText()), 48);
  await T('pub-srv-s-lav-simples').check(); await T('pub-continuar-1').click();
  await p.locator('.pub-dia:not(.pub-mais)').nth(2).click(); await p.locator('.pub-hora').first().click(); await T('pub-continuar-2').click();
  await T('pub-nome').fill('Beto Teste'); await T('pub-telefone').fill('53988776655');
  assert.match(await T('pub-resumo').innerText(), /Strada · KLM9N87/);
  await T('pub-enviar').click(); await T('pub-feito').waitFor();
  assert.match(await T('pub-feito').innerText(), /Strada/);
  await T('pub-ver-meus').click(); await T('pub-meus').waitFor().catch(() => {});
  ok('link do cliente: placa, modelo e porte; preços do porte; pedido com veículo');

  // painel: "Cliente agendou" com o veículo
  await p.evaluate(() => { location.hash = ''; });
  await T('nav-agenda').click();
  await abrirEvento(p, 'Beto');
  await T('gaveta').waitFor();
  assert.match(await T('ficha-veiculo').innerText(), /Strada/);
  await T('confirmar-pedido').click();
  await T('iniciar-servico').waitFor();
  await T('iniciar-servico').click();
  await p.getByText(/Em serviço/).first().waitFor();
  assert.equal(await T('iniciar-servico').count(), 0);
  await T('marcar-pronto').click();
  await T('desfazer-pronto').waitFor();
  assert.match(await T('gaveta').innerText(), /Pronto para retirada/);
  await T('desfazer-pronto').click();
  await T('marcar-pronto').waitFor();
  await T('marcar-pronto').click();
  await p.keyboard.press('Escape');
  // a legenda conta o marcador e filtra
  await T('legenda-pronto').click();
  assert.equal(await p.locator('[data-testid=cartao]').count() >= 1, true);
  ok('painel: Iniciar serviço, Pronto para retirada, desfazer e filtro pela legenda');
  await semRolagem(p, 'computador: agenda');
  await p.screenshot({ path: 'shots/e2e30-desktop.png' });
  await ctx.close();
}

// ================= celular =================
{
  const { ctx, p } = await abrir({ width: 390, height: 800 }, true);
  const T = (id) => p.getByTestId(id);
  await semRolagem(p, 'celular: entrada');
  await T('demo-davi').tap();
  await semRolagem(p, 'celular: agenda');
  for (const k of ['clientes', 'servicos', 'estoque', 'estab']) { await T(`nav-${k}`).tap(); await semRolagem(p, `celular: ${k}`); }
  await T('nav-servicos').tap(); await p.getByRole('button', { name: 'Editar Lavagem simples', exact: true }).tap();
  await semRolagem(p, 'celular: serviço por porte'); await p.keyboard.press('Escape');
  await T('nav-clientes').tap(); await p.getByRole('button', { name: 'Editar Igor' }).first().tap(); await semRolagem(p, 'celular: veículos do cliente'); await p.keyboard.press('Escape');
  await T('nav-agenda').tap(); await T('atender').tap(); await semRolagem(p, 'celular: Atender'); await p.keyboard.press('Escape');
  await p.evaluate(() => { location.hash = 'agendar'; });
  await semRolagem(p, 'celular: link, veículo');
  await pubVeiculo(p, { toque: true });
  await semRolagem(p, 'celular: link, serviços');
  await p.screenshot({ path: 'shots/e2e30-mobile-servicos.png', fullPage: true });
  ok('celular: telas sem rolagem horizontal');
  await ctx.close();
}

await b.close();
assert.deepEqual(erros, [], 'erros de página/console: ' + erros.join(' | '));
console.log('e2e30 ok');
