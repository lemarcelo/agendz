/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Login por digital (passkey) no site real, com autenticador VIRTUAL do Chromium (WebAuthn de verdade no navegador) e um servidor de mentira que confere o que o
// servidor real confere sem a assinatura: tipo, desafio de uso único, origem, hash do rpId e verificação do usuário. Cadastrar pede a senha (errada = 403),
// entra pela digital, remove com confirmação na tela, o desafio não vale duas vezes e 390 px não rola de lado.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2);
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha = (t) => crypto.createHash('sha256').update(t).digest();
const chamadas = [];
const desafios = new Map(); // id → { desafio, tipo }
const aparelhos = []; // { id, credencial, nome, criadoEm, ultimoUso }
let porta = 0;
let seq = 0;
const login = { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] };
const eu = { id: ALAN, nome: 'Alan Dalforno', apelido: 'Alan', usuario: 'alan', papel: 'dono', email: '', telefone: '', nascimento: '', foto: null };

// confere o clientData como o servidor confere
function conferirCliente(cd64, tipo, d) {
  const cd = JSON.parse(Buffer.from(cd64, 'base64url').toString('utf8'));
  assert.equal(cd.type, tipo); assert.equal(cd.challenge, d.desafio); assert.equal(cd.origin, `http://localhost:${porta}`); assert.ok(!cd.crossOrigin);
}
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, corpo: c });
    const emitir = (tipo, extra = {}) => { const n = `d${++seq}-abcdefgh`; const desafio = b64u(crypto.randomBytes(32)); desafios.set(n, { desafio, tipo }); return { desafioId: n, desafio, rpId: 'localhost', ...extra }; };
    const gasta = (idd, tipo) => { const d = desafios.get(idd); desafios.delete(idd); return d && d.tipo === tipo ? d : null; };
    try {
      if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
      if (u.pathname === '/api/auth/login') return json(200, login);
      if (u.pathname === '/api/clientes') return json(200, []);
      if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]);
      if (u.pathname === '/api/estabelecimento/local') return json(200, {});
      if (u.pathname === '/api/agendamentos') return json(200, []);
      if (u.pathname === '/api/avisos') return json(200, []);
      if (u.pathname === '/api/usuarios/me' && req.method === 'GET') return json(200, eu);
      // ---- entrada
      if (u.pathname === '/api/auth/passkey/desafio') return json(200, emitir('entrada'));
      if (u.pathname === '/api/auth/passkey/entrar') {
        const d = gasta(c.desafioId, 'entrada');
        if (!d) return json(403, { mensagem: 'Não foi possível entrar com a digital. Use a senha.' });
        conferirCliente(c.clientDataJSON, 'webauthn.get', d);
        const auth = Buffer.from(c.authenticatorData, 'base64url');
        assert.ok(auth.subarray(0, 32).equals(sha('localhost')), 'rpIdHash'); assert.ok(auth[32] & 0x04, 'verificação do usuário'); assert.ok(auth[32] & 0x01, 'presença');
        const a = aparelhos.find((x) => x.credencial === c.credencialId);
        if (!a || !c.assinatura) return json(403, { mensagem: 'Não foi possível entrar com a digital. Use a senha.' });
        a.ultimoUso = new Date().toISOString();
        return json(200, login);
      }
      // ---- cadastro (pessoa logada)
      if (u.pathname === '/api/usuarios/me/passkeys/desafio') {
        if (c.senha !== 'Minha-senha') return json(403, { mensagem: 'Senha incorreta.' });
        return json(200, emitir('cadastro', { usuarioHandle: b64u(ALAN), usuarioNome: 'Alan Dalforno', excluir: aparelhos.map((x) => x.credencial) }));
      }
      if (u.pathname === '/api/usuarios/me/passkeys' && req.method === 'POST') {
        const d = gasta(c.desafioId, 'cadastro');
        if (!d) return json(403, { mensagem: 'Não foi possível entrar com a digital. Use a senha.' });
        conferirCliente(c.clientDataJSON, 'webauthn.create', d);
        const at = Buffer.from(c.atestado, 'base64url');
        const i = at.indexOf(sha('localhost'));
        assert.ok(i >= 0, 'authData com o hash do rpId'); assert.ok(at[i + 32] & 0x04, 'verificação do usuário'); assert.ok(at[i + 32] & 0x40, 'credencial incluída');
        const tam = (at[i + 53] << 8) | at[i + 54];
        const credencial = b64u(at.subarray(i + 55, i + 55 + tam));
        const item = { id: id(500 + aparelhos.length), credencial, nome: c.nome, criadoEm: new Date().toISOString(), ultimoUso: null };
        aparelhos.push(item);
        return json(201, { id: item.id, nome: item.nome, criadoEm: item.criadoEm, ultimoUso: null });
      }
      if (u.pathname === '/api/usuarios/me/passkeys' && req.method === 'GET') return json(200, aparelhos.map((x) => ({ id: x.id, nome: x.nome, criadoEm: x.criadoEm, ultimoUso: x.ultimoUso })));
      const rem = /^\/api\/usuarios\/me\/passkeys\/([^/]+)$/.exec(u.pathname);
      if (rem && req.method === 'DELETE') { const i = aparelhos.findIndex((x) => x.id === rem[1]); if (i < 0) return json(404, { mensagem: 'Aparelho não encontrado.' }); aparelhos.splice(i, 1); return json(204); }
      json(404, {});
    } catch (e) { json(500, { mensagem: 'assert: ' + e.message }); }
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
porta = servidor.address().port;
const url = `http://localhost:${porta}/`;
const b = await chromium.launch();
const erros = [];

