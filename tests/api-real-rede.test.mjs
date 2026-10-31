/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Login automático por rede confiável no cliente (v119): o pedido só leva `loginAutomatico` quando marcado; só o token de rede confiável pode ser guardado;
// reabrir com o token guardado confere no servidor (GET /api/auth/sessao) e recusa token de outro formato; listar/remover/encerrar falam só com as rotas certas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aparelhos, configurar, entrar, redes, restaurar, sair, sessaoAtual, tokenDeRedeConfiavel } from '../src/services/api-real.js';

const JWT = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
const ID = '00000000-0000-4000-8000-000000000001';
let chamadas;
function servidor(respostas) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    const caminho = String(url).replace('https://loja.teste', '');
    chamadas.push({ url: caminho, metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
    const r = respostas[`${init.method} ${caminho}`] || { status: 404, corpo: {} };
    return { ok: r.status < 400, status: r.status, json: async () => { if (r.corpo === undefined) throw new Error('sem corpo'); return r.corpo; } };
  };
}
const sessaoJson = (extra = {}) => ({ token: JWT, id: ID, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'], redeConfiavel: false, perguntarRede: false, ...extra });
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('entrar: loginAutomatico só vai quando marcado; perguntarRede e redeConfiavel vêm da sessão', async () => {
  servidor({ 'POST /api/auth/login': { status: 200, corpo: sessaoJson({ perguntarRede: true }) } });
  let r = await entrar({ identificador: 'alan', senha: '1234', loginAutomatico: true });
  assert.equal(r.sessao.perguntarRede, true);
  assert.equal(r.sessao.redeConfiavel, false);
  assert.deepEqual(chamadas[0].corpo, { identificador: 'alan', senha: '1234', loginAutomatico: true });
  await entrar({ identificador: 'alan', senha: '1234' });
  assert.deepEqual(chamadas[1].corpo, { identificador: 'alan', senha: '1234' });
  assert.equal(tokenDeRedeConfiavel(), null, 'token comum (24 h) nunca é entregue para guardar');
});

test('confiar na rede: troca para o token longo e só então ele pode ser guardado; o corpo leva só o nome', async () => {
  servidor({ 'POST /api/auth/login': { status: 200, corpo: sessaoJson({ perguntarRede: true }) }, 'POST /api/auth/redes-confiaveis': { status: 200, corpo: sessaoJson({ token: 'dddddddddd.eeeeeeeeee.ffffffffff', redeConfiavel: true }) } });
  await entrar({ identificador: 'alan', senha: '1234', loginAutomatico: true });
  const r = await redes.confiar('  Casa  ');
  assert.equal(r.ok, true);
  assert.deepEqual(chamadas[1].corpo, { rotulo: 'Casa' });
  assert.equal(chamadas[1].auth, `Bearer ${JWT}`);
  assert.equal(tokenDeRedeConfiavel(), 'dddddddddd.eeeeeeeeee.ffffffffff');
  assert.equal(sessaoAtual().perguntarRede, false);
});

test('confiar: resposta sem token de rede confiável é erro (nada fica guardável)', async () => {
  servidor({ 'POST /api/auth/login': { status: 200, corpo: sessaoJson() }, 'POST /api/auth/redes-confiaveis': { status: 200, corpo: sessaoJson() } });
  await entrar({ identificador: 'alan', senha: '1234' });
  const r = await redes.confiar('');
  assert.equal(r.ok, false);
  assert.equal(tokenDeRedeConfiavel(), null);
});

test('restaurar: confere no servidor e devolve a sessão com o mesmo token; formato estranho nem sai da memória; 401 limpa', async () => {
  servidor({});
  assert.equal((await restaurar('qualquer coisa')).ok, false);
  assert.equal(chamadas.length, 0, 'token de formato errado não vai ao servidor');
  servidor({ 'GET /api/auth/sessao': { status: 200, corpo: sessaoJson({ token: JWT, redeConfiavel: true }) } });
  let r = await restaurar(JWT);
  assert.equal(r.ok, true);
  assert.equal(chamadas[0].auth, `Bearer ${JWT}`);
  assert.equal(sessaoAtual().redeConfiavel, true);
  assert.equal(tokenDeRedeConfiavel(), JWT);
  sair();
  servidor({ 'GET /api/auth/sessao': { status: 200, corpo: sessaoJson({ token: 'outro.outro.outro-token', redeConfiavel: true }) } });
  r = await restaurar(JWT);
  assert.equal(r.ok, false, 'o servidor devolveu outro token: não vale');
  assert.equal(sessaoAtual(), null);
  servidor({ 'GET /api/auth/sessao': { status: 401, corpo: { mensagem: 'Sessão encerrada. Entre de novo.' } } });
  r = await restaurar(JWT);
  assert.equal(r.status, 401);
  assert.equal(sessaoAtual(), null);
});

test('encerrar chama POST /api/auth/sair com o token; token comum não chama nada', async () => {
  servidor({ 'POST /api/auth/login': { status: 200, corpo: sessaoJson() }, 'POST /api/auth/sair': { status: 204, corpo: undefined } });
  await entrar({ identificador: 'alan', senha: '1234' });
  await redes.encerrar();
  assert.equal(chamadas.filter((c) => c.url === '/api/auth/sair').length, 0);
  servidor({ 'GET /api/auth/sessao': { status: 200, corpo: sessaoJson({ redeConfiavel: true }) }, 'POST /api/auth/sair': { status: 204, corpo: undefined } });
  await restaurar(JWT);
  await redes.encerrar();
  assert.equal(chamadas[1].url, '/api/auth/sair');
  assert.equal(chamadas[1].auth, `Bearer ${JWT}`);
});

test('listar e remover: leitura defensiva e id validado antes de ir ao servidor', async () => {
  servidor({ 'GET /api/usuarios/me/redes-confiaveis': { status: 200, corpo: [{ id: ID, rotulo: 'Casa', criadoEm: '2026-10-30T10:00:00Z', ultimoUso: null, atual: true }, { id: 'x', rotulo: 'lixo' }, null] }, [`DELETE /api/usuarios/me/redes-confiaveis/${ID}`]: { status: 204, corpo: undefined } });
  const r = await redes.listar();
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].atual, true);
  assert.equal((await redes.remover('../x')).ok, false);
  assert.equal(chamadas.length, 1, 'id inválido não vai ao servidor');
  assert.equal((await redes.remover(ID)).ok, true);
});

