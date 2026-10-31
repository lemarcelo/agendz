/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B6 (site real, servidor falso): mais de um proprietário. Promover, rebaixar ou cadastrar proprietário pede a SENHA de quem faz (campo `eq-confirma-senha`);
// refazer a senha de outro proprietário também; perfil sem proprietário não pede. Senha errada = 403 do servidor e a sessão continua. As regras de verdade estão em UsuariosTest.
// O mesmo fluxo no Artifact está em tests/proprietarios.test.mjs (unidade) e na parte 2 deste arquivo.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const chamadas = [];
const MEU = '00000000-0000-4000-8000-0000000000aa';
let loja = { slug: 'apex', nome: 'Apex Estética Automotiva', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null };
let papel = 'dono';
let secoes = ['clientes', 'servicos', 'estabelecimento', 'agenda', 'estoque', 'financeiro'];
let seq = 0;
let banco = [{ id: MEU, nome: 'Davi Souza', apelido: 'Davi', usuario: 'davi', papel: 'dono', atende: true, podeVender: true, comissaoPct: null, permissoes: {}, corSlot: 0, deveTrocarSenha: false, cpfMascarado: '529.***.***-25' }];
const SENHA = 'Zq7mKd4Wp9Xe';

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: req.url, auth: req.headers.authorization || null, corpo: c });
    if (req.url === '/api/publico/loja') return json(200, loja);
    if (req.url === '/api/auth/login') return json(200, { token: 'tok-login', id: MEU, nome: papel === 'dono' ? 'Davi' : 'Pablo', papel, deveTrocarSenha: false, onboardingPendente: false, secoes });
    if (req.headers.authorization !== 'Bearer tok-login') return json(401, { mensagem: 'Sessão inválida' });
    if (papel !== 'dono' && req.url.startsWith('/api/usuarios')) return json(403, { mensagem: 'Sem permissão' });
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/usuarios' && req.method === 'GET') return json(200, banco);
    if (url.pathname === '/api/usuarios' && req.method === 'POST') {
      if (c.papel === 'dono' && c.confirmaSenha !== '1234') return json(403, { mensagem: 'Senha incorreta' });
      if (!String(c.nome || '').trim() || !String(c.apelido || '').trim()) return json(400, { mensagem: 'Informe o nome e o apelido.' });
      if (banco.some((x) => x.apelido.toLowerCase() === c.apelido.toLowerCase())) return json(409, { mensagem: 'Já existe alguém com esse apelido.' });
      if ('senha' in c) return json(400, { mensagem: 'Campo não aceito' });
      const novo = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, nome: c.nome, apelido: c.apelido, usuario: c.usuario || c.apelido.toLowerCase(), papel: c.papel, atende: c.atende !== false, podeVender: c.podeVender !== false, comissaoPct: c.comissaoPct ?? null, permissoes: c.permissoes || {}, corSlot: seq, deveTrocarSenha: true, email: c.email, cpfMascarado: c.cpf ? '111.***.***-35' : undefined, cpf: (c.cpf || '').replace(/\D/g, '') || undefined };
      banco.push(novo);
      return json(201, { usuario: novo, senhaTemporaria: SENHA });
    }
    let m = url.pathname.match(/^\/api\/usuarios\/([0-9a-f-]{36})(\/atendimento|\/senha-temporaria)?$/);
    if (m) {
      const x = banco.find((y) => y.id === m[1]);
      if (!x) return json(404, { mensagem: 'Usuário não encontrado.' });
      if (m[2] === '/atendimento') {
        if (!c.atende && x.apelido === 'Pablo') return json(409, { mensagem: 'Pablo ainda tem 2 agendamentos futuros (a confirmar ou confirmado). Remarque ou cancele antes de desativar.' });
        x.atende = c.atende; return json(200, x);
      }
      if (m[2] === '/senha-temporaria') {
        if (x.papel === 'dono' && (!c || c.confirmaSenha !== '1234')) return json(403, { mensagem: 'Senha incorreta' }); x.deveTrocarSenha = true; return json(200, { usuario: x, senhaTemporaria: 'Nv5tHc8Ra3Lw' }); }
      if (req.method === 'GET') return json(200, x);
      if (req.method === 'PUT') {
        if (c.papel && (c.papel === 'dono') !== (x.papel === 'dono') && c.confirmaSenha !== '1234') return json(403, { mensagem: 'Senha incorreta' });
        if (x.papel === 'dono' && c.papel && c.papel !== 'dono' && banco.filter((y) => y.papel === 'dono').length < 2) return json(409, { mensagem: 'É preciso ter pelo menos um proprietário.' });
        const { confirmaSenha, ...resto } = c; Object.assign(x, resto); return json(200, x);
      }
      if (req.method === 'DELETE') {
        if (x.apelido === 'Pablo') return json(409, { mensagem: 'Esse usuário tem histórico de agendamentos e não pode ser removido. Desative-o: o histórico fica e ele deixa de receber novos agendamentos.' });
        banco = banco.filter((y) => y !== x); return json(204);
      }
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
  await p.getByTestId('login-id').fill('davi'); await p.getByTestId('login-senha').fill('qualquer'); await p.getByTestId('login-entrar').click();
  await p.locator('.nav button').first().waitFor();
  return { ctx, p };
}
const semRolagem = async (p, nome) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${nome}: rolagem horizontal em 390 px`);


{
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-equipe').click();
  await p.getByTestId('eq-lista').waitFor();
  const ana = banco.find((x) => x.apelido === 'Ana') || (() => { const n = { id: '00000000-0000-4000-8000-0000000000b1', nome: 'Ana Souza', apelido: 'Ana', usuario: 'ana', papel: 'atendente', atende: false, podeVender: true, comissaoPct: null, permissoes: {}, corSlot: 1, deveTrocarSenha: false, cpfMascarado: null }; banco.push(n); return n; })();
  await p.reload(); await p.getByTestId('login-id').fill('davi'); await p.getByTestId('login-senha').fill('x'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-equipe').click(); await p.getByTestId('eq-lista').waitFor();
  // promover a Ana: o campo da senha só aparece ao escolher Proprietário
  await p.getByTestId(`editar-${ana.id}`).click();
  await p.getByTestId('eq-form').waitFor();
  assert.equal(await p.getByTestId('eq-confirma-senha').count(), 0, 'perfil sem proprietário não pede senha');
  await p.getByTestId('eq-papel').selectOption('dono');
  assert.equal(await p.getByTestId('eq-confirma-senha').count(), 1);
  assert.match(await p.getByTestId('eq-papel').innerText(), /Proprietário/);
  assert.ok(!/\bDono\b/.test(await p.getByTestId('eq-form').innerText()), 'texto visível diz proprietário');
  await p.getByTestId('eq-confirma-senha').fill('errada'); await p.getByTestId('salvar-pessoa').click();
  assert.match(await p.getByTestId('eq-erro').innerText(), /Senha incorreta/);
  assert.equal(banco.find((x) => x.id === ana.id).papel, 'atendente', 'senha errada não muda nada');
  await p.getByTestId('eq-confirma-senha').fill('1234'); await p.getByTestId('salvar-pessoa').click();
  await p.getByTestId('eq-salvo').waitFor();
  assert.equal(banco.find((x) => x.id === ana.id).papel, 'dono');
  assert.equal(chamadas.filter((c) => c.m === 'PUT' && c.u.endsWith(ana.id)).at(-1).corpo.confirmaSenha, '1234');
  // refazer a senha de outro proprietário pede a senha de quem faz; a senha digitada não fica na tela depois
  await p.getByTestId(`senha-${ana.id}`).click();
  await p.getByTestId(`eq-refazer-${ana.id}`).waitFor();
  assert.equal(chamadas.filter((c) => c.u.endsWith('/senha-temporaria')).length, 0, 'nada enviado antes de digitar a senha');
  await p.getByTestId(`eq-refazer-senha-${ana.id}`).fill('errada'); await p.getByTestId(`eq-refazer-sim-${ana.id}`).click();
  assert.match(await p.getByTestId('eq-erro-lista').innerText(), /Senha incorreta/);
  await p.getByTestId(`eq-refazer-senha-${ana.id}`).fill('1234'); await p.getByTestId(`eq-refazer-sim-${ana.id}`).click();
  await p.getByTestId('equipe-senha').waitFor();
  assert.equal(await p.getByTestId('equipe-senha-valor').innerText(), 'Nv5tHc8Ra3Lw');
  await p.getByTestId('equipe-senha-anotei').click();
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('input')].filter((i) => i.value === '1234').length), 0, 'a senha de confirmação não fica em nenhum campo depois de usada');
  // refazer a senha de quem NÃO é proprietário não pede senha
  const pablo = banco.find((x) => x.apelido === 'Pablo');
  if (pablo) { await p.getByTestId(`senha-${pablo.id}`).click(); await p.getByTestId('equipe-senha').waitFor(); await p.getByTestId('equipe-senha-anotei').click(); }
  // rebaixar a Ana de volta (agora há dois): pede a senha de novo
  await p.getByTestId(`editar-${ana.id}`).click(); await p.getByTestId('eq-form').waitFor();
  await p.getByTestId('eq-papel').selectOption('atendente');
  await p.getByTestId('eq-confirma-senha').fill('1234'); await p.getByTestId('salvar-pessoa').click();
  await p.getByTestId('eq-salvo').waitFor();
  assert.equal(banco.find((x) => x.id === ana.id).papel, 'atendente');
  // 390 px: o campo da senha não cria rolagem lateral
  await p.setViewportSize({ width: 390, height: 800 });
  await p.getByTestId(`editar-${ana.id}`).click(); await p.getByTestId('eq-form').waitFor();
  await p.getByTestId('eq-papel').selectOption('dono');
  await semRolagem(p, 'campo da senha do proprietário');
  ok('site real: promover/rebaixar/refazer senha de proprietário pedem a senha; perfil comum não');
  await ctx.close();
}

await b.close();
servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e112 ok');
