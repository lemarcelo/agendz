/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F2 parte 1: site publicado com a API real (dist/index-real.html) contra um servidor falso no mesmo endereço (como o Caddy faz):
// a loja vem de GET /api/publico/loja (tipo e nome), login real, troca da senha temporária, painel, token só em memória, 390 px.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
assert.ok(!/localStorage\.setItem\([^)]*token/i.test(pagina), 'token não vai para localStorage');
const ok = (m) => console.log('✓', m);
const chamadas = [];
let loja = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };
let status404 = false;
let senhaTemporaria = true; // dono novo: a primeira senha é temporária
let loginAtual = 'alan'; // o dono escolhe o próprio usuário na troca

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: req.url, auth: req.headers.authorization || null, corpo: corpo ? JSON.parse(corpo) : null });
    if (req.url === '/api/publico/loja') return status404 ? json(404, { mensagem: 'Loja não encontrada' }) : json(200, loja);
    if (req.url === '/api/auth/login') {
      const c = JSON.parse(corpo);
      if (c.identificador !== loginAtual || c.senha !== (senhaTemporaria ? 'Temporaria-123' : 'Minha-senha-nova')) return json(401, { mensagem: 'Usuário ou senha inválidos' });
      return json(200, { token: 'tok-login', nome: 'Alan', papel: 'dono', deveTrocarSenha: senhaTemporaria, onboardingPendente: false });
    }
    if (req.url === '/api/usuarios/me/senha') {
      if (req.headers.authorization !== 'Bearer tok-login') return json(401, { mensagem: 'Sessão inválida' });
      const c = JSON.parse(corpo);
      if (c.senhaAtual !== 'Temporaria-123') return json(400, { mensagem: 'Senha atual incorreta' });
      if (c.usuario === 'ocupado') return json(409, { mensagem: 'Esse usuário já está em uso nesta loja. Escolha outro.' });
      if (!/^[a-z0-9._-]{2,60}$/.test(c.usuario || '')) return json(400, { mensagem: 'Usuário inválido' });
      loginAtual = c.usuario;
      senhaTemporaria = false;
      return json(200, { token: 'tok-novo', nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false });
    }
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
  await p.goto(url);
  return { ctx, p };
}

// 1. a loja vem da API: nome, ícone do tipo (sem logo) e tema do tipo; nada de usuários de demonstração nem seletor de loja
{
  const { ctx, p } = await abrir();
  await p.getByTestId('login-id').waitFor();
  assert.equal(await p.locator('h1').first().innerText(), 'Dalforno');
  assert.equal(await p.locator('html').getAttribute('data-tipo'), 'barbearia');
  assert.equal(await p.getByTestId('marca-icone').count(), 1, 'sem logo: ícone do tipo');
  assert.equal(await p.locator('[data-testid^="demo-"]').count(), 0, 'nada de demonstração no site real');
  assert.equal(chamadas[0].u, '/api/publico/loja');
  assert.equal(chamadas[0].auth, null);
  ok('loja carregada da API (nome, tipo e ícone); sem demonstração');
  await ctx.close();
}

