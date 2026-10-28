/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// 5d-4b: Comissões (proprietário) e Meus ganhos no site real (dist/index-real.html) contra um servidor falso: totais, pagamento com confirmação na tela e
// chave de repetição, cancelar com motivo, restaurar, período De/Até com erro na tela, "Meus ganhos" sem valor cheio e 390 px com fonte larga.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), AG1 = id(301), AG2 = id(302);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const chamadas = [];
let papel = 'dono';
const linhas = [
  { agendamentoId: AG1, inicio: '2026-10-27T13:00:00Z', servicos: ['Corte'], base: 45, comissao: 22.5, casa: 22.5, paga: false, cancelada: false },
  { agendamentoId: AG2, inicio: '2026-10-28T13:00:00Z', servicos: ['Barba', '1× Pomada'], base: 75, comissao: 37.5, casa: 37.5, paga: false, cancelada: false },
];
const soma = (f) => Math.round(linhas.filter(f).reduce((t, l) => t + l.comissao, 0) * 100) / 100;
const relatorio = () => ({
  de: '2026-10-01', ate: '2026-10-31',
  profissionais: [{ id: KIKO, nome: 'Kiko', semComissao: false, atendimentos: 2, base: 120, comissao: soma(() => true), casa: Math.round(linhas.reduce((t, l) => t + l.casa, 0) * 100) / 100, pago: soma((l) => l.paga), aPagar: soma((l) => !l.paga && !l.cancelada), linhas }],
  totais: { comissao: soma(() => true), aPagar: soma((l) => !l.paga && !l.cancelada), pago: soma((l) => l.paga), casa: 0 },
});
let pagamentos = 0;
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: c, chave: req.headers['idempotency-key'] });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: papel === 'dono' ? ALAN : KIKO, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'] });
    if (u.pathname === '/api/comissoes' && req.method === 'GET') {
      if (papel !== 'dono') return json(403, { mensagem: 'Sem permissão' });
      if (u.searchParams.get('de') && u.searchParams.get('ate') && u.searchParams.get('ate') < u.searchParams.get('de')) return json(400, { mensagem: 'A data final não pode ser antes da inicial.' });
      return json(200, relatorio());
    }
    if (u.pathname === '/api/comissoes/meu') {
      if (papel === 'dono') return json(403, { mensagem: 'Sem permissão' });
      const minhas = linhas.map((l) => ({ agendamentoId: l.agendamentoId, inicio: l.inicio, local: true, servicos: l.servicos, receber: l.cancelada ? 0 : l.comissao, paga: l.paga, cancelada: l.cancelada, motivoCancelada: l.motivo }));
      return json(200, { linhas: minhas, totais: { atendimentos: 2, receber: soma((l) => !l.cancelada), jaPago: soma((l) => l.paga), aReceber: soma((l) => !l.paga && !l.cancelada) }, previsto: { atendimentos: 1, receber: 20 } });
    }
    if (u.pathname === '/api/comissoes/pagamentos') {
      pagamentos += 1;
      const valor = soma((l) => !l.paga && !l.cancelada);
      linhas.forEach((l) => { if (!l.cancelada) l.paga = true; });
      return json(201, { valor, atendimentos: 2 });
    }
    let m = /^\/api\/agendamentos\/([^/]+)\/comissao\/cancelar$/.exec(u.pathname);
    if (m) { if (!c.motivo || c.motivo.length < 5) return json(400, { mensagem: 'Informe o motivo do cancelamento da comissão (pelo menos 5 letras).' }); const l = linhas.find((x) => x.agendamentoId === m[1]); l.cancelada = true; l.motivo = c.motivo; l.comissaoOriginal = l.comissao; return json(204); }
    m = /^\/api\/agendamentos\/([^/]+)\/comissao\/restaurar$/.exec(u.pathname);
    if (m) { const l = linhas.find((x) => x.agendamentoId === m[1]); l.cancelada = false; delete l.motivo; return json(204); }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 860 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(AGORA);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  return { ctx, p };
}
const textoDe = (p, t) => p.getByTestId(t).innerText();
const semRolagem = async (p, onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };

// 1. proprietário: totais, detalhes, cancelar com motivo, restaurar e pagar com confirmação na tela
{
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-comissoes').click();
  await p.getByTestId('com-total').waitFor();
  assert.equal(await p.getByTestId('nav-ganhos').count(), 0, 'proprietário não tem "Meus ganhos"');
  assert.match(await textoDe(p, 'com-total'), /R\$\s?60,00/); assert.match(await textoDe(p, 'com-apagar'), /R\$\s?60,00/);
  assert.match(chamadas.filter((c) => c.u === '/api/comissoes').at(-1).q, /^\?mes=2026-10$/);
  await p.getByTestId(`com-detalhe-${KIKO}`).click();
  await p.getByTestId(`com-cancelar-${AG1}`).click();
  await p.getByTestId('com-cancelar-sim').click();
  await p.getByTestId('comissoes-erro').waitFor();
  assert.match(await textoDe(p, 'comissoes-erro'), /Informe o motivo do cancelamento da comissão/);
  assert.equal(chamadas.filter((c) => c.u.endsWith('/comissao/cancelar')).length, 1, 'cancelar sem motivo vai ao servidor (ele recusa); a tela mostra a mensagem dele e mantém o formulário');
  await p.getByTestId('com-motivo').fill('Cortesia da casa');
  await p.getByTestId('com-cancelar-sim').click();
  await p.getByTestId('comissoes-aviso').waitFor();
  assert.match(await textoDe(p, 'comissoes-aviso'), /Comissão cancelada/);
  assert.deepEqual(chamadas.filter((c) => c.u.endsWith('/comissao/cancelar')).at(-1).corpo, { quem: KIKO, motivo: 'Cortesia da casa' });
  await p.waitForFunction(() => /R\$\s?37,50/.test(document.querySelector('[data-testid="com-apagar"]').innerText));
  await p.getByTestId(`com-detalhe-${KIKO}`).click().catch(() => {});
  if (!(await p.getByTestId(`com-restaurar-${AG1}`).count())) await p.getByTestId(`com-detalhe-${KIKO}`).click();
  await p.getByTestId(`com-restaurar-${AG1}`).click();
  await p.waitForFunction(() => /R\$\s?60,00/.test(document.querySelector('[data-testid="com-apagar"]').innerText));
  await p.getByTestId(`com-pagar-${KIKO}`).click();
  assert.equal(pagamentos, 0, 'só pede confirmação: nada foi pago ainda');
  await p.getByTestId(`com-voltar-${KIKO}`).click();
  await p.getByTestId(`com-pagar-${KIKO}`).click();
  await p.getByTestId(`com-confirmar-${KIKO}`).click();
  await p.getByTestId('comissoes-aviso').waitFor();
  assert.match(await textoDe(p, 'comissoes-aviso'), /Comissão de R\$\s?60,00 paga a Kiko/);
  assert.equal(pagamentos, 1);
  const pg = chamadas.find((c) => c.u === '/api/comissoes/pagamentos');
  assert.deepEqual(pg.corpo, { profissionalId: KIKO, mes: '2026-10' }); assert.match(pg.chave, /^[A-Za-z0-9_-]{16,64}$/, 'o pagamento leva chave de repetição');
  await p.waitForFunction(() => /R\$\s?0,00/.test(document.querySelector('[data-testid="com-apagar"]').innerText));
  assert.match(await textoDe(p, 'com-pago'), /R\$\s?60,00/);
  ok('proprietário: cancelar com motivo, restaurar e pagar só depois da confirmação, com chave');
  await ctx.close();
}

// 2. período De/Até: a tela barra antes de enviar e mostra a mensagem
{
  linhas.forEach((l) => { l.paga = false; });
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-comissoes').click();
  await p.getByTestId('com-total').waitFor();
  await p.getByTestId('periodo-livre').click();
  const antes = chamadas.filter((c) => c.u === '/api/comissoes').length;
  await p.getByTestId('periodo-de').fill('2026-10-10'); await p.getByTestId('periodo-ate').fill('2026-10-01');
  await p.getByTestId('periodo-erro').waitFor();
  assert.match(await textoDe(p, 'periodo-erro'), /não pode ser antes da inicial/);
  assert.equal(chamadas.filter((c) => c.u === '/api/comissoes').length, antes, 'período inválido nem sai do cliente');
  await p.getByTestId('periodo-ate').fill('2026-10-31');
  await p.waitForFunction(() => document.querySelector('[data-testid="com-total"]'));
  assert.match(chamadas.filter((c) => c.u === '/api/comissoes').at(-1).q, /de=2026-10-10&ate=2026-10-31/);
  await p.getByTestId('periodo-mes').click();
  await p.getByTestId('periodo-anterior').click();
  assert.match(await textoDe(p, 'periodo-rotulo'), /setembro/i);
  ok('período: De/Até inválido é barrado na tela; mês anterior navega');
  await ctx.close();
}

// 3. Meus ganhos (profissional): só o que ele recebe; nada de valor cheio nem parte da casa
{
  papel = 'profissional';
  const { ctx, p } = await abrir();
  assert.equal(await p.getByTestId('nav-comissoes').count(), 0);
  await p.getByTestId('nav-ganhos').click();
  await p.getByTestId('meu-receber').waitFor();
  assert.match(await textoDe(p, 'meu-receber'), /R\$\s?60,00/); assert.match(await textoDe(p, 'meu-falta'), /R\$\s?60,00/);
  assert.match(await textoDe(p, 'meu-previsto'), /1 agendamento, somando R\$\s?20,00/);
  const tela = await textoDe(p, 'ganhos');
  assert.ok(!/estabelecimento/i.test(tela) && !/%/.test(tela), 'sem parte da casa nem percentual');
  assert.equal(await p.getByTestId(`meu-linha-${AG2}`).count(), 1);
  await semRolagem(p, 'ganhos 1280');
  ok('Meus ganhos: só o que ele recebe, sem parte da casa nem percentual');
  await ctx.close();
  papel = 'dono';
}

// 4. 390 px com fonte larga: as duas telas sem rolagem lateral
{
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await p.getByTestId('nav-comissoes').click();
  await p.getByTestId('com-total').waitFor();
  await p.getByTestId(`com-detalhe-${KIKO}`).click();
  await semRolagem(p, 'comissões 390');
  await ctx.close();
  papel = 'profissional';
  const n = await abrir({ width: 390, height: 800 });
  await n.p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await n.p.getByTestId('nav-ganhos').click();
  await n.p.getByTestId('meu-receber').waitFor();
  await semRolagem(n.p, 'ganhos 390');
  await n.ctx.close();
  papel = 'dono';
  ok('390 px com fonte larga: sem rolagem lateral');
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e52 ok');
