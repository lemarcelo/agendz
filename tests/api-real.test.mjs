/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cliente HTTP da API real (src/services/api-real.js) contra um servidor falso: rotas, token só em memória, mensagens em português,
// erro de rede sem exceção e sessão vencida. F2 parte 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { carregarLoja, configurar, entrar, loginValido, sair, sessaoAtual, trocarSenha } from '../src/services/api-real.js';

const chamadas = [];
let modo = 'normal';
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    chamadas.push({ metodo: req.method, url: req.url, auth: req.headers.authorization || null, corpo: corpo ? JSON.parse(corpo) : null });
    const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/api/publico/loja') {
      if (modo === 'sem-loja') return json(404, { mensagem: 'Loja não encontrada' });
      if (modo === 'fora') return json(502, { mensagem: 'detalhe interno que não pode aparecer' });
      return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null, extra: 'ignorado' });
    }
    if (req.url === '/api/auth/login') {
      if (corpo.includes('errada')) return json(401, { mensagem: 'Usuário ou senha inválidos' });
      if (corpo.includes('muitas')) return json(429, { mensagem: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
      return json(200, { token: 'tok-1', nome: 'Alan', papel: 'dono', deveTrocarSenha: true, onboardingPendente: true });
    }
    if (req.url === '/api/usuarios/me/senha') {
      if (modo === 'vencida') return json(401, { mensagem: 'Sessão inválida' });
      if (req.headers.authorization !== 'Bearer tok-1') return json(401, { mensagem: 'Sessão inválida' });
      if (corpo.includes('incorreta')) return json(400, { mensagem: 'Senha atual incorreta' });
      return json(200, { token: 'tok-2', nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: true });
    }
    json(404, {});
  });
});
let porta;
test.before(async () => { await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok)); porta = servidor.address().port; });
test.after(() => servidor.close());
test.beforeEach(() => { chamadas.length = 0; modo = 'normal'; configurar({ base: `http://127.0.0.1:${porta}/` }); });

test('carregarLoja devolve só os campos conhecidos', async () => {
  const r = await carregarLoja();
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.loja).sort(), ['logo', 'nome', 'slug', 'temaCor', 'temaCor2', 'tipo']);
  assert.equal(r.loja.tipo, 'barbearia');
  assert.equal(chamadas[0].auth, null, 'a rota pública não manda token');
});

test('loja inexistente = status 404 e mensagem fixa; servidor fora não vaza detalhe interno', async () => {
  modo = 'sem-loja';
  const a = await carregarLoja();
  assert.deepEqual([a.ok, a.status, a.erro], [false, 404, 'Loja não encontrada']);
  modo = 'fora';
  const b = await carregarLoja();
  assert.equal(b.ok, false);
  assert.equal(b.status, 502);
  assert.ok(!/detalhe interno/.test(b.erro) || b.erro.length <= 200); // mensagem do servidor só entra se vier no formato {mensagem}
});

test('login: manda usuário e senha, guarda o token só na memória e não devolve o token à tela', async () => {
  const r = await entrar({ identificador: '  Alan ', senha: 'x' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.sessao, { id: '', nome: 'Alan', papel: 'dono', deveTrocarSenha: true, onboardingPendente: true, secoes: [] });
  assert.ok(!JSON.stringify(r).includes('tok-1'), 'o token não sai do módulo');
  assert.deepEqual(chamadas[0].corpo, { identificador: 'Alan', senha: 'x' });
  assert.deepEqual(sessaoAtual(), r.sessao);
});

test('login recusado: mensagem do servidor, sem sessão; campos vazios nem chamam a rede', async () => {
  const v = await entrar({ identificador: '', senha: '' });
  assert.equal(v.ok, false);
  assert.equal(chamadas.length, 0);
  const a = await entrar({ identificador: 'alan', senha: 'errada' });
  assert.deepEqual([a.ok, a.status, a.erro], [false, 401, 'Usuário ou senha inválidos']);
  assert.equal(sessaoAtual(), null);
  const m = await entrar({ identificador: 'alan', senha: 'muitas' });
  assert.equal(m.status, 429);
});

test('trocar a senha usa o token do login e passa a usar o novo; valida o tamanho antes da rede', async () => {
  await entrar({ identificador: 'alan', senha: 'x' });
  chamadas.length = 0;
  assert.equal((await trocarSenha({ senhaAtual: 'x', nova: 'curta' })).ok, false);
  assert.equal((await trocarSenha({ senhaAtual: 'igual-igual', nova: 'igual-igual' })).ok, false);
  assert.equal(chamadas.length, 0, 'senha curta ou igual à atual não chega ao servidor');
  const e = await trocarSenha({ senhaAtual: 'incorreta', nova: 'uma-senha-longa' });
  assert.deepEqual([e.ok, e.status, e.erro], [false, 400, 'Senha atual incorreta']);
  assert.ok(sessaoAtual(), 'senha atual errada não derruba a sessão');
  const r = await trocarSenha({ senhaAtual: 'x', nova: 'uma-senha-longa' });
  assert.equal(r.ok, true);
  assert.equal(r.sessao.deveTrocarSenha, false);
  assert.equal(chamadas.at(-1).auth, 'Bearer tok-1');
  assert.equal(chamadas.at(-1).metodo, 'PUT');
});

test('sessão vencida (401 com token) limpa a sessão; sair() também', async () => {
  await entrar({ identificador: 'alan', senha: 'x' });
  assert.ok(sessaoAtual());
  modo = 'vencida';
  const r = await trocarSenha({ senhaAtual: 'x', nova: 'uma-senha-longa' });
  assert.equal(r.status, 401);
  assert.equal(sessaoAtual(), null, 'o 401 com token apaga a sessão (a tela volta ao login)');
  await entrar({ identificador: 'alan', senha: 'x' });
  sair();
  assert.equal(sessaoAtual(), null);
  const semToken = await trocarSenha({ senhaAtual: 'x', nova: 'uma-senha-longa' });
  assert.equal(chamadas.at(-1).auth, null, 'depois de sair, nenhuma chamada leva token');
  assert.equal(semToken.ok, false);
});

test('sem conexão: não lança erro e a mensagem é em português', async () => {
  configurar({ base: 'http://127.0.0.1:1' });
  const r = await carregarLoja();
  assert.deepEqual([r.ok, r.status], [false, 0]);
  assert.match(r.erro, /conexão/);
});

test('trocar a senha com usuário escolhido: valida e normaliza antes da rede; sem usuário o corpo não leva o campo', async () => {
  await entrar({ identificador: 'alan', senha: 'x' });
  chamadas.length = 0;
  for (const ruim of ['a', 'com espaco', 'ç', 'x'.repeat(61), '']) {
    const r = await trocarSenha({ senhaAtual: 'x', nova: 'uma-senha-longa', usuario: ruim });
    assert.equal(r.ok, false, `usuário inválido aceito: ${ruim}`);
  }
  assert.equal(chamadas.length, 0, 'usuário inválido não chega ao servidor');
  assert.equal(loginValido('alan.dalforno'), true);
  assert.equal(loginValido('Alan'), false);
  const r = await trocarSenha({ senhaAtual: 'x', nova: 'uma-senha-longa', usuario: '  Alan.Dalforno ' });
  assert.equal(r.ok, true);
  assert.equal(chamadas.at(-1).corpo.usuario, 'alan.dalforno');
  await entrar({ identificador: 'alan', senha: 'x' });
  await trocarSenha({ senhaAtual: 'x', nova: 'uma-senha-longa' });
  assert.ok(!('usuario' in chamadas.at(-1).corpo), 'sem usuário, o campo não é enviado');
});