// 2. login errado mostra a mensagem do servidor e limpa a senha; login certo com senha temporária cai na troca de senha
{
  const { ctx, p } = await abrir();
  await p.getByTestId('login-id').fill('alan');
  await p.getByTestId('login-senha').fill('errada-123');
  await p.getByTestId('login-entrar').click();
  await p.getByTestId('login-erro').waitFor();
  assert.match(await p.getByTestId('login-erro').innerText(), /Usuário ou senha inválidos/);
  assert.equal(await p.getByTestId('login-senha').inputValue(), '');
  assert.equal(await p.getByTestId('login-esqueci-texto').count(), 0);
  await p.getByTestId('login-esqueci').click();
  assert.match(await p.getByTestId('login-esqueci-texto').innerText(), /suporte/);
  assert.equal(await p.getByTestId('login-esqueci').getAttribute('aria-expanded'), 'true');
  await p.getByTestId('login-senha').fill('Temporaria-123');
  await p.getByTestId('login-entrar').click();
  await p.getByTestId('troca-nova').waitFor();
  assert.match(await p.getByTestId('troca-esqueci').innerText(), /suporte/);
  assert.equal(await p.getByTestId('troca-usuario').inputValue(), '', 'o usuário é preenchido pela própria pessoa');
  assert.equal(await p.getByTestId('troca-atual').count(), 0, 'a senha enviada já foi digitada no login: não pede de novo');
  assert.equal(await p.getByTestId('agenda-real').count(), 0, 'com senha temporária não chega ao painel');
  ok('login errado recusado; senha temporária pede a troca');

  // 3. troca: confirmação diferente e senha curta ficam na tela; senha atual errada mostra o erro do servidor
  await p.getByTestId('troca-nova').fill('Minha-senha-nova');
  await p.getByTestId('troca-repetir').fill('Minha-senha-nova');
  await p.getByTestId('troca-salvar').click(); // sem usuário: não segue
  assert.match(await p.getByTestId('troca-erro').innerText(), /seu usuário/);
  await p.getByTestId('troca-usuario').fill('Alan Dalforno'); // espaço: inválido
  await p.getByTestId('troca-salvar').click();
  assert.match(await p.getByTestId('troca-erro').innerText(), /seu usuário/);
  assert.equal(chamadas.filter((c) => c.u === '/api/usuarios/me/senha').length, 0, 'usuário vazio ou inválido não chega ao servidor');
  await p.getByTestId('troca-usuario').fill('Alan.Dalforno'); // maiúsculas viram minúsculas
  await p.getByTestId('troca-repetir').fill('outra-coisa-aqui');
  await p.getByTestId('troca-salvar').click();
  assert.match(await p.getByTestId('troca-erro').innerText(), /confirmação/);
  await p.getByTestId('troca-repetir').fill('Minha-senha-nova');
  await p.getByTestId('troca-nova').fill('curta');
  await p.getByTestId('troca-repetir').fill('curta');
  await p.getByTestId('troca-salvar').click();
  assert.match(await p.getByTestId('troca-erro').innerText(), /8 caracteres/);
  await p.getByTestId('troca-usuario').fill('ocupado');
  await p.getByTestId('troca-nova').fill('Minha-senha-nova');
  await p.getByTestId('troca-repetir').fill('Minha-senha-nova');
  await p.getByTestId('troca-salvar').click();
  await p.waitForFunction(() => /já está em uso/.test(document.querySelector('[data-testid=troca-erro]')?.textContent || ''));
  await p.getByTestId('troca-usuario').fill('Alan.Dalforno');
  await p.getByTestId('troca-salvar').click();
  await p.getByTestId('agenda-real').waitFor(); // depois de entrar cai na Agenda, não no Início
  assert.equal(await p.getByTestId('nav-inicio').count(), 0, 'não existe aba Início');
  assert.equal(await p.locator('.nav button.on').getAttribute('data-testid'), 'nav-agenda', 'abre na Agenda');
  assert.equal(await p.getByTestId('topo-nome').innerText(), 'Alan');
  const troca = chamadas.filter((c) => c.u === '/api/usuarios/me/senha');
  assert.ok(troca.length >= 2 && troca.every((c) => c.auth === 'Bearer tok-login'), 'a troca leva o token do login');
  assert.equal(troca.at(-1).corpo.usuario, 'alan.dalforno', 'o usuário escolhido vai em minúsculas');
  ok('troca de senha: erros na tela, servidor confere a atual, painel depois');

  // 4. token só em memória: nada em storage nem cookie; recarregar pede o login de novo; sair volta ao login
  const guardado = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
  assert.ok(!/tok-|Temporaria|Minha-senha/.test(guardado), 'token ou senha em storage/cookie: ' + guardado);
  await p.getByTestId('sair').click();
  await p.getByTestId('login-id').waitFor();
  await p.getByTestId('login-id').fill('alan.dalforno');
  await p.getByTestId('login-senha').fill('Minha-senha-nova');
  await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-estabelecimento').click(); await p.getByTestId('tela-estabelecimento').waitFor();
  await p.reload();
  await p.getByTestId('login-id').waitFor();
  ok('token e senha fora de storage/cookie; sair e recarregar pedem o login');
  await ctx.close();
}

// 5. loja de outro tipo e 390 px sem rolagem lateral (login, troca e painel)
{
  loja = { slug: 'apex', nome: 'Apex Estética Automotiva', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null };
  senhaTemporaria = true; loginAtual = 'alan';
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await p.getByTestId('login-id').waitFor();
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' }); // a fonte (mais larga) dos testes no CI
  assert.equal(await p.locator('html').getAttribute('data-tipo'), 'estetica_automotiva');
  const semRolagem = async (nome) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${nome}: rolagem horizontal em 390 px`);
  await semRolagem('login');
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Temporaria-123'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('troca-nova').waitFor(); await semRolagem('troca');
  await p.getByTestId('troca-usuario').fill('alan'); await p.getByTestId('troca-nova').fill('Minha-senha-nova'); await p.getByTestId('troca-repetir').fill('Minha-senha-nova'); await p.getByTestId('troca-salvar').click();
  await p.getByTestId('nav-estabelecimento').click(); await p.getByTestId('tela-estabelecimento').waitFor(); await semRolagem('painel');
  ok('estética: tipo certo e 390 px sem rolagem lateral (login, troca, painel)');
  await ctx.close();
}

// 6. loja inexistente nunca cai numa loja padrão; servidor fora mostra aviso com "Tentar de novo"
{
  status404 = true;
  const { ctx, p } = await abrir();
  await p.getByTestId('loja-nao-encontrada').waitFor();
  assert.equal(await p.getByTestId('login-id').count(), 0);
  await ctx.close();
  status404 = false;
  const c2 = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await c2.newPage();
  await p2.route('**/api/publico/loja', (r) => r.abort());
  await p2.goto(url);
  await p2.getByTestId('erro-carga').waitFor();
  assert.match(await p2.getByTestId('erro-carga').innerText(), /conexão/);
  await p2.unroute('**/api/publico/loja');
  await p2.getByTestId('tentar-de-novo').click();
  await p2.getByTestId('login-id').waitFor();
  await c2.close();
  ok('loja inexistente = "Loja não encontrada"; sem conexão = aviso e nova tentativa');
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e36 ok');
