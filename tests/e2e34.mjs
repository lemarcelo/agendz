/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda: botão "Link Agenda" em TODAS as lojas de demonstração (apex, dalforno, offbox) e seletor único de profissionais
// (sem sobreposição em 390 e 1440 px, inclusive com fonte larga e nome comprido; seleção inicial; recolhe ao escolher; "Todos").
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const LOJAS = ['apex', 'dalforno', 'offbox']; // se entrar loja nova em src/services/lojas-demo.js, entra aqui (o teste confere a lista)
const base = new URL('../dist/index.html', import.meta.url).href;
const ok = (m) => console.log('✓', m);

async function abrir(slug, viewport, { fonteLarga = false } = {}) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }));
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(`${base}?loja=${slug}`);
  if (fonteLarga) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  return { ctx, p };
}
const entrarComoDono = async (p) => { await p.locator('[data-testid^="demo-"]', { hasText: 'proprietário' }).first().click(); await p.getByTestId('filtro-abrir').waitFor(); };

// 0. a lista deste teste é a lista do código
{
  const fonte = (await import('node:fs')).readFileSync(new URL('../src/services/lojas-demo.js', import.meta.url), 'utf8');
  const slugs = [...fonte.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(slugs)].sort(), [...LOJAS].sort(), 'lojas de demonstração diferentes da lista do teste');
  ok('lista de lojas do teste = lojas-demo.js');
}

// 1. botão Link Agenda em cada loja: habilitado, abre o WhatsApp com o link da própria loja, em 390 e em 1440 px
for (const slug of LOJAS) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
    const { ctx, p } = await abrir(slug, vp);
    await entrarComoDono(p);
    const bt = p.getByTestId('copiar-link');
    assert.equal(await bt.isDisabled(), false, `${slug} ${vp.width}: botão habilitado`);
    if (vp.width < 700) assert.equal((await bt.innerText()).trim(), 'Link Agenda', `${slug}: texto no celular`);
    const aba = ctx.waitForEvent('page', { timeout: 6000 });
    await (vp.width < 700 ? bt.tap() : bt.click());
    const nova = await aba;
    assert.ok(nova.url().startsWith('https://wa.me/?text='), `${slug}: ${nova.url()}`);
    const msg = decodeURIComponent(nova.url().split('text=')[1]);
    assert.ok(msg.includes('#agendar'), `${slug}: mensagem sem o link: ${msg}`);
    assert.ok(msg.includes('loja=' + slug) || msg.includes(slug), `${slug}: o link não é da própria loja: ${msg}`);
    for (const outra of LOJAS.filter((x) => x !== slug)) assert.ok(!msg.includes('loja=' + outra), `${slug}: link de outra loja (${outra})`);
    await nova.close(); await ctx.close();
  }
  ok(`${slug}: Link Agenda funciona (computador e celular)`);
}

