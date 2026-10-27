import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.setDefaultTimeout(8000);
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(new URL('../dist/index-barbearia.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
await T('demo-alan').click();
await T('nav-equipe').click();
await T('desativar-u-kiko').click();
await p.getByText(/ainda tem \d+ agendamento/).first().waitFor();
await p.screenshot({ path: 'shots/60-desativar-bloqueado.png' });
console.log('✓ bloqueia com agendamentos futuros');
await T('desativar-u-tailuan').click();
await p.getByText(/Tailuan ainda tem/).first().waitFor();
// cancela futuros do Tailuan pela agenda e desativa
console.log('erros', erros);
await b.close();
if (erros.length) { console.log('ERROS', erros); process.exit(1); }
