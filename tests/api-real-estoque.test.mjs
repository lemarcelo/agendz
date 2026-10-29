/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estoque do site real (src/services/api-real.js, `estoque`): rotas e corpos, validação antes da rede, chave de repetição do movimento e leitura defensiva.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configurar, estoque } from '../src/services/api-real.js';

const ID = '00000000-0000-4000-8000-000000000077';
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined, chave: init.headers && init.headers['Idempotency-Key'] }); return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => resposta, text: async () => JSON.stringify(resposta) }; };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('listar: lê só o que importa, id ruim some, texto é cortado', async () => {
  servidor([{ id: ID, codigo: '1', nome: 'P'.repeat(300), preco: 45, estoque: 'muito', minimo: 3, comissaoPct: 10, custo: 22, ativo: false, extra: 1 }, { id: 'x', nome: 'lixo' }]);
  const r = await estoque.listar();
  assert.equal(r.produtos.length, 1);
  assert.equal(r.produtos[0].nome.length, 150); assert.equal(r.produtos[0].estoque, 0); assert.equal(r.produtos[0].ativo, false); assert.ok(!('extra' in r.produtos[0]));
});

test('salvar: novo leva estoque inicial, edição nunca leva estoque; id ruim não sai', async () => {
  servidor({ id: ID, nome: 'Pomada', preco: 45 });
  await estoque.salvar({ nome: 'Pomada', preco: 45, estoque: 12, lixo: 1 });
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/produtos', metodo: 'POST', corpo: { nome: 'Pomada', preco: 45, estoque: 12 }, chave: undefined });
  await estoque.salvar({ id: ID, nome: 'Pomada', preco: 50, estoque: 99 });
  assert.equal(chamadas[1].url, `https://loja.teste/api/produtos/${ID}`); assert.equal(chamadas[1].metodo, 'PUT'); assert.ok(!('estoque' in chamadas[1].corpo));
  assert.equal((await estoque.salvar({ id: 'ruim', nome: 'x' })).ok, false);
  assert.equal(chamadas.length, 2);
});

test('movimentar: valida antes da rede e repete a mesma chave no mesmo pedido (e troca depois de dar certo)', async () => {
  servidor({ id: ID, em: '2026-10-29T13:00:00Z', tipo: 'entrada', delta: 5, saldo: 17 });
  assert.equal((await estoque.movimentar(ID, { tipo: 'roubo', qtd: 1 })).ok, false);
  assert.equal((await estoque.movimentar(ID, { tipo: 'entrada', qtd: 0 })).ok, false);
  assert.equal((await estoque.movimentar(ID, { tipo: 'entrada', qtd: -1 })).ok, false);
  assert.equal((await estoque.movimentar(ID, { tipo: 'entrada', qtd: NaN })).ok, false);
  assert.equal((await estoque.movimentar('ruim', { tipo: 'entrada', qtd: 1 })).ok, false);
  assert.equal(chamadas.length, 0);
  assert.equal((await estoque.movimentar(ID, { tipo: 'ajuste', qtd: 0, obs: 'Zerou' })).ok, true); // contagem pode ser zero
  const r = await estoque.movimentar(ID, { tipo: 'entrada', qtd: 5 });
  assert.equal(r.movimento.saldo, 17); assert.equal(r.movimento.em, Date.parse('2026-10-29T13:00:00Z'));
  assert.deepEqual(chamadas[1].corpo, { tipo: 'entrada', qtd: 5 });
  const k1 = chamadas[1].chave; await estoque.movimentar(ID, { tipo: 'entrada', qtd: 5 });
  assert.notEqual(chamadas[2].chave, k1, 'depois de sucesso, pedido igual é outro pedido (chave nova)');
  servidor({ mensagem: 'Estoque insuficiente: há 3 em estoque.' }, 400);
  await estoque.movimentar(ID, { tipo: 'saida', qtd: 9, obs: 'Perda' }); const a = chamadas[0].chave;
  await estoque.movimentar(ID, { tipo: 'saida', qtd: 9, obs: 'Perda' });
  assert.equal(chamadas[1].chave, a, 'depois de erro, repetir o mesmo pedido mantém a chave');
  assert.match((await estoque.movimentar(ID, { tipo: 'saida', qtd: 9, obs: 'Perda' })).erro, /Estoque insuficiente/);
});

test('remover e movimentos: rotas certas', async () => {
  servidor({ desativado: true });
  assert.deepEqual(await estoque.remover(ID), { ok: true, desativado: true });
  assert.deepEqual(chamadas[0], { url: `https://loja.teste/api/produtos/${ID}`, metodo: 'DELETE', corpo: undefined, chave: undefined });
  servidor([{ id: ID, em: '2026-10-29T13:00:00Z', tipo: 'saida', delta: -2, saldo: 10, obs: 'Venda', autor: 'Alan', agendamentoId: ID }, 'lixo']);
  const m = await estoque.movimentos(ID);
  assert.equal(m.movimentos.length, 2); assert.equal(m.movimentos[0].venda, true); assert.equal(m.movimentos[1].tipo, 'ajuste');
  assert.equal((await estoque.movimentos('ruim')).ok, false);
});
