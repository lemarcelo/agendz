// Atendimento pago que muda de valor: com status "confirmado" o cliente recebe o Pix da diferença; depois de concluído nada é cobrado.
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
await (await irAteCartao(p, '[data-testid=cartao][title*="14:30 Marcelo"]')).click();
await T('pix-cpf').waitFor();
await T('pix-gerar').click();
await p.locator('[data-testid^=pix-codigo-]').waitFor();
await p.locator('[data-testid^=pix-enviar-]').click();
await p.locator('[data-testid^=pix-confirmar-]').click();
await p.locator('.modal-fundo').getByRole('button', { name: /Confirmar/ }).click();
await T('pix-pago').waitFor();
ok('Pix original pago');

// o esteticista lança um serviço a mais de R$ 15 depois do pagamento
// O chat só existe na tela Mensagens: lê as mensagens agora e de novo no fim do fluxo (nada pode ser enviado ao cliente nesse meio tempo).
const lerWa = async () => { await p.keyboard.press('Escape'); await T('nav-mensagens').click(); const t = (await T('wa-msgs').innerText()).toLowerCase(); await T('nav-agenda').click(); await (await irAteCartao(p, '[data-testid=cartao][title*="14:30 Marcelo"]')).click(); return t; };
const wa0 = await lerWa();
await p.getByRole('button', { name: /Mais opções/ }).click();
await p.locator('.servico-op:not(.on)').first().locator('input').check();
await p.getByRole('button', { name: 'Salvar serviços' }).click();
await T('pix-diferenca').waitFor();
assert.match(await T('pix-diferenca').innerText(), /faltam R\$\s?\d+,\d{2}.*Nada foi enviado ao cliente/s);
const falta = (await T('pix-diferenca').innerText()).match(/faltam R\$\s?(\d+,\d{2})/)[1];
assert.equal(await T('pix-complementar').count(), 0, 'nenhuma cobrança criada sozinha');
ok('confirmado: serviço a mais depois de pago só avisa; nada é enviado ao cliente');

// o esteticista decide cobrar: gera o Pix da diferença (continua sem enviar)
await T('pix-gerar').click();
await T('pix-complementar').waitFor();
assert.ok((await T('bloco-pagamento').innerText()).includes(falta));
ok('Pix da diferença gerado à mão, ainda sem envio');

// tira o serviço: o Pix da diferença (pendente) é cancelado; nada a cobrar e nada a devolver
await p.locator('.servico-op.on').last().locator('input').uncheck();
await p.getByRole('button', { name: 'Salvar serviços' }).click();
await p.waitForTimeout(300);
assert.equal(await T('pix-complementar').count(), 0, 'o complementar cancelado sai da lista');
ok('voltando ao valor pago, o complementar é cancelado');

// concluído: muda o valor e nada é cobrado nem enviado
await T('corrigir-status').selectOption('concluido');
await p.getByRole('button', { name: /Mais opções/ }).click().catch(() => {});
await p.locator('.servico-op:not(.on)').first().locator('input').check();
await p.getByRole('button', { name: 'Salvar serviços' }).click();
await T('pix-diferenca').waitFor();
assert.match(await T('pix-diferenca').innerText(), /nada é cobrado nem avisado/);
assert.equal(await T('pix-complementar').count(), 0);
const wa1 = await lerWa();
assert.equal(wa1.split('cobrança pix').length, wa0.split('cobrança pix').length, 'nada foi enviado ao cliente (nem ao gerar o Pix da diferença)');
assert.equal(wa1.length, wa0.length, 'nenhuma mensagem nova ao cliente');
ok('concluído: mostra a diferença, mas não cobra nem avisa');
await p.screenshot({ path: 'shots/diferenca-concluido.png' });
console.log('erros', erros);
assert.equal(erros.length, 0, erros.join('\n'));
await b.close();