// 1b. Artifact (sem ?loja= no endereço): a loja escolhida no login vai dentro do link (#agendar@loja) e o cliente cai nela, nunca na Apex
for (const slug of ['dalforno', 'offbox']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }));
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  await p.goto(base);
  await p.getByTestId(`demo-loja-${slug}`).click();
  await entrarComoDono(p);
  const aba = ctx.waitForEvent('page', { timeout: 6000 });
  await p.getByTestId('copiar-link').tap();
  const msg = decodeURIComponent((await aba).url().split('text=')[1]);
  assert.ok(msg.endsWith(`#agendar@${slug}`), `${slug}: o link não leva a loja: ${msg}`);
  const link = msg.slice(msg.indexOf('http') >= 0 ? msg.indexOf('http') : msg.indexOf('file'));
  // cliente: sessão nova, endereço sem ?loja=, só o hash do link
  const cli = await b.newContext({ viewport: { width: 390, height: 780 }, locale: 'pt-BR' });
  const q = await cli.newPage(); q.setDefaultTimeout(8000);
  await q.goto(`${base}#agendar@${slug}`);
  await q.getByTestId('pub-aba-agendar').waitFor();
  const tipos = { apex: 'estetica_automotiva', dalforno: 'barbearia', offbox: 'barbearia' };
  await q.waitForFunction((t) => document.documentElement.getAttribute('data-tipo') === t, tipos[slug]);
  // aparelho que antes usou outra loja (guardada no navegador): o link manda mais que a loja salva, e o link do profissional também
  const alt = { dalforno: 'Barbearia Dalforno', offbox: 'Offbox Barbearia' }[slug];
  assert.equal(await q.locator('img').first().getAttribute('alt'), alt, `${slug}: logo de outra loja na página do cliente`);
  const cli2 = await b.newContext({ viewport: { width: 390, height: 780 }, locale: 'pt-BR' });
  await cli2.addInitScript(() => { try { localStorage.setItem('agendz-demo-loja', 'apex'); } catch { /* sem armazenamento */ } });
  const q2 = await cli2.newPage(); q2.setDefaultTimeout(8000);
  await q2.goto(`${base}#agendar-u-kiko@${slug}`);
  await q2.getByTestId('pub-aba-agendar').waitFor();
  assert.equal(await q2.locator('img').first().getAttribute('alt'), alt, `${slug}: link do profissional caiu na loja salva`);
  assert.equal(await q2.evaluate(() => document.documentElement.getAttribute('data-tipo')), 'barbearia');
  await cli2.close();
  // v126: o link leva ?loja= além do #…@loja; sem o fragmento (redirecionamento ou quadro que o perde), a loja salva (apex) não manda
  assert.ok(msg.includes(`?loja=${slug}&ir=agendar#agendar@${slug}`), `${slug}: o link não leva ?loja= junto: ${msg}`);
  const cli3 = await b.newContext({ viewport: { width: 390, height: 780 }, locale: 'pt-BR' });
  await cli3.addInitScript(() => { try { localStorage.setItem('agendz-demo-loja', 'apex'); } catch { /* sem armazenamento */ } });
  const q3 = await cli3.newPage(); q3.setDefaultTimeout(8000);
  await q3.goto(`${base}?loja=${slug}#agendar`);
  await q3.getByTestId('pub-aba-agendar').waitFor();
  assert.equal(await q3.locator('img').first().getAttribute('alt'), alt, `${slug}: sem o fragmento, o link caiu na loja salva`);
  await cli3.close();
  // v129: o quadro do Artifact joga o fragmento fora e o link chegava no LOGIN da loja certa: a página vem de `?ir=`, sem nenhum #
  const cli4 = await b.newContext({ viewport: { width: 390, height: 780 }, locale: 'pt-BR' });
  const q4 = await cli4.newPage(); q4.setDefaultTimeout(8000);
  await q4.goto(`${base}?loja=${slug}&ir=agendar-u-kiko`);
  await q4.getByTestId('pub-aba-agendar').waitFor();
  assert.equal(await q4.locator('img').first().getAttribute('alt'), alt, `${slug}: sem o fragmento, a página do cliente abriu na loja errada`);
  assert.equal(await q4.getByTestId('login-entrar').count(), 0, `${slug}: sem o fragmento o link abriu o login`);
  await cli4.close();
  const corpo = await q.locator('body').innerText();
  assert.ok(!/lavagem|polimento|veículo/i.test(corpo), `${slug}: página do cliente com serviços da Apex`);
  // o título da aba e o texto do convite trazem o nome da loja certa
  const nomeLoja = { dalforno: 'Dalforno', offbox: 'Offbox' }[slug];
  assert.ok(msg.includes(nomeLoja), `${slug}: convite sem o nome da loja: ${msg}`);
  assert.ok(link.length > 0);
  await cli.close(); await ctx.close();
  ok(`${slug}: sem ?loja=, o link leva a loja (#agendar@${slug}) e a página do cliente é dela`);
}

