/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// 5d-4c-1: forma de pagamento e regras do Atender no site real (dist/index-real.html) contra um servidor falso: o proprietário muda a forma padrão e os campos
// obrigatórios no Início; o Atender usa o padrão, marca os obrigatórios com *, manda a forma só no atendimento feito, barra "sem padrão" na tela e mostra a
// mensagem do servidor; 390 px com fonte larga sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), SRV_CORTE = id(50);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const banco = [];
const chamadas = [];
let regras = { formaPagamentoPadrao: 'pix', futuro: ['nome', 'telefone'], local: [] };
let seq = 0;
const FORMAS = ['pix', 'dinheiro', 'cartao'];
const CAMPOS = ['nome', 'telefone', 'profissional', 'vendedor', 'formaPagamento'];
const rotulo = { nome: 'nome', telefone: 'telefone', profissional: 'profissional', vendedor: 'vendedor', formaPagamento: 'forma de pagamento' };
const ultimo = () => chamadas.filter((c) => c.m === 'POST' && c.u === '/api/atendimentos').at(-1);
const qtdAtendimentos = () => chamadas.filter((c) => c.m === 'POST' && c.u === '/api/atendimentos').length;
const textoDe = (p, t) => p.getByTestId(t).innerText();

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
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true, podeVender: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true, podeVender: true }]);
    if (u.pathname === '/api/servicos') return json(200, [{ id: SRV_CORTE, codigo: '1', nome: 'Corte', categoria: '', preco: 45, duracaoMin: 45, intervaloMin: 0, ativo: true }]);
    if (u.pathname === '/api/produtos') return json(200, []);
    if (u.pathname === '/api/estabelecimento/regras-atendimento') {
      if (req.method === 'GET') return json(200, regras);
      const f = c.formaPagamentoPadrao;
      if (f !== undefined && f !== '' && !FORMAS.includes(f)) return json(400, { mensagem: 'Forma de pagamento padrão inválida.' });
      const k = c.camposObrigatorios;
      if (k !== undefined) {
        const bom = ['futuro', 'local'].every((t) => Array.isArray(k[t]) && k[t].length <= 5 && new Set(k[t]).size === k[t].length && k[t].every((x) => CAMPOS.includes(x) && !(t === 'futuro' && x === 'formaPagamento')));
        if (!bom) return json(400, { mensagem: 'Campos obrigatórios inválidos.' });
        regras = { ...regras, futuro: k.futuro, local: k.local };
      }
      if (f !== undefined) regras = { ...regras, formaPagamentoPadrao: f };
      if (c.ordemServicos !== undefined) { if (!['uso', 'manual'].includes(c.ordemServicos)) return json(400, { mensagem: 'Ordem dos serviços inválida.' }); regras = { ...regras, ordemServicos: c.ordemServicos }; }
      return json(200, regras);
    }
    if (u.pathname === '/api/atendimentos' && req.method === 'POST') {
      const futuro = c.inicio && Date.parse(c.inicio) > AGORA.getTime() + 60000;
      const tem = { nome: !!c.nome, telefone: !!c.telefone, profissional: !!c.profissionalId, vendedor: !(c.produtos || []).length || !!c.vendedorId, formaPagamento: futuro || !!(c.formaPagamento || FORMAS.includes(regras.formaPagamentoPadrao)) };
      const faltam = (futuro ? regras.futuro : regras.local).filter((x) => !tem[x]).map((x) => rotulo[x]);
      if (faltam.length) return json(400, { mensagem: `Preencha ${faltam.length === 1 ? 'o campo obrigatório' : 'os campos obrigatórios'}: ${faltam.join(', ')}.` });
      const forma = futuro ? undefined : (c.formaPagamento || regras.formaPagamentoPadrao);
      if (!futuro && !forma) return json(400, { mensagem: 'Escolha a forma de pagamento.' });
      const quando = c.inicio ? Date.parse(c.inicio) : AGORA.getTime();
      const a = { id: id(300 + (seq += 1)), clienteId: null, profissionalId: c.profissionalId || ALAN, inicio: new Date(quando).toISOString(), fim: new Date(quando + 45 * 60000).toISOString(), fimOcupado: new Date(quando + 45 * 60000).toISOString(), status: futuro ? 'a_confirmar' : 'concluido', encaixe: false, total: 45, servicos: [{ servicoId: SRV_CORTE, nome: 'Corte', preco: 45, duracaoMin: 45 }], conflitosPendentes: [], origem: futuro ? 'painel' : 'atendimento', reagendado: false, statusManual: false, historico: [], produtos: [], totalProdutos: 0, ...(forma ? { formaPagamento: forma } : {}) };
      banco.push(a);
      return json(201, a);
    }
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) >= de));
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
const abrirAtender = async (p) => { await p.getByTestId('nav-agenda').click(); await p.getByTestId('agenda-dia').waitFor(); await p.getByTestId('atender-abrir').click(); await p.getByTestId('atender-forma-bloco').waitFor(); };

