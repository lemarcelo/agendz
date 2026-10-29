/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Relatórios do proprietário no site real (dist/index-real.html) contra um servidor falso: totais, listas, troca de período (mês e De/Até com erro na tela),
// resposta velha não sobrescreve a nova, menu só para o dono e 390 px com fonte larga sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const chamadas = [];
let papel = 'dono';
const relatorio = (q) => ({
  de: q.get('mes') ? `${q.get('mes')}-01` : q.get('de'), ate: q.get('mes') ? `${q.get('mes')}-28` : q.get('ate'),
  totais: { atendimentos: 3, servicos: 135, descontos: 10, produtos: 40, total: 175, ticketMedio: 58.33 },
  previsto: { atendimentos: 2, total: 90 },
  porProfissional: [{ id: KIKO, nome: 'Kiko', atendimentos: 3, servicos: 135, produtos: 40, total: 175 }],
  porServico: [{ nome: 'Corte', qtd: 2, valor: 90 }, { nome: 'Barba', qtd: 1, valor: 45 }],
  porProduto: [{ nome: 'Pomada', qtd: 2, valor: 40 }],
  porForma: [{ forma: 'pix', atendimentos: 2, total: 120 }, { forma: 'nao_informada', atendimentos: 1, total: 55 }],
  porDia: [{ dia: '2026-10-27', atendimentos: 2, total: 120 }, { dia: '2026-10-28', atendimentos: 1, total: 55 }],
});
const servidor = http.createServer((req, res) => {
  const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
  chamadas.push({ m: req.method, u: u.pathname, q: u.search });
  if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: papel === 'dono' ? ALAN : KIKO, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'] });
  if (u.pathname === '/api/relatorios') { if (papel !== 'dono') return json(403, { mensagem: 'Sem permissão.' }); return json(200, relatorio(u.searchParams)); }
  if (u.pathname === '/api/avisos') return json(200, []);
  if (u.pathname.startsWith('/api/agendamentos') || u.pathname === '/api/profissionais') return json(200, []);
  json(404, {});
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


{
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-relatorios').click();
  await p.getByTestId('rel-total').waitFor();
  assert.match(await textoDe(p, 'rel-total'), /R\$\s?175,00/);
  assert.equal(await textoDe(p, 'rel-atendimentos'), '3');
  assert.match(await textoDe(p, 'rel-descontos'), /R\$\s?10,00/);
  assert.match(await textoDe(p, 'rel-previsto'), /2 atendimentos/);
  assert.match(await textoDe(p, 'rel-por-profissional'), /Kiko/);
  assert.match(await textoDe(p, 'rel-por-servico'), /Corte[\s\S]*Barba/);
  assert.match(await textoDe(p, 'rel-por-produto'), /Pomada/);
  assert.match(await textoDe(p, 'rel-por-forma'), /Pix[\s\S]*Não informada/);
  assert.match(await textoDe(p, 'rel-por-dia'), /27\/10/);
  assert.match(chamadas.filter((c) => c.u === '/api/relatorios').at(-1).q, /^\?mes=2026-10$/);
  ok('proprietário: totais e listas do mês');
  await p.getByTestId('periodo-anterior').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="periodo-rotulo"]')?.innerText.toLowerCase().includes('setembro'));
  await p.getByTestId('rel-total').waitFor();
  assert.match(chamadas.filter((c) => c.u === '/api/relatorios').at(-1).q, /^\?mes=2026-09$/);
  await p.getByTestId('periodo-livre').click();
  await p.getByTestId('periodo-de').fill('2026-10-10'); await p.getByTestId('periodo-ate').fill('2026-10-01');
  await p.getByTestId('periodo-erro').waitFor();
  await p.getByTestId('periodo-ate').fill('2026-10-20');
  await p.waitForTimeout(300);
  assert.match(chamadas.filter((c) => c.u === '/api/relatorios').at(-1).q, /^\?de=2026-10-10&ate=2026-10-20$/);
  ok('período: mês anterior, De/Até com erro na tela');
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await semRolagem(p, 'relatórios 1280');
  await ctx.close();
  const n = await abrir({ width: 390, height: 800 });
  await n.p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await n.p.getByTestId('nav-relatorios').click();
  await n.p.getByTestId('rel-total').waitFor();
  await semRolagem(n.p, 'relatórios 390');
  await n.ctx.close();
  ok('390 px com fonte larga: sem rolagem lateral');
}
{
  papel = 'profissional';
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-agenda').waitFor();
  assert.equal(await p.getByTestId('nav-relatorios').count(), 0, 'só o proprietário vê Relatórios');
  await ctx.close();
  papel = 'dono';
  ok('quem não é proprietário não tem o menu');
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e58 ok');
