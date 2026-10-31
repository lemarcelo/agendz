/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Login automático por rede confiável (v119) no site real, contra um servidor de mentira: caixa "Login automático"; pergunta "Deseja logar automaticamente nesta rede Wi-Fi?"
// (Agora não = nada guardado; Sim = token longo guardado SÓ neste caso); reabrir o site entra direto; token recusado é esquecido; remover a rede em Meu perfil;
// Sair derruba o token no servidor e no aparelho; token comum nunca é guardado; digital pelo campo de usuário (interface condicional); 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const ALAN = '00000000-0000-4000-8000-000000000001';
const CURTO = 'aaaaaaaaaa.curto000000.cccccccccc';
const LONGO = 'aaaaaaaaaa.longo00000.cccccccccc';
const CHAVE = 'agendz-rede:dalforno';
const chamadas = [];
const estado = { redes: [], longoValido: true };
let porta = 0;
const sessao = (extra = {}) => ({ token: CURTO, id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'], redeConfiavel: false, perguntarRede: false, ...extra });
const eu = { id: ALAN, nome: 'Alan Dalforno', apelido: 'Alan', usuario: 'alan', papel: 'dono', email: '', telefone: '', nascimento: '', foto: null };

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    const auth = req.headers.authorization || '';
    chamadas.push({ m: req.method, u: u.pathname, corpo: c, auth });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') {
      if (estado.redes.length && estado.longoValido) return json(200, sessao({ token: LONGO, redeConfiavel: true })); // rede já confiável: token longo, sem perguntar
      return json(200, sessao(c.loginAutomatico ? { perguntarRede: true } : {}));
    }
    if (u.pathname === '/api/auth/passkey/desafio') return json(200, { desafioId: 'd1-abcdefgh', desafio: Buffer.alloc(32, 7).toString('base64url'), rpId: 'localhost' });
    if (u.pathname === '/api/auth/redes-confiaveis' && req.method === 'POST') {
      if (auth !== `Bearer ${CURTO}`) return json(403, { mensagem: 'Para confiar nesta rede, entre de novo agora (com a senha ou a digital).' });
      estado.redes = [{ id: '00000000-0000-4000-8000-0000000000aa', rotulo: c.rotulo || 'Esta rede', criadoEm: '2026-10-30T10:00:00Z', ultimoUso: null, atual: true }];
      estado.longoValido = true;
      return json(200, sessao({ token: LONGO, redeConfiavel: true }));
    }
    if (u.pathname === '/api/auth/sessao') {
      if (auth !== `Bearer ${LONGO}` || !estado.longoValido) return json(401, { mensagem: 'Sessão encerrada. Entre de novo.' });
      return json(200, sessao({ token: LONGO, redeConfiavel: true }));
    }
    if (u.pathname === '/api/auth/sair') { estado.longoValido = false; return json(204); }
    if (u.pathname === '/api/usuarios/me/redes-confiaveis' && req.method === 'GET') return json(200, estado.redes);
    const rem = /^\/api\/usuarios\/me\/redes-confiaveis\/([^/]+)$/.exec(u.pathname);
    if (rem && req.method === 'DELETE') { estado.redes = []; estado.longoValido = false; return json(204); }
    if (u.pathname === '/api/usuarios/me/passkeys') return json(200, []);
    if (u.pathname === '/api/clientes') return json(200, []);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }]);
    if (u.pathname === '/api/estabelecimento/local') return json(200, {});
    if (u.pathname === '/api/agendamentos') return json(200, []);
    if (u.pathname === '/api/avisos') return json(200, []);
    if (u.pathname === '/api/usuarios/me' && req.method === 'GET') return json(200, eu);
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
porta = servidor.address().port;
const url = `http://localhost:${porta}/`;
const b = await chromium.launch();
const erros = [];

async function abrir(viewport = { width: 390, height: 800 }, antes) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript(() => { window.PublicKeyCredential.isConditionalMediationAvailable = async () => false; });
  if (antes) await ctx.addInitScript(antes);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  return { ctx, p };
}
const guardado = (p) => p.evaluate((k) => localStorage.getItem(k), CHAVE);
const semRolagem = async (p, onde) => assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `rolagem lateral em ${onde}`);
const entrar = async (p, auto) => {
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha');
  if (auto) await p.getByTestId('login-auto').check();
  await p.getByTestId('login-entrar').click();
};

