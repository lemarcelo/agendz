// Seleção de status e barbeiro: clique = um só; segurar / dois cliques (só mouse) / Ctrl+clique = vários; X remove só um.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// O seletor de profissionais é único e recolhe ao escolher: abre a lista se estiver fechada e devolve o item.
const filtroProf = async (p, id) => { const it = p.getByTestId(`filtro-${id}`); if (!(await it.isVisible().catch(() => false))) await p.getByTestId('filtro-abrir').click(); return it; };

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index-barbearia.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(url);
  return { ctx, p };
}
const ok = (m) => console.log('✓', m);
const marcado = async (T, id) => { if (id.startsWith('filtro-u-') && !(await T(id).isVisible().catch(() => false))) await T('filtro-abrir').click(); return (await T(id).getAttribute('aria-pressed')) === 'true'; };
const qtd = (p, sel) => p.locator(sel).count();
async function segurarMouse(p, loc, ms = 700) {
  const r = await loc.boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down(); await p.waitForTimeout(ms); await p.mouse.up(); await p.waitForTimeout(80);
}
async function segurarToque(p, ctx, loc, ms = 700) {
  const cdp = await ctx.newCDPSession(p); const r = await loc.boundingBox();
  const pt = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] }); await p.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(120);
}

// ================= computador =================
{
  const { ctx, p } = await abrir({ width: 1440, height: 900 });
  const T = (id) => p.getByTestId(id);
  await T('demo-alan').click(); await T('nav-agenda').waitFor();
  await p.getByTestId('agenda-modo-calendario').click();

  // status: clique escolhe um só
  await T('legenda-confirmado').click();
  await T('legenda-cancelado').click();
  assert.equal(await marcado(T, 'legenda-confirmado'), false, 'clicar em outro troca, não soma');
  assert.equal(await marcado(T, 'legenda-cancelado'), true);
  assert.equal(await qtd(p, '[data-testid^="remover-"]'), 0, 'sem X com um só marcado');
  await T('legenda-cancelado').click();
  assert.equal(await marcado(T, 'legenda-cancelado'), false, 'clicar no único marcado limpa');
  ok('status: clique = um por vez');

  // dois cliques juntam
  await T('legenda-confirmado').click();
  await T('legenda-cancelado').dblclick();
  assert.equal(await marcado(T, 'legenda-confirmado'), true, 'duplo clique mantém o que já estava');
  assert.equal(await marcado(T, 'legenda-cancelado'), true, 'duplo clique soma');
  assert.equal(await qtd(p, '[data-testid^="remover-"]'), 2, 'X em cada marcador selecionado');
  // segurar com o mouse soma o terceiro
  await segurarMouse(p, T('legenda-concluido'));
  assert.equal(await marcado(T, 'legenda-concluido'), true, 'segurar soma');
  assert.equal(await marcado(T, 'legenda-confirmado'), true);
  assert.equal(await qtd(p, '[data-testid^="remover-"]'), 3);
  assert.equal(await T('legenda-a-confirmar').evaluate((e) => e.parentElement.firstElementChild === e), true);
  ok('status: dois cliques e segurar juntam vários');

  // X tira só aquele
  await T('remover-concluido').click();
  assert.equal(await marcado(T, 'legenda-concluido'), false);
  assert.equal(await marcado(T, 'legenda-confirmado'), true);
  await T('remover-cancelado').click();
  assert.equal(await qtd(p, '[data-testid^="remover-"]'), 0, 'sobrou um: sem X');
  assert.equal(await marcado(T, 'legenda-confirmado'), true);
  // Ctrl + clique também soma (teclado)
  await T('legenda-sem-resposta').click({ modifiers: ['Control'] });
  assert.equal(await qtd(p, '[data-testid^="remover-"]'), 2);
  await T('legenda-limpar').click();
  assert.equal(await qtd(p, '[data-testid^="remover-"]'), 0);
  ok('status: X remove só um; Ctrl+clique soma; limpar zera');

  // segurar e arrastar continua mudando a ordem (não vira seleção)
  const lista = () => p.locator('.legenda button[data-testid^="legenda-"]').evaluateAll((e) => e.map((x) => x.dataset.testid));
  const antes = await lista();
  const o = await T('legenda-cancelado').boundingBox(); const a = await T('legenda-a-confirmar').boundingBox();
  await p.mouse.move(o.x + o.width / 2, o.y + o.height / 2); await p.mouse.down(); await p.waitForTimeout(560);
  for (let i = 1; i <= 8; i++) { await p.mouse.move(o.x + o.width / 2 + ((a.x + 4 - o.x - o.width / 2) * i) / 8, o.y + o.height / 2); await p.waitForTimeout(25); }
  await p.mouse.up(); await p.waitForTimeout(150);
  const depois = await lista();
  assert.notDeepEqual(depois, antes, 'a ordem mudou');
  assert.equal(await marcado(T, 'legenda-cancelado'), false, 'arrastar não seleciona');
  await T('ordem-restaurar').click().catch(() => {});

  // barbeiros (dono): um por vez, vários por gesto, X, mínimo de um
  await (await filtroProf(p, 'u-kiko')).click();
  assert.equal(await marcado(T, 'filtro-u-kiko'), true);
  assert.equal(await marcado(T, 'filtro-u-alan'), false, 'clique troca a agenda');
  await (await filtroProf(p, 'u-kiko')).click();
  assert.equal(await marcado(T, 'filtro-u-kiko'), true, 'sempre fica um');
  await (await filtroProf(p, 'u-alan')).dblclick();
  assert.equal(await marcado(T, 'filtro-u-alan'), true);
  assert.equal(await marcado(T, 'filtro-u-kiko'), true, 'duplo clique junta');
  assert.equal(await qtd(p, '[data-testid^="remover-u-"]'), 2);
  await p.keyboard.press('Escape'); await T('remover-u-kiko').click();
  assert.equal(await marcado(T, 'filtro-u-kiko'), false);
  assert.equal(await marcado(T, 'filtro-u-alan'), true);
  assert.equal(await qtd(p, '[data-testid^="remover-u-"]'), 0, 'o último não tem X');
  await segurarMouse(p, await filtroProf(p, 'u-kiko'));
  assert.equal(await marcado(T, 'filtro-u-kiko'), true, 'segurar junta');
  assert.equal(await qtd(p, '[data-testid^="remover-u-"]'), 2);
  // lembra após recarregar
  await T('sair').click(); await p.goto(url); await T('demo-alan').click();
  assert.equal(await marcado(T, 'filtro-u-kiko'), true); assert.equal(await marcado(T, 'filtro-u-alan'), true);
  ok('barbeiros: um por vez; gesto junta; X remove; sempre ao menos um; lembrado');
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, 'sem rolagem horizontal');
  await ctx.close();
}

