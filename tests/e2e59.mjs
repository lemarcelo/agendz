/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estoque no site real (dist/index-real.html) contra um servidor falso: lista com aviso de estoque baixo, novo produto, editar sem mexer no estoque,
// entrada/saída/contagem com a mensagem do servidor, histórico, remover (desativa quando tem histórico), menu só com permissão e 390 px com fonte larga.
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
const P1 = id(77), P2 = id(78);
let produtos = [
  { id: P1, codigo: '1', nome: 'Pomada', unidade: 'un', preco: 45, comissaoPct: 10, estoque: 2, minimo: 3, custo: 22, ativo: true },
  { id: P2, codigo: '2', nome: 'Shampoo', unidade: 'un', preco: 30, estoque: 20, minimo: 2, custo: 12, ativo: true },
];
let movimentos = [];
let proximo = 100;
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, corpo: c, chave: req.headers['idempotency-key'] });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: papel === 'dono' ? ALAN : KIKO, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'] });
    if (u.pathname === '/api/avisos') return json(200, []);
    if (u.pathname.startsWith('/api/agendamentos') || u.pathname === '/api/profissionais') return json(200, []);
    if (u.pathname === '/api/produtos' && req.method === 'GET') return json(200, produtos);
    if (u.pathname === '/api/produtos' && req.method === 'POST') {
      if (!c.nome) return json(400, { mensagem: 'Informe o nome do material.' });
      const novo = { id: id(proximo++), codigo: String(produtos.length + 1), unidade: c.unidade || 'un', ativo: true, minimo: 0, custo: 0, ...c };
      produtos.push(novo); return json(201, novo);
    }
    let m = /^\/api\/produtos\/([^/]+)\/movimentos$/.exec(u.pathname);
    if (m && req.method === 'GET') return json(200, movimentos.filter((x) => x.p === m[1]).map(({ p, ...x }) => x).reverse());
    if (m && req.method === 'POST') {
      const p = produtos.find((x) => x.id === m[1]);
      if (!c.tipo) return json(400, { mensagem: 'Escolha entrada, saída ou contagem.' });
      if (c.tipo !== 'entrada' && (!c.obs || c.obs.length < 3)) return json(400, { mensagem: 'Informe o motivo (pelo menos 3 letras).' });
      const delta = c.tipo === 'entrada' ? c.qtd : c.tipo === 'saida' ? -c.qtd : c.qtd - p.estoque;
      if (p.estoque + delta < 0) return json(400, { mensagem: `Estoque insuficiente: há ${p.estoque} em estoque.` });
      p.estoque += delta;
      const mov = { id: id(proximo++), em: '2026-10-28T13:00:00Z', tipo: c.tipo, delta, saldo: p.estoque, obs: c.obs, autor: 'Alan', p: p.id };
      movimentos.push(mov); return json(201, mov);
    }
    m = /^\/api\/produtos\/([^/]+)$/.exec(u.pathname);
    if (m && req.method === 'PUT') { const p = produtos.find((x) => x.id === m[1]); Object.assign(p, c, { estoque: p.estoque }); return json(200, p); }
    if (m && req.method === 'DELETE') {
      const p = produtos.find((x) => x.id === m[1]);
      if (movimentos.some((x) => x.p === p.id)) { p.ativo = false; return json(200, { desativado: true }); }
      produtos = produtos.filter((x) => x !== p); return json(204);
    }
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