async function abrir(viewport = { width: 1280, height: 860 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(url);
  return { ctx, p, cdp };
}
const entrarSenha = async (p) => { await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click(); await p.getByTestId('agenda-dia').waitFor(); };

try {
  const { p } = await abrir();
  // 1. cadastrar: senha errada = 403 e a sessão continua
  await entrarSenha(p);
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('meu-perfil').waitFor();
  await p.getByTestId('perfil-digital').waitFor();
  assert.equal(await p.getByTestId('digital-item').count(), 0);
  await p.getByTestId('digital-nome').fill('Notebook do balcão');
  await p.getByTestId('digital-senha').fill('senha-errada');
  await p.getByTestId('digital-cadastrar').click();
  await p.getByTestId('digital-erro').waitFor();
  assert.match(await p.getByTestId('digital-erro').innerText(), /Senha incorreta/);
  assert.equal(await p.getByTestId('meu-perfil').count(), 1, 'senha errada (403) não derruba a sessão');
  ok('cadastrar com a senha errada: 403 na tela, sessão mantida');

  // 2. cadastrar de verdade (o autenticador virtual responde)
  await p.getByTestId('digital-senha').fill('Minha-senha');
  await p.getByTestId('digital-cadastrar').click();
  await p.getByTestId('digital-item').first().waitFor();
  assert.match(await p.getByTestId('digital-item').first().innerText(), /Notebook do balcão.*nunca usado/);
  assert.equal(await p.getByTestId('digital-senha').inputValue(), '', 'a senha digitada não fica na tela');
  ok('cadastrar o aparelho: aparece na lista');

  // 3. sair e entrar pela digital
  await p.getByTestId('perfil-fechar').click();
  await p.getByTestId('sair').click();
  await p.getByTestId('login-digital').waitFor();
  await p.getByTestId('login-digital').click();
  await p.getByTestId('agenda-dia').waitFor();
  ok('entrar com a digital leva à Agenda');
  assert.equal(aparelhos[0].ultimoUso !== null, true);

  // 4. o desafio de entrada é de uso único (servidor): repetir a resposta não entra
  const entrou = chamadas.filter((x) => x.u === '/api/auth/passkey/entrar').at(-1).corpo;
  const rep = await fetch(`${url}api/auth/passkey/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entrou) });
  assert.equal(rep.status, 403);
  ok('repetir a mesma resposta é recusado (403)');

  // 5. remover pede confirmação na tela
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('digital-item').first().waitFor();
  await p.getByTestId('digital-remover').click();
  await p.getByTestId('digital-remover-nao').click();
  assert.equal(aparelhos.length, 1, 'voltar não remove');
  await p.getByTestId('digital-remover').click();
  await p.getByTestId('digital-remover-sim').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="digital-item"]').length === 0);
  assert.equal(aparelhos.length, 0);
  ok('remover confirma na própria tela e apaga');

  // 6. sem aparelho cadastrado a entrada pela digital é recusada com a frase padrão e a senha continua entrando
  await p.getByTestId('perfil-fechar').click();
  await p.getByTestId('sair').click();
  await p.getByTestId('login-digital').click();
  await p.getByTestId('login-erro').waitFor();
  assert.ok((await p.getByTestId('login-erro').innerText()).length > 0);
  await entrarSenha(p);
  ok('sem cadastro a digital é recusada; a senha continua valendo');

  // 7. 390 px: sem rolagem lateral no perfil
  const m = await abrir({ width: 390, height: 800 });
  await entrarSenha(m.p);
  await m.p.getByTestId('abrir-perfil').click();
  await m.p.getByTestId('perfil-digital').waitFor();
  await m.p.getByTestId('perfil-digital').scrollIntoViewIfNeeded();
  assert.ok(!(await m.p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'rolagem lateral em 390 px');
  ok('390 px: sem rolagem lateral');
} finally {
  await b.close(); servidor.close();
}
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e70 ok');
