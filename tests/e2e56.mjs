/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// 5e-2: remarcar pelo link e avisos do painel no site real (dist/index-real.html) contra um servidor falso: "Remarcar" em Meus agendamentos (dias e horários
// pelo token do próprio horário, no cabeçalho), horário tomado mostra a mensagem do servidor, menos de 24 h explica sem chamar o servidor, o horário remarcado
// volta a "aguardando confirmação"; cartão de Avisos no Início (novos, marcar como lido, vazio, sem acesso = cartão some); 390 px com fonte larga sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), AG1 = id(401), AG2 = id(402), AV1 = id(601), AV2 = id(602);
const T1 = 'a1'.repeat(24), T2 = 'b2'.repeat(24);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const OCUPADO = 'Esse horário acabou de ser ocupado. Escolha outro.';
const chamadas = [];
let avisosAcesso = true;
let falhaOcupado = true;
const resumo = (agId, inicio, extra = {}) => ({ id: agId, inicio, fim: new Date(Date.parse(inicio) + 1800000).toISOString(), status: 'confirmado', rotulo: 'Confirmado', servicos: ['Corte'], duracao: 30, total: 40, desconto: 0, cupom: null, profissional: 'Alan', ativo: true, podeCancelar: true, ...extra });
const ags = { [AG1]: resumo(AG1, '2026-11-03T12:00:00Z'), [AG2]: resumo(AG2, '2026-10-28T15:00:00Z', { podeCancelar: false }) };
const tokens = { [T1]: AG1, [T2]: AG2 };
let avisos = [
  { id: AV1, em: '2026-10-28T12:00:00Z', agendamentoId: AG1, tipo: 'pedido', texto: 'Maria Souza pediu horário pelo link: 03/11 às 09:00 (aguardando a sua confirmação).', lido: false },
  { id: AV2, em: '2026-10-27T12:00:00Z', agendamentoId: AG2, tipo: 'cancelou', texto: 'Joana cancelou o horário de 30/10 às 10:00 pelo link.', lido: true },
];

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: c, auth: req.headers.authorization || '', acesso: req.headers['x-acesso'] || '' });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: ['nome', 'telefone'], local: [] });
    if (u.pathname === '/api/estabelecimento/link-agendamento') return json(200, { ativo: true, diasMax: 30, disponivel: true });
    if (u.pathname === '/api/avisos') return avisosAcesso ? json(200, avisos) : json(403, { mensagem: 'Acesso negado.' });
    const al = u.pathname.match(/^\/api\/avisos\/([^/]+)\/lido$/);
    if (al && req.method === 'PUT') { const a = avisos.find((x) => x.id === al[1]); if (!a) return json(404, { mensagem: 'Aviso não encontrado.' }); a.lido = true; return json(200, a); }
    if (u.pathname === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, servicos: [{ id: id(50), nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }], profissionais: [{ id: ALAN, nome: 'Alan', foto: null }] });
    if (u.pathname === '/api/publico/meus' && req.method === 'POST') return json(200, c.tokens.filter((t) => tokens[t]).map((t) => ags[tokens[t]]));
    const rm = u.pathname.match(/^\/api\/publico\/agendamentos\/([^/]+)\/(dias|horarios|remarcar)$/);
    if (rm) {
      if (tokens[req.headers['x-acesso']] !== rm[1]) return json(404, { mensagem: 'Agendamento não encontrado.' });
      if (rm[2] === 'dias') return json(200, ['2026-10-30', '2026-11-02'].filter((d) => d >= u.searchParams.get('de')));
      if (rm[2] === 'horarios') return json(200, ['12:00:00Z', '12:30:00Z'].map((h) => ({ inicio: `${u.searchParams.get('data')}T${h}`, profissionalId: ALAN })));
      if (falhaOcupado) { falhaOcupado = false; return json(409, { mensagem: OCUPADO }); }
      Object.assign(ags[rm[1]], { inicio: c.inicio, status: 'a_confirmar', rotulo: 'Aguardando confirmação' });
      avisos.unshift({ id: id(700 + avisos.length), em: '2026-10-28T13:00:00Z', agendamentoId: rm[1], tipo: 'remarcou', texto: 'Maria Souza remarcou pelo link.', lido: false });
      return json(200, ags[rm[1]]);
    }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 860 }, hash = '#agendar') {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(AGORA);
  await ctx.addInitScript(([t1, t2]) => { try { localStorage.setItem('agendz-acessos-dalforno', JSON.stringify([{ id: '00000000-0000-4000-8000-000000000401', token: t1 }, { id: '00000000-0000-4000-8000-000000000402', token: t2 }])); } catch { /* sem storage */ } }, [T1, T2]);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url + hash);
  return { ctx, p };
}
const deHoje = (m, u) => chamadas.filter((c) => c.m === m && c.u === u);

