// Ordem personalizada: segurar e arrastar menu, abas, colunas e marcadores; salva por usuário; clique no marcador filtra o calendário. Mouse, teclado e toque (celular).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index-barbearia.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(url);
  return { ctx, p };
}
const centro = async (loc) => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, r }; };
// segura com o mouse, arrasta até a metade esquerda/direita do alvo e solta
async function arrastarMouse(p, origem, alvo, lado = 'antes') {
  const o = await centro(origem); const a = await centro(alvo);
  const x = lado === 'antes' ? a.r.x + a.r.width * 0.15 : a.r.x + a.r.width * 0.85;
  await p.mouse.move(o.x, o.y); await p.mouse.down(); await p.waitForTimeout(520);
  await p.mouse.move((o.x + x) / 2, a.y, { steps: 6 }); await p.mouse.move(x, a.y, { steps: 6 }); await p.waitForTimeout(80);
  await p.mouse.up(); await p.waitForTimeout(120);
}
// mesmo gesto com toque de verdade (pointerType touch), pelo protocolo do Chrome
async function arrastarToque(p, ctx, origem, alvo, lado = 'antes') {
  const cdp = await ctx.newCDPSession(p);
  const o = await centro(origem); const a = await centro(alvo);
  const x = lado === 'antes' ? a.r.x + a.r.width * 0.15 : a.r.x + a.r.width * 0.85;
  const t = (type, px, py) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }] });
  await t('touchStart', o.x, o.y); await p.waitForTimeout(560);
  for (let i = 1; i <= 8; i++) { await t('touchMove', o.x + ((x - o.x) * i) / 8, o.y + ((a.y - o.y) * i) / 8); await p.waitForTimeout(25); }
  await t('touchEnd'); await p.waitForTimeout(150);
}
const ordemTestIds = (p, sel) => p.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') || e.textContent.trim()));
const semRolagem = async (p, onde) => {
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `${onde}: rolagem horizontal (${sw} > ${iw})`);
};

