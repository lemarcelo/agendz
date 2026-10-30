/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// 5d-4c-2: cupons no site real (dist/index-real.html) contra um servidor falso: tela Cupons do proprietário (criar sem enviar chave, ver chave, nova chave e remover
// com confirmação na tela, mensagem do servidor), aplicar e retirar na ficha do horário (chave errada = mensagem genérica; desconto e valor a pagar), campo de cupom
// só no agendamento futuro do Atender (chave errada não cria nada); 390 px com fonte larga sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), SRV_CORTE = id(50), AG1 = id(301);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const GENERICO = 'Cupom inválido ou indisponível.';
let cupons = [];
let chaveSeq = 0;
const chavesBoas = ['ABCD-EFGH-JKLM', 'WXYZ-2345-6789', 'QRST-UVWX-YZ23'];
const chamadas = [];
let seq = 0;
const ag = { id: AG1, clienteId: null, profissionalId: ALAN, inicio: '2026-10-28T17:00:00.000Z', fim: '2026-10-28T17:45:00.000Z', fimOcupado: '2026-10-28T17:45:00.000Z', status: 'a_confirmar', encaixe: false, total: 45,
  servicos: [{ servicoId: SRV_CORTE, nome: 'Corte', preco: 45, duracaoMin: 45, desconto: 0 }], conflitosPendentes: [], origem: 'painel', reagendado: false, statusManual: false, nomeAvulso: 'Marcos', produtos: [], totalProdutos: 0, desconto: 0 };
const banco = [ag];
const norm = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/^(.{4})(.{4})(.{4})$/, '$1-$2-$3');
const cupomPeloNome = (n) => cupons.find((c) => c.nome === n);
const lista = (c) => ({ ...c, situacao: c.ativo === false ? 'inativo' : 'vigente' });
const chamadasDe = (m, u) => chamadas.filter((c) => c.m === m && c.u === u);

