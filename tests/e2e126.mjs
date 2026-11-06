/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco B1b no SITE REAL (#agendar, dist/index-real.html), contra um servidor falso: dois serviços feitos por pessoas diferentes (Corte só do Kiko, Barba só do Bruno).
// Um campo de profissional por serviço (vazio, obrigatório, só quem faz); "Com quem?" some; horários só da sequência; o pedido leva as atribuições; a tela final lista as partes.
// 1366 e 390 px (fonte larga). E2E_CAPTURAS=pasta grava as imagens.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const pasta = process.env.E2E_CAPTURAS || '';
if (pasta) mkdirSync(pasta, { recursive: true });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const KIKO = id(2), BRUNO = id(3), CORTE = id(50), BARBA = id(51), SOBR = id(52);
const servicos = [{ id: CORTE, nome: 'Corte', duracao: 40, preco: 50, antecedenciaH: 0 }, { id: BARBA, nome: 'Barba', duracao: 30, preco: 35, antecedenciaH: 0 }, { id: SOBR, nome: 'Sobrancelha', duracao: 15, preco: 20, antecedenciaH: 0 }];
const vinc = { [KIKO]: [CORTE, SOBR], [BRUNO]: [BARBA, SOBR] };
const chamadas = [];
const resumo = (n, quem, srv, ini) => ({ id: id(800 + n), inicio: ini, fim: new Date(new Date(ini).getTime() + 40 * 60000).toISOString(), status: 'a_confirmar', rotulo: 'A confirmar', servicos: srv, duracao: 40, total: 50, desconto: 0, cupom: '', profissional: quem, ativo: true, podeCancelar: true });

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    if (req.method !== 'GET') chamadas.push({ m: req.method, p, dados: corpo ? JSON.parse(corpo) : null });
    if (p === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Barbearia Dalforno', tipo: 'barbearia' });
    if (p === '/api/publico/agendar') return json(200, { ativo: true, diasMax: 30, exigeTelefone: true, exigeNome: true, tipo: 'barbearia', servicos, profissionais: [{ id: KIKO, nome: 'Kiko', servicoIds: vinc[KIKO] }, { id: BRUNO, nome: 'Bruno', servicoIds: vinc[BRUNO] }], profissionalAutomatico: false, selo: '1.' + 'a'.repeat(32) });
    const srv = (u.searchParams.get('servicos') || '').split(',').filter(Boolean);
    const atr = (u.searchParams.get('atribuicoes') || '').split(',').filter(Boolean).map((x) => x.split(':'));
    const prof = u.searchParams.get('profissionalId');
    // servidor falso com a regra do verdadeiro: sem atribuições, só vale quem faz TODOS os serviços; com atribuições, a sequência (aqui: sempre cabe, primeiro serviço no Kiko)
    const quemFaz = [KIKO, BRUNO].filter((x) => srv.every((s) => vinc[x].includes(s)) && (!prof || prof === x));
    const cadeia = atr.length > 1 && atr.every(([s, q]) => vinc[q].includes(s));
    const ok2 = cadeia || quemFaz.length > 0;
    if (p === '/api/publico/dias') return json(200, ok2 ? [1, 2, 3, 4].map((i) => new Date(Date.UTC(2026, 10, 9 + i)).toISOString().slice(0, 10)) : []);
    if (p === '/api/publico/horarios') return json(200, ok2 ? [{ inicio: '2026-11-10T13:00:00Z', profissionalId: cadeia ? atr[0][1] : quemFaz[0] }, { inicio: '2026-11-10T14:00:00Z', profissionalId: cadeia ? atr[0][1] : quemFaz[0] }] : []);
    if (p === '/api/publico/agendamentos' && req.method === 'POST') {
      const d = JSON.parse(corpo);
      const tk = (n) => String(n).repeat(48).slice(0, 48);
      if (d.atribuicoes) return json(201, { agendamento: resumo(1, 'Kiko', ['Corte'], d.inicio), token: tk(1), usouPlano: false, outros: [{ agendamento: resumo(2, 'Bruno', ['Barba'], new Date(new Date(d.inicio).getTime() + 40 * 60000).toISOString()), token: tk(2), usouPlano: false, outros: [] }] });
      return json(201, { agendamento: resumo(1, 'Kiko', ['Corte'], d.inicio), token: tk(1), usouPlano: false, outros: [] });
    }
    if (p === '/api/publico/meus') return json(200, []);
    json(404, {});
  });
});

