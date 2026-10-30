/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Remarcar pelo painel (Artifact): cliente com telefone → pergunta "Avisar o cliente?"; "Avisar no WhatsApp" abre wa.me em aba nova com a mensagem pronta;
// "Agora não" só fecha; trocar só o status (mesmo horário) não pergunta.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const ok = (m) => console.log('✓', m);
const ctx = await b.newContext({ viewport: { width: 1366, height: 820 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
const pedidos = [];
await ctx.route(/wa\.me|whatsapp\.com/, (r) => { pedidos.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/html', body: '<title>wa</title>' }); });
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
await p.goto(new URL('../dist/index.html', import.meta.url).href);
await p.getByTestId('demo-loja-dalforno').click();
await p.getByTestId('demo-alan').click();
await p.getByTestId('nav-agenda').click();
const cartao = p.locator('[data-testid="cartao"]').first();
await cartao.waitFor();

async function remarcar(mexerHora) {
  await p.locator('[data-testid="cartao"]').first().click();
  await p.getByTestId('acao-remarcar').click();
  if (mexerHora) await p.getByRole('button', { name: 'Hora mais' }).click();
  await p.getByTestId('salvar-agendamento').click();
}

// 1) só o horário igual (nada mudou de horário): não pergunta
await remarcar(false);
await p.waitForTimeout(400);
assert.equal(await p.getByTestId('avisar-whats-pergunta').count(), 0, 'sem mudar o horário não pergunta');
ok('remarcar sem mudar o horário não pergunta');
await p.keyboard.press('Escape');

// 2) mudou o horário: pergunta; "Agora não" fecha sem abrir aba
await remarcar(true);
await p.getByTestId('avisar-whats-pergunta').waitFor();
const antes = ctx.pages().length;
await p.getByTestId('avisar-whats-nao').click();
await p.getByTestId('avisar-whats-pergunta').waitFor({ state: 'detached' });
assert.equal(ctx.pages().length, antes, '"Agora não" não abre aba');
ok('"Agora não" fecha sem abrir o WhatsApp');
await p.keyboard.press('Escape');

// 3) "Avisar no WhatsApp": aba nova em wa.me com a mensagem de reagendamento
await remarcar(true);
await p.getByTestId('avisar-whats-pergunta').waitFor();
const texto = await p.getByTestId('avisar-whats-texto').textContent();
assert.ok(/remarc|reagend/i.test(texto), 'mensagem de reagendamento: ' + texto);
const [nova] = await Promise.all([
  ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null),
  p.getByTestId('avisar-whats-sim').click(),
]);
assert.ok(nova, 'abriu aba nova');
await nova.waitForLoadState().catch(() => {});
assert.equal(pedidos.length, 1, 'um pedido ao WhatsApp: ' + pedidos.join(' '));
assert.match(pedidos[0], /^https:\/\/wa\.me\/55\d{10,11}\?text=/, 'endereço do wa.me com telefone: ' + pedidos[0]);
assert.ok(decodeURIComponent(pedidos[0]).includes(texto.split('\n')[0].trim().slice(0, 20)), 'a mensagem vai no link');
ok('"Avisar no WhatsApp" abre aba nova no wa.me');
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e69 ok');
