/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco B1 no SITE REAL (dist/index-real.html), contra um servidor falso: no Atender, serviços feitos por pessoas diferentes ganham um campo de profissional por serviço
// (vazio, obrigatório, só quem faz aquele serviço); o campo único some; o pedido sai com `atribuicoes`. 1366 e 390 px (fonte larga). E2E_CAPTURAS=pasta grava as imagens.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const pasta = process.env.E2E_CAPTURAS || '';
if (pasta) mkdirSync(pasta, { recursive: true });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO = id(1), KIKO = id(2), BRUNO = id(3), CORTE = id(50), BARBA = id(51), SOBR = id(52);
const usuario = (i, nome, papel) => ({ id: i, nome, apelido: nome.split(' ')[0], usuario: nome.split(' ')[0].toLowerCase(), papel, atende: true, podeVender: true, permissoes: {}, email: '', telefone: '' });
const usuarios = [usuario(DONO, 'Alan Dalforno', 'dono'), usuario(KIKO, 'Kiko Gindri', 'profissional'), usuario(BRUNO, 'Bruno Souza', 'profissional')];
const servicos = [
  { id: CORTE, codigo: '1', nome: 'Corte', preco: 50, duracaoMin: 40, ativo: true }, { id: BARBA, codigo: '2', nome: 'Barba', preco: 35, duracaoMin: 30, ativo: true },
  { id: SOBR, codigo: '3', nome: 'Sobrancelha', preco: 20, duracaoMin: 15, ativo: true },
];
const vinculos = { [CORTE]: [DONO, KIKO, BRUNO], [BARBA]: [DONO, KIKO], [SOBR]: [BRUNO] };
const chamadas = [];
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    const dados = corpo ? JSON.parse(corpo) : null;
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    if (req.method !== 'GET') chamadas.push({ m: req.method, p, dados });
    if (p === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Barbearia Dalforno', tipo: 'barbearia' });
    if (p === '/api/auth/login') return json(200, { token: 'tok', id: DONO, nome: 'Alan Dalforno', papel: 'dono', secoes: ['agenda'] });
    if (p === '/api/profissionais') return json(200, usuarios.map((x) => ({ id: x.id, nome: x.nome, papel: x.papel, atende: true, podeVender: true })));
    if (p === '/api/usuarios') return json(200, usuarios);
    if (p === '/api/servicos/profissionais') return json(200, vinculos);
    if (p === '/api/servicos') return json(200, servicos);
    if (p === '/api/atendimentos' && req.method === 'POST') return json(201, { id: id(900), profissionalId: dados.profissionalId, inicio: new Date().toISOString(), fim: new Date().toISOString(), status: 'concluido', servicos: [], total: 0 });
    if (p === '/api/estabelecimento/escala') return json(200, { semana: {} });
    if (p === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
    if (p === '/api/agendamentos') return json(200, []);
    if (p === '/api/estabelecimento/comissao') return json(200, { comissaoPadrao: 50 });
    if (p === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [], ordemServicos: 'uso' });
    if (p === '/api/estabelecimento/link-agendamento') return json(200, { ativo: true, diasMax: 30, limiteAbertos: 3, intervaloMin: 0, telefoneObrigatorio: true, nomeObrigatorio: true, veiculoObrigatorio: [], pendencias: [] });
    if (p === '/api/estabelecimento/local') return json(200, {});
    if (p === '/api/onboarding') return json(200, { tipo: 'barbearia', passo: 'servicos', concluido: true, servicos: [], jaCadastrados: [], expedienteSugerido: {} });
    if (p === '/api/onboarding/reconfiguracoes') return json(200, { itens: [] });
    if (p === '/api/suporte/chamados') return json(200, []);
    if (p === '/api/suporte/nao-lidas') return json(200, { total: 0 });
    if (p === '/api/usuarios/me/menu') return json(200, { recolhido: false });
    if (p === '/api/usuarios/me') return json(200, { id: DONO, nome: 'Alan Dalforno', papel: 'dono' });
    if (p === '/api/clientes') return json(200, []);
    if (p === '/api/produtos') return json(200, []);
    if (p === '/api/portes') return json(200, { portes: [] });
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
    await ctx.clock.setFixedTime(new Date('2026-11-09T11:00:00-03:00'));
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(`http://127.0.0.1:${servidor.address().port}`);
    if (touch) await p.addStyleTag({ content: FONTE_LARGA });
    const T = (t) => p.getByTestId(t);
    await p.fill('[data-testid="login-id"]', 'alan'); await p.fill('[data-testid="login-senha"]', '12345678'); await p.click('[data-testid="login-entrar"]');
    await T('agenda-real').waitFor();
    await T('atender-abrir').click();
    await T('atender-form').waitFor();

    // serviços feitos pela MESMA pessoa (Corte: todos) não pedem campo por serviço: continua o campo único
    await T(`atender-srv-${CORTE}`).check();
    await T('atender-prox-quando').click(); await T('atender-prox-cliente').click();
    assert.equal(await T('atender-pps').count(), 0, 'um serviço só: sem campo por serviço');
    assert.ok(await T('atender-profissional').isVisible(), 'continua o campo único de profissional');
    await T('atender-voltar').click(); await T('atender-voltar').click();

    // Barba (Alan e Kiko) + Sobrancelha (só o Bruno): pessoas diferentes → um campo por serviço
    await T(`atender-srv-${CORTE}`).uncheck();
    await T(`atender-srv-${BARBA}`).check(); await T(`atender-srv-${SOBR}`).check();
    await T('atender-prox-quando').click(); await T('atender-prox-cliente').click();
    await T('atender-pps').waitFor();
    assert.equal(await T('atender-profissional').count(), 0, 'o campo único some');
    assert.equal(await T(`atender-pps-${BARBA}`).inputValue(), '', 'vem vazio');
    assert.equal(await T(`atender-pps-${SOBR}`).inputValue(), '', 'vem vazio');
    const opBarba = await T(`atender-pps-${BARBA}`).locator('option').allInnerTexts();
    const opSobr = await T(`atender-pps-${SOBR}`).locator('option').allInnerTexts();
    assert.deepEqual(opBarba.filter((x) => x && x !== 'Escolha…').sort(), ['Alan Dalforno', 'Kiko Gindri'], 'só quem faz a barba');
    assert.deepEqual(opSobr.filter((x) => x && x !== 'Escolha…'), ['Bruno Souza'], 'só quem faz a sobrancelha');
    const larg = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert.ok(larg[0] <= larg[1], 'sem rolagem lateral');
    if (pasta) { await T('atender-pps').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${pasta}/b1-atender-por-servico-${vp.nome}.png` }); }

    // obrigatório: sem escolher, não envia
    await T('salvar-atender').click();
    await T('atender-erro').waitFor();
    assert.match(await T('atender-erro').innerText(), /profissional de cada serviço/);
    assert.equal(chamadas.filter((c) => c.p === '/api/atendimentos').length, 0, 'nada é enviado');

    // escolhe e envia: o pedido leva as atribuições
    await T(`atender-pps-${BARBA}`).selectOption(KIKO);
    await T(`atender-pps-${SOBR}`).selectOption(BRUNO);
    await T('salvar-atender').click();
    await p.waitForFunction(() => true);
    await p.waitForTimeout(500);
    const post = chamadas.find((c) => c.p === '/api/atendimentos');
    assert.ok(post, 'o pedido foi enviado');
    assert.deepEqual([...post.dados.atribuicoes].map((x) => [x.servicoId, x.profissionalId]).sort(), [[BARBA, KIKO], [SOBR, BRUNO]].sort());
    assert.equal(post.dados.profissionalId, KIKO, 'o profissional do primeiro serviço é a âncora');
    ok(`${vp.nome}px: Atender com profissional por serviço (vazio, obrigatório, só quem faz, envia as atribuições)`);
    await ctx.close();
  }
  assert.deepEqual(erros, [], 'sem erros de página nem diálogos nativos');
} finally {
  await b.close();
  servidor.close();
}
console.log('e2e125 ok');