const FONTE_LARGA = '* { font-family: "DejaVu Sans", sans-serif !important; }';
const erros = [];
await new Promise((r) => servidor.listen(0, r));
const b = await chromium.launch();
try {
  for (const vp of [{ nome: '1366', width: 1366, height: 800 }, { nome: '390', width: 390, height: 780 }]) {
    chamadas.length = 0;
    const touch = vp.width < 700;
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.clock.setFixedTime(new Date('2026-11-09T07:00:00-03:00'));
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(`http://127.0.0.1:${servidor.address().port}/#agendar`);
    if (touch) await p.addStyleTag({ content: FONTE_LARGA });
    const T = (t) => p.getByTestId(t);
    const semLateral = async (onde) => { const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(w[0] <= w[1], `${onde}: sem rolagem lateral (${w[0]} <= ${w[1]})`); };
    await T(`pub-srv-${CORTE}`).waitFor();

    // um serviço só: continua o "Com quem?" de sempre
    await T(`pub-srv-${CORTE}`).check({ force: true });
    assert.equal(await T('pub-pps').count(), 0, 'um serviço só: sem campo por serviço');
    assert.ok(await T('pub-barb-qualquer').isVisible(), 'continua "Com quem?"');

    // Corte (só o Kiko) + Barba (só o Bruno): um campo por serviço, vazio e obrigatório
    await T(`pub-srv-${BARBA}`).check({ force: true });
    await T('pub-pps').waitFor();
    assert.equal(await T('pub-barb-qualquer').count(), 0, '"Com quem?" some');
    assert.equal(await T(`pub-pps-${CORTE}`).inputValue(), '');
    assert.equal(await T(`pub-pps-${BARBA}`).inputValue(), '');
    assert.deepEqual((await T(`pub-pps-${CORTE}`).locator('option').allInnerTexts()).filter((x) => x && x !== 'Escolha…'), ['Kiko'], 'só quem faz o corte');
    assert.deepEqual((await T(`pub-pps-${BARBA}`).locator('option').allInnerTexts()).filter((x) => x && x !== 'Escolha…'), ['Bruno'], 'só quem faz a barba');
    assert.ok(await T('pub-continuar-1').isDisabled(), 'sem escolher, não continua');
    if (pasta) await p.screenshot({ path: `${pasta}/b1b-agendar-1-servicos-${vp.nome}.png`, fullPage: true });
    await semLateral('etapa serviços');
    await T(`pub-pps-${CORTE}`).selectOption(KIKO);
    assert.ok(await T('pub-continuar-1').isDisabled(), 'falta o da barba');
    await T(`pub-pps-${BARBA}`).selectOption(BRUNO);
    assert.ok(await T('pub-continuar-1').isEnabled());
    await T('pub-continuar-1').click();

    // horários da sequência (o servidor falso só devolve quando há atribuições)
    await T('pub-grid-dia').waitFor();
    const pedidos = chamadas.length;
    await T('pub-hora-1000').or(T('pub-grid-dia').locator('button').first()).first().click();
    if (pasta) await p.screenshot({ path: `${pasta}/b1b-agendar-2-horario-${vp.nome}.png`, fullPage: true });
    await semLateral('etapa horário');
    await T('pub-continuar-2').click();
    await T('pub-nome').fill('Cliente Teste'); await T('pub-tel').fill('(51) 98888-7777');
    await T('pub-enviar').click();
    await T('pub-feito').waitFor();
    const post = chamadas.find((c) => c.p === '/api/publico/agendamentos');
    assert.deepEqual([...post.dados.atribuicoes].map((x) => [x.servicoId, x.profissionalId]).sort(), [[BARBA, BRUNO], [CORTE, KIKO]].sort(), 'o pedido leva quem faz cada serviço');
    const partes = await T('pub-feito-partes').locator('li').allInnerTexts();
    assert.equal(partes.length, 2, 'a tela final lista as duas partes');
    assert.match(partes[0], /Corte.*Kiko/); assert.match(partes[1], /Barba.*Bruno/);
    if (pasta) await p.screenshot({ path: `${pasta}/b1b-agendar-3-feito-${vp.nome}.png`, fullPage: true });
    await semLateral('tela final');
    assert.ok(pedidos >= 0);
    ok(`${vp.nome}px: #agendar com profissional por serviço (campo por serviço, só quem faz, horários da sequência, pedido com atribuições, partes na confirmação)`);
    await ctx.close();
  }
  assert.deepEqual(erros, [], 'sem erros de página nem diálogos nativos');
} finally {
  await b.close();
  servidor.close();
}
console.log('e2e126 ok');
