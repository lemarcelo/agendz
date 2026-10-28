/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ficha do agendamento > Mais opções > Serviços realizados: a caixa da lista tem canto arredondado e o botão "Salvar serviços" não encosta nela
// (390 px e 1440 px, claro e escuro).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
for (const [nome, viewport, esquema] of [['celular', { width: 390, height: 780 }, 'light'], ['celular escuro', { width: 390, height: 780 }, 'dark'], ['computador', { width: 1440, height: 900 }, 'light']]) {
  const ctx = await b.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: esquema });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.locator('[data-testid^="demo-"]', { hasText: 'proprietário' }).first().click();
  await p.getByTestId('agenda-modo-horarios').click();
  await p.locator('[data-testid=cartao]').first().click();
  await p.getByText('Mais opções').click();
  const lista = p.getByTestId('ficha-lista-servicos');
  const caixas = lista.locator('input[type=checkbox]');
  await caixas.last().click();
  const botao = p.getByRole('button', { name: 'Salvar serviços' });
  await botao.waitFor();
  const m = await p.evaluate(() => {
    const l = document.querySelector('[data-testid="ficha-lista-servicos"]');
    const bt = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Salvar serviços');
    return { raio: parseFloat(getComputedStyle(l).borderBottomLeftRadius), vao: bt.getBoundingClientRect().top - l.getBoundingClientRect().bottom };
  });
  assert.ok(m.raio >= 6, `${nome}: a caixa da lista sem canto arredondado (${m.raio}px)`);
  assert.ok(m.vao >= 8, `${nome}: "Salvar serviços" encosta na lista (vão de ${m.vao}px)`);
  console.log('✓', nome, m);
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, []);
