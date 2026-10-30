/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Botão "Link Agenda" da Agenda: com cor de tema na loja (Apex: verde→lima da logo) o fundo segue o tema; sem tema (Dalforno e Offbox em "Padrão") fica neutro.
// Nos dois casos o texto fica legível (contraste >= 4,5). Três lojas, tema claro e escuro, computador e celular. Relógio fixo.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const base = new URL('../dist/index.html', import.meta.url).href;
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const b = await chromium.launch();
const erros = [];
const casos = [['apex', 'demo-davi'], ['dalforno', 'demo-alan'], ['offbox', 'demo-kiko']];
for (const [loja, usuario] of casos) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
    for (const tema of ['light', 'dark']) {
      const touch = vp.width < 700;
      const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
      await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
      const p = await ctx.newPage(); p.setDefaultTimeout(8000);
      p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
      await p.goto(`${base}?loja=${loja}`);
      await p.getByTestId(usuario).click(); await p.getByTestId('agenda-topo').waitFor();
      await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
      const btn = p.getByTestId('copiar-link');
      await btn.waitFor();
      const m = await btn.evaluate((e) => { const c = getComputedStyle(e); const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number); return { fundo: c.backgroundImage, fundoCor: c.backgroundColor, cor: rgb(c.color), cores: (c.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(rgb) }; });
      if (loja === 'apex') assert.ok(m.cores.length >= 1, `${loja}/${tema}/${vp.width}: o fundo tem a cor do tema (${m.fundo})`);
      else assert.equal(m.fundo, 'none', `${loja}/${tema}/${vp.width}: sem tema, o fundo fica neutro`);
      const fundos = m.cores.length ? m.cores : [(m.fundoCor.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)];
      for (const f of fundos) assert.ok(contraste(m.cor, f) >= 4.5, `${loja}/${tema}/${vp.width}: texto legível sobre o fundo (${contraste(m.cor, f).toFixed(2)})`);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'sem rolagem lateral');
      ok(`${loja} ${tema} ${vp.width}px: botão Link Agenda com fundo do tema e contraste ok`);
      await ctx.close();
    }
  }
}
assert.deepEqual(erros, []);
await b.close();
ok('e2e75 completo');
