/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// 5d-4a: produtos no Atender do site real (dist/index-real.html) contra um servidor falso: venda com serviço, venda só de produto (vendedor), horário futuro
// que exige serviço, quantidade limitada, vendedor fixo para quem é profissional, produto no detalhe do cartão e 390 px com fonte larga sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), SRV_CORTE = id(50), POMADA = id(70), OLEO = id(71), NOVO = id(900);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const banco = [];
const chamadas = [];
let papel = 'dono';
let seq = 0;
const ultimo = () => chamadas.filter((c) => c.m === 'POST' && c.u === '/api/atendimentos').at(-1);
const textoDe = (p, t) => p.getByTestId(t).innerText();
const PRODUTOS = [{ id: POMADA, codigo: '1', nome: 'Pomada', preco: 45, estoque: 8, ativo: true }, { id: OLEO, codigo: '2', nome: 'Óleo de barba', preco: 30, estoque: 2, ativo: true }];

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, corpo: c });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: papel === 'profissional' ? KIKO : ALAN, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/clientes') return json(200, []);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true, podeVender: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true, podeVender: true }]);
    if (u.pathname === '/api/servicos') return json(200, [{ id: SRV_CORTE, codigo: '1', nome: 'Corte', categoria: '', preco: 45, duracaoMin: 45, intervaloMin: 0, ativo: true }]);
    if (u.pathname === '/api/produtos') return json(200, PRODUTOS);
    if (u.pathname === '/api/atendimentos' && req.method === 'POST') {
      const futuro = c.inicio && Date.parse(c.inicio) > AGORA.getTime() + 60000;
      if (futuro && !(c.servicoIds || []).length) return json(400, { mensagem: 'Para agendar um horário futuro, escolha ao menos um serviço. Produto sozinho só no atendimento de agora.' });
      const linhas = (c.produtos || []).map((p) => { const m = PRODUTOS.find((x) => x.id === p.materialId); return { materialId: m.id, nome: m.nome, qtd: p.qtd, preco: m.preco, vendedorId: papel === 'profissional' ? KIKO : (c.vendedorId || ALAN) }; });
      const quando = c.inicio ? Date.parse(c.inicio) : AGORA.getTime();
      const temServico = (c.servicoIds || []).length > 0;
      const a = { id: id(300 + (seq += 1)), clienteId: null, profissionalId: papel === 'profissional' ? KIKO : (c.profissionalId || ALAN), inicio: new Date(quando).toISOString(), fim: new Date(quando + (temServico ? 45 : 1) * 60000).toISOString(), fimOcupado: new Date(quando + (temServico ? 45 : 1) * 60000).toISOString(), status: futuro ? 'a_confirmar' : 'concluido', encaixe: false, total: temServico ? 45 : 0, servicos: temServico ? [{ servicoId: SRV_CORTE, nome: 'Corte', preco: 45, duracaoMin: 45 }] : [], conflitosPendentes: [], origem: futuro ? 'painel' : 'atendimento', reagendado: false, statusManual: false, historico: [], produtos: linhas, totalProdutos: linhas.reduce((t, l) => t + l.preco * l.qtd, 0) };
      banco.push(a);
      return json(201, a);
    }
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) >= de));
    }
    const m = /^\/api\/agendamentos\/([^/]+)$/.exec(u.pathname);
    if (m) { const a = banco.find((x) => x.id === m[1]); return a ? json(200, a) : json(404, { mensagem: 'Agendamento não encontrado.' }); }
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
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  return { ctx, p };
}

