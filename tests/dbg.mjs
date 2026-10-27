import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('PAGE', e.message));
await p.goto(new URL('../dist/index.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
await T('demo-davi').click();
await T('wa-quem').selectOption('c:c-marcelo');
await p.getByRole('tab', { name: 'Relógio' }).click();
for (let i = 0; i < 6; i++) {
  const t = await T('relogio').textContent();
  const en = await T('proximo-evento').isEnabled();
  console.log(i, t, en, (await T('proximo-evento').textContent()).slice(0, 80));
  if (!en) break;
  await T('proximo-evento').click({ timeout: 3000 });
}
await b.close();
