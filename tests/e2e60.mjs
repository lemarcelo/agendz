/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda e avisos do site real se atualizam sozinhos: o que o cliente remarcou ou cancelou pelo link aparece sem recarregar (ao voltar para a aba e a
// cada 20 s), cartão aberto continua aberto e o cartão mostra a data (dia da semana + dia/mês) em negrito e a hora grande.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const U = (s) => new Date(`${s}-03:00`).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), BRUNO = id(11), CAIO = id(12);
const banco = [];
const ag = (n, inicio, min, prof, cli, status, nome, extra = {}) => banco.push({ id: id(100 + n), clienteId: cli, profissionalId: prof, inicio: U(inicio), fim: new Date(new Date(U(inicio)).getTime() + min * 60000).toISOString(), fimOcupado: new Date(new Date(U(inicio)).getTime() + (min + 10) * 60000).toISOString(), status, encaixe: false, total: 45, servicos: [{ servicoId: id(50), nome, preco: 45, duracaoMin: min }], conflitosPendentes: [], origem: 'painel', reagendado: false, statusManual: false, historico: [], ...extra });
ag(1, '2026-10-28T09:00:00', 45, ALAN, BRUNO, 'confirmado', 'Corte');
ag(2, '2026-10-28T11:00:00', 30, KIKO, CAIO, 'a_confirmar', 'Barba');
ag(3, '2026-10-28T15:00:00', 30, ALAN, BRUNO, 'cancelado', 'Corte', { motivoCancelamento: 'cliente' });
ag(4, '2026-10-29T10:00:00', 45, ALAN, CAIO, 'confirmado', 'Corte');
ag(5, '2026-10-31T14:00:00', 30, KIKO, BRUNO, 'a_confirmar', 'Barba', { origem: 'link' });
ag(6, '2026-11-03T09:00:00', 45, ALAN, CAIO, 'confirmado', 'Corte');
const chamadas = [];
let avisosServidor = [];
let papel = 'dono';
let semServidor = false;
let ocupadoEm = null; // remarcar para este horário responde 409
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: corpo ? JSON.parse(corpo) : null });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: ALAN, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/clientes') return json(200, [{ id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '11999990001' }, { id: CAIO, nome: 'Caio Souza', apelido: '', telefone: '11999990002' }]);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]);
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      if (semServidor) return json(503, { mensagem: 'fora do ar' });
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) > de && (papel !== 'profissional' || a.profissionalId === ALAN)));
    }
    const m = /^\/api\/agendamentos\/([^/]+)(\/status|\/remarcar)?$/.exec(u.pathname);
    if (m) {
      const a = banco.find((x) => x.id === m[1]);
      if (!a) return json(404, { mensagem: 'Agendamento não encontrado.' });
      if (!m[2]) return json(200, { ...a, historico: [{ em: new Date().toISOString(), autor: 'Alan', campo: 'criação', para: 'Corte' }] });
      const c = JSON.parse(corpo);
      if (m[2] === '/status') { a.status = c.status; return json(200, a); }
      if (c.inicio === ocupadoEm) return json(409, { mensagem: 'Esse horário já está ocupado por um agendamento confirmado.' });
      a.inicio = c.inicio; a.fim = new Date(Date.parse(c.inicio) + 45 * 60000).toISOString(); a.fimOcupado = new Date(Date.parse(c.inicio) + 55 * 60000).toISOString(); a.reagendado = true;
      return json(200, a);
    }
    if (u.pathname === '/api/avisos') return json(200, avisosServidor);
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 860 }, relogio = false) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  if (relogio) await ctx.clock.install({ time: new Date('2026-10-28T10:00:00-03:00') }); else await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  return { ctx, p };
}
const ultimo = (m, rota) => chamadas.filter((c) => c.m === m && c.u.endsWith(rota)).at(-1);
const textoDe = (p, t) => p.getByTestId(t).innerText();

