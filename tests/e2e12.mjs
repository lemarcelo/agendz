// Atendimento pago que muda de valor: com status "confirmado" o cliente recebe o Pix da diferença; depois de concluído nada é cobrado.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // relógio fixo: o resultado não depende da hora em que o teste roda
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
await p.goto(new URL('../dist/index.html', import.meta.url).href);
const T = (id) => p.locator(`[data-testid="${id}"]`);
const ok = (m) => console.log('✓', m);
await T('demo-davi').click();
await T('nav-agenda').click();
await p.locator('[data-testid=evento][title*="14:30 Marcelo"]').first().click();
await T('pix-cpf').waitFor();
await T('pix-gerar').click();
await p.locator('[data-testid^=pix-codigo-]').waitFor();
await p.locator('[data-testid^=pix-enviar-]').click();
await p.locator('[data-testid^=pix-confirmar-]').click();
await p.locator('.modal-fundo').getByRole('button', { name: /Confirmar/ }).click();
await T('pix-pago').waitFor();
ok('Pix original pago');

// o esteticista lança um serviço a mais de R$ 15 depois do pagamento
const antes = (await T('wa-msgs').innerText()).toLowerCase().split('cobrança pix').length;
await p.getByRole('button', { name: /Mais opções/ }).click();
await p.locator('.servico-op:not(.on)').first().locator('input').check();
await p.getByRole('button', { name: 'Salvar serviços' }).click();
await T('pix-diferenca').waitFor();
assert.match(await T('pix-diferenca').innerText(), /faltam R\$\s?\d+,\d{2}.*Nada foi enviado ao cliente/s);
const falta = (await T('pix-diferenca').innerText()).match(/faltam R\$\s?(\d+,\d{2})/)[1];
assert.equal(await T('pix-complementar').count(), 0, 'nenhuma cobrança criada sozinha');
const depois = (await T('wa-msgs').innerText()).toLowerCase().split('cobrança pix').length;
assert.equal(depois, antes, 'nada enviado ao cliente');
ok('confirmado: serviço a mais depois de pago só avisa; nada é enviado ao cliente');

// o esteticista decide cobrar: gera o Pix da diferença (continua sem enviar)
await T('pix-gerar').click();
await T('pix-complementar').waitFor();
assert.ok((await T('bloco-pagamento').innerText()).includes(falta));
assert.equal((await T('wa-msgs').innerText()).toLowerCase().split('cobrança pix').length, antes, 'gerar não envia');
ok('Pix da diferença gerado à mão, ainda sem envio');

// tira o serviço: o Pix da diferença (pendente) é cancelado; nada a cobrar e nada a devolver
await p.locator('.servico-op.on').last().locator('input').uncheck();
await p.getByRole('button', { name: 'Salvar serviços' }).click();
await p.waitForTimeout(300);
assert.equal(await T('pix-complementar').count(), 0, 'o complementar cancelado sai da lista');
ok('voltando ao valor pago, o complementar é cancelado');

// concluído: muda o valor e nada é cobrado nem enviado
await T('corrigir-status').selectOption('concluido');
const m1 = (await T('wa-msgs').innerText()).length;
await p.getByRole('button', { name: /Mais opções/ }).click().catch(() => {});
await p.locator('.servico-op:not(.on)').first().locator('input').check();
await p.getByRole('button', { name: 'Salvar serviços' }).click();
await T('pix-diferenca').waitFor();
assert.match(await T('pix-diferenca').innerText(), /nada é cobrado nem avisado/);
assert.equal(await T('pix-complementar').count(), 0);
assert.equal((await T('wa-msgs').innerText()).length, m1, 'nenhuma mensagem nova ao cliente');
ok('concluído: mostra a diferença, mas não cobra nem avisa');
await p.screenshot({ path: 'shots/diferenca-concluido.png' });
console.log('erros', erros);
assert.equal(erros.length, 0, erros.join('\n'));
await b.close();
