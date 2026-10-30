/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v123 (API simulada): o dono reordena os serviços, escolhe o modo (mais usados / minha ordem) e Atender e link recebem a lista nessa ordem.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, estabelecimento, servicos, publico } from '../src/services/api.js';
import { servicosNaOrdemDaLoja, usoDosServicos } from '../src/domain/ordem-servicos.js';

const st = () => store.getState();
const ids = () => servicosNaOrdemDaLoja(st()).map((s) => s.id);
const manual = () => [...st().servicos].sort((a, b) => a.ordem - b.ordem).map((s) => s.id);

test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar();
  auth.logout(); assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});

test('reordenar: grava 1..n, ignora ids desconhecidos/repetidos e põe os que faltam no fim', () => {
  const todos = st().servicos.map((s) => s.id);
  assert.ok(todos.length >= 3);
  const [a, b, c] = todos;
  assert.ok(servicos.reordenar([c, 'xxx', c, a]).ok);
  assert.deepEqual(manual().slice(0, 3), [c, a, ...todos.filter((x) => x !== c && x !== a).slice(0, 1)]);
  assert.deepEqual(new Set(st().servicos.map((s) => s.ordem)).size, todos.length, 'ordens distintas');
  assert.equal(servicos.reordenar('lixo').ok, false);
  assert.equal(servicos.reordenar([1, 2]).ok, false);
  void b;
});

test('reordenar exige a seção Serviços: o esteticista não mexe na ordem', () => {
  const antes = manual();
  auth.logout(); assert.ok(auth.login({ identificador: 'pablo', senha: '1234' }).ok);
  assert.equal(servicos.reordenar([...antes].reverse()).ok, false);
  assert.deepEqual(manual(), antes);
});

test('modo: padrão é "uso"; só "uso" e "manual" são aceitos; manual segue a ordem do dono', () => {
  assert.equal(estabelecimento.salvar({ ordemServicos: 'aleatorio' }).ok, false);
  const todos = st().servicos.map((s) => s.id);
  assert.ok(servicos.reordenar([...todos].reverse()).ok);
  assert.ok(estabelecimento.salvar({ ordemServicos: 'manual' }).ok);
  assert.deepEqual(ids(), [...todos].reverse());
  // no modo uso, o mais usado sobe; a contagem não vira campo guardado
  assert.ok(estabelecimento.salvar({ ordemServicos: 'uso' }).ok);
  const uso = usoDosServicos(st().agendamentos);
  const topo = ids()[0];
  const maior = Math.max(...st().servicos.map((s) => uso.get(s.id) || 0));
  assert.equal(uso.get(topo) || 0, maior);
  assert.ok(st().servicos.every((s) => !('usos' in s) && !('uso' in s)), 'contador nunca guardado');
});

test('link do cliente: a lista pública sai na ordem do modo e sem contagem', () => {
  const todos = st().servicos.filter((s) => s.ativo !== false).map((s) => s.id);
  assert.ok(servicos.reordenar([...todos].reverse()).ok);
  assert.ok(estabelecimento.salvar({ ordemServicos: 'manual' }).ok);
  auth.logout();
  const cfg = publico.config();
  const lista = (cfg.config || cfg).servicos.map((s) => s.id);
  assert.deepEqual(lista.filter((x) => todos.includes(x)), [...todos].reverse());
  assert.ok((cfg.config || cfg).servicos.every((s) => !('usos' in s) && !('uso' in s)));
});

test('serviço novo vai para o fim da ordem manual', () => {
  const r = servicos.salvar({ nome: 'Serviço do fim', categoria: 'Teste', precos: { pequeno: 10, medio: 10, grande: 10, suv: 10, pickup: 10 }, duracoes: { pequeno: 30, medio: 30, grande: 30, suv: 30, pickup: 30 }, intervalo: 0, antecedenciaH: 0 });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(manual().at(-1), st().servicos.find((s) => s.nome === 'Serviço do fim').id);
});
