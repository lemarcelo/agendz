/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F (V60, duração indefinida) na demonstração (dist/index.html), barbearia (Dalforno, Alan) e estética (Apex, Davi), ponta a ponta:
//  o dono guarda o WhatsApp do estabelecimento (Estabelecimento > Dados), cadastra um serviço de duração indefinida com vários valores e descrição (Serviços), marca vários horários
//  no Atender (grade de 30 min, X para desmarcar, soma em minutos, valor final) e o agendamento é criado; no #agendar o serviço não tem grade: mostra a descrição e os valores e o botão
//  "Combinar agendamento" é um link https://wa.me com o número do estabelecimento (nunca whatsapp://), e escolher só ele não oferece horário.
// Relógio fixo (segunda 12/10/2026). 1440 e 390 px com fonte larga (DejaVu Sans), sem rolagem lateral. E2E_CAPTURAS=<pasta> grava as imagens.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const CAP = process.env.E2E_CAPTURAS;
const LOJAS = [{ slug: 'dalforno', demo: 'demo-alan', nome: 'Dalforno' }, { slug: 'apex', demo: 'demo-davi', nome: 'Apex' }];
const b = await chromium.launch();
const erros = [];
for (const loja of LOJAS) {
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
    const rotulo = `${loja.slug}/${vp.width}`;
    const touch = vp.width < 700;
    const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
    await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }));
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(new URL('../dist/index.html', import.meta.url).href + `?loja=${loja.slug}`);
    await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
    const T = (id) => p.getByTestId(id);
    const semRolagem = async (onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${rotulo}: sem rolagem lateral ${onde}`);
    const foto = async (nome) => { if (!CAP) return; await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/f-demo-${loja.slug}-${nome}-${vp.width}.png`, fullPage: true }); };

    await T(loja.demo).click(); await T('agenda-topo').waitFor();

    // 1) WhatsApp do estabelecimento
    await T('nav-estab').click();
    await T('est-whatsapp').waitFor();
    await T('est-whatsapp').fill('123'); await T('salvar-dados').click();
    await p.getByText(/Informe o WhatsApp com DDD/).first().waitFor();
    await T('est-endereco').fill('Rua das Flores, 100'); await T('est-whatsapp').fill('(53) 99999-0000'); await T('salvar-dados').click();
    await p.getByText('Dados salvos.').first().waitFor();
    ok(`${rotulo}: WhatsApp do estabelecimento (número curto é recusado)`);

    // 2) serviço de duração indefinida com vários valores
    await T('nav-servicos').click();
    await T('novo-servico').click();
    await T('srv-nome').fill('Coloração');
    await p.locator('label:has([data-testid="srv-indefinida"])').click();
    await T('srv-indef').waitFor();
    assert.equal(await T('srv-dur').count(), 0, `${rotulo}: some a duração em minutos`);
    assert.equal(await T('srv-duracao-indef').inputValue(), 'Indefinida');
    await T('srv-duracao-texto').fill('De 1 a 3 dias, conforme o cabelo');
    await T('srv-preco-modo').selectOption('lista');
    await T('srv-opcao-desc-0').fill('Mechas curtas'); await T('srv-opcao-valor-0').fill('180');
    await T('srv-opcao-desc-1').fill('Mechas longas'); await T('srv-opcao-valor-1').fill('320');
    await semRolagem('cadastro do serviço'); await foto('cadastro');
    await T('salvar-servico').click();
    await p.getByText('Coloração').first().waitFor();
    ok(`${rotulo}: serviço indefinido cadastrado com lista de valores`);

    // 3) Atender com vários horários
    await T('nav-agenda').click();
    await T('atender').click();
    const srvId = await p.locator('[data-testid^="atender-srv-"]').evaluateAll((els) => (els.find((e) => e.closest('label,div')?.textContent.includes('Coloração')) || {}).dataset?.testid);
    assert.ok(srvId, `${rotulo}: o serviço aparece no Atender`);
    assert.match(await p.locator(`label:has([data-testid="${srvId}"])`).first().innerText(), /A partir de R\$\s?180,00/);
    await T(srvId).check();
    await T('atender-bloco-dia').waitFor();
    await T('atender-bloco-dia').fill('2026-11-24');
    for (const h of ['0900', '0930', '1000']) await T(`atender-bloco-h-${h}`).click();
    assert.match(await T('atender-blocos-total').innerText(), /Total: 1 h 30 min/);
    await T('atender-bloco-h-0930').click(); // X: desmarca e o bloco se parte
    assert.equal(await T('atender-bloco-item').count(), 2);
    await T('atender-bloco-h-0930').click();
    assert.equal(await T('atender-bloco-item').count(), 1);
    await T(`atender-valor-op-${srvId.replace('atender-srv-', '')}-1`).click();
    assert.equal(await T(`atender-valor-${srvId.replace('atender-srv-', '')}`).inputValue(), '320');
    await semRolagem('grade de horários'); await foto('atender-grade');
    if (loja.slug === 'apex') { // estética: o veículo é do cadastro do atendimento
      const placa = T('atender-v-placa'); if (await placa.count()) { await placa.fill('ABC1D23'); }
    }
    await T('salvar-atender').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid="atender-bloco-dia"]'), null, { timeout: 8000 }).catch(() => {});
    if (await T('atender-bloco-dia').count()) { // ficou aberto: mostra o motivo
      const msg = await p.locator('[role="alert"], .msg-conflito, .aviso-erro').allInnerTexts();
      throw new Error(`${rotulo}: o Atender não fechou: ${JSON.stringify(msg)}`);
    }
    ok(`${rotulo}: Atender com blocos e valor final criou o agendamento`);

    // 4) o cliente no #agendar: sem grade, com a descrição, os valores e o botão Combinar
    await p.evaluate(() => { location.hash = '#agendar'; });
    await T('pub-aba-agendar').waitFor();
    if (loja.slug === 'apex') { // estética: veículo primeiro
      await T('pub-placa').fill('ABC1D23'); await T('pub-modelo').fill('Onix'); await T('pub-porte-medio').click().catch(() => {}); await T('pub-continuar-0').click();
    }
    const pubId = await p.locator('[data-testid^="pub-srv-"]').evaluateAll((els) => (els.find((e) => e.closest('label')?.textContent.includes('Coloração')) || {}).dataset?.testid);
    assert.ok(pubId, `${rotulo}: o serviço aparece no link`);
    const sid = pubId.replace('pub-srv-', '');
    await T(pubId).check();
    await T(`pub-combinar-${sid}`).waitFor();
    assert.equal(await T('pub-continuar-1').count(), 0, `${rotulo}: só indefinido não oferece horário`);
    assert.match(await T(`pub-combinar-valores-${sid}`).innerText(), /Mechas longas[\s\S]*R\$\s?320,00/);
    assert.match(await T(`pub-combinar-duracao-${sid}`).innerText(), /De 1 a 3 dias/);
    const href = await T(`pub-combinar-btn-${sid}`).getAttribute('href');
    assert.ok(href.startsWith('https://wa.me/5553999990000?text='), `${rotulo}: wa.me comum com o WhatsApp do estabelecimento (${href})`);
    assert.equal(await T(`pub-combinar-btn-${sid}`).getAttribute('target'), '_blank');
    assert.match(decodeURIComponent(href.split('text=')[1]), /Coloração/);
    await semRolagem('link do cliente'); await foto('link');
    await ctx.close();
    ok(`${rotulo}: link do cliente com Combinar agendamento`);
  }
}
assert.deepEqual(erros, [], 'sem erro de página nem diálogo nativo');
await b.close();
console.log('e2e134 ok');
