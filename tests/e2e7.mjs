import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const erros = [];
const novo = async (w, h, scheme = 'light') => {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: scheme });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  return p;
};
const ok = (m) => console.log('✓', m);
const arq = (nome) => ({ name: nome, mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
{
  const p = await novo(1440, 900);
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Contas' }).click();
  // Nubank: sem API (conta nova)
  await T('nova-conta').click();
  await T('conta-apelido').fill('Nubank PJ'); await T('conta-banco').selectOption('Nubank'); await T('conta-agencia').fill('0001'); await T('conta-numero').fill('445566-7');
  await T('salvar-conta').click();
  assert.equal(await T('api-testar').count(), 0);
  await p.screenshot({ path: 'shots/91-api-nubank.png', fullPage: true });
  // Sicredi: tenta sem certificado
  await p.getByRole('tab', { name: 'Conta principal' }).click();
  assert.match(await T('api-url').inputValue(), /api-pix-h\.sicredi/);
  await T('api-client-id').fill('abc12345'); await T('api-client-secret').fill('segredo123');
  await T('api-testar').click();
  assert.match(await T('api-passos').innerText(), /Envie o certificado/);
  await p.screenshot({ path: 'shots/92-api-falha.png', fullPage: true });
  await T('api-cert').setInputFiles(arq('sicredi.cer')); await T('api-chave').setInputFiles(arq('app.key')); await T('api-cadeia').setInputFiles(arq('cadeia.pem'));
  await T('api-testar').click();
  await T('api-ativa').waitFor();
  assert.match(await T('api-passos').innerText(), /Webhook registrado/);
  await p.screenshot({ path: 'shots/93-api-ativa.png', fullPage: true });
  ok('configura e testa a API Pix (Sicredi)');
  // gera cobrança pela API e paga
  await T('nav-agenda').click();
  await p.locator('[data-testid=evento][title*="14:30 Marcelo"]').first().click();
  await T('pix-gerar').click();
  await p.locator('[data-testid^=pix-codigo-]').waitFor();
  assert.match(await p.locator('[data-testid=bloco-pagamento]').innerText(), /API do Sicredi/);
  const codigo = await p.locator('[data-testid^=pix-codigo-] code').innerText();
  assert.ok(codigo.includes('pix-simulado.sicredi.example'));
  await p.locator('[data-testid^=pix-enviar-]').click();
  await p.getByRole('tab', { name: 'Banco' }).click();
  await T('banco-codigo').fill(codigo); await T('banco-nome').fill('Marcelo Santos'); await T('banco-cpf').fill('284.510.937-79');
  await T('banco-pagar').click();
  assert.match(await T('banco-resultado').innerText(), /webhook/);
  await p.screenshot({ path: 'shots/94-api-webhook.png' });
  assert.match(await T('pix-pago').innerText(), /API Pix/);
  await p.getByRole('tab', { name: 'Conversa' }).click();
  assert.ok((await T('wa-msgs').innerText()).toLowerCase().includes('pagamento confirmado'));
  ok('pagamento confirma por webhook e avisa no WhatsApp');
  console.log('erros', erros);
}
{
  const p = await novo(400, 800, 'dark');
  const T = (id) => p.locator(`[data-testid="${id}"]`);
  await T('demo-davi').click();
  await T('nav-financeiro').click();
  await p.getByRole('tab', { name: 'Contas' }).click();
  await p.getByRole('tab', { name: 'Conta de fornecedores' }).click();
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'shots/95-api-mobile.png', fullPage: true });
  console.log('overflow horizontal', await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  console.log('erros', erros);
}
await b.close();
if (erros.length) { console.log('ERROS', erros); process.exit(1); }