// 1. serviço + produto: a quantidade e o vendedor vão no corpo; preço e comissão nunca; o cartão mostra a venda no detalhe
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-produtos-bloco').waitFor();
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  await p.getByTestId(`atender-prod-${POMADA}`).check();
  await p.getByTestId(`atender-qtd-${POMADA}`).fill('2');
  assert.match(await textoDe(p, 'atender-total-produtos'), /2 unidades · R\$\s?90,00 em produtos/);
  assert.equal(await p.getByTestId('atender-vendedor').inputValue(), ALAN, 'vendedor padrão = quem lança');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  const c = ultimo().corpo;
  assert.deepEqual(c.produtos, [{ materialId: POMADA, qtd: 2 }]); assert.equal(c.vendedorId, ALAN);
  assert.ok(!JSON.stringify(c).includes('preco') && !JSON.stringify(c).includes('comissao'));
  const cartao = p.locator('[data-testid="cartao"][data-status="concluido"]').first();
  assert.match(await cartao.innerText(), /R\$\s?135,00/, 'serviço + produtos no cartão');
  await cartao.getByTestId('cartao-abrir').click();
  assert.match(await textoDe(p, 'detalhe-produto'), /2× Pomada · R\$\s?90,00/);
  ok('serviço + produto: corpo sem preço nem comissão; total e detalhe do cartão mostram a venda');
  await ctx.close();
}

// 2. só produto: vale no atendimento de agora; escolher outro vendedor vai no corpo; a venda aparece como "Venda de produtos"
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId(`atender-prod-${OLEO}`).check();
  assert.match(await textoDe(p, 'atender-total'), /Só produtos/);
  await p.getByTestId('atender-vendedor').selectOption(KIKO);
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  const c = ultimo().corpo;
  assert.deepEqual(c.servicoIds, []); assert.deepEqual(c.produtos, [{ materialId: OLEO, qtd: 1 }]); assert.equal(c.vendedorId, KIKO);
  assert.match(await p.locator('[data-testid="cartao"]').filter({ hasText: 'Venda de produtos' }).first().innerText(), /R\$\s?30,00/);
  ok('só produto: vendedor escolhido vai no corpo e o cartão mostra "Venda de produtos"');
  await ctx.close();
}

// 3. horário futuro sem serviço: a tela avisa antes de enviar (nada vai ao servidor); quantidade fica de 1 a 999
{
  const { ctx, p } = await abrir();
  const antes = chamadas.filter((c) => c.u === '/api/atendimentos').length;
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-11-03T10:00');
  await p.getByTestId('atender-nome').fill('Ana Lima'); await p.getByTestId('atender-telefone').fill('11977776666');
  await p.getByTestId(`atender-prod-${POMADA}`).check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('atender-erro').waitFor();
  assert.match(await textoDe(p, 'atender-erro'), /Produto sozinho só no atendimento de agora/);
  assert.equal(chamadas.filter((c) => c.u === '/api/atendimentos').length, antes, 'a tela barra antes de enviar');
  await p.getByTestId(`atender-qtd-${POMADA}`).fill('5000');
  assert.equal(await p.getByTestId(`atender-qtd-${POMADA}`).inputValue(), '999');
  await p.getByTestId(`atender-qtd-${POMADA}`).fill('0');
  assert.equal(await p.getByTestId(`atender-qtd-${POMADA}`).inputValue(), '1');
  ok('futuro sem serviço é barrado na tela; quantidade presa entre 1 e 999');
  await ctx.close();
}

// 4. profissional vende sempre como ele mesmo (o seletor de vendedor fica travado)
{
  papel = 'profissional';
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId(`atender-prod-${POMADA}`).check();
  assert.equal(await p.getByTestId('atender-vendedor').isDisabled(), true);
  assert.equal(await p.getByTestId('atender-vendedor').inputValue(), KIKO);
  await ctx.close();
  papel = 'dono';
  ok('profissional: vendedor travado nele mesmo');
}

// 5. 390 px com fonte larga: formulário com produtos sem rolagem lateral
{
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId(`atender-prod-${POMADA}`).check();
  await p.getByTestId(`atender-qtd-${POMADA}`).fill('3');
  const larg = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  assert.ok(larg.doc <= larg.janela, `rolagem lateral: ${larg.doc} > ${larg.janela}`);
  ok('390 px com fonte larga: sem rolagem lateral');
  await ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e51 ok');
