/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Imagens no chamado de suporte (site real): juntar até 3 imagens (a tela reduz e redesenha como JPEG), tirar uma antes de enviar, enviar com o chamado e com a
// resposta, ver as imagens da conversa (baixadas com o token, mostradas por endereço local `blob:`, nunca por URL pública), arquivo que não é imagem e 4ª imagem
// recusados na tela, imagem que falha mostra aviso, 390 px sem rolagem lateral. Servidor falso (confere Authorization e o conteúdo do que sobe).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EU = id(1), CH = id(201);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=', 'base64');
const chamadas = [];
const guardadas = new Map(); // id do anexo → bytes (JPEG que a tela mandou)
let chamado = null;
let falhaImagem = false;
const msg = (n, tipo, nome, texto, anexos = []) => ({ id: n, autorTipo: tipo, autorNome: nome, texto, criadoEm: '2026-10-29T13:00:00Z', anexos });
const guardar = (lista = []) => lista.map((b64, i) => { const aid = id(900 + guardadas.size + i); guardadas.set(aid, Buffer.from(b64, 'base64')); return { id: aid, tipo: 'image/jpeg', tamanho: guardadas.get(aid).length }; });
const visao = (st = 'aberto') => ({ id: CH, usuarioNome: 'Alan', assunto: chamado.assunto, categoria: chamado.categoria, status: st, criadoEm: '2026-10-29T13:00:00Z', atualizadoEm: '2026-10-29T13:05:00Z', naoLidas: 0, msgs: chamado.msgs });
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, auth: req.headers.authorization || '', corpo: corpo && req.headers['content-type'] === 'application/json' ? JSON.parse(corpo) : null });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: EU, nome: 'Alan', papel: 'profissional', deveTrocarSenha: false, onboardingPendente: false, secoes: [] });
    if (u.pathname === '/api/usuarios/me') return json(200, { id: EU, nome: 'Alan Dalforno', apelido: 'Alan', usuario: 'alan', papel: 'profissional', email: '', telefone: '', nascimento: '', foto: null });
    if (u.pathname === '/api/suporte/chamados/nao-lidas') return json(200, { naoLidas: 0 });
    if (u.pathname === '/api/suporte/chamados' && req.method === 'GET') return json(200, chamado ? [{ ...visao(), msgs: undefined }] : []);
    if (u.pathname === '/api/suporte/chamados' && req.method === 'POST') {
      const c = JSON.parse(corpo);
      chamado = { assunto: c.assunto, categoria: c.categoria, msgs: [msg(1, 'cliente', 'Alan', c.texto, guardar(c.anexos))] };
      return json(201, visao());
    }
    if (u.pathname === `/api/suporte/chamados/${CH}` && req.method === 'GET') return json(200, visao());
    if (u.pathname === `/api/suporte/chamados/${CH}/mensagens` && req.method === 'POST') {
      const c = JSON.parse(corpo);
      chamado.msgs.push(msg(chamado.msgs.length + 1, 'cliente', 'Alan', c.texto, guardar(c.anexos)));
      return json(201, visao('em_atendimento'));
    }
    const im = new RegExp(`^/api/suporte/chamados/${CH}/anexos/([^/]+)$`).exec(u.pathname);
    if (im) {
      if (!req.headers.authorization) return json(401, { mensagem: 'x' });
      if (falhaImagem || !guardadas.has(im[1])) return json(404, { mensagem: 'Imagem não encontrada.' });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
      return res.end(guardadas.get(im[1]));
    }
    return json(404, { mensagem: 'Não encontrado' });
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
const semRolagem = async (p, onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral (${l.doc} > ${l.janela})`); };
const arquivo = (nome = 'print.png') => ({ name: nome, mimeType: 'image/png', buffer: PNG });

for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 780 }]) {
  chamado = null; guardadas.clear(); falhaImagem = false; chamadas.length = 0;
  const touch = vp.width < 700;
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  const T = (i) => p.getByTestId(i);
  await T('login-id').fill('alan'); await T('login-senha').fill('Minha-senha'); await T('login-entrar').click();
  await T('nav-suporte').click();
  await T('sup-novo').click();
  await T('sup-assunto').fill('Erro na agenda');
  await T('sup-texto').fill('Veja os prints.');

  // juntar 3 imagens (uma de cada vez e duas juntas), tirar uma antes de enviar, a 4ª é recusada
  await T('sup-imagem-arquivo').setInputFiles(arquivo('um.png'));
  await T('sup-previa').first().waitFor();
  await T('sup-imagem-arquivo').setInputFiles([arquivo('dois.png'), arquivo('tres.png')]);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="sup-previa"]').length === 3);
  assert.equal(await T('sup-imagem-escolher').isDisabled(), true, 'com 3 imagens o botão de juntar fica desligado');
  await T('sup-previa-tirar').last().click();
  assert.equal(await T('sup-previa').count(), 2);
  await T('sup-imagem-arquivo').setInputFiles([arquivo('a.png'), arquivo('b.png')]); // 2 + 2 = 4
  await T('sup-imagem-erro').waitFor();
  assert.match(await T('sup-imagem-erro').innerText(), /Até 3/);
  assert.equal(await T('sup-previa').count(), 2, 'a escolha recusada não entra');
  await T('sup-imagem-arquivo').setInputFiles({ name: 'vetor.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
  await p.waitForFunction(() => /PNG, JPEG ou WebP/.test(document.querySelector('[data-testid="sup-imagem-erro"]')?.textContent || ''));
  assert.equal(await T('sup-previa').count(), 2, 'SVG não entra');
  await semRolagem(p, 'novo chamado com imagens');
  ok(`${vp.width}px: juntar, tirar, 4ª imagem e SVG recusados na tela`);

  // enviar: o corpo leva JPEG de verdade (reduzido e redesenhado), só em `anexos`; loja e usuário não vão
  await T('sup-abrir').click();
  await T('sup-conversa').waitFor();
  const post = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/suporte/chamados').at(-1);
  assert.deepEqual(Object.keys(post.corpo).sort(), ['anexos', 'assunto', 'categoria', 'texto']);
  assert.equal(post.corpo.anexos.length, 2);
  for (const a of post.corpo.anexos) assert.equal(Buffer.from(a, 'base64').subarray(0, 3).toString('hex'), 'ffd8ff', 'o que sobe é JPEG, não o arquivo original');
  await T('sup-img').first().waitFor();
  assert.equal(await T('sup-img').count(), 2);
  const origem = await T('sup-img').first().locator('img').getAttribute('src');
  assert.match(origem, /^blob:/, 'a imagem aparece por endereço local, não por URL pública');
  const baixadas = chamadas.filter((c) => /\/anexos\//.test(c.u));
  assert.ok(baixadas.length >= 2 && baixadas.every((c) => c.auth === 'Bearer tok'), 'a imagem é baixada com o token');
  ok(`${vp.width}px: imagens vão como JPEG e voltam por blob, baixadas com o token`);

  // ampliar alterna; resposta com imagem
  await T('sup-img').first().click();
  assert.match(await T('sup-img').first().getAttribute('class'), /grande/);
  await T('sup-img').first().click();
  await T('sup-resposta').fill('Mais um print');
  await T('sup-imagem-arquivo').setInputFiles(arquivo('resp.png'));
  await T('sup-previa').first().waitFor();
  await T('sup-enviar').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="sup-msg"]').length === 2);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="sup-img"]').length === 3);
  assert.equal(await T('sup-previa').count(), 0, 'a escolha é limpa depois de enviar');
  await semRolagem(p, 'conversa com imagens');
  ok(`${vp.width}px: resposta com imagem e escolha limpa`);

  // imagem que não carrega: aviso, sem quebrar a conversa
  falhaImagem = true;
  await T('sup-voltar').click(); await T('sup-item').click();
  await T('sup-img-falha').first().waitFor();
  assert.equal(await T('sup-msg').count() >= 2, true);
  ok(`${vp.width}px: imagem que falha mostra aviso e a conversa segue`);
  await ctx.close();
}
await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e71 ok');
