/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Auditoria visual: percorre todas as telas do menu (abas, formulários e a ficha do agendamento) nas três lojas de demonstração, em 390 px e 1440 px,
// claro e escuro, e falha se achar (1) caixa com borda e canto reto (esqueceu `conj`/raio) ou (2) botão encostado (menos de 6 px) na caixa de cima.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const ACHADOS = new Map();
const vistoria = () => {
  const out = [];
  const nome = (e) => (e.getAttribute('data-testid') ? `[${e.getAttribute('data-testid')}]` : '') + e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 40 && r.height > 24 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight * 3; };
  const bordas = (cs) => ['Top', 'Right', 'Bottom', 'Left'].filter((l) => parseFloat(cs['border' + l + 'Width']) > 0 && cs['border' + l + 'Style'] !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs['border' + l + 'Color'])).length;
  for (const e of document.querySelectorAll('body *')) {
    if (/^(TABLE|THEAD|TBODY|TR|TD|TH|INPUT|SELECT|TEXTAREA|HR|SVG|PATH|IMG|OPTION|LEGEND|HTML|BODY)$/i.test(e.tagName)) continue;
    if (!vis(e)) continue;
    const cs = getComputedStyle(e);
    if (bordas(cs) >= 3 && parseFloat(cs.borderTopLeftRadius) === 0 && parseFloat(cs.borderBottomLeftRadius) === 0) out.push(['caixa sem raio', nome(e)]);
    if (bordas(cs) >= 1 || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.borderBottomLeftRadius) > 0)) {
      const r = e.getBoundingClientRect();
      let n = e.nextElementSibling;
      if (n && vis(n)) {
        const rn = n.getBoundingClientRect();
        const ehBotao = n.matches('button, .btn, a.btn, input[type=submit]');
        const gap = rn.top - r.bottom;
        const sobrepoeH = Math.min(r.right, rn.right) - Math.max(r.left, rn.left) > 20;
        if (ehBotao && sobrepoeH && gap >= -1 && gap < 6 && r.width > 120) out.push(['botão colado na caixa (' + Math.round(gap) + 'px)', nome(e) + ' → ' + nome(n)]);
      }
    }
  }
  return out;
};
let VISTAS = 0;
async function juntar(p, onde) { VISTAS++; for (const [t, n] of await p.evaluate(vistoria)) { const k = `${t} | ${n}`; if (!ACHADOS.has(k)) ACHADOS.set(k, onde); } }
const LOJAS = ['apex', 'dalforno', 'offbox'];
const COMBOS = [['390', { width: 390, height: 800 }, 'light'], ['390', { width: 390, height: 800 }, 'dark'], ['1440', { width: 1440, height: 900 }, 'light']];
for (const [rot, vp, esq] of COMBOS) {
  for (const loja of LOJAS) {
    const arq = loja;
    {
      const ctx = await b.newContext({ viewport: vp, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: esq });
      await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
      const p = await ctx.newPage(); p.setDefaultTimeout(6000);
      p.on('dialog', (d) => d.dismiss());
      await p.goto(new URL('../dist/index.html', import.meta.url).href + '?loja=' + loja);
      const onde = (x) => `${arq} ${rot}px ${esq}: ${x}`;
      await juntar(p, onde('login'));
      await p.locator('[data-testid^="demo-"]', { hasText: 'proprietário' }).first().click().catch(() => {});
      await p.waitForTimeout(400);
      const navs = await p.locator('[data-testid^="nav-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid')));
      for (const n of navs) {
        await p.getByTestId(n).click().catch(() => {}); await p.waitForTimeout(250);
        await juntar(p, onde(n));
        // abas e botões de "novo/adicionar" que abrem formulário
        for (const alvo of await p.locator('.abas button').all()) { await alvo.click().catch(() => {}); await p.waitForTimeout(150); await juntar(p, onde(n + ' aba')); }
        for (const t of ['atender', 'novo-servico', 'novo-cliente', 'novo-usuario', 'novo-material', 'novo-cupom', 'novo-box']) {
          const el = p.getByTestId(t); if (await el.count()) { await el.first().click().catch(() => {}); await p.waitForTimeout(250); await juntar(p, onde(n + ' ' + t)); await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
        }
      }
      // ficha do agendamento
      await p.getByTestId('nav-agenda').click().catch(() => {}); await p.getByTestId('agenda-modo-horarios').click().catch(() => {});
      const c = p.locator('[data-testid=cartao]').first();
      if (await c.count()) { await c.click(); await p.waitForTimeout(250); await juntar(p, onde('ficha')); await p.getByText('Mais opções').click().catch(() => {}); await juntar(p, onde('ficha mais')); }
      await ctx.close();
    }
  }
}
await b.close();
const lista = [...ACHADOS].map(([k, v]) => `${k}  (visto em ${v})`);
assert.deepEqual(lista, [], 'problemas de layout:\n' + lista.join('\n'));
console.log('✓', VISTAS, 'telas vistoriadas sem caixa de canto reto nem botão colado');
