/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso com o app fechado no cliente HTTP (v130): cada chamada fala só com a rota certa, com o token da sessão; id inválido nem sai; endpoint que não é https nem sai;
// resposta do servidor é saneada; recurso desligado no servidor (503) volta como erro com status.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configurar, entrar, push } from '../src/services/api-real.js';

const JWT = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
const ID = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
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
const sessaoJson = { token: JWT, id: ID, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'], redeConfiavel: false, perguntarRede: false };
const logar = async (extra) => { servidor({ 'POST /api/auth/login': { status: 200, corpo: sessaoJson }, ...extra }); configurar({ base: 'https://loja.teste' }); await entrar({ identificador: 'alan', senha: '1234' }); };

test('chave: devolve só o texto da chave; 503 (desligado no servidor) vem com status', async () => {
  await logar({ 'GET /api/push/chave': { status: 200, corpo: { chave: 'BAAA', extra: 'x' } } });
  const r = await push.chave();
  assert.deepEqual(r, { ok: true, chave: 'BAAA' });
  assert.equal(chamadas[1].auth, `Bearer ${JWT}`);
  await logar({ 'GET /api/push/chave': { status: 503, corpo: { mensagem: 'Aviso com o app fechado ainda não está ligado neste servidor.' } } });
  const f = await push.chave();
  assert.equal(f.ok, false); assert.equal(f.status, 503);
});

test('listar: só id válido, texto cortado, no máximo 5', async () => {
  const lixo = [{ id: ID, aparelho: 'Celular', criadoEm: '2026-10-31T10:00:00Z', ultimoEnvio: null, endpoint: 'https://segredo' }, { id: 'não-é-uuid', aparelho: 'x' }, ...Array.from({ length: 8 }, () => ({ id: ID2, aparelho: 'y'.repeat(200) }))];
  await logar({ 'GET /api/push/inscricoes': { status: 200, corpo: lixo } });
  const r = await push.listar();
  assert.equal(r.ok, true);
  assert.ok(r.itens.length <= 5);
  assert.deepEqual(r.itens[0], { id: ID, aparelho: 'Celular', criadoEm: '2026-10-31T10:00:00Z', ultimoEnvio: '' });
  assert.ok(r.itens.every((x) => x.id && x.aparelho.length <= 60 && !('endpoint' in x)));
});

test('inscrever: leva só endpoint, as duas chaves e o nome; endpoint que não é https nem sai', async () => {
  await logar({ 'POST /api/push/inscricoes': { status: 201, corpo: { id: ID, aparelho: 'Celular' } } });
  const corpo = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) }, aparelho: ' Celular ', senha: 'não vai' };
  const r = await push.inscrever(corpo);
  assert.deepEqual(r, { ok: true, id: ID });
  assert.deepEqual(chamadas[1].corpo, { endpoint: corpo.endpoint, keys: corpo.keys, aparelho: 'Celular' });
  const antes = chamadas.length;
  for (const mau of [{ endpoint: 'http://x.example/a', keys: corpo.keys }, { endpoint: 'https://x.example/' + 'a'.repeat(700), keys: corpo.keys }, { keys: corpo.keys }, null]) {
    const m = await push.inscrever(mau);
    assert.equal(m.ok, false);
  }
  assert.equal(chamadas.length, antes, 'nada disso chega à rede');
});

test('remover: id inválido nem sai; válido chama DELETE na rota certa', async () => {
  await logar({ [`DELETE /api/push/inscricoes/${ID}`]: { status: 204, corpo: undefined } });
  const n = chamadas.length;
  assert.equal((await push.remover('../../usuarios')).ok, false);
  assert.equal(chamadas.length, n);
  const r = await push.remover(ID);
  assert.equal(r.ok, true);
  assert.equal(chamadas[chamadas.length - 1].metodo, 'DELETE');
});

test('testar: devolve enviados e falhas como números; 503 volta como erro', async () => {
  await logar({ 'POST /api/push/teste': { status: 200, corpo: { enviados: 2, falhas: 'x' } } });
  assert.deepEqual(await push.testar(), { ok: true, enviados: 2, falhas: 0 });
  await logar({ 'POST /api/push/teste': { status: 503, corpo: { mensagem: 'desligado' } } });
  const r = await push.testar();
  assert.equal(r.ok, false); assert.equal(r.status, 503);
});