try {
  const { p } = await abrir();
  // A. a caixa existe, explica e o campo de usuário aceita a digital do aparelho
  await p.getByTestId('login-id').waitFor();
  assert.match(await p.getByTestId('login-id').getAttribute('autocomplete'), /username webauthn/);
  assert.equal(await p.getByTestId('login-auto').isChecked(), false);
  assert.equal(await p.getByTestId('login-auto-ajuda').count(), 0);
  await p.getByTestId('login-auto').check();
  assert.match(await p.getByTestId('login-auto-ajuda').innerText(), /1 dia/);
  await semRolagem(p, 'login com a explicação');
  ok('A: caixa "Login automático" com explicação; campo de usuário com autocomplete webauthn; 390 px');

  // B. rede nova: pergunta; "Agora não" não guarda nada
  await entrar(p, true);
  await p.getByTestId('pergunta-rede').waitFor();
  assert.match(await p.getByTestId('pergunta-rede').innerText(), /Deseja logar automaticamente\?/);
  await semRolagem(p, 'pergunta da rede');
  assert.equal(await p.getByTestId('agenda-dia').count(), 0, 'o painel só abre depois da resposta');
  await p.getByTestId('rede-nao').click();
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await guardado(p), null, 'Agora não: nada guardado');
  assert.ok(!chamadas.some((x) => x.u === '/api/auth/redes-confiaveis'), 'Agora não: nada enviado ao servidor');
  ok('B: rede nova pergunta; "Agora não" entra e não guarda nada');

  // C. Sim: token longo guardado; o nome da rede vai ao servidor
  await p.reload();
  await entrar(p, true);
  await p.getByTestId('pergunta-rede').waitFor();
  await p.getByTestId('rede-rotulo').fill('Casa');
  await p.getByTestId('rede-sim').click();
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await guardado(p), LONGO);
  const post = chamadas.filter((x) => x.u === '/api/auth/redes-confiaveis').pop();
  assert.deepEqual(post.corpo, { rotulo: 'Casa' });
  assert.equal(post.auth, `Bearer ${CURTO}`, 'a confiança sai com a sessão recém-aberta');
  ok('C: "Sim" guarda só o token longo e manda o nome da rede');

  // D. reabrir o site entra direto
  const antesD = chamadas.length;
  await p.reload();
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await p.getByTestId('login-id').count(), 0);
  const restaurou = chamadas.slice(antesD).find((x) => x.u === '/api/auth/sessao');
  assert.equal(restaurou.auth, `Bearer ${LONGO}`);
  assert.ok(!chamadas.slice(antesD).some((x) => x.u === '/api/auth/login'), 'sem pedir login');
  ok('D: reabrir o site entra direto, conferindo o token no servidor');

  // E. Meu perfil: lista, remove com confirmação; o token guardado deixa de valer
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('perfil-redes').waitFor();
  assert.match(await p.getByTestId('redes-item').first().innerText(), /Casa.*esta rede/);
  await semRolagem(p, 'Meu perfil com redes');
  await p.getByTestId('redes-remover').click();
  assert.equal(chamadas.filter((x) => x.m === 'DELETE').length, 0, 'remover pede confirmação na tela');
  await p.getByTestId('redes-remover-sim').click();
  await p.getByTestId('redes-vazio').waitFor();
  await p.reload();
  await p.getByTestId('login-id').waitFor();
  assert.equal(await guardado(p), null, 'token recusado (401) é esquecido');
  ok('E: Meu perfil lista e remove a rede; token recusado some do aparelho');

  // F. Sair derruba o token no servidor e no aparelho
  await entrar(p, true);
  await p.getByTestId('pergunta-rede').waitFor();
  await p.getByTestId('rede-sim').click();
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await guardado(p), LONGO);
  await p.getByTestId('sair').click();
  await p.getByTestId('login-id').waitFor();
  assert.equal(await guardado(p), null);
  const sair = chamadas.filter((x) => x.u === '/api/auth/sair').pop();
  assert.equal(sair.auth, `Bearer ${LONGO}`);
  assert.equal(estado.longoValido, false);
  await p.reload();
  await p.getByTestId('login-id').waitFor();
  ok('F: Sair avisa o servidor, limpa o aparelho e o próximo acesso pede login');

  // G. login comum (sem marcar) nunca guarda token
  estado.redes = []; estado.longoValido = true;
  await entrar(p, false);
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await guardado(p), null);
  assert.equal(await p.getByTestId('pergunta-rede').count(), 0, 'sem marcar "Login automático" ninguém pergunta');
  ok('G: login sem a caixa não pergunta e não guarda nada');

  // H. rede já confiável: o servidor devolve o token longo e a tela guarda sem perguntar
  estado.redes = [{ id: '00000000-0000-4000-8000-0000000000aa', rotulo: 'Casa', criadoEm: '2026-10-30T10:00:00Z', ultimoUso: null, atual: true }];
  await p.getByTestId('sair').click();
  await p.getByTestId('login-id').waitFor();
  await entrar(p, false);
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await guardado(p), LONGO);
  assert.equal(await p.getByTestId('pergunta-rede').count(), 0);
  ok('H: rede já confiável entra com token longo e sem pergunta');

  // I. digital pelo campo de usuário: interface condicional pedida ao navegador (mediation conditional + sinal para cancelar)
  const cond = await abrir({ width: 1280, height: 860 }, () => {
    window.__get = [];
    window.PublicKeyCredential.isConditionalMediationAvailable = async () => true;
    navigator.credentials.get = (o) => { window.__get.push({ mediation: o.mediation, uv: o.publicKey && o.publicKey.userVerification, temSinal: !!o.signal }); return new Promise((_, rej) => { if (o.signal) o.signal.addEventListener('abort', () => rej(new DOMException('abortado', 'AbortError'))); }); };
  });
  await cond.p.getByTestId('login-id').waitFor();
  await cond.p.waitForFunction(() => window.__get.length > 0);
  assert.deepEqual(await cond.p.evaluate(() => window.__get[0]), { mediation: 'conditional', uv: 'required', temSinal: true });
  await cond.p.getByTestId('login-id').fill('alan'); await cond.p.getByTestId('login-senha').fill('Minha-senha');
  estado.redes = [];
  await cond.p.getByTestId('login-entrar').click();
  await cond.p.getByTestId('agenda-dia').waitFor();
  assert.equal(await cond.p.getByTestId('login-erro').count(), 0, 'cancelar a espera da digital não vira erro');
  ok('I: a digital é oferecida no campo de usuário (conditional) e não atrapalha a senha');
} finally {
  await b.close(); servidor.close();
}
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e93 ok');
