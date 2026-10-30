/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estabelecimento no site real: horário de funcionamento (abrir/fechar dia, outra faixa, copiar, conferência antes de enviar, recusa do servidor, gravação)
// e logo + cor do tema (enviar PNG, tema aplicado na hora, escolher paleta, remover), só do proprietário; 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=', 'base64');
const chamadas = [];
let escala = { semana: { 1: { aberto: true, faixas: [['09:00', '18:00']] }, 2: { aberto: true, faixas: [['09:00', '18:00']] } } };
let marca = { logo: null, temaCor: null, temaCor2: null };
let recusarEscala = false;
let papel = 'dono';
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, corpo: corpo ? JSON.parse(corpo) : null });
    const login = { token: 'tok', id: ALAN, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes', 'estabelecimento'] };
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', ...marca });
    if (u.pathname === '/api/auth/login') return json(200, login);
    if (u.pathname === '/api/clientes') return json(200, []);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }]);
    if (u.pathname === '/api/agendamentos') return json(200, []);
    if (u.pathname === '/api/avisos') return json(200, []);
    if (u.pathname === '/api/estabelecimento/local') return json(200, {});
    if (u.pathname === '/api/estabelecimento/comissao') return json(200, { pct: 0 });
    if (u.pathname === '/api/estabelecimento/escala' && req.method === 'GET') return json(200, escala);
    if (u.pathname === '/api/estabelecimento/escala' && req.method === 'PUT') {
      if (recusarEscala) return json(400, { mensagem: 'Horário recusado pelo servidor.' });
      escala = JSON.parse(corpo); return json(200, escala);
    }
    if (u.pathname === '/api/estabelecimento/marca' && req.method === 'GET') return json(200, marca);
    if (u.pathname === '/api/estabelecimento/marca' && req.method === 'PUT') { marca = JSON.parse(corpo); return json(200, marca); }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
const semRolagem = async (p, onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };
async function abrir(viewport = { width: 1280, height: 860 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-estabelecimento').waitFor();
  await p.getByTestId('nav-estabelecimento').click();
  await p.getByTestId('exp-form').waitFor();
  return { ctx, p };
}
const ultima = (m, u) => [...chamadas].reverse().find((c) => c.m === m && c.u === u);

{
  const { ctx, p } = await abrir();
  assert.equal(await p.getByTestId('exp-dia-1').isChecked(), true);
  assert.equal(await p.getByTestId('exp-dia-0').isChecked(), false, 'domingo fechado');
  assert.equal(await p.getByTestId('exp-faixa-1-0-ini').inputValue(), '09:00');
  ok('o horário salvo aparece na tela');

  // erro de conferência não sai do aparelho
  await p.getByTestId('exp-faixa-1-0-ini').fill('19:00');
  const antes = chamadas.filter((c) => c.m === 'PUT' && c.u === '/api/estabelecimento/escala').length;
  await p.getByTestId('exp-salvar').click();
  await p.getByTestId('exp-erro').waitFor();
  assert.match(await p.getByTestId('exp-erro').innerText(), /antes do fim/);
  assert.equal(chamadas.filter((c) => c.m === 'PUT' && c.u === '/api/estabelecimento/escala').length, antes, 'nada foi enviado');
  ok('horário inválido é barrado antes de enviar');

  // abrir sábado, duas faixas, copiar e gravar
  await p.getByTestId('exp-faixa-1-0-ini').fill('09:00');
  await p.getByTestId('exp-dia-6').check();
  await p.getByTestId('exp-faixa-6-0-ini').fill('08:00'); await p.getByTestId('exp-faixa-6-0-fim').fill('12:00');
  await p.getByTestId('exp-mais-6').click();
  await p.getByTestId('exp-faixa-6-1-ini').fill('14:00'); await p.getByTestId('exp-faixa-6-1-fim').fill('18:00');
  await p.getByTestId('exp-salvar').click();
  await p.getByTestId('exp-ok').waitFor();
  const corpo = ultima('PUT', '/api/estabelecimento/escala').corpo;
  assert.deepEqual(corpo.semana[6].faixas, [['08:00', '12:00'], ['14:00', '18:00']]);
  assert.deepEqual(Object.keys(corpo.semana).sort(), ['1', '2', '6']);
  ok('sábado com duas faixas gravado só com os dias abertos');

  // recusa do servidor aparece e não perde o que foi digitado
  recusarEscala = true;
  await p.getByTestId('exp-faixa-6-0-fim').fill('12:30');
  await p.getByTestId('exp-salvar').click();
  await p.getByTestId('exp-erro').waitFor();
  assert.match(await p.getByTestId('exp-erro').innerText(), /recusado pelo servidor/);
  assert.equal(await p.getByTestId('exp-faixa-6-0-fim').inputValue(), '12:30');
  recusarEscala = false;
  ok('recusa do servidor vira mensagem e mantém os campos');

  // copiar para os outros dias abertos
  await p.getByTestId('exp-copiar-6').click();
  assert.equal(await p.getByTestId('exp-faixa-1-1-ini').inputValue(), '14:00');
  ok('copiar para os outros dias abertos');
  await ctx.close();
}

{
  const { ctx, p } = await abrir();
  await p.getByTestId('marca-painel').scrollIntoViewIfNeeded();
  await p.getByTestId('marca-sem-logo').waitFor();
  await p.getByTestId('marca-arquivo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await p.getByTestId('marca-ok').waitFor();
  await p.getByTestId('marca-logo-previa').waitFor();
  const gravado = ultima('PUT', '/api/estabelecimento/marca').corpo;
  assert.match(gravado.logo, /^data:image\/(png|jpeg|webp);base64,/);
  ok('logo enviada: pré-visualização e gravação');

  await p.getByTestId('marca-tema-padrao').click();
  await p.waitForFunction(() => true);
  assert.equal(ultima('PUT', '/api/estabelecimento/marca').corpo.temaCor, null);
  const paleta = await p.locator('[data-testid^="marca-tema-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((t) => !/padrao|logo$/.test(t)));
  assert.ok(paleta.length >= 1, 'há paletas');
  await p.getByTestId(paleta[0]).click();
  await p.waitForFunction(() => !!document.getElementById('tema-marca'));
  assert.match(ultima('PUT', '/api/estabelecimento/marca').corpo.temaCor, /^#[0-9a-f]{6}$/i);
  await p.waitForFunction((t) => document.querySelector(`[data-testid="${t}"]`)?.getAttribute('aria-pressed') === 'true', paleta[0]);
  ok('paleta escolhida: gravada e aplicada na hora');

  await p.getByTestId('marca-remover').click();
  await p.getByTestId('marca-sem-logo').waitFor();
  assert.equal(ultima('PUT', '/api/estabelecimento/marca').corpo.logo, null);
  ok('logo removida volta ao ícone do tipo');
  await ctx.close();
}

{
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await semRolagem(p, 'estabelecimento 390');
  await p.getByTestId('marca-painel').scrollIntoViewIfNeeded();
  await semRolagem(p, 'marca 390');
  const c = await p.getByTestId('exp-form').boundingBox();
  assert.ok(c.x >= 0 && c.x + c.width <= 390, 'o horário cabe na tela');
  await ctx.close();
  ok('390 px: sem rolagem lateral');
}
await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e72 ok');
