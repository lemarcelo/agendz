import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.setDefaultTimeout(8000);
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await p.goto(new URL('../dist/index.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
await T('demo-davi').click();
await T('nav-equipe').click();
await T('desativar-u-pablo').click();
await p.getByText(/ainda tem \d+ agendamento/).first().waitFor();
await p.screenshot({ path: 'shots/60-desativar-bloqueado.png' });
console.log('✓ bloqueia com agendamentos futuros');
await T('desativar-u-marcelo').click();
await p.getByText(/Marcelo ainda tem/).first().waitFor();
// cancela futuros do Marcelo pela agenda e desativa
console.log('erros', erros);
await b.close();
if (erros.length) { console.log('ERROS', erros); process.exit(1); }
