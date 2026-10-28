/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Sem internet (site real): a ação espera a conexão voltar e é enviada sozinha, uma única vez; cancelar desiste sem enviar;
// resposta perdida com o aparelho online NÃO é reenviada (sem chave de repetição no servidor, reenviar poderia duplicar).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelarEspera, configurar, entrar, esperandoRede, quandoEsperar } from '../src/services/api-real.js';

const LOGIN_OK = { token: 'tok', nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false };
function aparelho({ online }) {
  const ouvintes = new Set();
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true, writable: true });
  globalThis.addEventListener = (n, f) => { if (n === 'online') ouvintes.add(f); };
  globalThis.removeEventListener = (n, f) => { if (n === 'online') ouvintes.delete(f); };
  return { ouvintes, conectar() { globalThis.navigator.onLine = true; [...ouvintes].forEach((f) => f()); } };
}
const vez = () => new Promise((r) => setTimeout(r, 5));
let enviadas;
function servidor() {
  enviadas = [];
  globalThis.fetch = async (url, init) => { enviadas.push({ url: String(url), corpo: init.body }); return { ok: true, status: 200, json: async () => LOGIN_OK }; };
}
test.beforeEach(() => { configurar({ base: 'https://loja.teste' }); quandoEsperar(null); });

test('sem internet: a ação NÃO sai, a tela é avisada e, ao voltar a conexão, é enviada uma única vez', async () => {
  const ap = aparelho({ online: false });
  servidor();
  const avisos = []; quandoEsperar((v) => avisos.push(v));
  const pend = entrar({ identificador: 'alan', senha: 'x' });
  await vez();
  assert.equal(enviadas.length, 0, 'nada foi enviado sem internet');
  assert.equal(esperandoRede(), true);
  ap.conectar();
  assert.equal((await pend).ok, true);
  assert.equal(enviadas.length, 1, 'enviada uma vez só');
  assert.deepEqual(avisos, [true, false]); assert.equal(esperandoRede(), false); assert.equal(ap.ouvintes.size, 0, 'ouvinte removido');
});

test('a internet cai durante o envio: espera voltar e reenvia (a requisição não chegou ao servidor)', async () => {
  const ap = aparelho({ online: true });
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    if (n === 1) { globalThis.navigator.onLine = false; throw new TypeError('Failed to fetch'); }
    return { ok: true, status: 200, json: async () => LOGIN_OK };
  };
  const pend = entrar({ identificador: 'alan', senha: 'x' });
  await vez(); assert.equal(esperandoRede(), true);
  ap.conectar();
  assert.equal((await pend).ok, true); assert.equal(n, 2);
});

test('queda com o aparelho online (resposta perdida) NÃO é reenviada sozinha: evita ação em dobro', async () => {
  aparelho({ online: true });
  let n = 0;
  globalThis.fetch = async () => { n++; throw new TypeError('Failed to fetch'); };
  const r = await entrar({ identificador: 'alan', senha: 'x' });
  assert.equal(r.status, 0); assert.match(r.erro, /Sem conexão/); assert.equal(n, 1);
});

test('cancelar a espera termina a ação com "sem conexão" e nada é enviado quando a internet voltar', async () => {
  const ap = aparelho({ online: false });
  servidor();
  const pend = entrar({ identificador: 'alan', senha: 'x' });
  await vez();
  cancelarEspera();
  const r = await pend;
  assert.equal(r.ok, false); assert.match(r.erro, /Sem conexão/);
  ap.conectar(); await vez();
  assert.equal(enviadas.length, 0);
  assert.equal(esperandoRede(), false);
});