test('aparelho confiável: confiar leva só o nome e troca para o token longo; listar e remover usam as rotas de aparelho, com id validado', async () => {
  const longo = 'gggggggggg.hhhhhhhhhh.iiiiiiiiii';
  servidor({
    'POST /api/auth/login': { status: 200, corpo: sessaoJson({ perguntarRede: true }) },
    'POST /api/auth/aparelhos-confiaveis': { status: 200, corpo: sessaoJson({ token: longo, redeConfiavel: true }) },
    'GET /api/usuarios/me/aparelhos-confiaveis': { status: 200, corpo: [{ id: ID, rotulo: 'Celular Android · Chrome', criadoEm: '2026-10-31T10:00:00Z', ultimoUso: '2026-10-31T11:00:00Z', atual: true }, { id: 'x', rotulo: 'lixo' }, null] },
    [`DELETE /api/usuarios/me/aparelhos-confiaveis/${ID}`]: { status: 204, corpo: undefined },
  });
  await entrar({ identificador: 'alan', senha: '1234', loginAutomatico: true });
  const c = await aparelhos.confiar('  Celular Android · Chrome  ');
  assert.equal(c.ok, true);
  assert.deepEqual(chamadas[1].corpo, { rotulo: 'Celular Android · Chrome' });
  assert.equal(chamadas[1].auth, `Bearer ${JWT}`);
  assert.equal(tokenDeRedeConfiavel(), longo, 'o token de aparelho pode ser guardado no aparelho');
  assert.equal(sessaoAtual().perguntarRede, false);
  const l = await aparelhos.listar();
  assert.equal(l.itens.length, 1);
  assert.equal(l.itens[0].atual, true);
  assert.equal((await aparelhos.remover('../x')).ok, false);
  assert.equal(chamadas.length, 3, 'id inválido não vai ao servidor');
  assert.equal((await aparelhos.remover(ID)).ok, true);
});

test('aparelho confiável: resposta sem token longo é erro e nada fica guardável; 403/409 do servidor chegam com a mensagem dele', async () => {
  servidor({ 'POST /api/auth/login': { status: 200, corpo: sessaoJson() }, 'POST /api/auth/aparelhos-confiaveis': { status: 200, corpo: sessaoJson() } });
  await entrar({ identificador: 'alan', senha: '1234' });
  const r = await aparelhos.confiar('');
  assert.equal(r.ok, false);
  assert.equal(tokenDeRedeConfiavel(), null);
  servidor({ 'POST /api/auth/login': { status: 200, corpo: sessaoJson() }, 'POST /api/auth/aparelhos-confiaveis': { status: 409, corpo: { mensagem: 'Você já tem 5 aparelhos confiáveis. Remova um em Meu perfil para adicionar outro.' } } });
  await entrar({ identificador: 'alan', senha: '1234' });
  const e = await aparelhos.confiar('');
  assert.equal(e.ok, false);
  assert.equal(e.status, 409);
  assert.match(e.erro, /5 aparelhos confiáveis/);
});
