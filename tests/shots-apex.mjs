// Capturas para conferir o visual do Apex (não faz parte do verificar).
import { chromium } from 'playwright';
const b = await chromium.launch();
const abre = async (w, h) => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: 1 });
  await ctx.clock.setFixedTime(new Date('2026-10-12T10:30:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  return p;
};
{
  const p = await abre(1440, 900);
  await p.screenshot({ path: 'shots/apex-login.png' });
  await p.locator('[data-testid=demo-davi]').click();
  await p.getByRole('button', { name: 'Dia', exact: true }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/apex-agenda-dia.png' });
  await p.locator('[data-testid=nav-servicos]').click(); await p.screenshot({ path: 'shots/apex-servicos.png', fullPage: true });
  await p.locator('[data-testid=alternar-tema]').click(); await p.locator('[data-testid=nav-agenda]').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: 'shots/apex-agenda-claro.png' });
}
{
  const p = await abre(390, 800);
  await p.screenshot({ path: 'shots/apex-m-login.png' });
  await p.locator('[data-testid=demo-davi]').click(); await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/apex-m-agenda.png' });
  await p.evaluate(() => { location.hash = 'agendar'; }); await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/apex-m-publico1.png' });
}
await b.close();
