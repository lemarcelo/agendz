/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco C: o card e as listas mostram apelido > nome > "Sem nome", NUNCA o telefone; o Atender grava o que o barbeiro digita como apelido;
// quem agenda pelo link e não tem cadastro tem o nome copiado para o apelido. A unicidade (telefone + nome) não muda.
import { test, jest, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda } from '../src/services/api.js';
import { reiniciar } from '../tests/helpers.mjs';
import { nomeCliente } from '../src/ui/format.js';
import { nomeReal, rotuloDoCliente, SEM_NOME } from '../src/domain/cliente-rotulo.js';

const st = () => store.getState();
const ag = (id) => st().agendamentos.find((a) => a.id === id);
beforeEach(() => {
  jest.useRealTimers();
  jest.useFakeTimers({ doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], now: new Date('2026-10-12T07:00:00-03:00') });
  reiniciar(); auth.logout(); assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});

test('rótulo: apelido, senão nome, senão "Sem nome"; nunca o telefone', () => {
  assert.equal(rotuloDoCliente({ nome: 'Carlos Souza', apelido: 'Carlão' }), 'Carlão');
  assert.equal(rotuloDoCliente({ nome: 'Carlos Souza', apelido: '' }), 'Carlos Souza');
  assert.equal(rotuloDoCliente({ nome: '(51) 97777-1111', apelido: '', semNome: true }), SEM_NOME);
  assert.equal(rotuloDoCliente({ nome: '(51) 97777-1111', apelido: '  ', semNome: true }), SEM_NOME);
  assert.equal(rotuloDoCliente({ nome: '(51) 97777-1111', apelido: 'Zé', semNome: true }), 'Zé');
  assert.equal(rotuloDoCliente(null), SEM_NOME);
  assert.equal(nomeReal({ nome: '(51) 97777-1111', semNome: true }), '');
  assert.equal(nomeReal({ nome: 'Ana', semNome: false }), 'Ana');
});

test('BUG: agendar só com o telefone mostrava o telefone no card; agora mostra "Sem nome"', () => {
  const a = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '(51) 97777-1111' });
  assert.ok(a.ok, JSON.stringify(a));
  const rotulo = nomeCliente(st(), ag(a.agendamento.id));
  assert.equal(rotulo, SEM_NOME);
  assert.ok(!/\d{4}/.test(rotulo), 'o card nunca mostra o telefone');
});

test('Atender: o texto digitado vira o apelido do cadastro novo e é o que aparece no card', () => {
  const a = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '(51) 97777-2222', nome: 'Seu Zé' });
  assert.ok(a.ok, JSON.stringify(a));
  const c = st().clientes.find((x) => x.id === ag(a.agendamento.id).clienteId);
  assert.equal(c.apelido, 'Seu Zé');
  assert.equal(nomeCliente(st(), ag(a.agendamento.id)), 'Seu Zé');
});

test('cadastro criado só com o telefone que depois recebe um nome digitado ganha também o apelido', () => {
  const a = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '(51) 97777-3333' });
  const c = st().clientes.find((x) => x.id === ag(a.agendamento.id).clienteId);
  assert.equal(c.apelido, '');
  const b = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '51977773333', nome: 'Heitor' });
  assert.ok(b.ok);
  const depois = st().clientes.find((x) => x.id === c.id);
  assert.equal(depois.apelido, 'Heitor'); assert.equal(depois.nome, 'Heitor'); assert.equal(depois.semNome, undefined);
});

test('apelido que já existe não é trocado pelo texto digitado em outro atendimento', () => {
  const a = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '(51) 97777-4444', nome: 'Beto' });
  const c = st().clientes.find((x) => x.id === ag(a.agendamento.id).clienteId);
  agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '51977774444', nome: 'Beto' });
  assert.equal(st().clientes.find((x) => x.id === c.id).apelido, 'Beto');
  assert.equal(st().clientes.filter((x) => x.telefone.replace(/\D/g, '') === '51977774444').length, 1, 'mesmo telefone e nome: não duplica');
});

// ---- site real: a lista de clientes leva `semNome` (o servidor guarda o telefone no campo nome nesse caso) ----
import { configurar, clientes as apiClientes } from '../src/services/api-real.js';
test('site real: a lista traz semNome e o rótulo do card nunca é o telefone', async () => {
  configurar({ base: 'https://loja.teste' });
  const itens = [
    { id: '00000000-0000-4000-8000-000000000001', nome: '(51) 97777-1111', apelido: '', telefone: '51977771111', semNome: true, veiculos: [] },
    { id: '00000000-0000-4000-8000-000000000002', nome: 'Ana Lima', apelido: 'Aninha', telefone: '51977772222', veiculos: [] },
  ];
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => itens, text: async () => JSON.stringify(itens), headers: { get: () => 'application/json' } });
  const r = await apiClientes.listar('');
  assert.equal(r.ok, true);
  assert.deepEqual(r.clientes.map((c) => c.semNome), [true, false]);
  assert.deepEqual(r.clientes.map(rotuloDoCliente), [SEM_NOME, 'Aninha']);
});
