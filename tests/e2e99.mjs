/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aparelho confiável (v125, B8) no site real, contra um servidor de mentira: depois do login com "Login automático" a pergunta oferece REDE (computador) e APARELHO (celular),
// com a sugestão certa para cada um; "Só neste aparelho" manda o nome vindo do navegador e guarda o token longo; reabrir entra direto; Meu perfil lista e remove (o aparelho em
// uso desconecta); erro do servidor (limite de 5) aparece e não entra; "Agora não" não guarda nada; 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const ALAN = '00000000-0000-4000-8000-000000000001';
const APARELHO_ID = '00000000-0000-4000-8000-0000000000bb';
const CURTO = 'aaaaaaaaaa.curto000000.cccccccccc';
const LONGO = 'aaaaaaaaaa.aparelho00.cccccccccc';
const CHAVE = 'agendz-rede:dalforno';
const UA_CELULAR = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const chamadas = [];
const estado = { aparelhos: [], longoValido: true, recusarConfiar: false };
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
    if (u.pathname === '/api/auth/login') return json(200, sessao(c.loginAutomatico ? { perguntarRede: true } : {}));
    if (u.pathname === '/api/auth/aparelhos-confiaveis' && req.method === 'POST') {
      if (estado.recusarConfiar) return json(409, { mensagem: 'Você já tem 5 aparelhos confiáveis. Remova um em Meu perfil para adicionar outro.' });
      if (auth !== `Bearer ${CURTO}`) return json(403, { mensagem: 'Para confiar neste aparelho, entre de novo agora (com a senha ou a digital).' });
      estado.aparelhos = [{ id: APARELHO_ID, rotulo: c.rotulo || 'Este aparelho', criadoEm: '2026-10-31T10:00:00Z', ultimoUso: '2026-10-31T10:05:00Z', atual: true }];
      estado.longoValido = true;
      return json(200, sessao({ token: LONGO, redeConfiavel: true }));
    }
    if (u.pathname === '/api/auth/sessao') {
      if (auth !== `Bearer ${LONGO}` || !estado.longoValido) return json(401, { mensagem: 'Sessão encerrada. Entre de novo.' });
      return json(200, sessao({ token: LONGO, redeConfiavel: true }));
    }
    if (u.pathname === '/api/auth/sair') { estado.longoValido = false; estado.aparelhos = []; return json(204); }
    if (u.pathname === '/api/usuarios/me/aparelhos-confiaveis' && req.method === 'GET') return json(200, estado.aparelhos);
    const rem = /^\/api\/usuarios\/me\/aparelhos-confiaveis\/([^/]+)$/.exec(u.pathname);
    if (rem && req.method === 'DELETE') { estado.aparelhos = []; estado.longoValido = false; return json(204); }
    if (u.pathname === '/api/usuarios/me/redes-confiaveis') return json(200, []);
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
const url = `http://localhost:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];

async function abrir({ viewport = { width: 390, height: 800 }, userAgent = UA_CELULAR } = {}) {
  const ctx = await b.newContext({ viewport, userAgent, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript(() => { window.PublicKeyCredential.isConditionalMediationAvailable = async () => false; });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  return p;
}
const guardado = (p) => p.evaluate((k) => localStorage.getItem(k), CHAVE);
const semRolagem = async (p, onde) => assert.ok(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `rolagem lateral em ${onde}`);
const entrar = async (p, auto) => {
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha');
  if (auto) await p.getByTestId('login-auto').check();
  await p.getByTestId('login-entrar').click();
};
const ordemDosBlocos = (p) => p.evaluate(() => [...document.querySelectorAll('[data-testid="pergunta-rede"] > div[data-testid^="pergunta-rede-"]')].map((e) => e.dataset.testid));

try {
  // A. celular: a sugestão é o aparelho (vem primeiro); "Sim" manda o nome do navegador e guarda o token longo
  let p = await abrir();
  await entrar(p, true);
  await p.getByTestId('pergunta-rede').waitFor();
  assert.deepEqual(await ordemDosBlocos(p), ['pergunta-rede-aparelho', 'pergunta-rede-rede']);
  assert.match(await p.getByTestId('pergunta-rede').innerText(), /Deseja logar automaticamente\?/);
  assert.match(await p.getByTestId('pergunta-rede-aparelho').innerText(), /em qualquer rede/);
  await semRolagem(p, 'pergunta com aparelho e rede (celular)');
  assert.equal(await p.getByTestId('agenda-dia').count(), 0, 'o painel só abre depois da resposta');
  await p.getByTestId('aparelho-sim').click();
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await guardado(p), LONGO);
  const post = chamadas.filter((x) => x.u === '/api/auth/aparelhos-confiaveis').pop();
  assert.deepEqual(post.corpo, { rotulo: 'Celular Android · Chrome' });
  assert.equal(post.auth, `Bearer ${CURTO}`, 'a confiança sai com a sessão recém-aberta');
  assert.ok(!chamadas.some((x) => x.u === '/api/auth/redes-confiaveis'), 'aparelho não cria rede confiável');
  ok('A: celular sugere o aparelho; "Sim" manda o nome do navegador e guarda só o token longo');

  // B. reabrir o site entra direto
  const antesB = chamadas.length;
  await p.reload();
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await p.getByTestId('login-id').count(), 0);
  assert.equal(chamadas.slice(antesB).find((x) => x.u === '/api/auth/sessao').auth, `Bearer ${LONGO}`);
  assert.ok(!chamadas.slice(antesB).some((x) => x.u === '/api/auth/login'), 'sem pedir login');
  ok('B: reabrir o site entra direto, conferindo o token no servidor');

  // C. Meu perfil: lista o aparelho; remover pede confirmação; remover o aparelho em uso desconecta e limpa o aparelho
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('perfil-aparelhos').waitFor();
  assert.match(await p.getByTestId('aparelhos-item').first().innerText(), /Celular Android · Chrome · este aparelho/);
  await semRolagem(p, 'Meu perfil com aparelhos');
  await p.getByTestId('aparelhos-remover').click();
  assert.equal(chamadas.filter((x) => x.m === 'DELETE').length, 0, 'remover pede confirmação na tela');
  assert.match(await p.getByTestId('aparelhos-aviso-atual').innerText(), /desconectado/);
  await p.getByTestId('aparelhos-remover-nao').click();
  assert.equal(chamadas.filter((x) => x.m === 'DELETE').length, 0, 'Voltar não remove');
  await p.getByTestId('aparelhos-remover').click();
  await p.getByTestId('aparelhos-remover-sim').click();
  await p.getByTestId('login-id').waitFor();
  assert.equal(await guardado(p), null, 'removeu o aparelho em uso: nada fica guardado');
  assert.equal(chamadas.filter((x) => x.m === 'DELETE').length, 1);
  await p.reload();
  await p.getByTestId('login-id').waitFor();
  ok('C: Meu perfil lista e remove; remover o aparelho em uso desconecta e limpa o aparelho');
  await p.context().close();

  // D. computador: a sugestão é a rede (vem primeiro); os dois botões existem; "Agora não" não guarda nada
  p = await abrir({ viewport: { width: 1280, height: 860 }, userAgent: UA_PC });
  await entrar(p, true);
  await p.getByTestId('pergunta-rede').waitFor();
  assert.deepEqual(await ordemDosBlocos(p), ['pergunta-rede-rede', 'pergunta-rede-aparelho']);
  assert.equal(await p.getByTestId('rede-sim').count(), 1);
  assert.equal(await p.getByTestId('aparelho-sim').count(), 1);
  const antesD = chamadas.length;
  await p.getByTestId('rede-nao').click();
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await guardado(p), null, 'Agora não: nada guardado');
  assert.ok(!chamadas.slice(antesD).some((x) => /confiaveis/.test(x.u)), 'Agora não: nada enviado ao servidor');
  ok('D: computador sugere a rede; "Agora não" entra sem guardar nem enviar nada');

  // E. servidor recusa (limite de 5): a mensagem dele aparece, a pessoa continua na pergunta e ainda pode entrar sem confiar
  await p.getByTestId('sair').click();
  await p.getByTestId('login-id').waitFor();
  estado.recusarConfiar = true;
  await entrar(p, true);
  await p.getByTestId('pergunta-rede').waitFor();
  await p.getByTestId('aparelho-sim').click();
  await p.getByTestId('rede-erro').waitFor();
  assert.match(await p.getByTestId('rede-erro').innerText(), /5 aparelhos confiáveis/);
  assert.equal(await guardado(p), null);
  assert.equal(await p.getByTestId('agenda-dia').count(), 0, 'erro: continua na pergunta');
  await p.getByTestId('aparelho-sim').click(); // o botão voltou a funcionar (não travou em "Salvando…")
  await p.getByTestId('rede-erro').waitFor();
  await p.getByTestId('rede-nao').click();
  await p.getByTestId('agenda-dia').waitFor();
  estado.recusarConfiar = false;
  ok('E: limite de aparelhos: a mensagem do servidor aparece, o botão não trava e dá para entrar sem confiar');

  // F. sem marcar "Login automático" ninguém pergunta e nada é guardado
  await p.getByTestId('sair').click();
  await p.getByTestId('login-id').waitFor();
  await entrar(p, false);
  await p.getByTestId('agenda-dia').waitFor();
  assert.equal(await p.getByTestId('pergunta-rede').count(), 0);
  assert.equal(await guardado(p), null);
  ok('F: login sem a caixa não pergunta nem guarda');
} finally {
  await b.close(); servidor.close();
}
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e99 ok');