const sinal = (p) => p.evaluate(() => window.dispatchEvent(new Event('focus'))); // o mesmo que voltar para a aba
const A1 = id(101), A4 = id(104);
{
  const { ctx, p } = await abrir();
  // cartão: data em negrito (dia da semana + dia/mês) e hora grande
  const c1 = p.locator(`[data-testid="cartao"][data-id="${A1}"]`);
  assert.equal(await c1.getByTestId('cartao-data').innerText(), 'qua 28/10');
  const est = await c1.evaluate((el) => ({ peso: Number(getComputedStyle(el.querySelector('.cartao-data')).fontWeight), hora: parseFloat(getComputedStyle(el.querySelector('.cartao-hora')).fontSize), horaPeso: Number(getComputedStyle(el.querySelector('.cartao-hora')).fontWeight), dataTam: parseFloat(getComputedStyle(el.querySelector('.cartao-data')).fontSize) }));
  assert.ok(est.peso >= 700 && est.horaPeso >= 700, 'data e hora em negrito');
  assert.ok(est.hora >= 24 && est.hora > est.dataTam, `do dia: hora um pouco maior (${est.hora}px > ${est.dataTam}px)`);
  const prox = p.locator('[data-testid="cartao-proximo"]').first();
  assert.equal(await prox.getByTestId('cartao-data').innerText(), 'qui 29/10');
  const tam = await prox.evaluate((el) => ({ data: parseFloat(getComputedStyle(el.querySelector('.cartao-data')).fontSize), hora: parseFloat(getComputedStyle(el.querySelector('.cartao-hora')).fontSize) }));
  assert.ok(tam.data >= 24 && tam.data > tam.hora, `dos próximos dias: data maior (${tam.data}px > ${tam.hora}px)`);
  // data e hora ficam à direita do cartão (depois do nome e do status)
  for (const el of [c1, prox]) {
    const r = await el.evaluate((c) => { const q = c.querySelector('.cartao-quando').getBoundingClientRect(), n = c.querySelector('.cartao-nome').getBoundingClientRect(), box = c.getBoundingClientRect(); return { qEsq: q.left, nDir: n.right, qDir: q.right, boxDir: box.right }; });
    assert.ok(r.qEsq >= r.nDir - 1, 'data e hora depois do nome');
    assert.ok(r.boxDir - r.qDir < 40, `data e hora encostadas na direita (${Math.round(r.boxDir - r.qDir)}px)`);
  }
  ok('cartão: data e hora à direita; hora maior no dia, data maior nos próximos dias');
  // abre o cartão do dia e o cliente cancela a quinta-feira e remarca o horário de hoje pelo link
  await c1.getByTestId('cartao-abrir').click();
  const antes = chamadas.filter((c) => c.u === '/api/agendamentos' && c.m === 'GET').length;
  banco.find((a) => a.id === A4).status = 'cancelado';
  const a1 = banco.find((a) => a.id === A1);
  a1.inicio = U('2026-10-28T13:00:00'); a1.fim = U('2026-10-28T13:45:00'); a1.fimOcupado = U('2026-10-28T13:55:00'); a1.reagendado = true;
  await sinal(p);
  await p.waitForFunction((i) => !document.querySelector(`[data-testid="cartao-proximo"][data-id="${i}"]`), A4);
  await p.waitForFunction((i) => /13:00/.test(document.querySelector(`[data-testid="cartao"][data-id="${i}"]`)?.innerText || ''), A1);
  assert.match(await c1.innerText(), /Reagendado/);
  assert.equal(await c1.getByTestId('cartao-abrir').getAttribute('aria-expanded'), 'true', 'o cartão aberto continua aberto');
  assert.ok(chamadas.filter((c) => c.u === '/api/agendamentos' && c.m === 'GET').length > antes);
  assert.equal(await p.getByTestId('agenda-erro').count(), 0);
  ok('cliente remarcou e cancelou: a agenda mudou sozinha, sem recarregar');
  // servidor caiu: a lista continua na tela, sem erro
  const lista = [...banco]; banco.length = 0; banco.push({ quebrar: true });
  semServidor = true; await sinal(p); await p.waitForTimeout(400);
  semServidor = false;
  assert.equal(await p.getByTestId('agenda-erro').count(), 0, 'falha de uma consulta automática não derruba a tela');
  assert.ok(await p.locator('[data-testid="cartao"]').count() >= 1);
  banco.length = 0; banco.push(...lista);
  // aviso novo aparece em Início sem recarregar
  await p.getByTestId('nav-avisos').click();
  await p.getByTestId('avisos-vazio').waitFor();
  avisosServidor = [{ id: id(900), tipo: 'cancelou', texto: 'Bruno cancelou o horário de quinta.', em: '2026-10-28T12:00:00Z', lido: false }];
  await sinal(p);
  await p.getByTestId(`aviso-${id(900)}`).waitFor();
  assert.match(await textoDe(p, 'avisos-novos'), /1 novo/);
  ok('aviso novo apareceu sem recarregar');
  await ctx.close();
  avisosServidor = [];
}
{
  // a cada 20 s, sem nenhum gesto
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, true);
  banco.find((a) => a.id === A1).status = 'cancelado';
  await p.waitForFunction((i) => document.querySelector(`[data-testid="cartao"][data-id="${i}"]`)?.getAttribute('data-status') === 'confirmado', A1);
  await p.clock.runFor(21000);
  // cancelado sai da lista do dia e vai para a linha "Cancelados (N)"
  await p.waitForFunction((i) => !document.querySelector(`[data-testid="cartao"][data-id="${i}"]`) && /^Cancelados? \(\d+\)$/.test(document.querySelector('[data-testid="cancelados-resumo"]')?.textContent.trim() || ''), A1);
  ok('a cada 20 s a agenda se atualiza sozinha');
  await ctx.close();
}
{
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  assert.ok(l.doc <= l.janela, `rolagem lateral ${l.doc} > ${l.janela}`);
  await ctx.close();
  ok('390 px com fonte larga: sem rolagem lateral');
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e60 ok');
