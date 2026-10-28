/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Site real sem internet: a ação espera (faixa de aviso) e é enviada sozinha, uma vez, quando a conexão volta; cancelar desiste sem enviar;
// 390 px sem rolagem lateral com a faixa.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const chamadas = [];
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ u: req.url, corpo: corpo ? JSON.parse(corpo) : null });
    if (req.url === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (req.url === '/api/auth/login') return json(200, { token: 'tok', nome: 'Alan', papel: 'dono', deveTrocarSenha: true, onboardingPendente: false });
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 800 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url); await p.getByTestId('login-id').waitFor();
  return { ctx, p };
}
const noLogin = () => chamadas.filter((c) => c.u === '/api/auth/login').length;

// 1. entrar sem internet: espera, não envia; ao voltar, envia uma vez e segue
{
  const { ctx, p } = await abrir();
  await ctx.setOffline(true);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Temporaria-123'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('aviso-rede').waitFor();
  await p.waitForTimeout(300);
  assert.equal(noLogin(), 0, 'sem internet nada chega ao servidor');
  await ctx.setOffline(false);
  await p.getByTestId('troca-nova').waitFor();
  assert.equal(noLogin(), 1, 'enviado uma vez só');
  assert.equal(await p.getByTestId('aviso-rede').count(), 0, 'a faixa some ao voltar a conexão');
  ok('entrar sem internet: faixa de aviso, nada enviado, envio único ao voltar');
  await ctx.close();
}

// 2. cancelar a espera: mostra o erro de sem conexão e nada é enviado depois
{
  const antes = noLogin();
  const { ctx, p } = await abrir();
  await ctx.setOffline(true);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Temporaria-123'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('aviso-rede').waitFor();
  await p.getByTestId('rede-cancelar').click();
  await p.getByTestId('login-erro').waitFor();
  assert.match(await p.getByTestId('login-erro').innerText(), /Sem conexão/);
  await ctx.setOffline(false); await p.waitForTimeout(300);
  assert.equal(noLogin(), antes, 'cancelada: nada é enviado quando a internet volta');
  ok('cancelar a espera desiste sem enviar');
  await ctx.close();
}

// 3. celular: a faixa de aviso não cria rolagem lateral e o envio segue ao voltar a conexão
{
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await ctx.setOffline(true);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Temporaria-123'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('aviso-rede').waitFor();
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'rolagem horizontal com a faixa em 390 px');
  await ctx.setOffline(false); await p.getByTestId('troca-nova').waitFor();
  ok('390 px: faixa de aviso sem rolagem lateral e o envio segue ao voltar a conexão');
  await ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e45 ok');