// =============== computador ===============
{
  const { ctx, p } = await abrir({ width: 1360, height: 860 });
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-alan').click();
  await T('nav-agenda').waitFor();
  const padrao = await ordemTestIds(p, '.nav button');
  assert.equal(padrao[0], 'nav-agenda');
  assert.equal(await T('ordem-restaurar').count(), 0, 'sem ordem personalizada não há botão de restaurar');

  // clique rápido continua navegando
  await T('nav-clientes').click();
  assert.equal(await T('nav-clientes').getAttribute('aria-current'), 'page');
  await T('nav-agenda').click();

  // menu: segurar Clientes e soltar antes de Agenda; a tela não muda (o clique do fim do arrasto é descartado)
  await arrastarMouse(p, T('nav-clientes'), T('nav-agenda'), 'antes');
  const nova = await ordemTestIds(p, '.nav button');
  assert.equal(nova[0], 'nav-clientes', 'Clientes foi para a frente: ' + nova.join(','));
  assert.equal(nova[1], 'nav-agenda');
  assert.equal(await T('nav-agenda').getAttribute('aria-current'), 'page', 'arrastar não navega');
  assert.equal(await T('ordem-restaurar').count(), 1);

  // fica salvo: recarrega e entra de novo
  await p.reload(); await T('demo-alan').click(); await T('nav-agenda').waitFor();
  assert.deepEqual(await ordemTestIds(p, '.nav button'), nova, 'a ordem do menu sobrevive ao recarregar');

  // é por usuário: outro usuário no mesmo navegador vê a ordem padrão
  await T('sair').click(); await T('demo-kiko').click(); await T('nav-agenda').waitFor();
  const kiko = await ordemTestIds(p, '.nav button');
  assert.equal(kiko[0], 'nav-agenda', 'barbeiro não herda a ordem do dono');
  await T('sair').click(); await T('demo-alan').click(); await T('nav-agenda').waitFor();

  // teclado: Alt + seta move o item focado e mantém o foco
  await T('nav-agenda').focus();
  await p.keyboard.press('Alt+ArrowRight');
  await p.waitForTimeout(100);
  const ap = await ordemTestIds(p, '.nav button');
  assert.equal(ap.indexOf('nav-agenda'), 2, 'Alt + seta anda um passo: ' + ap.join(','));
  assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'nav-agenda', 'o foco continua no item movido');
  await p.keyboard.press('Alt+ArrowLeft');
  assert.equal((await ordemTestIds(p, '.nav button')).indexOf('nav-agenda'), 1);

  // abas do Financeiro
  await T('nav-financeiro').click();
  const abas0 = await ordemTestIds(p, '.abas button');
  await arrastarMouse(p, p.getByRole('tab', { name: 'Lançamentos' }), p.getByRole('tab', { name: 'Resumo' }), 'antes');
  const abas1 = await ordemTestIds(p, '.abas button');
  assert.equal(abas1[0], 'Lançamentos'); assert.deepEqual([...abas1].sort(), [...abas0].sort());
  await p.getByRole('tab', { name: 'Lançamentos' }).click();
  await p.waitForTimeout(150);

  // colunas da tabela de lançamentos (ou outra tabela do Financeiro): Valor para a frente, e a célula acompanha o título
  await T('nav-clientes').click();
  const th = () => p.locator('table.tabela thead th');
  const cab0 = await th().allTextContents();
  assert.equal(cab0[0], 'Cliente');
  const linha0 = await p.locator('table.tabela tbody tr').first().locator('td').allTextContents();
  await arrastarMouse(p, p.locator('table.tabela thead th', { hasText: 'CPF' }), p.locator('table.tabela thead th', { hasText: 'Cliente' }), 'antes');
  const cab1 = await th().allTextContents();
  assert.equal(cab1[0], 'CPF', 'coluna CPF foi para a frente: ' + cab1.join('|'));
  assert.equal(cab1[cab1.length - 1], '', 'a coluna de ações continua no fim');
  const linha1 = await p.locator('table.tabela tbody tr').first().locator('td').allTextContents();
  assert.equal(linha1[0], linha0[2], 'a célula do CPF acompanhou o título');
  await p.reload(); await T('demo-alan').click(); await T('nav-clientes').click();
  assert.equal((await th().allTextContents())[0], 'CPF', 'a ordem das colunas sobrevive ao recarregar');

  // legenda: segura e muda a ordem; clicar filtra o calendário
  await T('nav-agenda').click();
  await p.getByTestId('agenda-modo-calendario').click();
  const leg0 = await ordemTestIds(p, '.legenda button[data-testid^="legenda-"]');
  assert.equal(leg0[0], 'legenda-a-confirmar');
  await arrastarMouse(p, T('legenda-cancelado'), T('legenda-a-confirmar'), 'antes');
  const leg1 = await ordemTestIds(p, '.legenda button[data-testid^="legenda-"]');
  assert.equal(leg1[0], 'legenda-cancelado', 'marcador movido: ' + leg1.join(','));
  assert.equal(await T('legenda-cancelado').getAttribute('aria-pressed'), 'false', 'arrastar não liga o filtro');

  const totalPontos = await p.locator('.mes-ponto').count();
  assert.ok(totalPontos > 1, 'o mês tem mais de um status para filtrar');
  const contConf = Number(await T('cont-confirmado').textContent());
  await T('legenda-confirmado').click();
  assert.equal(await T('legenda-confirmado').getAttribute('aria-pressed'), 'true');
  const classes = await p.locator('.mes-ponto').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith('st-'))));
  assert.ok(classes.length > 0 && classes.every((c) => c === 'st-azul'), 'só confirmados no calendário: ' + classes.join(','));
  const somaPontos = await p.locator('.mes-ponto').evaluateAll((els) => els.reduce((s, e) => s + (Number(e.textContent) || 0), 0));
  assert.equal(somaPontos, contConf, 'o calendário mostra tantos casos quanto o contador do marcador');
  assert.equal(Number(await T('cont-confirmado').textContent()), contConf, 'o contador não muda com o filtro');
  assert.ok(await T('filtro-ativo').isVisible());
  // dois marcadores ao mesmo tempo
  await T('legenda-cancelado').dblclick(); // dois cliques juntam com o que já estava marcado
  const duas = await p.locator('.mes-ponto').evaluateAll((els) => (els.map((e) => [...e.classList].find((c) => c.startsWith('st-')))));
  assert.ok([...duas].every((c) => ['st-azul', 'st-cinza'].includes(c)));
  // vale também no dia
  await p.getByTestId('agenda-modo-horarios').click();
  const cart = await p.locator('[data-testid="cartao"]').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c.startsWith('st-'))));
  assert.ok(cart.every((c) => ['st-azul', 'st-cinza'].includes(c)), 'no dia só aparecem os casos escolhidos: ' + cart.join(','));
  await T('legenda-limpar').click();
  assert.equal(await T('filtro-ativo').count(), 0);
  assert.equal(await T('legenda-confirmado').getAttribute('aria-pressed'), 'false');
  await p.getByTestId('agenda-modo-calendario').click();
  assert.equal(await p.locator('.mes-ponto').count(), totalPontos, 'sem filtro volta tudo');

  // restaurar ordem padrão
  await T('ordem-restaurar').click();
  assert.deepEqual(await ordemTestIds(p, '.nav button'), padrao);
  assert.equal(await T('ordem-restaurar').count(), 0);
  assert.equal(await T('legenda-a-confirmar').evaluate((e) => e.parentElement.parentElement.firstElementChild === e.parentElement), true, 'legenda voltou ao padrão');

  // ordem adulterada no armazenamento nunca derruba a tela
  await p.evaluate(() => {
    const u = Object.keys(localStorage).find((k) => k.startsWith('agenda-visao:'))?.split(':')[1] || '';
    for (const k of ['nav', 'legenda', 'col:clientes']) localStorage.setItem(`ordem:${k}:${u}`, JSON.stringify([{ x: 1 }, '__proto__', 7, null, 'nav-fantasma']));
  });
  await p.reload(); await T('demo-alan').click(); await T('nav-agenda').waitFor();
  assert.deepEqual(await ordemTestIds(p, '.nav button'), padrao, 'lixo salvo é ignorado');
  await ctx.close();
}