function aplicar(a, chave) {
  const c = cupons.find((x) => x.ativo !== false && x.chave === norm(chave));
  if (!c) return null;
  const d = Math.round(a.servicos[0].preco * c.percentual) / 100;
  a.servicos[0].desconto = d; a.desconto = d; a.cupom = { cupomId: c.id, nome: c.nome, tipo: c.tipo, chave: c.chave }; c.usos += 1;
  return c;
}

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
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/clientes') return json(200, []);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true, podeVender: true }]);
    if (u.pathname === '/api/servicos') return json(200, [{ id: SRV_CORTE, codigo: '1', nome: 'Corte', categoria: '', preco: 45, duracaoMin: 45, intervaloMin: 0, ativo: true }]);
    if (u.pathname === '/api/produtos') return json(200, []);
    if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: ['nome', 'telefone'], local: [] });
    // ---- cupons do estabelecimento
    if (u.pathname === '/api/cupons' && req.method === 'GET') return json(200, cupons.map(lista));
    if (u.pathname === '/api/cupons' && req.method === 'POST') {
      if ('chave' in c) return json(400, { mensagem: 'Campo desconhecido: chave.' });
      if (!String(c.nome || '').trim()) return json(400, { mensagem: 'Dê um nome ao cupom.' });
      const novo = { id: id(700 + (seq += 1)), nome: c.nome, tipo: c.tipo, servicoIds: c.servicoIds, percentual: c.percentual ?? null, valor: c.valor ?? null, inicio: c.inicio, fim: c.fim, usosMax: c.usosMax, usosPorCliente: c.usosPorCliente, chave: chavesBoas[chaveSeq++ % 3], ativo: true, usos: 0 };
      cupons.push(novo);
      return json(201, lista(novo));
    }
    const m = u.pathname.match(/^\/api\/cupons\/([^/]+)(\/chave)?$/);
    if (m) {
      const alvo = cupons.find((x) => x.id === m[1]);
      if (!alvo) return json(404, { mensagem: 'Cupom não encontrado.' });
      if (m[2] && req.method === 'POST') { alvo.chave = chavesBoas[chaveSeq++ % 3]; return json(200, lista(alvo)); }
      if (req.method === 'DELETE') { if (alvo.usos > 0) { alvo.ativo = false; return json(200, { desativado: true }); } cupons = cupons.filter((x) => x !== alvo); return json(200, { desativado: false }); }
    }
    // ---- agenda
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) >= de));
    }
    const g = u.pathname.match(/^\/api\/agendamentos\/([^/]+)(\/cupom)?$/);
    if (g) {
      const a = banco.find((x) => x.id === g[1]);
      if (!a) return json(404, { mensagem: 'Agendamento não encontrado.' });
      if (!g[2] && req.method === 'GET') return json(200, { ...a, historico: [] });
      if (g[2] && req.method === 'POST') {
        if (a.cupom) return json(400, { mensagem: 'Esse horário já tem um cupom. Retire o atual para usar outro.' });
        if (!aplicar(a, c.chave)) return json(400, { mensagem: GENERICO });
        return json(200, a);
      }
      if (g[2] && req.method === 'DELETE') {
        if (!a.cupom) return json(400, { mensagem: 'Esse horário não tem cupom.' });
        const dono = cupons.find((x) => x.id === a.cupom.cupomId); if (dono) dono.usos -= 1;
        a.servicos[0].desconto = 0; a.desconto = 0; delete a.cupom;
        return json(200, a);
      }
    }
    if (u.pathname === '/api/atendimentos' && req.method === 'POST') {
      const quando = Date.parse(c.inicio);
      const novo = { ...ag, id: id(900 + (seq += 1)), inicio: new Date(quando).toISOString(), fim: new Date(quando + 2700000).toISOString(), fimOcupado: new Date(quando + 2700000).toISOString(), nomeAvulso: c.nome,
        servicos: [{ servicoId: SRV_CORTE, nome: 'Corte', preco: 45, duracaoMin: 45, desconto: 0 }], desconto: 0, cupom: undefined };
      if (c.cupomChave && !aplicar(novo, c.cupomChave)) return json(400, { mensagem: GENERICO });
      banco.push(novo);
      return json(201, novo);
    }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function entrar(viewport = { width: 1280, height: 860 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(AGORA);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-estabelecimento').click(); await p.getByTestId('tela-estabelecimento').waitFor();
  return { ctx, p };
}
const abrirCartao = async (p) => { await p.getByTestId('nav-agenda').click(); await p.getByTestId('cartao').first().waitFor(); await p.getByTestId('cartao-abrir').first().click(); await p.getByTestId('agendamento-detalhe').waitFor(); };

// 1. tela Cupons: vazia, cria (sem enviar chave), vê a chave, nova chave com confirmação, remove com confirmação; erro do servidor aparece
{
  const { ctx, p } = await entrar();
  await p.getByTestId('nav-cupons').click();
  await p.getByTestId('cupom-vazio').waitFor();
  await p.getByTestId('novo-cupom').click();
  await p.getByTestId('cupom-form').waitFor();
  await p.getByTestId('cupom-tipo').selectOption('percentual');
  await p.getByTestId('cupom-percentual').fill('10');
  await p.getByTestId('salvar-cupom').click();
  await p.getByTestId('cupom-erro').waitFor();
  assert.match(await p.getByTestId('cupom-erro').innerText(), /Dê um nome ao cupom\./);
  await p.getByTestId('cupom-nome').fill('Vale corte');
  await p.getByTestId('salvar-cupom').click();
  await p.getByTestId('cupom-aviso').waitFor();
  const post = chamadasDe('POST', '/api/cupons').at(-1).corpo;
  assert.ok(!('chave' in post), 'a chave nasce no servidor: nunca vai no corpo');
  assert.deepEqual([post.nome, post.tipo, post.percentual, post.usosMax, post.usosPorCliente], ['Vale corte', 'percentual', 10, 50, 1]);
  assert.ok(!('valor' in post), 'percentual não leva valor');
  const cartao = p.getByTestId(`cupom-${cupons[0].id}`);
  assert.match(await cartao.innerText(), /Vale corte/);
  assert.match(await cartao.innerText(), /Valendo/);
  assert.match(await p.getByTestId(`cupom-chave-${cupons[0].id}`).innerText(), /ABCD-EFGH-JKLM/, 'recém-criado: a chave aparece no cartão');
  await p.getByTestId(`cupom-ver-${cupons[0].id}`).click();
  assert.match(await p.getByTestId(`cupom-chave-${cupons[0].id}`).innerText(), /ABCD-••••-••••/);
  await p.getByTestId(`cupom-ver-${cupons[0].id}`).click();
  ok('Cupons: erro do servidor na tela, corpo sem chave, chave visível e oculta');
  await p.getByTestId(`cupom-nova-chave-${cupons[0].id}`).click();
  await p.getByTestId(`cupom-confirmar-${cupons[0].id}`).waitFor();
  assert.equal(chamadasDe('POST', `/api/cupons/${cupons[0].id}/chave`).length, 0, 'só confirma na tela depois do clique em Gerar');
  await p.getByTestId(`cupom-confirmar-sim-${cupons[0].id}`).click();
  await p.waitForFunction((t) => /WXYZ-2345-6789/.test(document.querySelector(`[data-testid="${t}"]`)?.innerText || ''), `cupom-chave-${cupons[0].id}`);
  ok('nova chave: confirmação na tela; a antiga some');
  await p.getByTestId(`cupom-remover-${cupons[0].id}`).click();
  await p.getByTestId(`cupom-confirmar-sim-${cupons[0].id}`).click();
  await p.getByTestId('cupom-vazio').waitFor();
  assert.equal(cupons.length, 0);
  ok('remover: confirmação na tela e o cupom some da lista');
  await ctx.close();
}

// 2. ficha do horário: chave errada = mensagem genérica; certa = desconto e valor a pagar; retirar desfaz
{
  cupons = []; chaveSeq = 0;
  cupons.push({ id: id(777), nome: 'Vale corte', tipo: 'percentual', servicoIds: [], percentual: 10, valor: null, inicio: '2026-10-01', fim: '2026-12-31', usosMax: 5, usosPorCliente: 1, chave: 'ABCD-EFGH-JKLM', ativo: true, usos: 0 });
  const { ctx, p } = await entrar();
  await abrirCartao(p);
  assert.equal(await p.getByTestId('detalhe-cupom').count(), 0);
  await p.getByTestId('acao-cupom').click();
  await p.getByTestId('cupom-chave-agenda').fill('AAAA-BBBB-CCCC');
  await p.getByTestId('cupom-aplicar').click();
  await p.getByTestId('agendamento-erro').waitFor();
  assert.equal((await p.getByTestId('agendamento-erro').innerText()).trim(), GENERICO);
  assert.equal(ag.desconto, 0, 'nada mudou');
  await p.getByTestId('cupom-chave-agenda').fill('abcd efgh jklm');
  await p.getByTestId('cupom-aplicar').click();
  await p.getByTestId('detalhe-cupom').waitFor();
  assert.deepEqual(chamadasDe('POST', `/api/agendamentos/${AG1}/cupom`).at(-1).corpo, { chave: 'abcd efgh jklm' }, 'o servidor normaliza a chave; a tela só apara');
  const t = await p.getByTestId('detalhe-cupom').innerText();
  assert.match(t, /Vale corte/); assert.match(t, /4,50/); assert.match(t, /40,50/);
  assert.match(await p.getByTestId('cartao').first().innerText(), /40,50/, 'o cartão mostra o valor com desconto');
  assert.ok(!(await p.getByTestId('agendamento-detalhe').innerText()).includes('ABCD-EFGH-JKLM'), 'a chave nunca aparece na agenda');
  ok('ficha: chave errada devolve a mensagem genérica; certa mostra desconto e valor a pagar');
  await p.getByTestId('acao-retirar-cupom').click();
  await p.waitForFunction(() => !document.querySelector('[data-testid="detalhe-cupom"]'));
  assert.equal(ag.desconto, 0);
  assert.match(await p.getByTestId('cartao').first().innerText(), /45,00/);
  ok('retirar cupom devolve o valor cheio');
  await ctx.close();
}

// 3. Atender: o campo de cupom só no agendamento futuro; chave errada não cria nada; certa vai no corpo
{
  const { ctx, p } = await entrar();
  await p.getByTestId('nav-agenda').click(); await p.getByTestId('agenda-dia').waitFor(); await p.getByTestId('atender-abrir').click(); await p.getByTestId('atender-forma-bloco').waitFor();
  assert.equal(await p.getByTestId('atender-cupom').count(), 0, 'atendimento de agora não tem cupom');
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-11-03T10:00');
  await p.getByTestId('atender-cupom').waitFor();
  await p.getByTestId('atender-nome').fill('Ana Lima'); await p.getByTestId('atender-telefone').fill('11977776666');
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  const antes = banco.length;
  await p.getByTestId('atender-cupom').fill('ERRADA-ERRADA');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('atender-erro').waitFor();
  assert.equal((await p.getByTestId('atender-erro').innerText()).trim(), GENERICO);
  assert.equal(banco.length, antes, 'chave errada: nada foi criado');
  await p.getByTestId('atender-cupom').fill('abcd-efgh-jklm');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(chamadasDe('POST', '/api/atendimentos').at(-1).corpo.cupomChave, 'abcd-efgh-jklm');
  assert.equal(banco.length, antes + 1);
  assert.equal(banco.at(-1).desconto, 4.5);
  ok('Atender futuro: campo de cupom só no futuro; chave errada não cria; certa cria com desconto');
  await ctx.close();
}

// 4. 390 px com fonte larga: lista, formulário e ficha com cupom, sem rolagem lateral
{
  const { ctx, p } = await entrar({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  const larg = async (onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };
  await p.getByTestId('nav-cupons').click();
  await p.getByTestId(`cupom-${id(777)}`).waitFor();
  await larg('lista de cupons');
  await p.getByTestId('novo-cupom').click(); await p.getByTestId('cupom-form').waitFor();
  await larg('formulário de cupom');
  await p.getByTestId('cupom-cancelar').click();
  await p.getByTestId('nav-agenda').click(); await p.getByTestId('cartao').first().waitFor(); await p.getByTestId('cartao-abrir').first().click();
  await p.getByTestId('acao-cupom').click(); await p.getByTestId('cupom-form-agenda').waitFor();
  await larg('ficha com cupom');
  ok('390 px com fonte larga: sem rolagem lateral');
  await ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e54 ok');