{
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-estoque').click();
  await p.getByTestId('est-lista').waitFor();
  assert.match(await textoDe(p, 'est-baixo'), /Pomada/);
  assert.doesNotMatch(await textoDe(p, 'est-baixo'), /Shampoo/);
  assert.match(await textoDe(p, `est-${P1}`), /estoque baixo/);
  ok('lista com aviso de estoque baixo');
  // novo produto: erro do servidor na tela, depois salva com estoque inicial
  await p.getByTestId('novo-produto').click();
  await p.getByTestId('salvar-produto').click();
  assert.match(await textoDe(p, 'est-erro'), /Informe o nome do material/);
  await p.getByTestId('est-nome').fill('Cera'); await p.getByTestId('est-preco').fill('25,90'); await p.getByTestId('est-inicial').fill('8'); await p.getByTestId('est-minimo').fill('2');
  await p.getByTestId('salvar-produto').click();
  await p.getByTestId('est-salvo').waitFor();
  const criado = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/produtos').at(-1).corpo;
  assert.deepEqual(criado, { nome: 'Cera', unidade: 'un', ativo: true, preco: 25.9, minimo: 2, comissaoPct: 0, estoque: 8 });
  assert.match(await textoDe(p, 'est-lista'), /Cera[\s\S]*em estoque 8 un/);
  ok('novo produto com estoque inicial');
  // editar: o corpo nunca leva estoque
  await p.getByTestId(`est-editar-${P2}`).click();
  await p.getByTestId('est-preco').fill('32'); await p.getByTestId('salvar-produto').click();
  await p.getByTestId('est-salvo').waitFor();
  assert.ok(!('estoque' in chamadas.filter((c) => c.m === 'PUT').at(-1).corpo));
  // entrada, saída sem motivo (erro do servidor), saída acima do saldo, contagem
  await p.getByTestId(`est-mover-${P1}`).click();
  await p.getByTestId('mov-vazio').waitFor();
  await p.getByTestId('mov-qtd').fill('5'); await p.getByTestId('mov-registrar').click();
  await p.getByTestId('mov-ok').waitFor();
  assert.match(await textoDe(p, 'est-saldo'), /7 un/);
  assert.match(await textoDe(p, 'mov-lista'), /Entrada[\s\S]*\+5/);
  await p.getByTestId('mov-tipo').selectOption('saida');
  await p.getByTestId('mov-qtd').fill('1'); await p.getByTestId('mov-registrar').click();
  await p.getByTestId('mov-erro').waitFor();
  assert.match(await textoDe(p, 'mov-erro'), /Informe o motivo/);
  await p.getByTestId('mov-qtd').fill('50'); await p.getByTestId('mov-obs').fill('Perda grande'); await p.getByTestId('mov-registrar').click();
  await p.waitForFunction(() => /Estoque insuficiente: há 7/.test(document.querySelector('[data-testid="mov-erro"]')?.innerText || ''));
  assert.match(await textoDe(p, 'est-saldo'), /7 un/, 'saída recusada não muda o saldo na tela');
  await p.getByTestId('mov-tipo').selectOption('ajuste');
  await p.getByTestId('mov-qtd').fill('6'); await p.getByTestId('mov-obs').fill('Contagem do mês'); await p.getByTestId('mov-registrar').click();
  await p.waitForFunction(() => /6 un/.test(document.querySelector('[data-testid="est-saldo"]').innerText));
  const mov = chamadas.filter((c) => c.u.endsWith('/movimentos') && c.m === 'POST');
  assert.ok(mov.every((c) => /^[A-Za-z0-9_-]{16,64}$/.test(c.chave || '')), 'todo movimento leva chave de repetição');
  assert.equal(new Set(mov.map((c) => c.chave)).size, mov.length, 'pedidos diferentes, chaves diferentes');
  ok('entrada, saída recusada com a mensagem do servidor e contagem');
  await p.getByTestId('mov-voltar').click();
  assert.match(await textoDe(p, `est-${P1}`), /em estoque 6 un/);
  // remover: produto com histórico é desativado; sem histórico, apagado
  await p.getByTestId(`est-remover-${P1}`).click(); await p.getByTestId(`est-remover-sim-${P1}`).click();
  await p.waitForFunction(() => /desativado em vez de apagado/.test(document.querySelector('[data-testid="est-salvo"]')?.innerText || ''));
  await p.waitForFunction((i) => /desativado/.test(document.querySelector(`[data-testid="est-${i}"]`)?.innerText || ''), P1);
  assert.match(await textoDe(p, `est-${P1}`), /desativado/);
  await p.getByTestId(`est-remover-${P2}`).click(); await p.getByTestId(`est-remover-sim-${P2}`).click();
  await p.waitForFunction((i) => !document.querySelector(`[data-testid="est-${i}"]`), P2);
  ok('remover: desativa com histórico, apaga sem');
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await semRolagem(p, 'estoque 1280');
  await ctx.close();
  const n = await abrir({ width: 390, height: 800 });
  await n.p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await n.p.getByTestId('nav-estoque').click();
  await n.p.getByTestId('est-lista').waitFor();
  await semRolagem(n.p, 'estoque 390');
  await n.p.getByTestId(`est-mover-${P1}`).click();
  await n.p.getByTestId('mov-lista').waitFor();
  await semRolagem(n.p, 'movimentos 390');
  await n.p.getByTestId('mov-voltar').click();
  await n.p.getByTestId('novo-produto').click();
  await semRolagem(n.p, 'form produto 390');
  await n.ctx.close();
  ok('390 px com fonte larga: sem rolagem lateral');
}
{
  papel = 'profissional';
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-agenda').waitFor();
  assert.equal(await p.getByTestId('nav-estoque').count(), 0, 'sem a seção estoque não há menu');
  await ctx.close();
  papel = 'dono';
  ok('sem permissão, sem menu');
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e59 ok');
