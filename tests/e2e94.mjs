/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estética sem box ativo (v120), site real contra um servidor falso: Atender e Link Agenda NÃO abrem; a Agenda avisa na própria tela; o proprietário recebe o botão
// "Cadastrar boxes" que leva à tela Boxes, quem não é proprietário só lê o aviso; com um box cadastrado tudo volta. 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAVI = id(1), PABLO = id(2), SRV = id(50), BX1 = id(60);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const chamadas = [];
let boxes = [];
let papel = 'dono';
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, papel === 'dono'
      ? { token: 'tok', id: DAVI, nome: 'Davi', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] }
      : { token: 'tok', id: PABLO, nome: 'Pablo', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'] });
    if (u.pathname === '/api/clientes') return json(200, []);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: DAVI, nome: 'Davi', papel: 'dono', atende: true, podeVender: true }, { id: PABLO, nome: 'Pablo', papel: 'profissional', atende: true, podeVender: true }]);
    if (u.pathname === '/api/servicos') return json(200, [{ id: SRV, codigo: '1', nome: 'Lavagem', categoria: '', preco: 80, duracaoMin: 60, intervaloMin: 0, antecedenciaH: 0, ativo: true, precos: { pequeno: 60, medio: 80, grande: 100, suv: 120, pickup: 150 }, duracoes: { pequeno: 45, medio: 60, grande: 75, suv: 90, pickup: 120 } }]);
    if (u.pathname === '/api/produtos') return json(200, []);
    if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [] });
    if (u.pathname === '/api/estabelecimento/link-agendamento') return json(200, { ativo: true, diasMax: 30, disponivel: true, telefoneObrigatorio: true, pendencias: [] });
    if (u.pathname === '/api/estabelecimento/local') return json(200, {});
    if (u.pathname === '/api/boxes') return json(200, boxes);
    if (u.pathname === '/api/agendamentos') return json(200, []);
    if (u.pathname === '/api/avisos') return json(200, []);
    if (u.pathname === '/api/usuarios/me') return json(200, { id: DAVI, nome: 'Davi', apelido: 'Davi', usuario: 'davi', papel, email: '', telefone: '', nascimento: '', foto: null });
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://localhost:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 860 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(AGORA);
  const paginasNovas = [];
  ctx.on('page', (pg) => paginasNovas.push(pg));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  paginasNovas.length = 0;
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('x'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  return { ctx, p, paginasNovas };
}
const semRolagem = async (p, onde) => assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `rolagem lateral em ${onde}`);

try {
  // 1. proprietário sem box: Atender e Link Agenda só avisam; o aviso leva ao cadastro
  const d = await abrir();
  await d.p.waitForTimeout(400); // as listas da Agenda chegam
  await d.p.getByTestId('atender-abrir').click();
  await d.p.getByTestId('aviso-sem-box').waitFor();
  assert.equal(await d.p.getByTestId('atender-form').count(), 0, 'o formulário de atender não abre sem box');
  assert.match(await d.p.getByTestId('aviso-sem-box').innerText(), /Cadastre ao menos um box/);
  await d.p.getByTestId('aviso-sem-box-fechar').click();
  assert.equal(await d.p.getByTestId('aviso-sem-box').count(), 0);
  await d.p.getByTestId('agenda-link').click();
  await d.p.getByTestId('aviso-sem-box').waitFor();
  assert.equal(d.paginasNovas.length, 0, 'o Link Agenda não abre o WhatsApp sem box');
  assert.ok(!chamadas.some((c) => c.u === '/api/atendimentos'));
  await d.p.getByTestId('aviso-sem-box-cadastrar').click();
  await d.p.getByTestId('boxes-real').waitFor();
  ok('proprietário: Atender e Link Agenda avisam, nada abre; "Cadastrar boxes" leva à tela Boxes');

  // 2. com um box cadastrado, tudo volta
  boxes = [{ id: BX1, nome: 'Box 1', ativo: true }];
  await d.p.getByTestId('nav-agenda').click();
  await d.p.getByTestId('agenda-dia').waitFor();
  await d.p.waitForTimeout(400);
  await d.p.getByTestId('atender-abrir').click();
  await d.p.getByTestId('atender-form').waitFor();
  assert.equal(await d.p.getByTestId('aviso-sem-box').count(), 0);
  ok('com um box ativo o Atender abre normalmente');
  await d.ctx.close();

  // 3. quem não é proprietário só lê o aviso (sem botão de cadastro) e 390 px não rola de lado
  boxes = []; papel = 'profissional';
  const m = await abrir({ width: 390, height: 800 });
  await m.p.waitForTimeout(400);
  await m.p.getByTestId('atender-abrir').click();
  await m.p.getByTestId('aviso-sem-box').waitFor();
  assert.equal(await m.p.getByTestId('aviso-sem-box-cadastrar').count(), 0, 'sem permissão: não há atalho para o cadastro');
  assert.match(await m.p.getByTestId('aviso-sem-box-pedir').innerText(), /proprietário/);
  await semRolagem(m.p, 'aviso sem box (390 px)');
  ok('profissional: só o aviso, sem botão; 390 px sem rolagem lateral');
  await m.ctx.close();
} finally {
  await b.close(); servidor.close();
}
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e94 ok');
