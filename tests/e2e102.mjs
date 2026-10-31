/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso com o app fechado (v130) no site real, contra um servidor de mentira e um navegador com service worker/push de mentira (o push de verdade fala com Google/Apple):
// Meu perfil mostra o bloco; "Ligar avisos" pede a permissão, registra /sw.js, inscreve com a chave do servidor e manda só endpoint+chaves; "Enviar teste" mostra o resultado;
// "Desligar" apaga no servidor e no aparelho; permissão negada, navegador sem suporte e recurso desligado no servidor têm texto próprio; remover outro aparelho confirma na tela;
// 390 px e desktop, claro e escuro, sem rolagem lateral. O sw.js e o manifesto saem do build real.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
assert.ok(existsSync(new URL('../dist/sw.js', import.meta.url)) && existsSync(new URL('../dist/manifest.webmanifest', import.meta.url)), 'o build real precisa gerar sw.js e manifest');
assert.match(pagina, /rel="manifest"/, 'a página real aponta o manifesto');
const ok = (m) => console.log('✓', m);
const ALAN = '00000000-0000-4000-8000-000000000001';
const OUTRO = '00000000-0000-4000-8000-0000000000cc';
const MEU = '00000000-0000-4000-8000-0000000000dd';
const CHAVE = Buffer.from([4, ...Array.from({ length: 64 }, (_, i) => i + 1)]).toString('base64url');
const chamadas = [];
const estado = { itens: [], desligado: false, enviadosNoTeste: 1 };
const sessao = { token: 'aaaaaaaaaa.curto000000.cccccccccc', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'], redeConfiavel: false, perguntarRede: false };
const eu = { id: ALAN, nome: 'Alan Dalforno', apelido: 'Alan', usuario: 'alan', papel: 'dono', email: '', telefone: '', nascimento: '', foto: null };

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    if (u.pathname === '/sw.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(readFileSync(new URL('../dist/sw.js', import.meta.url))); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, corpo: c });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, sessao);
    if (u.pathname === '/api/push/chave') return estado.desligado ? json(503, { mensagem: 'Aviso com o app fechado ainda não está ligado neste servidor.' }) : json(200, { chave: CHAVE });
    if (u.pathname === '/api/push/inscricoes' && req.method === 'GET') return json(200, estado.itens);
    if (u.pathname === '/api/push/inscricoes' && req.method === 'POST') {
      let it = estado.itens.find((x) => x.id === MEU);
      if (!it) { it = { id: MEU, aparelho: c.aparelho || '', criadoEm: '2026-10-31T10:00:00Z', ultimoEnvio: null }; estado.itens.push(it); }
      return json(201, it);
    }
    const rem = /^\/api\/push\/inscricoes\/([^/]+)$/.exec(u.pathname);
    if (rem && req.method === 'DELETE') { estado.itens = estado.itens.filter((x) => x.id !== rem[1]); return json(204); }
    if (u.pathname === '/api/push/teste') return json(200, { enviados: estado.enviadosNoTeste, falhas: 0 });
    if (u.pathname === '/api/usuarios/me/redes-confiaveis' || u.pathname === '/api/usuarios/me/aparelhos-confiaveis' || u.pathname === '/api/usuarios/me/passkeys') return json(200, []);
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
const url = `http://localhost:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];

// Navegador de mentira: service worker, PushManager e Notification controlados pelo teste (window.__push guarda o que aconteceu).
const FALSO = (permissaoInicial, permissaoAoPedir, comSuporte) => `
  window.PublicKeyCredential && (window.PublicKeyCredential.isConditionalMediationAvailable = async () => false);
  window.__push = { sub: null, registrou: [], assinou: [], desinscreveu: 0, pediu: 0 };
  if (${comSuporte}) {
    let perm = ${JSON.stringify(permissaoInicial)};
    window.PushManager = function PushManager() {};
    window.Notification = { get permission() { return perm; }, requestPermission: async () => { window.__push.pediu++; perm = ${JSON.stringify(permissaoAoPedir)}; return perm; } };
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/falso', getKey: (n) => new Uint8Array(n === 'p256dh' ? 65 : 16).fill(n === 'p256dh' ? 4 : 7), unsubscribe: async () => { window.__push.desinscreveu++; window.__push.sub = null; return true; } };
    const reg = { pushManager: { getSubscription: async () => window.__push.sub, subscribe: async (o) => { window.__push.assinou.push(Array.from(new Uint8Array(o.applicationServerKey)).length); window.__push.sub = sub; return sub; } } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async (u, o) => { window.__push.registrou.push(u + '|' + (o && o.scope)); return reg; }, ready: Promise.resolve(reg), getRegistration: async () => reg } });
  } else {
    delete window.PushManager;
  }