// 1. o proprietário vê as regras no Início e muda: o corpo leva só forma e listas; a resposta do servidor volta à tela
{
  const { ctx, p } = await entrar();
  await p.getByTestId('regras-real').waitFor();
  assert.equal(await p.getByTestId('regras-forma').inputValue(), 'pix');
  assert.equal(await p.getByTestId('regras-futuro-nome').isChecked(), true);
  assert.equal(await p.getByTestId('regras-local-telefone').isChecked(), false);
  assert.equal(await p.getByTestId('regras-futuro-formaPagamento').count(), 0, 'agendamento futuro não tem forma de pagamento');
  await p.getByTestId('regras-forma').selectOption('dinheiro');
  await p.getByTestId('regras-local-telefone').check();
  await p.getByTestId('regras-local-formaPagamento').check();
  await p.getByTestId('regras-futuro-telefone').uncheck();
  assert.equal(await p.getByTestId('regras-ordem-servicos').inputValue(), 'uso', 'padrão: mais usados primeiro');
  await p.getByTestId('regras-ordem-servicos').selectOption('manual');
  await p.getByTestId('regras-salvar').click();
  await p.getByTestId('regras-ok').waitFor();
  const put = chamadas.filter((c) => c.m === 'PUT' && c.u === '/api/estabelecimento/regras-atendimento').at(-1).corpo;
  assert.deepEqual(put, { formaPagamentoPadrao: 'dinheiro', camposObrigatorios: { futuro: ['nome'], local: ['telefone', 'formaPagamento'] }, ordemServicos: 'manual' });
  assert.deepEqual(regras, { formaPagamentoPadrao: 'dinheiro', futuro: ['nome'], local: ['telefone', 'formaPagamento'], ordemServicos: 'manual' });
  ok('Início do dono: muda forma padrão e campos obrigatórios; corpo certo, servidor guardou');
  await ctx.close();
}

// 2. o Atender usa as regras: padrão marcado, * nos obrigatórios, a mensagem do servidor aparece e nada é gravado; com o campo e outra forma, vai no corpo
{
  regras = { formaPagamentoPadrao: 'dinheiro', futuro: ['nome'], local: ['telefone', 'formaPagamento'] };
  const { ctx, p } = await entrar();
  await abrirAtender(p);
  await p.waitForFunction((t) => document.querySelector(`[data-testid="${t}"]`)?.checked === true, 'atender-forma-dinheiro'); // as regras chegam do servidor logo depois de abrir
  assert.equal(await p.getByTestId('atender-forma-dinheiro').isChecked(), true, 'o padrão vem marcado');
  assert.match(await p.getByTestId('atender-forma-bloco').innerText(), /forma de pagamento \*/i);
  assert.match(await p.locator('label.campo', { has: p.getByTestId('atender-telefone') }).innerText(), /Telefone \*/);
  assert.doesNotMatch(await p.locator('label.campo', { has: p.getByTestId('atender-nome') }).innerText(), /\*/, 'nome não é obrigatório no atendimento feito');
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  assert.match(await textoDe(p, 'atender-faltam'), /Falta preencher: telefone\./);
  const antes = banco.length;
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('atender-erro').waitFor();
  assert.match(await textoDe(p, 'atender-erro'), /Preencha o campo obrigatório: telefone\./);
  assert.equal(banco.length, antes, 'nada gravado');
  await p.getByTestId('atender-telefone').fill('11977776666');
  await p.getByTestId('atender-forma-cartao').check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(ultimo().corpo.formaPagamento, 'cartao');
  assert.equal(banco.at(-1).formaPagamento, 'cartao');
  ok('Atender: padrão marcado, * nos obrigatórios, mensagem do servidor na tela, forma escolhida vai no corpo');
  // o padrão vale quando nada é escolhido
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  await p.getByTestId('atender-telefone').fill('11977776666');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(ultimo().corpo.formaPagamento, 'dinheiro');
  ok('sem escolher, vale a forma padrão da loja');
  await ctx.close();
}

// 3. sem padrão: a tela barra antes de enviar; depois de escolher, vai
{
  regras = { formaPagamentoPadrao: '', futuro: ['nome', 'telefone'], local: [] };
  const { ctx, p } = await entrar();
  await abrirAtender(p);
  await p.waitForFunction(() => document.querySelector('[data-testid="atender-forma-pix"]')?.checked === false); // até as regras chegarem, vale a de fábrica (Pix)
  for (const f of FORMAS) assert.equal(await p.getByTestId(`atender-forma-${f}`).isChecked(), false);
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  const antes = qtdAtendimentos();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('atender-erro').waitFor();
  assert.match(await textoDe(p, 'atender-erro'), /Escolha a forma de pagamento\./);
  assert.equal(qtdAtendimentos(), antes, 'nada enviado');
  await p.getByTestId('atender-forma-pix').check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(ultimo().corpo.formaPagamento, 'pix');
  ok('sem padrão: a tela exige escolher a forma antes de enviar');
  await ctx.close();
}

// 4. agendamento futuro: sem bloco de forma e sem forma no corpo
{
  regras = { formaPagamentoPadrao: 'pix', futuro: ['nome', 'telefone'], local: [] };
  const { ctx, p } = await entrar();
  await abrirAtender(p);
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-11-03T10:00');
  assert.equal(await p.getByTestId('atender-forma-bloco').count(), 0);
  await p.getByTestId('atender-nome').fill('Ana Lima'); await p.getByTestId('atender-telefone').fill('11977776666');
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.ok(!('formaPagamento' in ultimo().corpo), 'futuro não manda forma');
  ok('futuro: sem bloco de forma e sem forma no corpo');
  await ctx.close();
}

// 5. 390 px com fonte larga: Início com as regras e o Atender com a forma, sem rolagem lateral
{
  const { ctx, p } = await entrar({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await p.getByTestId('regras-real').waitFor();
  let larg = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  assert.ok(larg.doc <= larg.janela, `Início: rolagem lateral ${larg.doc} > ${larg.janela}`);
  await abrirAtender(p);
  larg = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  assert.ok(larg.doc <= larg.janela, `Atender: rolagem lateral ${larg.doc} > ${larg.janela}`);
  ok('390 px com fonte larga: sem rolagem lateral');
  await ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e53 ok');
