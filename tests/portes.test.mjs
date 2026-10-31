/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v122: o dono cadastra os portes (tamanhos de veículo) em Estabelecimento > Portes; o Médio fica; porte usado só desativa; serviço precisa de preço nos portes ativos.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, clientes, estabelecimento, servicos, publico } from '../src/services/api.js';
import { PORTES, ROTULO_PORTE, definirPortes, portesAtivos, porteAtivo, precoNoPorte, sanearPortes, valorDoPorte } from '../src/domain/veiculos.js';
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

test('serviço (v124): só o Médio é obrigatório; os outros portes saem do fator, salvo preço específico', () => {
  assert.ok(salvarPortes([...FAB, { nome: 'Van', fator: 1.5 }]).ok);
  const van = st().estabelecimento.portes.find((x) => x.nome === 'Van').id;
  const base = { nome: 'Lavagem teste', intervaloMin: 0, preco: 100, duracao: 60 };
  const sem = servicos.salvar(base);
  assert.ok(sem.ok, JSON.stringify(sem));
  const sv = () => st().servicos.find((x) => x.nome === 'Lavagem teste');
  assert.deepEqual(sv().precos, { medio: 100 }, 'só o valor base fica salvo');
  assert.deepEqual([servicoNoPorte(sv(), 'pequeno').preco, servicoNoPorte(sv(), 'medio').preco, servicoNoPorte(sv(), 'grande').preco, servicoNoPorte(sv(), 'suv').preco, servicoNoPorte(sv(), 'pickup').preco, servicoNoPorte(sv(), van).preco], [90, 100, 120, 130, 140, 150]);
  assert.equal(servicoNoPorte(sv(), van).duracao, 60, 'a duração não usa fator');
  // preço específico vence o fator; os demais portes seguem o fator
  assert.ok(servicos.salvar({ ...base, id: sv().id, codigo: sv().codigo, precos: { medio: 100, suv: 180, [van]: 0 }, duracoes: { medio: 60, suv: 90 } }).ok);
  assert.deepEqual([servicoNoPorte(sv(), 'suv').preco, servicoNoPorte(sv(), 'grande').preco, servicoNoPorte(sv(), van).preco], [180, 120, 0], 'zero é preço específico válido (porte grátis)');
  assert.equal(servicoNoPorte(sv(), 'suv').duracao, 90);
  assert.equal(servicos.salvar({ ...base, id: sv().id, codigo: sv().codigo, precos: { medio: 100, suv: -5 } }).ok, false);
  assert.equal(servicos.salvar({ ...base, id: sv().id, codigo: sv().codigo, precos: { medio: 100, foguete: 5 } }).ok, false);
});

test('fator (v124): padrão de fábrica, Médio fixo em 1, faixa 0,10 a 10, duas casas e gravação antiga sem fator', () => {
  definirPortes(null);
  assert.deepEqual(portesAtivos().map((x) => [x.id, x.fator]), [['pequeno', 0.9], ['medio', 1], ['grande', 1.2], ['suv', 1.3], ['pickup', 1.4]]);
  const novo = () => 'pt1';
  const lista = (f, m) => [{ id: 'medio', nome: 'Médio', ...(m === undefined ? {} : { fator: m }) }, { nome: 'Van', ...(f === undefined ? {} : { fator: f }) }];
  assert.deepEqual(sanearPortes(lista(), novo).portes.map((x) => x.fator), [1, 1], 'porte novo sem fator vale 1');
  assert.deepEqual(sanearPortes(lista(1.255, 3), novo).portes.map((x) => x.fator), [1, 1.26], 'Médio sempre 1; duas casas');
  assert.match(sanearPortes(lista(0.09), novo).erro, /fator do porte Van vai de 0,10 a 10/);
  assert.match(sanearPortes(lista(10.01), novo).erro, /0,10 a 10/);
  assert.equal(sanearPortes(lista('2'), novo).ok, false, 'fator tem de ser número');
  assert.equal(sanearPortes(lista(NaN), novo).ok, false);
  assert.ok(sanearPortes(lista(0.1), novo).ok && sanearPortes(lista(10), novo).ok);
  // gravação antiga (sem fator) cai no fator de fábrica do id
  definirPortes([{ id: 'pequeno', nome: 'Pequeno' }, { id: 'medio', nome: 'Médio' }, { id: 'pt9', nome: 'Van' }]);
  assert.deepEqual(portesAtivos().map((x) => x.fator), [0.9, 1, 1]);
  definirPortes(null);
});

test('fator (v124): salvar pelo estabelecimento muda o preço dos serviços sem tabela; precoNoPorte arredonda em 2 casas', () => {
  const peq = () => st().estabelecimento.portes?.find((x) => x.id === 'pequeno');
  const lista = [...FAB.map((x) => ({ ...x, fator: x.id === 'pequeno' ? 0.85 : undefined }))];
  assert.ok(salvarPortes(lista).ok);
  assert.equal(peq().fator, 0.85);
  assert.ok(servicos.salvar({ nome: 'Cera teste', intervaloMin: 0, preco: 99.9, duracao: 30 }).ok);
  const sv = st().servicos.find((x) => x.nome === 'Cera teste');
  assert.equal(servicoNoPorte(sv, 'pequeno').preco, 84.92, '99,90 × 0,85 = 84,915 → 84,92');
  assert.equal(precoNoPorte(99.9, undefined, 'medio'), 99.9);
  assert.equal(precoNoPorte(99.9, '', 'grande'), 119.88);
  assert.equal(precoNoPorte(99.9, 50, 'grande'), 50);
  assert.equal(precoNoPorte('x', undefined, 'grande'), 0);
  assert.equal(salvarPortes(FAB.map((x) => ({ ...x, fator: x.id === 'suv' ? 11 : undefined }))).ok, false);
  assert.equal(peq().fator, 0.85, 'recusado não altera nada');
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

test('link do cliente (v124): a página recebe o preço de cada porte ativo (específico ou base × fator), sem expor fator nem tabela crua', () => {
  assert.ok(salvarPortes([...FAB, { nome: 'Van', fator: 1.5 }]).ok);
  const van = st().estabelecimento.portes.find((x) => x.nome === 'Van').id;
  assert.ok(servicos.salvar({ nome: 'Cristalização', intervaloMin: 0, preco: 200, duracao: 90, precos: { medio: 200, suv: 300 } }).ok);
  auth.logout();
  const cfg = publico.config(); const c = cfg.config || cfg;
  const sv = c.servicos.find((x) => x.nome === 'Cristalização');
  assert.deepEqual([sv.precos.pequeno, sv.precos.medio, sv.precos.grande, sv.precos.suv, sv.precos.pickup, sv.precos[van]], [180, 200, 240, 300, 280, 300]);
  assert.equal(sv.duracoes.grande, 90, 'sem tempo específico vale o base');
  assert.ok(!('fator' in c.portes[0]), 'o cliente não vê o fator');
});