`;
async function abrir({ viewport = { width: 390, height: 800 }, tema = 'light', permissaoInicial = 'default', permissaoAoPedir = 'granted', comSuporte = true } = {}) {
  const ctx = await b.newContext({ viewport, colorScheme: tema, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript(FALSO(permissaoInicial, permissaoAoPedir, comSuporte));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('push-secao').waitFor();
  return p;
}
const semRolagem = async (p, onde) => assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `rolagem lateral em ${onde}`);
const feitas = (m, u) => chamadas.filter((x) => x.m === m && x.u === u);

try {
  // A. celular: ligar, testar, desligar
  let p = await abrir();
  await p.getByTestId('push-estado').waitFor();
  assert.match(await p.getByTestId('push-estado').innerText(), /Desligado neste aparelho/);
  assert.equal(await p.getByTestId('push-testar').count(), 0);
  await semRolagem(p, 'Meu perfil com push (390)');
  await p.getByTestId('push-ativar').click();
  await p.getByTestId('push-msg').waitFor();
  assert.match(await p.getByTestId('push-estado').innerText(), /Ligado neste aparelho/);
  const w = await p.evaluate(() => window.__push);
  assert.equal(w.pediu, 1, 'a permissão foi pedida num toque');
  assert.deepEqual(w.registrou, ['/sw.js|/']);
  assert.deepEqual(w.assinou, [65], 'inscreveu com a chave pública do servidor (65 bytes)');
  const post = feitas('POST', '/api/push/inscricoes')[0];
  assert.equal(post.corpo.endpoint, 'https://fcm.googleapis.com/fcm/send/falso');
  assert.deepEqual(Object.keys(post.corpo.keys).sort(), ['auth', 'p256dh']);
  assert.ok(!JSON.stringify(post.corpo).includes('Minha-senha'));
  assert.equal(await p.getByTestId('push-item').count(), 1);
  await semRolagem(p, 'push ligado (390)');
  ok('A1: ligar pede a permissão, registra /sw.js, inscreve com a chave do servidor e lista o aparelho');

  await p.getByTestId('push-testar').click();
  await p.waitForFunction(() => /Teste enviado a 1 aparelho/.test(document.querySelector('[data-testid="push-msg"]')?.textContent || ''));
  estado.enviadosNoTeste = 0;
  await p.getByTestId('push-testar').click();
  await p.getByTestId('push-erro').waitFor();
  assert.match(await p.getByTestId('push-erro').innerText(), /Nenhum aparelho recebeu/);
  ok('A2: teste mostra quantos aparelhos receberam, e avisa quando nenhum recebeu');

  await p.getByTestId('push-desativar').click();
  await p.waitForFunction(() => /Desligado neste aparelho/.test(document.querySelector('[data-testid="push-estado"]')?.textContent || ''));
  assert.equal((await p.evaluate(() => window.__push)).desinscreveu, 1);
  assert.equal(feitas('DELETE', `/api/push/inscricoes/${MEU}`).length, 1, 'apagou no servidor');
  assert.equal(estado.itens.length, 0);
  assert.equal(await p.getByTestId('push-item').count(), 0);
  ok('A3: desligar apaga no servidor e no aparelho');
  await p.context().close();

  // B. permissão negada ao pedir
  p = await abrir({ permissaoAoPedir: 'denied' });
  await p.getByTestId('push-ativar').click();
  await p.getByTestId('push-erro').waitFor();
  assert.match(await p.getByTestId('push-erro').innerText(), /bloqueou/);
  assert.equal(feitas('POST', '/api/push/inscricoes').length, 2, 'nada novo foi ao servidor (só os dois da cena A: ligar e o reenvio do desligar)');
  assert.equal(await p.getByTestId('push-ativar').count(), 0);
  assert.equal(await p.getByTestId('push-bloqueado').count(), 1);
  await p.context().close();
  ok('B: permissão negada mostra o motivo e não inscreve');

  // C. já bloqueado, sem suporte, recurso desligado no servidor
  p = await abrir({ permissaoInicial: 'denied' });
  assert.equal(await p.getByTestId('push-bloqueado').count(), 1);
  assert.equal(await p.getByTestId('push-ativar').count(), 0);
  await p.context().close();
  p = await abrir({ comSuporte: false });
  assert.match(await p.getByTestId('push-sem-suporte').innerText(), /tela de início/);
  assert.equal(await p.getByTestId('push-ativar').count(), 0);
  await semRolagem(p, 'sem suporte (390)');
  await p.context().close();
  estado.desligado = true;
  p = await abrir();
  await p.getByTestId('push-fora').waitFor();
  assert.equal(await p.getByTestId('push-ativar').count(), 0, 'servidor sem o recurso: nenhum botão que não funciona');
  await p.context().close();
  estado.desligado = false;
  ok('C: bloqueado, sem suporte (com a dica do iPhone) e servidor desligado têm texto próprio e nenhum botão inútil');

  // D. remover outro aparelho pede confirmação
  estado.itens = [{ id: OUTRO, aparelho: 'Celular Android · Chrome', criadoEm: '2026-10-30T09:00:00Z', ultimoEnvio: '2026-10-31T09:00:00Z' }];
  p = await abrir({ viewport: { width: 1366, height: 800 }, tema: 'dark' });
  await p.getByTestId('push-item').waitFor();
  assert.match(await p.getByTestId('push-item').first().innerText(), /Celular Android · Chrome/);
  await p.getByTestId('push-remover').click();
  assert.equal(feitas('DELETE', `/api/push/inscricoes/${OUTRO}`).length, 0, 'remover pede confirmação na tela');
  await p.getByTestId('push-remover-nao').click();
  assert.equal(feitas('DELETE', `/api/push/inscricoes/${OUTRO}`).length, 0);
  await p.getByTestId('push-remover').click();
  await p.getByTestId('push-remover-sim').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="push-item"]').length === 0);
  assert.equal(feitas('DELETE', `/api/push/inscricoes/${OUTRO}`).length, 1);
  await semRolagem(p, 'desktop escuro');
  await p.context().close();
  ok('D: remover outro aparelho confirma na tela (desktop, escuro)');

  // E. build: o service worker não faz pedido de rede nem guarda nada
  const sw = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
  assert.ok(!/fetch\s*\(|XMLHttpRequest|localStorage|caches\./.test(sw), 'sw.js só mostra aviso e abre o site');
  assert.match(sw, /showNotification/); assert.match(sw, /notificationclick/);
  const man = JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(man.start_url, '/'); assert.equal(man.display, 'standalone');
  ok('E: sw.js sem rede nem armazenamento; manifesto com início "/" e modo aplicativo');

  assert.deepEqual(erros, [], 'erros de página ou diálogos: ' + erros.join(' | '));
} finally {
  await b.close();
  servidor.close();
}