// 2. seletor único de profissionais: sem sobreposição, seta à direita, recolhe ao escolher, "Todos", seleção inicial
for (const slug of LOJAS) {
  for (const [vp, fonteLarga] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 780 }, false], [{ width: 390, height: 780 }, true], [{ width: 360, height: 740 }, true]]) {
    const { ctx, p } = await abrir(slug, vp, { fonteLarga });
    const T = (id) => p.getByTestId(id);
    await entrarComoDono(p);
    // nome comprido: o botão corta com reticências e nada passa da tela nem encosta no resto
    await p.evaluate(() => { const bEl = document.querySelector('[data-testid="filtro-abrir"] .filtro-txt b'); bEl.textContent = 'Fulano de Tal da Silva Sauro Muito Comprido de Verdade'; });
    const caixa = await T('filtro-abrir').boundingBox();
    assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= vp.width, `${slug} ${vp.width}: botão dentro da tela`);
    const seta = await p.locator('[data-testid="filtro-abrir"] .seletor-seta').boundingBox();
    const txt = await p.locator('[data-testid="filtro-abrir"] .filtro-txt').boundingBox();
    assert.ok(seta.x >= txt.x + txt.width - 1 && seta.x + seta.width <= caixa.x + caixa.width + 1, `${slug}: seta à direita, sem sobrepor o texto`);
    const abaixo = await p.locator('.agenda-topo').boundingBox();
    assert.ok(abaixo.y >= caixa.y + caixa.height, `${slug} ${vp.width}: a barra do calendário não é coberta pelo seletor`);
    const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(sw <= iw, `${slug} ${vp.width}: sem rolagem horizontal (${sw} > ${iw})`);
    // barra de ações (Dia/Semana/Mês, Link, Atender) dentro da tela e sem se sobrepor
    const caixas = await p.locator('.agenda-acoes > *').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.x + r.width]; }));
    for (let i = 0; i < caixas.length; i++) {
      assert.ok(caixas[i][1] <= vp.width, `${slug} ${vp.width}: botão ${i} passa da tela`);
      if (i) assert.ok(caixas[i][0] >= caixas[i - 1][1] - 0.5, `${slug} ${vp.width}: botões ${i - 1} e ${i} se sobrepõem`);
    }
    await ctx.close();
  }
  ok(`${slug}: seletor e barra sem sobreposição (390/360 com fonte larga e 1440)`);
}

{
  const { ctx, p } = await abrir('apex', { width: 1440, height: 900 });
  const T = (id) => p.getByTestId(id);
  await entrarComoDono(p);
  // quem atende vem selecionado; abrir mostra a lista com "Todos" e recolhe ao escolher
  await T('filtro-abrir').click(); await T('seletor-painel').waitFor();
  assert.equal(await T('filtro-u-davi').getAttribute('aria-pressed'), 'true', 'Davi atende: vem selecionado');
  assert.equal(await T('filtro-todos').getAttribute('aria-pressed'), 'false');
  await T('filtro-u-pablo').click(); await T('seletor-painel').waitFor({ state: 'detached' });
  ok('um clique escolhe e a lista recolhe');
  await T('filtro-abrir').click(); await T('filtro-todos').click(); await T('seletor-painel').waitFor({ state: 'detached' });
  assert.match(await T('filtro-abrir').innerText(), /Todos/);
  await p.reload(); await entrarComoDono(p);
  assert.match(await T('filtro-abrir').innerText(), /Todos/, '"Todos" escolhido fica lembrado');
  await T('filtro-abrir').click(); await p.keyboard.press('Escape'); await T('seletor-painel').waitFor({ state: 'detached' });
  assert.equal(await T('filtro-abrir').getAttribute('aria-expanded'), 'false');
  ok('"Todos" fica lembrado; Esc recolhe');
  await ctx.close();
}

assert.deepEqual(erros, [], 'erros no console/página: ' + erros.join(' | '));
await b.close();
console.log('e2e34 ok');
