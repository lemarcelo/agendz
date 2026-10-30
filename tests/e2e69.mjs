/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Remarcar pelo painel (Artifact), nas duas lojas (barbearia e estética) em computador e 390 px:
// cliente com telefone → pergunta "Avisar o cliente?" ("Avisar no WhatsApp" abre wa.me em aba nova com a mensagem pronta; "Agora não" só fecha);
// trocar só o status (mesmo horário) não pergunta; cliente cadastrado SEM telefone e atendimento SEM cadastro → a tela diz que não dá para avisar (nunca fecha em silêncio);
// remarcar para OUTRO dia (o cartão sai da lista) mantém o aviso; o aviso nunca abre aba nova quando não há telefone.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

const b = await chromium.launch();
const erros = [];
const ok = (m) => console.log('✓', m);
const LOJAS = [{ loja: 'dalforno', pessoa: 'alan' }, { loja: 'apex', pessoa: 'davi' }];
const TELAS = [{ nome: 'desktop', w: 1366, h: 820 }, { nome: '390', w: 390, h: 800 }];

async function abrir(tela, { loja, pessoa }) {
  const touch = tela.w < 700;
  const ctx = await b.newContext({ viewport: { width: tela.w, height: tela.h }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const pedidos = [];
  await ctx.route(/wa\.me|whatsapp\.com/, (r) => { pedidos.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa</title>' }); });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  await p.getByTestId(`demo-loja-${loja}`).click();
  await p.getByTestId(`demo-${pessoa}`).click();
  await p.getByTestId('nav-agenda').click();
  await p.locator('[data-testid="cartao"]').first().waitFor();
  return { ctx, p, pedidos };
}

const semRolagem = async (p, onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral em ${onde}`);
const dentroDaTela = async (p, id, onde) => {
  await p.waitForTimeout(500);
  const bx = await p.getByTestId(id).boundingBox();
  const vp = p.viewportSize();
  assert.ok(bx && bx.x >= 0 && bx.x + bx.width <= vp.width + 1 && bx.y >= 0 && bx.y + bx.height <= vp.height + 1, `${onde}: ${id} cabe na tela (${JSON.stringify(bx)})`);
};

// Atender com data futura (vira agendamento). Sem telefone e sem cliente escolhido = horário sem cadastro.
async function agendar(p, { nome, telefone = '', cadastrado = false, dia, hora }) {
  await limpar(p);
  await p.getByTestId('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  if (cadastrado) { // escolhe o cliente já cadastrado pela busca
    await p.getByTestId('atender-cliente-abrir').click();
    await p.getByLabel('Buscar cliente').last().fill(nome);
    await p.getByRole('option', { name: new RegExp(nome) }).first().click();
  } else {
    await p.getByTestId('atender-nome').fill(nome);
    if (telefone) await p.getByTestId('atender-telefone').fill(telefone);
  }
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill(dia);
  await p.getByTestId('hora-h').fill(String(hora)); await p.getByTestId('hora-m').fill('00');
  await salvarAtender(p);
  await p.getByTestId('salvar-atender').waitFor({ state: 'detached' });
}
const cartaoDe = (p, nome) => p.locator('button.cartao', { hasText: nome }).first();
// A gaveta do agendamento fica aberta depois de remarcar: fecha antes de trocar de aba.
const limpar = async (p) => { for (let i = 0; i < 3 && await p.locator('[role=dialog]').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); } };
const irPara = async (p, nav) => { await limpar(p); await p.getByTestId(nav).click(); };
async function novoCliente(p, nome, telefone) {
  await irPara(p, 'nav-clientes');
  await p.getByTestId('novo-cliente').click();
  await p.getByTestId('cli-nome').fill(nome);
  await p.getByTestId('cli-tel').fill(telefone);
  await p.getByTestId('salvar-cliente').click();
  await p.getByTestId('salvar-cliente').waitFor({ state: 'detached' });
  await irPara(p, 'nav-agenda');
}
// Apagar o telefone na ficha é recusado com mensagem na tela (o cadastro nunca fica sem telefone) e o número antigo continua.
async function tentarApagarTelefone(p, nome) {
  await irPara(p, 'nav-clientes');
  await p.getByLabel('Buscar cliente').fill(nome);
  await p.getByRole('button', { name: `Editar ${nome}` }).first().click();
  await p.getByTestId('cli-tel').fill('');
  await p.getByTestId('salvar-cliente').click();
  await p.getByText('Informe o telefone com DDD.').waitFor();
  await p.keyboard.press('Escape');
  await p.getByTestId('salvar-cliente').waitFor({ state: 'detached' }).catch(() => {});
  await irPara(p, 'nav-agenda');
}
// Abre o cartão e remarca (data opcional; senão mexe só na hora).
async function remarcar(p, cartao, { dia, mexerHora = true } = {}) {
  await cartao.click();
  await p.getByTestId('acao-remarcar').click();
  if (dia) await p.getByTestId('data').fill(dia);
  if (mexerHora) await p.getByRole('button', { name: 'Hora mais' }).click();
  await p.getByTestId('salvar-agendamento').click();
  await p.waitForTimeout(250);
  const recusa = await p.locator('[role=dialog] [role=alert]').allInnerTexts();
  assert.deepEqual(recusa, [], 'remarcar foi recusado: ' + recusa.join(' | '));
}
const fechaTudo = async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(150); if (await p.getByTestId('salvar-agendamento').count()) await p.keyboard.press('Escape'); };

for (const alvo of LOJAS) for (const tela of TELAS) {
  const rot = `${alvo.loja}/${tela.nome}`;
  const { ctx, p, pedidos } = await abrir(tela, alvo);
  const semAba = async (fn) => { const n = ctx.pages().length; await fn(); await p.waitForTimeout(250); assert.equal(ctx.pages().length, n, `${rot}: não abriu aba nova`); };

  // 1) só o status (horário igual): não pergunta nada
  await p.locator('[data-testid="cartao"]').first().click();
  await p.getByTestId('acao-remarcar').click();
  await p.getByTestId('salvar-agendamento').click();
  await p.waitForTimeout(400);
  assert.equal(await p.getByTestId('avisar-whats-pergunta').count(), 0, `${rot}: sem mudar o horário não pergunta`);
  assert.equal(await p.getByTestId('avisar-sem-telefone').count(), 0, `${rot}: sem mudar o horário não fala de telefone`);
  ok(`${rot}: remarcar sem mudar o horário não pergunta`);
  await fechaTudo(p);

  // 2) mudou o horário (cadastro do seed, com telefone): "Agora não" fecha sem abrir aba
  await remarcar(p, p.locator('[data-testid="cartao"]').first());
  await p.getByTestId('avisar-whats-pergunta').waitFor();
  await semRolagem(p, `${rot} pergunta`);
  if (tela.w < 700) { await dentroDaTela(p, 'avisar-whats-sim', `${rot} pergunta`); await dentroDaTela(p, 'avisar-whats-nao', `${rot} pergunta`); }
  await semAba(async () => { await p.getByTestId('avisar-whats-nao').click(); await p.getByTestId('avisar-whats-pergunta').waitFor({ state: 'detached' }); });
  ok(`${rot}: "Agora não" fecha sem abrir o WhatsApp`);
  await fechaTudo(p);

  // 3) "Avisar no WhatsApp": aba nova em wa.me com a mensagem de reagendamento
  await remarcar(p, p.locator('[data-testid="cartao"]').first());
  await p.getByTestId('avisar-whats-pergunta').waitFor();
  const texto = await p.getByTestId('avisar-whats-texto').textContent();
  assert.ok(/remarc|reagend/i.test(texto), `${rot}: mensagem de reagendamento: ${texto}`);
  const [nova] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), p.getByTestId('avisar-whats-sim').click()]);
  assert.ok(nova, `${rot}: abriu aba nova`);
  await nova.waitForLoadState().catch(() => {});
  assert.equal(pedidos.length, 1, `${rot}: um pedido ao WhatsApp: ${pedidos.join(' ')}`);
  assert.match(pedidos[0], /^https:\/\/wa\.me\/55\d{10,11}\?text=/, `${rot}: wa.me com telefone: ${pedidos[0]}`);
  assert.ok(decodeURIComponent(pedidos[0]).includes(texto.split('\n')[0].trim().slice(0, 20)), `${rot}: a mensagem vai no link`);
  await nova.close();
  ok(`${rot}: "Avisar no WhatsApp" abre aba nova no wa.me`);
  await fechaTudo(p);
  pedidos.length = 0;

  // 4) cliente cadastrado cujo número não recebe WhatsApp (cadastro só aceita telefone com DDD, então "sem telefone" no cadastro é recusado na ficha)
  await novoCliente(p, 'Sem Fone Teste', '(55) 1234-5678');
  await agendar(p, { nome: 'Sem Fone Teste', cadastrado: true, dia: '2026-10-15', hora: 9 });
  await remarcar(p, cartaoDe(p, 'Sem Fone Teste'));
  await p.getByTestId('avisar-sem-telefone').waitFor();
  assert.equal(await p.getByTestId('avisar-whats-pergunta').count(), 0, `${rot}: sem WhatsApp não oferece o WhatsApp`);
  assert.match(await p.getByTestId('avisar-sem-telefone').innerText(), /sem telefone/i, `${rot}: texto fala em telefone`);
  assert.match(await p.locator('.modal, [role=dialog]').first().innerText(), /Sem Fone Teste/, `${rot}: o aviso diz de quem é`);
  await semRolagem(p, `${rot} sem telefone`);
  await dentroDaTela(p, 'avisar-sem-telefone-ok', `${rot} sem telefone`);
  await semAba(async () => { await p.getByTestId('avisar-sem-telefone-ok').click(); await p.getByTestId('avisar-sem-telefone').waitFor({ state: 'detached' }); });
  assert.equal(pedidos.length, 0, `${rot}: sem WhatsApp não chama o WhatsApp`);
  ok(`${rot}: cliente cadastrado com número sem WhatsApp → aviso "sem telefone"`);
  await tentarApagarTelefone(p, 'Sem Fone Teste');
  ok(`${rot}: apagar o telefone do cadastro é recusado com mensagem`);

  // 5) atendimento SEM CADASTRO (sem telefone nem cliente): mesmo aviso
  await agendar(p, { nome: 'Avulso Teste', dia: '2026-10-15', hora: 15 });
  await remarcar(p, cartaoDe(p, 'Avulso Teste'));
  await p.getByTestId('avisar-sem-telefone').waitFor();
  assert.match(await p.locator('.modal, [role=dialog]').first().innerText(), /Avulso Teste/, `${rot}: o aviso diz de quem é (sem cadastro)`);
  await semAba(async () => { await p.getByTestId('avisar-sem-telefone-ok').click(); await p.getByTestId('avisar-sem-telefone').waitFor({ state: 'detached' }); });
  ok(`${rot}: atendimento sem cadastro → aviso "sem telefone"`);

  // 6) remarcar para OUTRO dia (fora dos 7 dias da lista: o cartão sai): o aviso continua e o cartão sumiu
  await agendar(p, { nome: 'Outro Dia Teste', telefone: '(55) 99222-3344', dia: '2026-10-15', hora: 17 });
  await remarcar(p, cartaoDe(p, 'Outro Dia Teste'), { dia: '2026-11-20', mexerHora: false });
  await p.getByTestId('avisar-whats-pergunta').waitFor();
  assert.equal(await cartaoDe(p, 'Outro Dia Teste').count(), 0, `${rot}: o cartão saiu da lista`);
  assert.match(await p.getByTestId('avisar-whats-texto').textContent(), /novembro|20\/11|quinta|sexta/i, `${rot}: a mensagem traz a data nova`);
  const [nova2] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), p.getByTestId('avisar-whats-sim').click()]);
  assert.ok(nova2, `${rot}: outro dia abriu aba nova`);
  await nova2.waitForLoadState().catch(() => {});
  assert.equal(pedidos.length, 1, `${rot}: outro dia → um pedido ao WhatsApp`);
  await nova2.close();
  ok(`${rot}: remarcar para outro dia mantém o aviso (cartão fora da lista)`);

  await agendar(p, { nome: 'Avulso Longe', dia: '2026-10-15', hora: 11 });
  await remarcar(p, cartaoDe(p, 'Avulso Longe'), { dia: '2026-11-21', mexerHora: false });
  await p.getByTestId('avisar-sem-telefone').waitFor();
  assert.equal(await cartaoDe(p, 'Avulso Longe').count(), 0, `${rot}: avulso saiu da lista`);
  await p.getByTestId('avisar-sem-telefone-ok').click();
  await p.getByTestId('avisar-sem-telefone').waitFor({ state: 'detached' });
  ok(`${rot}: sem cadastro remarcado para outro dia mantém o aviso`);

  await ctx.close();
}
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e69 ok');