// ================= celular (toque) =================
{
  const { ctx, p } = await abrir({ width: 390, height: 780 }, true);
  const T = (id) => p.getByTestId(id);
  await T('demo-alan').click(); await T('nav-agenda').waitFor();
  await T('legenda-confirmado').tap();
  await T('legenda-cancelado').tap();
  assert.equal(await marcado(T, 'legenda-confirmado'), false, 'toque troca');
  assert.equal(await marcado(T, 'legenda-cancelado'), true);
  await segurarToque(p, ctx, T('legenda-confirmado'));
  assert.equal(await marcado(T, 'legenda-confirmado'), true, 'toque longo soma');
  assert.equal(await marcado(T, 'legenda-cancelado'), true);
  assert.equal(await qtd(p, '[data-testid^="remover-"]'), 2);
  await T('remover-cancelado').tap();
  assert.equal(await marcado(T, 'legenda-cancelado'), false);
  assert.equal(await marcado(T, 'legenda-confirmado'), true);
  // toque longo em barbeiro
  await segurarToque(p, ctx, await filtroProf(p, 'u-kiko'));
  assert.equal(await qtd(p, '[data-testid^="remover-u-"]'), 2, 'toque longo junta barbeiros');
  await p.keyboard.press('Escape'); await T('remover-u-kiko').tap();
  assert.equal(await qtd(p, '[data-testid^="remover-u-"]'), 0);
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, 'celular sem rolagem horizontal');
  ok('celular: toque troca; toque longo junta; X remove');
  await ctx.close();
}

await b.close();
assert.deepEqual(erros, [], 'erros de página/console: ' + erros.join(' | '));
console.log('e2e28 ok');
