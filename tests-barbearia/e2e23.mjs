// Comissão por período (De/Até) e trava da ficha depois de a comissão ser paga.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// A Agenda mostra um dia por vez (v73): procura o cartão hoje, depois nos dias seguintes e nos anteriores, e devolve o primeiro que achar.
const irAteCartao = async (p, seletor, dias = 21) => {
  const alvo = p.locator(seletor);
  await p.getByTestId('agenda-modo-horarios').click().catch(() => {});
  for (const dir of ['Próximo', 'Anterior']) {
    await p.getByRole('button', { name: 'Hoje', exact: true }).click();
    for (let i = 0; i <= dias; i++) { if (await alvo.count()) return alvo.first(); await p.getByRole('button', { name: dir, exact: true }).click(); }
  }
  throw new Error('cartão não encontrado em ±' + dias + ' dias: ' + seletor);
};
// O seletor de profissionais é único e recolhe ao escolher: abre a lista se estiver fechada e devolve o item.
const filtroProf = async (p, id) => { const it = p.getByTestId(`filtro-${id}`); if (!(await it.isVisible().catch(() => false))) await p.getByTestId('filtro-abrir').click(); return it; };

const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index-barbearia.html', import.meta.url).href);
const T = (id) => p.getByTestId(id);
const num = async (id) => Number((await T(id).innerText()).replace(/[^\d,]/g, '').replace(',', '.'));
const ok = (m) => console.log('✓', m);

await T('demo-alan').click();
await T('nav-relatorios').click();
await p.getByRole('tab', { name: 'Comissões' }).click();
const mesTodo = await num('com-apagar-u-kiko');
assert.ok(mesTodo > 0, 'o Kiko tem comissão a pagar no mês');
// período curto: só um dia sem atendimentos concluídos do Kiko
await T('per-de').fill('2026-10-31'); await T('per-ate').fill('2026-10-31');
assert.match(await T('rel-mes').innerText(), /31\/10\/2026 a 31\/10\/2026/);
assert.equal(await T('com-apagar-u-kiko').count(), 0, 'sem atendimentos nesse dia, o Kiko nem aparece');
// data final antes da inicial: mostra o erro, não quebra
await T('per-de').fill('2026-10-20'); await T('per-ate').fill('2026-10-10');
assert.match(await p.locator('[role=alert]').first().innerText(), /não pode ser antes/);
await p.getByRole('button', { name: 'Mês atual' }).click();
assert.equal(await num('com-apagar-u-kiko'), mesTodo, 'voltar ao mês traz tudo de novo');
ok('período De/Até e atalho Mês atual');

// uma venda de produto do Kiko hoje; depois de pagar a comissão dele, a ficha trava
await T('nav-agenda').click();
await T('atender').click();
await p.locator('[data-testid^="atender-prod-"]').first().fill('1');
await T('atender-vendedor').selectOption('u-kiko');
await T('atender-profissional').selectOption('u-kiko');
await T('salvar-atender').click();
await T('salvar-atender').waitFor({ state: 'detached' });
await T('nav-relatorios').click();
await p.getByRole('tab', { name: 'Comissões' }).click();
await T('com-pagar-u-kiko').click();
await T('com-confirmar-u-kiko').click();
assert.equal(await num('com-apagar-u-kiko'), 0);
await T('nav-agenda').click();
await (await filtroProf(p, 'u-kiko')).click();
await (await irAteCartao(p, '[data-testid=cartao]:has-text(\"Venda de produtos\")')).click();
await T('comissao-travada').waitFor();
assert.equal(await p.locator('[data-testid^="rm-produto-"]').count(), 0);
assert.equal(await T('add-servico-sel').count(), 0);
assert.equal(await T('add-produto-sel').count(), 0);
ok('ficha travada depois da comissão paga');
console.log('erros', erros);
assert.equal(erros.length, 0, erros.join('\n'));
await b.close();