// 1. remarcar pelo link
{
  const { ctx, p } = await abrir();
  await p.getByTestId('pub-aba-meus').click();
  await p.getByTestId(`pub-ag-${AG1}`).waitFor();
  assert.match(await p.getByTestId(`pub-ag-${AG1}`).innerText(), /Confirmado/);
  await p.getByTestId(`pub-remarcar-${AG1}`).click();
  await p.getByTestId('pub-dia-2026-10-30').waitFor();
  const dias = deHoje('GET', `/api/publico/agendamentos/${AG1}/dias`).at(-1);
  assert.equal(dias.acesso, T1, 'o token DESTE horário vai no cabeçalho'); assert.ok(!dias.q.includes(T1) && dias.auth === '');
  assert.equal(await p.getByTestId(`pub-remarcar-sim-${AG1}`).isDisabled(), true, 'sem escolher horário não dá para enviar');
  await p.getByTestId('pub-hora-0900').click();
  await p.getByTestId(`pub-remarcar-sim-${AG1}`).click();
  await p.getByTestId('pub-erro-meus').waitFor();
  assert.match(await p.getByTestId('pub-erro-meus').innerText(), /acabou de ser ocupado/);
  assert.equal(await p.getByTestId(`pub-remarcando-${AG1}`).count(), 1, 'depois do erro continua escolhendo');
  await p.getByTestId('pub-hora-0930').click();
  await p.getByTestId(`pub-remarcar-sim-${AG1}`).click();
  await p.getByTestId('pub-aviso').waitFor();
  assert.match(await p.getByTestId('pub-aviso').innerText(), /novo horário/);
  const rem = deHoje('POST', `/api/publico/agendamentos/${AG1}/remarcar`).at(-1);
  assert.deepEqual(rem.corpo, { inicio: '2026-10-30T12:30:00.000Z' }); assert.equal(rem.acesso, T1); assert.ok(!rem.q.includes(T1)); assert.equal(rem.auth, '');
  assert.match(await p.getByTestId(`pub-ag-${AG1}`).innerText(), /Aguardando confirmação/);
  assert.match(await p.getByTestId(`pub-ag-${AG1}`).innerText(), /09:30/);
  assert.equal(await p.getByTestId(`pub-remarcando-${AG1}`).count(), 0);
  ok('remarcar: dias e horários pelo token do próprio horário, erro do servidor na tela, volta a aguardar confirmação');

  // 2. menos de 24 h: explica e não chama o servidor
  const antes = chamadas.length;
  await p.getByTestId(`pub-remarcar-${AG2}`).click();
  await p.getByTestId(`pub-remarcar-prazo-${AG2}`).waitFor();
  assert.equal(chamadas.length, antes, 'menos de 24 h nem consulta horários');
  assert.match(await p.getByTestId(`pub-remarcar-prazo-${AG2}`).innerText(), /24 horas/);
  ok('menos de 24 h: a tela explica e não chama o servidor');
  await ctx.close();
}

// 3. cartão de Avisos no Início do painel
{
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, '');
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-inicio').click(); await p.getByTestId('avisos-real').waitFor();
  await p.getByTestId(`aviso-${AV1}`).waitFor();
  assert.match(await p.getByTestId('avisos-novos').innerText(), /2 novos/);
  assert.match(await p.getByTestId(`aviso-${AV1}`).innerText(), /Maria Souza pediu horário/);
  assert.equal(await p.getByTestId(`aviso-lido-${AV2}`).count(), 0, 'o já lido não tem botão');
  await p.getByTestId(`aviso-lido-${AV1}`).click();
  await p.getByTestId(`aviso-${AV1}`).locator('.btn').waitFor({ state: 'detached' });
  assert.equal(deHoje('PUT', `/api/avisos/${AV1}/lido`).length, 1);
  assert.match(await p.getByTestId('avisos-novos').innerText(), /1 novo/);
  ok('Avisos: lista os novos, marca como lido');
  await ctx.close();
}
{
  avisosAcesso = false;
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, '');
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-inicio').click(); await p.getByTestId('painel-real').waitFor();
  await p.waitForFunction(() => !document.querySelector('[data-testid="avisos-real"]'));
  ok('sem acesso à agenda (403): o cartão de avisos some');
  await ctx.close();
  avisosAcesso = true;
}

// 4. 390 px com fonte larga: sem rolagem lateral (remarcar aberto e avisos)
{
  falhaOcupado = false;
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  const larg = async (onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };
  await p.getByTestId('pub-aba-meus').click();
  await p.getByTestId(`pub-remarcar-${AG1}`).waitFor(); await larg('meus agendamentos');
  await p.getByTestId(`pub-remarcar-${AG1}`).click(); await p.getByTestId('pub-dia-2026-10-30').waitFor(); await larg('remarcando');
  await p.getByTestId(`pub-remarcar-${AG2}`).click(); await p.getByTestId(`pub-remarcar-prazo-${AG2}`).waitFor(); await larg('prazo');
  await ctx.close();
  const { ctx: c2, p: p2 } = await abrir({ width: 390, height: 800 }, '');
  await p2.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await p2.getByTestId('login-id').fill('alan'); await p2.getByTestId('login-senha').fill('Minha-senha'); await p2.getByTestId('login-entrar').click();
  await p2.getByTestId('nav-inicio').click(); await p2.getByTestId('avisos-real').waitFor();
  const l = await p2.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  assert.ok(l.doc <= l.janela, `avisos: rolagem lateral ${l.doc} > ${l.janela}`);
  ok('390 px com fonte larga: sem rolagem lateral');
  await c2.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e56 ok');
