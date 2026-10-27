// Link de agendamento: botão na Agenda, página do cliente (celular), "Cliente agendou", Meus agendamentos, lembretes e celular da Agenda.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pubVeiculo } from './e2e-util.mjs';
// O seletor de profissionais é único e recolhe ao escolher: abre a lista se estiver fechada e devolve o item.
const filtroProf = async (p, id) => { const it = p.getByTestId(`filtro-${id}`); if (!(await it.isVisible().catch(() => false))) await p.getByTestId('filtro-abrir').click(); return it; };

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', permissions: ['clipboard-read', 'clipboard-write'],
    ...(touch ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {}) });
  // sem rede: as páginas do WhatsApp respondem vazias; o endereço whatsapp:// é anotado em vez de navegar
  await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }));
  await ctx.addInitScript(() => { window.__wa = []; const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (/^whatsapp:/.test(this.href)) { window.__wa.push(this.href); return; } return c.call(this); }; });
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
const NOMES_DO_SEED = ['Igor', 'Marcos', 'Rafael'];

// ================= computador: dono + cliente =================
{
  const { ctx, p } = await abrir({ width: 1440, height: 900 });
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click(); await T('copiar-link').waitFor();

  // posição: Dia/Semana/Mês | Link | Atender, com folga
  const seg = await p.locator('.barra-cal-acoes .segmentado').boundingBox();
  const lk = await T('copiar-link').boundingBox(); const at = await T('atender').boundingBox();
  assert.ok(seg.x + seg.width < lk.x && lk.x + lk.width < at.x, 'ordem: visão, link, Atender');
  assert.ok(lk.x - (seg.x + seg.width) >= 16 && at.x - (lk.x + lk.width) >= 16, `folga de 16 px: ${lk.x - seg.x - seg.width} e ${at.x - lk.x - lk.width}`);
  assert.equal(await T('copiar-link').getAttribute('aria-label'), 'Enviar link de agendamento pelo WhatsApp');
  // computador: um clique abre o WhatsApp (wa.me) em outra aba com a mensagem e o link; o link também é copiado; o painel não sai do lugar
  const urlAntes = p.url();
  const popup = ctx.waitForEvent('page', { timeout: 6000 });
  await T('copiar-link').click();
  await p.getByText('Link copiado').waitFor();
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  assert.ok(copiado.endsWith('#agendar'), 'copiou o link: ' + copiado);
  const aba = await popup; assert.ok(aba.url().startsWith('https://wa.me/?text='), aba.url());
  const msg = decodeURIComponent(aba.url().split('text=')[1]);
  assert.ok(msg.includes('Apex') && msg.endsWith(copiado), 'mensagem com o nome e o link: ' + msg);
  assert.equal((await p.evaluate(() => window.__wa)).length, 0, 'nunca tenta whatsapp://');
  await aba.close();
  assert.equal(p.url(), urlAntes, 'a página do painel não navegou');
  assert.equal(await T('copiar-link').isVisible(), true, 'o painel continua aberto');
  ok('botão de link abre o WhatsApp em outra aba, copia o link e mantém o painel');

  // dono desliga o link: botão e página indisponíveis
  await T('nav-estab').click(); await p.getByRole('tab', { name: 'Regras' }).click();
  await T('regras-link').locator('.trilho').click();
  await T('nav-agenda').click();
  assert.equal(await T('copiar-link').isDisabled(), true, 'link desligado: botão desabilitado');
  await p.evaluate(() => { location.hash = 'agendar'; });
  await T('pub-desligado').waitFor();
  await p.evaluate(() => { location.hash = ''; });
  await T('nav-estab').click(); await p.getByRole('tab', { name: 'Regras' }).click();
  await T('regras-link').locator('.trilho').click();
  await T('nav-agenda').click();
  assert.equal(await T('copiar-link').isDisabled(), false);
  ok('dono liga e desliga o link');

  // página do cliente
  await p.evaluate(() => { location.hash = 'agendar-u-pablo'; });
  await T('pagina-publica').waitFor();
  assert.ok(await T('pub-banner').isVisible(), 'o dono vê o aviso de que está na página do cliente');
  await pubVeiculo(p);
  await T('pub-srv-s-lav-simples').check();
  assert.equal(await p.getByTestId('pub-barb-u-pablo').getAttribute('aria-pressed'), 'true', 'o link do esteticista já escolhe ele');
  await T('pub-continuar-1').click();
  // pega o 4º dia (mais de 24 h) e o primeiro horário
  await p.locator('.pub-dia:not(.pub-mais)').nth(3).click();
  const horas = await p.locator('.pub-hora').evaluateAll((e) => e.map((x) => x.dataset.testid));
  assert.ok(horas.length > 4);
  const hora1 = horas[2];
  await T(hora1).click(); await T('pub-continuar-2').click();
  await T('pub-resumo').waitFor();
  const corpo = await T('pagina-publica').innerText();
  for (const n of NOMES_DO_SEED) assert.ok(!corpo.includes(n), `a página do cliente não mostra ${n}`);
  // validações
  await T('pub-enviar').click();
  assert.match(await T('pub-erro').innerText(), /nome/i);
  await T('pub-nome').fill('Joana Prado'); await T('pub-telefone').fill('11988887777'); await T('pub-enviar').click();
  assert.match(await T('pub-erro').innerText(), /DDD/);
  await T('pub-telefone').fill('51 98123 4567'); assert.equal(await T('pub-telefone').inputValue(), '(51) 98123-4567');
  await T('pub-enviar').click();
  await T('pub-feito').waitFor();
  assert.ok(await T('pub-lembretes-pergunta').isVisible(), 'pergunta sobre lembretes');
  await T('pub-lembrete-sim').click();
  await T('pub-lembrete-resp').waitFor();
  ok('cliente agenda com nome e telefone e aceita lembretes');

  // o horário escolhido não aparece mais para o próximo cliente
  await T('pub-novo').click();
  await pubVeiculo(p);
  await T('pub-srv-s-lav-simples').check(); await T('pub-barb-u-pablo').click(); await T('pub-continuar-1').click();
  await p.locator('.pub-dia:not(.pub-mais)').nth(3).click();
  assert.equal(await T(hora1).count(), 0, 'horário ocupado não aparece');
  assert.ok((await p.locator('.pub-hora').count()) >= horas.length - 3, 'os outros horários continuam');
  ok('horário já pedido some para os outros clientes');

  // meus agendamentos
  await p.getByTestId('pub-aba-meus').click();
  await T('pub-meus').waitFor();
  const card = p.locator('[data-testid^="pub-ag-"]').first();
  assert.match(await card.innerText(), /Aguardando confirmação/);
  assert.ok(!(await T('pub-meus').innerText()).match(/Igor|Marcos|Rafael/));
  assert.equal(await T('pub-lembretes-check').isChecked(), true);
  const id = (await card.getAttribute('data-testid')).replace('pub-ag-', '');
  // reagendar
  await T(`pub-remarcar-${id}`).click();
  await p.locator('[data-testid^="pubr-dia-"]').nth(4).click();
  const hs = await p.locator('[data-testid^="pubr-hora-"]').evaluateAll((e) => e.map((x) => x.dataset.testid));
  await T(hs[hs.length - 1]).click(); await T(`pub-remarcar-ok-${id}`).click();
  assert.match(await T('pub-aviso').innerText(), /remarcado/i);
  ok('cliente reagenda o próprio horário');

  // dono vê "Cliente agendou", confirma e o cliente vê Confirmado
  await p.evaluate(() => { location.hash = ''; });
  await T('nav-agenda').click();
  await p.getByRole('button', { name: 'Semana', exact: true }).click();
  await (await filtroProf(p, 'u-pablo')).click(); // o pedido foi para o Pablo
  assert.ok(Number(await T('cont-cliente-agendou').innerText()) >= 1, 'legenda conta o pedido do cliente');
  await T('legenda-cliente-agendou').click();
  const roxo = await p.locator('.grade-col .ev').evaluateAll((e) => e.map((x) => [...x.classList].find((c) => c.startsWith('st-'))));
  assert.ok(roxo.length >= 1 && roxo.every((c) => c === 'st-roxo'), 'só pedidos do cliente: ' + roxo.join(','));
  await p.locator('.grade-col .ev').first().click();
  await T('pedido-do-link').waitFor();
  await T('confirmar-pedido').click();
  assert.equal(await T('pedido-do-link').count(), 0);
  await p.keyboard.press('Escape');
  await p.evaluate(() => { location.hash = 'agendar'; });
  await T('pub-aba-meus').click();
  assert.match(await T('pub-meus').innerText(), /Confirmado/);
  ok('dono confirma o pedido; o cliente vê Confirmado');

  // cancelar com menos de 24 h é recusado; com mais, funciona
  await T('pub-aba-agendar').click();
  await pubVeiculo(p);
  await T('pub-srv-s-lav-motor').check(); await T('pub-barb-u-pablo').click(); await T('pub-continuar-1').click();
  await p.locator('.pub-dia:not(.pub-mais)').first().click();
  const h2 = await p.locator('.pub-hora').first().getAttribute('data-testid');
  await T(h2).click(); await T('pub-continuar-2').click();
  await T('pub-nome').fill('Joana Prado'); await T('pub-telefone').fill('51981234567'); await T('pub-enviar').click();
  await T('pub-feito').waitFor(); await T('pub-lembrete-nao').click();
  await T('pub-ver-meus').click();
  const hoje = p.locator('[data-testid^="pub-ag-"]').first();
  const idHoje = (await hoje.getAttribute('data-testid')).replace('pub-ag-', '');
  await T(`pub-cancelar-${idHoje}`).click();
  assert.match(await T('pub-meus').innerText(), /menos de 24 horas/);
  await p.getByRole('button', { name: 'Voltar', exact: true }).first().click();
  const longe = p.locator('[data-testid^="pub-ag-"]').nth(1);
  const idLonge = (await longe.getAttribute('data-testid')).replace('pub-ag-', '');
  await T(`pub-cancelar-${idLonge}`).click(); await T(`pub-cancelar-sim-${idLonge}`).click();
  assert.match(await T('pub-aviso').innerText(), /cancelado/i);
  ok('cancelar respeita o prazo de 24 h');

  // sair e voltar com telefone + código
  await T('pub-sair').click();
  await T('pub-entrar').waitFor();
  await T('pub-login-tel').fill('51981234567'); await T('pub-pedir-codigo').click();
  const dica = await T('pub-codigo-demo').innerText();
  const codigo = dica.match(/\b(\d{6})\b/)[1];
  await T('pub-codigo').fill('000000' === codigo ? '111111' : '000000'); await T('pub-entrar-ok').click();
  assert.ok(await T('pub-erro-acesso').isVisible(), 'código errado não entra');
  await T('pub-codigo').fill(codigo); await T('pub-entrar-ok').click();
  await T('pub-meus').waitFor();
  assert.ok(!(await T('pub-meus').innerText()).match(/Igor|Marcos|Rafael/));
  ok('entrar com telefone e código mostra só os próprios horários');
  await semRolagem(p, 'computador: página do cliente');
  await ctx.close();
}

