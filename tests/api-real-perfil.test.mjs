/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// "Meu perfil" no site real (src/services/api-real.js, `perfil`): rotas e corpos, só os campos da lista, foto conferida antes da rede e leitura defensiva.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configurar, perfil } from '../src/services/api-real.js';

let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined });
    return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => resposta };
  };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('perfil.obter: lê só os dados da própria pessoa; campo extra some, foto que não é imagem some', async () => {
  servidor({ id: '00000000-0000-4000-8000-000000000001', nome: 'Alan Dalforno', apelido: 'Alan', usuario: 'alan', papel: 'dono', email: 'a@b.com', telefone: '11999990001', nascimento: '1990-05-01', foto: 'javascript:alert(1)', cpf: '123', comissaoPct: 50, permissoes: { x: true } });
  const r = await perfil.obter();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/usuarios/me'); assert.equal(chamadas[0].metodo, 'GET');
  assert.equal(r.ok, true); assert.equal(r.dados.apelido, 'Alan'); assert.equal(r.dados.foto, null);
  assert.ok(!('cpf' in r.dados) && !('comissaoPct' in r.dados) && !('permissoes' in r.dados));
  servidor({ mensagem: 'Sem acesso.' }, 403);
  assert.equal((await perfil.obter()).status, 403);
});

test('perfil.salvar: PUT com só os campos permitidos, aparados e cortados', async () => {
  servidor({ nome: 'Alan', apelido: 'Alan', usuario: 'alan', papel: 'dono', email: '', telefone: '', nascimento: '' });
  await perfil.salvar({ nome: ' Alan ', apelido: 'Alan', email: '', telefone: '11 99999-0001', nascimento: '1990-05-01', papel: 'dono', cpf: '1', comissaoPct: 100, permissoes: {}, usuario: 'x' });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/usuarios/me'); assert.equal(chamadas[0].metodo, 'PUT');
  assert.deepEqual(chamadas[0].corpo, { nome: 'Alan', apelido: 'Alan', email: '', telefone: '11 99999-0001', nascimento: '1990-05-01' });
  await perfil.salvar({ apelido: 'B'.repeat(200) });
  assert.equal(chamadas[1].corpo.apelido.length, 60);
  servidor({ mensagem: 'Já existe alguém com esses dados.' }, 409);
  const r = await perfil.salvar({ apelido: 'Kiko' });
  assert.equal(r.ok, false); assert.equal(r.erro, 'Já existe alguém com esses dados.');
});

test('perfil.foto: só imagem pequena vai à rede; vazio remove', async () => {
  servidor(null, 204);
  assert.equal((await perfil.foto('data:text/html;base64,PHNjcmlwdD4=')).ok, false);
  assert.equal((await perfil.foto('data:image/png;base64,' + 'A'.repeat(31000))).ok, false);
  assert.equal(chamadas.length, 0);
  assert.equal((await perfil.foto('data:image/png;base64,iVBORw0KGgo=')).ok, true);
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/usuarios/me/foto', metodo: 'PUT', corpo: { foto: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.equal((await perfil.foto('')).ok, true);
  assert.deepEqual(chamadas[1].corpo, { foto: '' });
});
