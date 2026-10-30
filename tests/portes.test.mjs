/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v122: o dono cadastra os portes (tamanhos de veículo) em Estabelecimento > Portes; o Médio fica; porte usado só desativa; serviço precisa de preço nos portes ativos.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, clientes, estabelecimento, servicos, publico } from '../src/services/api.js';
import { PORTES, ROTULO_PORTE, definirPortes, portesAtivos, porteAtivo, sanearPortes, valorDoPorte } from '../src/domain/veiculos.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { servicoNoPorte } from '../src/domain/rules.js';

const st = () => store.getState();
const FAB = [{ id: 'pequeno', nome: 'Pequeno' }, { id: 'medio', nome: 'Médio' }, { id: 'grande', nome: 'Grande' }, { id: 'suv', nome: 'SUV' }, { id: 'pickup', nome: 'Pickup' }];
const salvarPortes = (lista) => estabelecimento.salvar({ portes: lista });

test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar();
  auth.logout(); assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});

test('sanearPortes: nome 2–20 sem repetir, o Médio fica e ativo, ao menos um', () => {
  const novo = () => 'pt1';
  assert.equal(sanearPortes([], novo).ok, false);
  assert.match(sanearPortes([{ id: 'medio', nome: 'M' }], novo).erro, /2 a 20/);
  assert.match(sanearPortes([{ id: 'medio', nome: 'Médio' }, { nome: 'médio' }], novo).erro, /duas vezes/);
  assert.match(sanearPortes([{ id: 'pequeno', nome: 'Pequeno' }], novo).erro, /padrão/);
  assert.match(sanearPortes([{ id: 'medio', nome: 'Médio', ativo: false }], novo).erro, /desativado/);
  assert.equal(sanearPortes([{ id: 'medio', nome: 'Médio' }, { id: 'ID RUIM', nome: 'X1' }], novo).ok, false);
  const r = sanearPortes([{ id: 'medio', nome: ' Compacto ' }, { nome: 'Van', exemplo: 'Ex.: Sprinter', ativo: false }], novo);
  assert.ok(r.ok); assert.deepEqual(r.portes.map((x) => [x.id, x.nome, x.ativo]), [['medio', 'Compacto', true], ['pt1', 'Van', false]]);
});

test('registro: ids, rótulos e ativos acompanham a lista; valorDoPorte cai no médio', () => {
  definirPortes([{ id: 'medio', nome: 'Médio', exemplo: '' }, { id: 'pt2', nome: 'Van', ativo: false }]);
  assert.deepEqual([...PORTES], ['medio', 'pt2']); assert.equal(ROTULO_PORTE.pt2, 'Van');
  assert.deepEqual(portesAtivos().map((x) => x.id), ['medio']); assert.equal(porteAtivo('pt2'), false);
  assert.equal(valorDoPorte({ medio: 80 }, 'pt2', 1), 80); assert.equal(valorDoPorte({}, 'pt2', 1), 1);
  definirPortes(null);
  assert.deepEqual([...PORTES], FAB.map((x) => x.id));
});

test('o dono cadastra um porte novo e ele entra na lista, com id gerado', () => {
  const lista = [...FAB, { nome: 'Van' }];
  assert.ok(salvarPortes(lista).ok);
  const v = st().estabelecimento.portes.find((x) => x.nome === 'Van');
  assert.match(v.id, /^pt\d+$/); assert.ok(PORTES.includes(v.id)); assert.equal(ROTULO_PORTE[v.id], 'Van');
  assert.equal(salvarPortes([...st().estabelecimento.portes.map((x) => ({ ...x })), { nome: 'van' }]).ok, false, 'nome repetido recusado');
});

test('serviço: porte de fábrica ativo precisa de preço e tempo; porte novo sem valor vale o do Médio', () => {
  assert.ok(salvarPortes([...FAB, { nome: 'Van' }]).ok);
  const van = st().estabelecimento.portes.find((x) => x.nome === 'Van').id;
  const precos = { pequeno: 50, medio: 70, grande: 90, suv: 100, pickup: 110 };
  const duracoes = { pequeno: 40, medio: 60, grande: 80, suv: 90, pickup: 100 };
  const base = { nome: 'Lavagem teste', intervaloMin: 0 };
  assert.match(servicos.salvar({ ...base, precos: { ...precos, pickup: undefined }, duracoes }).erros[0], /Pickup/);
  const sem = servicos.salvar({ ...base, precos, duracoes });
  assert.ok(sem.ok, JSON.stringify(sem));
  const sv = st().servicos.find((x) => x.nome === 'Lavagem teste');
  assert.equal(servicoNoPorte(sv, van).preco, 70, 'sem preço no porte novo vale o Médio');
  assert.ok(servicos.salvar({ nome: 'Lavagem Van', intervaloMin: 0, precos: { ...precos, [van]: 150 }, duracoes: { ...duracoes, [van]: 120 } }).ok);
  const sv2 = st().servicos.find((x) => x.nome === 'Lavagem Van');
  assert.deepEqual([servicoNoPorte(sv2, van).preco, servicoNoPorte(sv2, van).duracao], [150, 120]);
});

test('porte usado por veículo de cliente só desativa; o Médio não sai nem desativa', () => {
  assert.ok(salvarPortes([...FAB, { nome: 'Van' }]).ok);
  const van = st().estabelecimento.portes.find((x) => x.nome === 'Van').id;
  const c = st().clientes[0];
  assert.ok(clientes.salvar({ ...c, veiculos: [...(c.veiculos || []), { placa: 'VAN1A23', modelo: 'Sprinter', porte: van }] }).ok);
  const semVan = st().estabelecimento.portes.filter((x) => x.id !== van).map((x) => ({ ...x }));
  assert.match(salvarPortes(semVan).erros[0], /desative/);
  const desativa = st().estabelecimento.portes.map((x) => ({ ...x, ativo: x.id === van ? false : x.ativo }));
  assert.ok(salvarPortes(desativa).ok);
  assert.equal(salvarPortes(st().estabelecimento.portes.map((x) => ({ ...x, ativo: x.id === 'medio' ? false : x.ativo }))).ok, false);
  assert.equal(salvarPortes(st().estabelecimento.portes.filter((x) => x.id !== 'medio')).ok, false);
});

test('quem não é do painel de estabelecimento não muda os portes; barbearia ignora o campo', () => {
  auth.logout(); assert.ok(auth.login({ identificador: 'pablo', senha: '1234' }).ok);
  assert.equal(salvarPortes(FAB).ok, false);
});

test('link do cliente: só porte ativo é oferecido e o desativado é recusado', () => {
  assert.ok(salvarPortes([...FAB, { nome: 'Van' }]).ok);
  const van = st().estabelecimento.portes.find((x) => x.nome === 'Van').id;
  assert.ok(publico.config().portes.some((x) => x.id === van));
  assert.ok(salvarPortes(st().estabelecimento.portes.map((x) => ({ ...x, ativo: x.id === van ? false : x.ativo }))).ok);
  const ids = publico.config().portes.map((x) => x.id);
  assert.ok(!ids.includes(van)); assert.ok(ids.includes('medio'));
  const r = publico.agendar({ nome: 'Joana', telefone: '(51) 99999-0000', placa: 'ABC1D23', modelo: 'Sprinter', porte: van, servicoIds: ['s-lav-simples'], inicio: 0 });
  assert.equal(r.ok, false);
  assert.deepEqual(publico.horarios({ servicoIds: ['s-lav-simples'], porte: van, dayTs: startOfDay(Date.now()) }), []);
});