// ================= celular: cliente e Agenda compacta =================
{
  const { ctx, p } = await abrir({ width: 390, height: 780 }, true);
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click(); await T('copiar-link').waitFor();
  await semRolagem(p, 'celular: agenda');
  // tudo acima do calendário cabe em menos de 330 px e o calendário começa na primeira tela
  const topoCal = await p.locator('.grade-semana, .grade').first().boundingBox();
  assert.ok(topoCal.y < 560, `o calendário começa na primeira tela (y=${Math.round(topoCal.y)})`);
  // status numa linha só
  const ys = await p.locator('.legenda .chip').evaluateAll((e) => [...new Set(e.map((x) => Math.round(x.getBoundingClientRect().top)))]);
  assert.equal(ys.length, 1, 'status numa linha só: ' + ys.join(','));
  // rótulo some nos não selecionados e aparece no selecionado
  assert.equal(await T('legenda-confirmado').locator('.chip-rot').isVisible(), false);
  await T('legenda-confirmado').tap();
  assert.equal(await T('legenda-confirmado').locator('.chip-rot').isVisible(), true);
  assert.equal(await T('legenda-confirmado').getAttribute('aria-label'), 'Confirmado: ' + (await T('cont-confirmado').innerText()) + ' no período');
  await T('legenda-confirmado').tap();
  // botão de link com ícone + "Link Agenda", alvo de 44 px, folga de 8 px ou mais
  const lk = await T('copiar-link').boundingBox(); const at = await T('atender').boundingBox(); const seg = await p.locator('.barra-cal-acoes .segmentado').boundingBox();
  assert.ok(lk.width >= 44 && lk.height >= 44, 'alvo de toque: ' + lk.width + 'x' + lk.height);
  assert.equal(await T('copiar-link').locator('.rotulo-link').isVisible(), false);
  assert.equal(await T('copiar-link').locator('.rotulo-link-curto').isVisible(), true);
  assert.equal((await T('copiar-link').innerText()).trim(), 'Link Agenda', 'celular: o botão diz Link Agenda');
  assert.ok(lk.x - (seg.x + seg.width) >= 8 && at.x - (lk.x + lk.width) >= 8, 'folga entre os botões');
  assert.ok(at.x + at.width <= 390 - 12, 'Atender dentro da margem');
  ok('celular: Agenda compacta, status numa linha, botão Link Agenda');

  // celular: um toque abre o WhatsApp (endereço wa.me, que abre o aplicativo) em outra aba, sem tentar o aplicativo do computador
  const popupM = ctx.waitForEvent('page', { timeout: 6000 });
  await T('copiar-link').tap();
  const abaM = await popupM; assert.ok(abaM.url().startsWith('https://wa.me/?text='), abaM.url());
  const msgM = decodeURIComponent(abaM.url().split('text=')[1]);
  assert.ok(msgM.includes('Apex') && msgM.includes('#agendar'), msgM);
  assert.equal((await p.evaluate(() => window.__wa)).length, 0, 'celular não usa whatsapp://');
  await abaM.close();
  assert.equal(await T('copiar-link').isVisible(), true, 'o painel continua aberto');
  ok('celular: o toque abre o WhatsApp com a mensagem e o link');

  // página do cliente no celular
  await p.evaluate(() => { location.hash = 'agendar'; });
  await T('pagina-publica').waitFor(); await semRolagem(p, 'celular: página do cliente, passo 1');
  await pubVeiculo(p, { toque: true });
  await T('pub-srv-s-lav-simples').check(); await T('pub-continuar-1').click(); await semRolagem(p, 'celular: passo 2');
  const h = await p.locator('.pub-hora').first().boundingBox();
  assert.ok(h.height >= 44, 'horário com alvo de 44 px');
  await p.locator('.pub-hora').first().tap(); await T('pub-continuar-2').tap();
  await T('pub-nome').fill('Cliente Celular'); await T('pub-telefone').fill('53991112222'); await semRolagem(p, 'celular: passo 3');
  await T('pub-enviar').tap(); await T('pub-feito').waitFor(); await semRolagem(p, 'celular: pedido enviado');
  await p.screenshot({ path: new URL('../shots/e2e29-celular-feito.png', import.meta.url).pathname });
  ok('celular: cliente agenda sem rolagem horizontal');

  // escuro
  await p.emulateMedia({ colorScheme: 'dark' });
  await T('pub-ver-meus').tap(); await T('pub-meus').waitFor(); await semRolagem(p, 'celular escuro: meus agendamentos');
  await p.screenshot({ path: new URL('../shots/e2e29-celular-meus-escuro.png', import.meta.url).pathname });
  await ctx.close();
}

await b.close();
assert.deepEqual(erros, [], 'erros de página/console: ' + erros.join(' | '));
console.log('e2e29 ok');