// =============== celular (390 px) ===============
{
  const { ctx, p } = await abrir({ width: 390, height: 800 }, true);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-alan').tap();
  await T('nav-agenda').waitFor();
  await semRolagem(p, 'celular: agenda');
  const leg0 = await ordemTestIds(p, '.legenda button[data-testid^="legenda-"]');
  await arrastarToque(p, ctx, T('legenda-concluido'), T('legenda-a-confirmar'), 'antes');
  const leg1 = await ordemTestIds(p, '.legenda button[data-testid^="legenda-"]');
  assert.equal(leg1[0], 'legenda-concluido', 'toque: marcador movido ' + leg1.join(',') + ' (antes ' + leg0.join(',') + ')');
  assert.equal(await T('legenda-concluido').getAttribute('aria-pressed'), 'false');
  await semRolagem(p, 'celular: legenda reordenada');
  // toque curto filtra
  await T('legenda-cancelado').tap();
  assert.equal(await T('legenda-cancelado').getAttribute('aria-pressed'), 'true');
  await T('legenda-limpar').tap();

  // menu no celular: mexer o dedo cedo é rolagem e não arrasto
  const nav0 = await ordemTestIds(p, '.nav button');
  await arrastarToque(p, ctx, T('nav-clientes'), T('nav-agenda'), 'antes');
  const nav1 = await ordemTestIds(p, '.nav button');
  assert.equal(nav1[0], 'nav-clientes', 'toque: menu movido ' + nav1.join(',') + ' (antes ' + nav0.join(',') + ')');
  await semRolagem(p, 'celular: menu reordenado');
  await ctx.close();
}

assert.deepEqual(erros, []);
await b.close();
console.log('e2e16 ok');
