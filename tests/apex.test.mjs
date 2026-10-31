/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// O que é só do Apex: preço e duração por porte, veículo e placa, box + esteticista sem conflito, serviço de vários dias, combos,
// marcadores "Em serviço" e "Pronto para retirada", Pix e comissão pelo preço do porte e o fluxo completo do link com veículo.
// Estes testes usam o catálogo de exemplo de verdade (não o "simples" dos testes de regra geral).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, clientes, servicos, estabelecimento, equipe, financeiro, publico } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import { addDays, startOfDay, tsAt, MIN, HORA } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { formatarPlaca, limparVeiculo, normalizarPlaca, placaValida, tipoPlaca } from '../src/domain/veiculos.js';
import { itensDoAgendamento } from '../src/domain/reports.js';
import { comissaoDoAgendamento } from '../src/domain/comissao.js';
import { marcadoresDe } from '../src/domain/marcadores.js';
import { logoValida, coresDoTema } from '../src/domain/tema.js';
import { validarModelo } from '../src/domain/templates.js';
import { MODELOS_SO_AUTOMATICOS } from '../src/domain/engine.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const ag = (id) => st().agendamentos.find((a) => a.id === id);
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const sv = (id) => st().servicos.find((s) => s.id === id);
let placaSeq = 0;
// Veículo novo e único a cada chamada (a placa não repete dentro do mesmo cliente).
const vei = (porte = 'medio', extra = {}) => ({ placa: `TST${1000 + ++placaSeq}`, modelo: 'Modelo Teste', porte, ...extra });
const criar = (o) => agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculo: vei(), status: 'confirmado', ...o });
const ok = (r) => { assert.ok(r.ok, JSON.stringify(r)); return r.agendamento; };

test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); // segunda de manhã
  store.reiniciar();
  como('davi');
});

// ---------- dados de exemplo ----------
test('exemplo: 3 boxes, 16 serviços com preço por porte, serviço de vários dias em andamento e nenhum conflito', () => {
  assert.deepEqual(st().estabelecimento.boxes.map((b) => b.nome), ['Box 1', 'Box 2', 'Box 3']);
  assert.equal(st().servicos.length, 16);
  for (const s of st().servicos) {
    for (const p of ['pequeno', 'medio', 'grande', 'suv', 'pickup']) { assert.ok(s.precos[p] > 0 && s.duracoes[p] > 0, `${s.nome} ${p}`); }
    assert.equal(s.preco, s.precos.medio); assert.equal(s.duracao, s.duracoes.medio);
  }
  assert.ok(st().servicos.some((s) => s.multiDia) && st().servicos.some((s) => s.combo));
  const vitri = st().agendamentos.find((a) => a.servicoIds.includes('s-vitrificacao'));
  assert.ok(vitri.emServico && vitri.boxId === 'bx3' && vitri.porte === 'suv');
  for (const a of st().agendamentos.filter((x) => ['a_confirmar', 'confirmado'].includes(x.status))) {
    const v = R.validarHorario(st(), { profissionalId: a.profissionalId, inicio: a.inicio, servicoIds: a.servicoIds, porte: a.porte, boxId: a.boxId, ignoreId: a.id, origem: 'painel', agora: store.agora() });
    assert.deepEqual(v.erros, [], a.id);
  }
});

// ---------- preço e duração por porte ----------
test('a mesma lavagem custa e dura diferente em cada porte; porte desconhecido vale como médio', () => {
  const s = sv('s-lav-simples');
  const tab = Object.fromEntries(['pequeno', 'medio', 'grande', 'suv', 'pickup'].map((p) => [p, [R.servicoNoPorte(s, p).preco, R.servicoNoPorte(s, p).duracao]]));
  assert.deepEqual(tab, { pequeno: [40, 30], medio: [50, 40], grande: [60, 45], suv: [70, 50], pickup: [70, 50] });
  assert.deepEqual([R.servicoNoPorte(s, 'foguete').preco, R.servicoNoPorte(s, undefined).duracao], [50, 40]);
  assert.equal(R.totalPreco(R.servicosPorIds(st(), ['s-lav-simples', 's-lav-motor'], 'suv')), 70 + 90);
});

test('o agendamento guarda o veículo, o porte e o preço do dia: mudar a tabela depois não muda o combinado', () => {
  const a = ok(criar({ clienteId: 'c-igor', veiculoId: 've-i1', veiculo: undefined, inicio: tsAt(dia(8), '10:00') }));
  assert.equal(a.porte, 'pickup'); assert.equal(a.veiculoId, 've-i1');
  assert.deepEqual(a.veiculo, { placa: 'IJK-5073', marca: 'Fiat', modelo: 'Strada', cor: 'Branca', porte: 'pickup' });
  assert.equal(a.precos['s-lav-simples'], 70);
  assert.ok(a.boxId);
  const novo = { ...sv('s-lav-simples'), precos: { ...sv('s-lav-simples').precos, pickup: 99 } };
  assert.ok(servicos.salvar(novo).ok);
  assert.equal(itensDoAgendamento(st(), ag(a.id))[0].valor, 70, 'preço congelado');
  // cadastro do veículo muda depois: a foto do agendamento fica como foi combinada
  const c = st().clientes.find((x) => x.id === 'c-igor');
  assert.ok(clientes.salvar({ ...c, veiculos: [{ ...c.veiculos[0], cor: 'Preta', porte: 'grande' }] }).ok);
  assert.equal(ag(a.id).veiculo.cor, 'Branca'); assert.equal(ag(a.id).porte, 'pickup');
});

test('a duração do porte define quando o esteticista fica livre: o pequeno libera antes que o SUV', () => {
  const d = dia(8);
  // pequeno: 30 min + 10 de intervalo = livre às 10:40
  ok(criar({ clienteId: 'c-jon', veiculoId: 've-j1', veiculo: undefined, inicio: tsAt(d, '10:00') }));
  assert.deepEqual(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d, '10:40'), servicoIds: ['s-lav-simples'], porte: 'medio' }).erros, []);
  assert.match(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d, '10:30'), servicoIds: ['s-lav-simples'], porte: 'medio' }).erros[0], /já está confirmado/);
  // SUV: 50 + 10 = livre às 11:00
  const d2 = dia(9);
  ok(criar({ clienteId: 'c-jon', veiculoId: 've-j2', veiculo: undefined, inicio: tsAt(d2, '10:00') }));
  assert.match(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d2, '10:40'), servicoIds: ['s-lav-simples'], porte: 'medio' }).erros[0], /já está confirmado/);
  assert.deepEqual(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d2, '11:00'), servicoIds: ['s-lav-simples'], porte: 'medio' }).erros, []);
});

test('serviço de um dia só precisa caber numa faixa do expediente (manhã 4 h, tarde 5 h)', () => {
  const d = dia(8);
  // cristalização de pickup: 270 min → não cabe na manhã (8–12), cabe à tarde (14–19)
  assert.match(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d, '08:00'), servicoIds: ['s-cristalizacao'], porte: 'pickup' }).erros[0], /não atende/);
  assert.deepEqual(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d, '14:00'), servicoIds: ['s-cristalizacao'], porte: 'pickup' }).erros, []);
});

// ---------- placa e veículos do cliente ----------
test('placa: antiga (ABC-1234) e Mercosul (ABC1D23) valem; o resto é recusado, com ou sem hífen e espaço', () => {
  for (const p of ['ABC-1234', 'abc1234', ' abc 1234 ', 'ABC1D23', 'abc1d23', 'RIO2A19']) assert.ok(placaValida(p), p);
  for (const p of ['', 'AB-1234', 'ABC-123', 'ABC12345', 'ABCD123', '1234ABC', 'ABC1D2', 'ABC1DD3', 'A1C1234', 'ABC123Ç', 'ÀBC1D23', null, undefined, 1234567, ['ABC1234']]) assert.equal(placaValida(p), false, String(p));
  assert.equal(tipoPlaca('ABC-1234'), 'antiga'); assert.equal(tipoPlaca('abc1d23'), 'mercosul'); assert.equal(tipoPlaca('ZZZ'), null);
  assert.equal(formatarPlaca('abc1234'), 'ABC-1234'); assert.equal(formatarPlaca('abc-1d23'), 'ABC1D23'); assert.equal(normalizarPlaca('abc 1234'), 'ABC1234');
  assert.equal(normalizarPlaca('x'.repeat(40)), '', 'texto enorme não passa');
});

test('veículo: placa, modelo e porte são obrigatórios; marca e cor são opcionais; textos longos são cortados', () => {
  assert.ok(limparVeiculo({ placa: 'ABC1D23', modelo: 'Civic', porte: 'medio' }).ok);
  assert.equal(limparVeiculo({ placa: 'ABC1D23', modelo: 'C', porte: 'medio' }).ok, false);
  assert.equal(limparVeiculo({ placa: 'ABC1D23', modelo: 'Civic', porte: 'gigante' }).ok, false);
  assert.equal(limparVeiculo({ placa: 'ABC1D23', modelo: 'Civic' }).ok, false);
  assert.equal(limparVeiculo({ placa: 'ABC1D23', modelo: { x: 1 }, porte: 'medio' }).ok, false);
  assert.equal(limparVeiculo(null).ok, false);
  assert.equal(limparVeiculo({ placa: 'ABC1D23', modelo: 'M'.repeat(100), porte: 'suv' }).veiculo.modelo.length, 40);
});

test('veículos do cliente: no máximo 10, placa única por cliente, id sempre do servidor, placa inválida recusada', () => {
  const c = st().clientes.find((x) => x.id === 'c-igor');
  const v = (placa, extra = {}) => ({ placa, modelo: 'Carro', porte: 'medio', ...extra });
  assert.equal(clientes.salvar({ ...c, veiculos: [v('XXX')] }).ok, false);
  assert.match(clientes.salvar({ ...c, veiculos: [v('ABC-1234'), v('abc1234')] }).erros[0], /duas vezes/);
  assert.equal(clientes.salvar({ ...c, veiculos: [v('ABC1D23', { porte: 'xx' })] }).ok, false);
  assert.equal(clientes.salvar({ ...c, veiculos: Array.from({ length: 11 }, (_, i) => v(`ABC${1000 + i}`)) }).ok, false);
  assert.equal(clientes.salvar({ ...c, veiculos: 'oi' }).ok, false);
  const r = clientes.salvar({ ...c, veiculos: [{ ...c.veiculos[0] }, v('QWE1R23', { id: 've-i1' })] });
  assert.ok(r.ok, JSON.stringify(r));
  const lista = st().clientes.find((x) => x.id === 'c-igor').veiculos;
  assert.equal(lista.length, 2); assert.equal(lista[0].id, 've-i1');
  assert.ok(lista[1].id !== 've-i1' && /^ve\d+$/.test(lista[1].id), 'o id mandado pelo cliente é ignorado');
  // a mesma placa pode existir em outro cliente (o carro foi vendido)
  const outro = st().clientes.find((x) => x.id === 'c-marcelo');
  assert.ok(clientes.salvar({ ...outro, veiculos: [...outro.veiculos, v('IJK-5073')] }).ok);
});

test('veículo com agendamento ativo não sai do cadastro; sem agendamento, sai', () => {
  const c = st().clientes.find((x) => x.id === 'c-igor');
  ok(criar({ clienteId: 'c-igor', veiculoId: 've-i1', veiculo: undefined, inicio: tsAt(dia(8), '10:00') }));
  assert.match(clientes.salvar({ ...c, veiculos: [] }).erros[0], /agendamento ativo/);
  // o carro cadastrado sem nenhum horário pode sair
  const c2 = st().clientes.find((x) => x.id === 'c-marcelo');
  assert.ok(clientes.salvar({ ...c2, veiculos: [...c2.veiculos, { placa: 'NOV1A23', modelo: 'Parado', porte: 'medio' }] }).ok);
  const c3 = st().clientes.find((x) => x.id === 'c-marcelo');
  assert.equal(c3.veiculos.length, 2);
  assert.ok(clientes.salvar({ ...c3, veiculos: [c3.veiculos[0]] }).ok);
  assert.equal(st().clientes.find((x) => x.id === 'c-marcelo').veiculos.length, 1);
});

test('agendar: veículo novo entra no cadastro do cliente, a mesma placa não duplica, cliente com 2 veículos precisa escolher', () => {
  const d = dia(8);
  const a = ok(criar({ clienteId: 'c-marcelo', veiculo: { placa: 'xyz-9876', marca: 'Fiat', modelo: 'Argo', porte: 'pequeno' }, inicio: tsAt(d, '09:00') }));
  assert.equal(a.veiculo.placa, 'XYZ-9876'); assert.equal(a.porte, 'pequeno');
  const c = st().clientes.find((x) => x.id === 'c-marcelo');
  assert.equal(c.veiculos.length, 2); assert.equal(a.veiculoId, c.veiculos[1].id);
  ok(criar({ clienteId: 'c-marcelo', veiculo: { placa: 'XYZ9876', modelo: 'Argo', porte: 'pequeno' }, profissionalId: 'u-davi', inicio: tsAt(d, '15:00') }));
  assert.equal(st().clientes.find((x) => x.id === 'c-marcelo').veiculos.length, 2, 'mesma placa (com ou sem hífen) não duplica');
  const sem = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-marcelo', servicoIds: ['s-lav-simples'], inicio: tsAt(d, '11:00') });
  assert.equal(sem.ok, false); assert.match(sem.erros[0], /veículo/i);
  assert.equal(agenda.criar({ clienteId: 'c-marcelo', veiculoId: 've-de-outro', profissionalId: 'u-marcelo', servicoIds: ['s-lav-simples'], inicio: tsAt(d, '11:00') }).ok, false);
  assert.equal(agenda.criar({ clienteId: 'c-marcelo', veiculo: { placa: 'ABC', modelo: 'X1', porte: 'medio' }, profissionalId: 'u-marcelo', servicoIds: ['s-lav-simples'], inicio: tsAt(d, '11:00') }).ok, false);
});

test('agendamento recusado não deixa veículo novo para trás no cadastro', () => {
  const d = dia(8);
  ok(criar({ inicio: tsAt(d, '10:00') }));
  const antes = st().clientes.find((x) => x.id === 'c-jon').veiculos.length;
  const r = agenda.criar({ clienteId: 'c-jon', veiculo: vei(), profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(d, '10:10'), status: 'confirmado' });
  assert.equal(r.ok, false);
  assert.equal(st().clientes.find((x) => x.id === 'c-jon').veiculos.length, antes);
});

test('atendimento de balcão: serviço pede veículo (fica só na foto do atendimento); venda só de produto não pede', () => {
  // de fábrica nada é obrigatório (v121): sem veículo registra no porte médio; o dono pode exigir o veículo em Estabelecimento > Regras
  assert.ok(estabelecimento.salvar({ camposObrigatorios: { futuro: [], local: ['veiculo'] } }).ok);
  const v = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'pix' });
  assert.equal(v.ok, false); assert.match(v.erros[0], /veículo/i);
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'pix', veiculo: { placa: 'AAA1B23', modelo: 'Hilux', porte: 'pickup' } });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  assert.equal(a.porte, 'pickup'); assert.equal(a.boxId, null); assert.equal(a.precos['s-lav-simples'], 70); assert.equal(a.veiculo.modelo, 'Hilux');
  const p = agenda.atender({ produtos: [{ materialId: 'pr-aromatizante', qtd: 1 }], profissionalId: 'u-pablo', formaPagamento: 'pix' });
  assert.ok(p.ok, JSON.stringify(p));
});

// ---------- box e esteticista ----------
test('três boxes: três carros ao mesmo tempo (um por esteticista) usam boxes diferentes; o quarto não tem box', () => {
  assert.ok(equipe.salvar({ nome: 'Rui Teste', apelido: 'Rui', cpf: '529.982.247-25', email: 'rui@apexestetica.com.br', senha: '1234', papel: 'profissional', telefone: '(55) 99999-0000' }).ok);
  const rui = st().usuarios.find((u) => u.apelido === 'Rui').id;
  const d = dia(9);
  const a1 = ok(criar({ clienteId: 'c-marcelo', profissionalId: 'u-davi', inicio: tsAt(d, '10:00') }));
  const a2 = ok(criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', inicio: tsAt(d, '10:00') }));
  const a3 = ok(criar({ clienteId: 'c-jon', profissionalId: 'u-marcelo', inicio: tsAt(d, '10:00') }));
  assert.equal(new Set([a1.boxId, a2.boxId, a3.boxId]).size, 3);
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId: rui, servicoIds: ['s-lav-simples'], veiculo: vei(), inicio: tsAt(d, '10:00'), status: 'confirmado' });
  assert.equal(r.ok, false); assert.match(r.erros[0], /Todos os boxes estão ocupados/);
  // 50 minutos depois (40 do serviço médio + 10 de intervalo) o box volta
  assert.ok(agenda.criar({ clienteId: 'c-marcelo', profissionalId: rui, servicoIds: ['s-lav-simples'], veiculo: vei(), inicio: tsAt(d, '10:50'), status: 'confirmado' }).ok);
});

test('mesmo esteticista não atende dois carros ao mesmo tempo, mesmo com box sobrando', () => {
  const d = dia(9);
  ok(criar({ clienteId: 'c-marcelo', inicio: tsAt(d, '10:00') }));
  const r = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculoId: 've-i1', inicio: tsAt(d, '10:20'), status: 'confirmado' });
  assert.equal(r.ok, false); assert.match(r.erros[0], /já está confirmado/);
});

test('box escolhido à mão: ocupado é recusado com o nome do box; livre é respeitado; remarcar mantém o box se estiver livre', () => {
  const d = dia(9);
  const a = ok(criar({ clienteId: 'c-marcelo', profissionalId: 'u-davi', boxId: 'bx2', inicio: tsAt(d, '10:00') }));
  assert.equal(a.boxId, 'bx2');
  const r = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculoId: 've-i1', boxId: 'bx2', inicio: tsAt(d, '10:00'), status: 'confirmado' });
  assert.equal(r.ok, false); assert.equal(r.erros[0], 'Box 2 está ocupado nesse horário.');
  assert.equal(agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculoId: 've-i1', boxId: 'bx99', inicio: tsAt(d, '10:00') }).ok, false);
  const m = agenda.remarcar(a.id, { inicio: tsAt(d, '15:00') });
  assert.ok(m.ok, JSON.stringify(m)); assert.equal(ag(a.id).boxId, 'bx2');
});

test('encaixe pode furar a agenda do esteticista, mas nunca o box', () => {
  const d = dia(9);
  ok(criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', boxId: 'bx1', inicio: tsAt(d, '10:00') }));
  const dupla = { clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculoId: 've-i1', inicio: tsAt(d, '10:20'), status: 'confirmado', encaixe: true };
  const naMesmaBox = agenda.atender({ ...dupla, boxId: 'bx1' });
  assert.equal(naMesmaBox.ok, false); assert.equal(naMesmaBox.erros[0], 'Box 1 está ocupado nesse horário.');
  const emOutro = agenda.atender(dupla);
  assert.ok(emOutro.ok, JSON.stringify(emOutro));
  assert.equal(ag(emOutro.agendamento.id).encaixe, true); assert.notEqual(ag(emOutro.agendamento.id).boxId, 'bx1');
});

test('pendente não bloqueia: quando o confirmado entra, o pendente do mesmo box ou esteticista é cancelado por conflito', () => {
  const d = dia(9);
  const p = ok(criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', status: 'a_confirmar', inicio: tsAt(d, '10:00') }));
  ok(criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', veiculo: undefined, veiculoId: 've-i1', inicio: tsAt(d, '10:10') }));
  assert.equal(ag(p.id).status, 'cancelado'); assert.equal(ag(p.id).motivoCancelamento, 'conflito');
});

test('boxes: configurar, renomear, desativar e a trava de box com carro ou histórico', () => {
  const boxes = () => st().estabelecimento.boxes;
  const salvar = (b) => estabelecimento.salvar({ boxes: b });
  assert.equal(salvar([]).ok, false);
  assert.equal(salvar([{ nome: 'A' }, { nome: 'a' }]).ok, false, 'nome repetido');
  assert.equal(salvar([{ id: 'bx1', nome: 'Box 1', ativo: false }, { id: 'bx2', nome: 'Box 2', ativo: false }, { id: 'bx3', nome: 'Box 3', ativo: false }]).ok, false, 'ao menos um ativo');
  assert.equal(salvar([{ nome: 'x'.repeat(31) }]).ok, false);
  assert.equal(salvar(Array.from({ length: 21 }, (_, i) => ({ nome: `B${i}` }))).ok, false);
  assert.equal(salvar('box').ok, false);
  // renomear mantém o id; novo box ganha id do servidor
  const r = salvar([...boxes().map((b) => (b.id === 'bx1' ? { ...b, nome: 'Box Principal' } : b)), { nome: 'Box 4' }]);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(boxes().find((b) => b.id === 'bx1').nome, 'Box Principal');
  assert.equal(boxes().length, 4); assert.match(boxes()[3].id, /^bx\d+$/);
  assert.equal(nomeDe('bx1'), 'Box Principal');
  // o box novo, sem histórico, pode sair; o com histórico só desativa
  assert.ok(salvar(boxes().slice(0, 3)).ok);
  assert.match(salvar(boxes().slice(1)).erros[0], /histórico/);
  // o Box 3 segura a vitrificação em andamento: não desativa enquanto o carro está lá
  const sem3 = boxes().map((b) => (b.id === 'bx3' ? { ...b, ativo: false } : b));
  assert.match(salvar(sem3).erros[0], /carro agendado/);
});
const nomeDe = (id) => R.nomeBox(st(), id);

test('com um só box ativo, o segundo carro no mesmo horário diz "O box está ocupado"', () => {
  // cancela o que ocupa os outros boxes e deixa só o Box 1
  for (const a of st().agendamentos.filter((x) => ['a_confirmar', 'confirmado'].includes(x.status) && x.boxId !== 'bx1')) assert.ok(agenda.cancelar(a.id).ok);
  assert.ok(estabelecimento.salvar({ boxes: st().estabelecimento.boxes.map((b) => (b.id === 'bx1' ? b : { ...b, ativo: false })) }).ok);
  const d = dia(9);
  ok(criar({ profissionalId: 'u-davi', inicio: tsAt(d, '10:00') }));
  const r = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculoId: 've-i1', inicio: tsAt(d, '10:00'), status: 'confirmado' });
  assert.equal(r.ok, false); assert.equal(r.erros[0], 'O box está ocupado nesse horário.');
});

// ---------- serviço de vários dias ----------
test('vitrificação de SUV (15 h): usa só o expediente, passa para o dia seguinte, e o carro fica no box até a retirada', () => {
  const d = dia(10); const d2 = dia(11);
  const a = ok(criar({ clienteId: 'c-jon', veiculoId: 've-j2', veiculo: undefined, servicoIds: ['s-vitrificacao'], profissionalId: 'u-pablo', inicio: tsAt(d, '09:00') }));
  assert.equal(a.porte, 'suv'); assert.equal(a.precos['s-vitrificacao'], 2600);
  const o = R.ocupacaoDe(st(), ag(a.id));
  assert.equal(o.dias, 2);
  // expediente da Apex: 09:00 às 20:00 sem pausa (11 h no primeiro dia, 4 h no segundo)
  assert.deepEqual(o.blocos.map(([x, y]) => [x, y]), [[tsAt(d, '09:00'), tsAt(d, '20:00')], [tsAt(d2, '09:00'), tsAt(d2, '13:00')]]);
  assert.equal(R.retiradaDe(st(), ag(a.id)), tsAt(d2, '13:00'));
  assert.deepEqual(o.box, [tsAt(d, '09:00'), tsAt(d2, '13:10')]);
  // o esteticista fica livre depois da retirada, mas não durante o serviço
  assert.deepEqual(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d2, '13:10'), servicoIds: ['s-lav-simples'], porte: 'pequeno' }).erros, []);
  assert.match(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d2, '12:00'), servicoIds: ['s-lav-simples'], porte: 'pequeno' }).erros[0], /já está confirmado/);
  // outro esteticista no meio do serviço pega outro box
  const b = ok(criar({ clienteId: 'c-marcelo', profissionalId: 'u-davi', inicio: tsAt(d2, '10:00') }));
  assert.notEqual(b.boxId, a.boxId);
});

test('vários dias: a entrada precisa cair no expediente (09h às 20h); fora dele é recusado', () => {
  const d = dia(10);
  assert.match(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d, '08:30'), servicoIds: ['s-vitrificacao'], porte: 'suv' }).erros[0], /não atende/);
  assert.match(agenda.validar({ profissionalId: 'u-pablo', inicio: tsAt(d, '20:30'), servicoIds: ['s-vitrificacao'], porte: 'suv' }).erros[0], /não atende/);
});

test('serviço de vários dias: dono cria com duração até 10 dias; serviço comum continua limitado a 24 h', () => {
  const base = sv('s-polim-tecnico');
  const longo = { ...base, id: undefined, nome: 'Restauração completa', codigo: '', duracoes: { pequeno: 2000, medio: 2400, grande: 3000, suv: 3600, pickup: 3600 } };
  assert.ok(servicos.salvar(longo).ok);
  assert.equal(servicos.salvar({ ...longo, nome: 'Outra restauração', codigo: '', multiDia: false }).ok, false, 'sem "vários dias", mais de 24 h não vale');
  assert.equal(servicos.salvar({ ...longo, nome: 'Absurda', codigo: '', duracoes: { ...longo.duracoes, suv: 15000 } }).ok, false, 'mais de 10 dias não vale');
});

// ---------- combos ----------
test('combo: preço e duração próprios por porte; consome os materiais dos serviços que o compõem', () => {
  const combo = sv('s-combo-det-cera');
  assert.equal(R.servicoNoPorte(combo, 'medio').preco, 210);
  assert.ok(R.servicoNoPorte(combo, 'medio').duracao < 110 + 60, 'combo dura menos que os dois separados');
  const mats = R.materiaisDoServico(st(), combo);
  const por = Object.fromEntries(mats.map((m) => [m.materialId, m.qtd]));
  assert.equal(por['mt-cera'], 40); assert.equal(por['mt-shampoo'], 50); assert.equal(por['mt-microfibra'], 3 + 1);
  // concluído: baixa o estoque do combo
  const d = dia(8);
  const a = ok(criar({ servicoIds: ['s-combo-det-cera'], inicio: tsAt(d, '14:00') }));
  const antes = st().materiais.find((m) => m.id === 'mt-cera').estoque;
  store.avancar(tsAt(d, '19:00') - store.agora());
  assert.equal(ag(a.id).status, 'concluido');
  assert.equal(st().materiais.find((m) => m.id === 'mt-cera').estoque, antes - 40);
});

test('combo: 2 a 10 serviços comuns; combo dentro de combo e serviço inexistente são recusados', () => {
  const novo = (extra) => servicos.salvar({ ...sv('s-combo-det-cera'), id: undefined, nome: `Combo ${Math.random()}`, codigo: '', ...extra });
  assert.ok(novo({ componentes: ['s-lav-simples', 's-enceramento'] }).ok);
  assert.equal(novo({ componentes: ['s-lav-simples'] }).ok, false);
  assert.equal(novo({ componentes: ['s-lav-simples', 's-combo-det-cera'] }).ok, false, 'combo dentro de combo');
  assert.equal(novo({ componentes: ['s-lav-simples', 'nao-existe'] }).ok, false);
  assert.equal(novo({ componentes: ['s-lav-simples', 's-lav-simples'] }).ok, false);
  // serviço que faz parte de combo não é apagado: só desativa
  const r = servicos.remover('s-enceramento');
  assert.ok(r.ok && r.desativado);
});

test('tabela de preço e duração: só o Médio (base) é obrigatório, específicos válidos; sem tabela, vale o valor único no Médio', () => {
  const s = sv('s-lav-motor');
  const salva = (extra) => servicos.salvar({ ...s, ...extra });
  assert.equal(salva({ precos: { pequeno: 1 }, preco: undefined, duracao: undefined }).ok, false, 'sem o Médio nem preço base');
  assert.ok(salva({ precos: { pequeno: 1 } }).ok, 'preço específico de um porte só: o Médio vem do preço base');
  assert.equal(sv('s-lav-motor').precos.pequeno, 1);
  assert.ok(salva({ precos: { ...sv('s-lav-motor').precos, pequeno: 40 } }).ok);
  assert.equal(salva({ precos: { ...s.precos, suv: -1 } }).ok, false);
  assert.equal(salva({ precos: { ...s.precos, suv: 'abc' } }).ok, false);
  assert.equal(salva({ precos: { ...s.precos, foguete: 5 } }).ok, false);
  assert.equal(salva({ duracoes: { ...s.duracoes, grande: 0 } }).ok, false);
  assert.equal(salva({ duracoes: { ...s.duracoes, grande: 1441 } }).ok, false);
  assert.ok(salva({ precos: { ...s.precos, suv: 95 }, duracoes: { ...s.duracoes, suv: 55 }, preco: 999, duracao: 999 }).ok, 'a tabela vale mais que o valor único');
  assert.deepEqual([sv('s-lav-motor').precos.suv, sv('s-lav-motor').duracoes.suv, sv('s-lav-motor').preco], [95, 55, 70], 'preco espelha o médio');
  assert.ok(salva({ precos: undefined, duracoes: undefined, preco: 50, duracao: 30 }).ok);
  assert.deepEqual(sv('s-lav-motor').precos, { medio: 50 }, 'sem tabela só o Médio fica salvo; os outros portes saem do fator');
  assert.equal(sv('s-lav-motor').categoria, 'Lavagem', 'editar o preço não apaga a categoria');
});

// ---------- marcadores de andamento ----------
test('Em serviço e Pronto para retirada são marcadores sobre o Confirmado: aparecem só nele, e o aviso do carro pronto sai uma vez', () => {
  const d = dia(8);
  const a = ok(criar({ clienteId: 'c-marcelo', veiculoId: 've-m1', veiculo: undefined, inicio: tsAt(d, '10:00') }));
  const agora = () => store.agora();
  assert.deepEqual(marcadoresDe(ag(a.id), agora()), ['confirmado']);
  assert.ok(agenda.iniciarServico(a.id).ok);
  assert.deepEqual(marcadoresDe(ag(a.id), agora()), ['confirmado', 'em-servico']);
  const m = st().mensagensCliente.length;
  assert.ok(agenda.marcarPronto(a.id).ok);
  assert.deepEqual(marcadoresDe(ag(a.id), agora()), ['confirmado', 'pronto']);
  const aviso = st().mensagensCliente.filter((x) => x.agendamentoId === a.id && x.modeloId === 'm-carro-pronto');
  assert.equal(aviso.length, 1); assert.equal(st().mensagensCliente.length, m + 1);
  assert.match(aviso[0].texto, /Civic ABC1D23/); assert.match(aviso[0].texto, /pronto/i);
  assert.ok(agenda.marcarPronto(a.id).ok, 'repetir não falha');
  assert.equal(st().mensagensCliente.filter((x) => x.agendamentoId === a.id && x.modeloId === 'm-carro-pronto').length, 1, 'sem aviso em dobro');
  // desfazer
  assert.ok(agenda.desmarcarAndamento(a.id, 'pronto').ok);
  assert.deepEqual(marcadoresDe(ag(a.id), agora()), ['confirmado', 'em-servico']);
  assert.equal(agenda.desmarcarAndamento(a.id, 'pronto').ok, false);
  assert.equal(agenda.desmarcarAndamento(a.id, 'qualquer').ok, false);
  assert.ok(agenda.desmarcarAndamento(a.id, 'emServico').ok);
  assert.deepEqual(marcadoresDe(ag(a.id), agora()), ['confirmado']);
});

test('marcadores só valem para confirmado: a confirmar, cancelado e concluído são recusados', () => {
  const d = dia(8);
  const p = ok(criar({ status: 'a_confirmar', inicio: tsAt(d, '10:00') }));
  assert.equal(agenda.iniciarServico(p.id).ok, false); assert.equal(agenda.marcarPronto(p.id).ok, false);
  const c = ok(criar({ clienteId: 'c-igor', veiculoId: 've-i1', veiculo: undefined, profissionalId: 'u-davi', inicio: tsAt(d, '10:00') }));
  assert.ok(agenda.cancelar(c.id).ok);
  assert.equal(agenda.iniciarServico(c.id).ok, false);
  assert.equal(agenda.iniciarServico('nao-existe').ok, false);
});

test('remarcar, cancelar ou voltar a "a confirmar" desliga os marcadores', () => {
  const d = dia(8);
  const a = ok(criar({ inicio: tsAt(d, '10:00') }));
  agenda.iniciarServico(a.id); agenda.marcarPronto(a.id);
  assert.ok(agenda.remarcar(a.id, { inicio: tsAt(dia(9), '10:00') }).ok);
  assert.ok(!ag(a.id).emServico && !ag(a.id).pronto);
  agenda.iniciarServico(a.id);
  assert.ok(agenda.alterarStatus(a.id, 'a_confirmar').ok);
  assert.ok(!ag(a.id).emServico);
  assert.ok(agenda.alterarStatus(a.id, 'confirmado').ok);
  agenda.marcarPronto(a.id);
  assert.ok(agenda.cancelar(a.id).ok);
  assert.ok(!ag(a.id).pronto);
});

test('carro pronto espera a retirada: não conclui sozinho em 24 h; depois disso conclui. Sem o marcador, conclui no fim do serviço', () => {
  const d = dia(8);
  const a = ok(criar({ clienteId: 'c-marcelo', veiculoId: 've-m1', veiculo: undefined, inicio: tsAt(d, '10:00') }));
  const b = ok(criar({ clienteId: 'c-igor', veiculoId: 've-i1', veiculo: undefined, profissionalId: 'u-davi', inicio: tsAt(d, '10:00') }));
  store.avancar(tsAt(d, '10:30') - store.agora());
  assert.ok(agenda.marcarPronto(a.id).ok);
  store.avancar(tsAt(d, '12:00') - store.agora());
  assert.equal(ag(b.id).status, 'concluido', 'sem marcador conclui no fim do serviço');
  assert.equal(ag(a.id).status, 'confirmado', 'pronto espera a retirada');
  store.avancar(22 * HORA); // 10:00 do dia seguinte: ainda dentro das 24 h do carro pronto (10:30)
  assert.equal(ag(a.id).status, 'confirmado');
  store.avancar(3 * HORA);
  assert.equal(ag(a.id).status, 'concluido');
});

// ---------- mensagens ----------
test('modelos novos: carro pronto e cancelamento, com o veículo; cancelamento é só manual; os demais trazem o veículo', () => {
  const m = (chave) => st().modelos.find((x) => x.chave === chave);
  assert.ok(m('carro_pronto') && m('cancelamento'));
  assert.deepEqual(validarModelo(m('carro_pronto'), st().modelos), validarModelo(m('carro_pronto'), st().modelos));
  assert.ok(!MODELOS_SO_AUTOMATICOS.includes('cancelamento') && !MODELOS_SO_AUTOMATICOS.includes('carro_pronto'));
  for (const chave of ['confirmacao', 'lembrete_24h', 'lembrete_2h', 'aviso', 'cancelamento', 'cliente_agendou', 'recusado']) assert.match(m(chave).corpo, /veículo|\{\{3\}\}|\{\{2\}\}/i, chave);
  const d = dia(8);
  const a = ok(criar({ clienteId: 'c-marcelo', veiculoId: 've-m1', veiculo: undefined, inicio: tsAt(d, '10:00') }));
  const r = agenda.enviarMensagem(a.id, m('cancelamento').id);
  assert.ok(r.ok, JSON.stringify(r));
  const msg = st().mensagensCliente.find((x) => x.agendamentoId === a.id && x.modeloId === m('cancelamento').id);
  assert.match(msg.texto, /Civic ABC1D23/); assert.match(msg.texto, /Lavagem simples/);
});

// ---------- Pix e comissão pelo preço do porte ----------
test('Pix cobra o preço do porte do veículo, e o Pix cobre o mesmo valor que o atendimento', () => {
  const d = dia(8);
  const cpf = st().clientes.find((c) => c.id === 'c-igor').cpf;
  const pickup = ok(criar({ clienteId: 'c-igor', veiculoId: 've-i1', veiculo: undefined, servicoIds: ['s-lav-detalhada'], inicio: tsAt(d, '09:00') }));
  const rp = financeiro.gerarCobranca(pickup.id, { cpf });
  assert.ok(rp.ok, JSON.stringify(rp)); assert.equal(rp.cobranca.valor, 150);
  const pequeno = ok(criar({ clienteId: 'c-jon', veiculoId: 've-j1', veiculo: undefined, profissionalId: 'u-davi', servicoIds: ['s-lav-detalhada'], inicio: tsAt(d, '09:00') }));
  const rq = financeiro.gerarCobranca(pequeno.id, { cpf: '284.510.937-79' });
  assert.ok(rq.ok, JSON.stringify(rq)); assert.equal(rq.cobranca.valor, 90);
});

test('comissão sai do preço do porte (e do combo, que tem preço próprio); o dono fica com 100% do que atende', () => {
  const d = dia(8);
  const a = ok(criar({ clienteId: 'c-igor', veiculoId: 've-i1', veiculo: undefined, servicoIds: ['s-lav-detalhada'], inicio: tsAt(d, '09:00') }));
  const c = comissaoDoAgendamento(st(), ag(a.id));
  assert.equal(c.base, 150); assert.equal(c.comissao, 75); assert.equal(c.casa, 75);
  const b = ok(criar({ clienteId: 'c-marcelo', veiculoId: 've-m1', veiculo: undefined, servicoIds: ['s-combo-det-cera'], inicio: tsAt(d, '14:00') }));
  const cb = comissaoDoAgendamento(st(), ag(b.id));
  assert.equal(cb.base, 210); assert.equal(cb.comissao, 105);
  const dono = ok(criar({ clienteId: 'c-jon', veiculoId: 've-j2', veiculo: undefined, profissionalId: 'u-davi', servicoIds: ['s-lav-simples'], inicio: tsAt(d, '09:00') }));
  const cd = comissaoDoAgendamento(st(), ag(dono.id));
  assert.equal(cd.base, 70); assert.equal(cd.comissao, 70);
  // mudar o porte do cadastro depois não muda a comissão já combinada
  const cl = st().clientes.find((x) => x.id === 'c-igor');
  assert.ok(clientes.salvar({ ...cl, veiculos: [{ ...cl.veiculos[0], porte: 'pequeno' }] }).ok);
  assert.equal(comissaoDoAgendamento(st(), ag(a.id)).base, 150);
});

// ---------- link do cliente, com veículo ----------
const tel = (i) => `(51) 9${String(7000 + i).padStart(4, '0')}-${String(2000 + i).padStart(4, '0')}`;
const pedir = (i, inicio, extra = {}) => publico.agendar({ nome: `Cliente Link ${i}`, telefone: tel(i), placa: `LNK${1000 + i}`, modelo: 'Gol', porte: 'pequeno', servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio, ...extra });

test('link: a página só vê nome, preço e duração por porte; nada de custo, material ou comissão', () => {
  const cfg = publico.config();
  assert.deepEqual(cfg.portes.map((p) => p.id), ['pequeno', 'medio', 'grande', 'suv', 'pickup']);
  const s = cfg.servicos.find((x) => x.id === 's-lav-simples');
  assert.deepEqual(s.precos, { pequeno: 40, medio: 50, grande: 60, suv: 70, pickup: 70 });
  assert.deepEqual(s.duracoes, { pequeno: 30, medio: 40, grande: 45, suv: 50, pickup: 50 });
  const txt = JSON.stringify(cfg);
  for (const proibido of ['materiais', 'comissao', 'custo', 'cpf', 'grupoMovimentacao', 'senha']) assert.ok(!txt.includes(proibido), proibido);
  assert.ok(cfg.servicos.find((x) => x.id === 's-vitrificacao').multiDia);
});

test('link: sem porte não há horário; horários só trazem { inicio, profissionalId }; o porte muda quais horários cabem', () => {
  const d = dia(9);
  assert.deepEqual(publico.horarios({ profissionalId: 'u-pablo', servicoIds: ['s-cristalizacao'], dayTs: d }).length, 0, 'sem porte não oferece nada');
  assert.equal(publico.horarios({ profissionalId: 'u-pablo', servicoIds: ['s-cristalizacao'], porte: 'foguete', dayTs: d }).length, 0);
  const pick = publico.horarios({ profissionalId: 'u-pablo', servicoIds: ['s-cristalizacao'], porte: 'pickup', dayTs: d });
  const peq = publico.horarios({ profissionalId: 'u-pablo', servicoIds: ['s-cristalizacao'], porte: 'pequeno', dayTs: d });
  assert.ok(pick.length > 0 && peq.length >= pick.length);
  for (const h of pick) assert.deepEqual(Object.keys(h).sort(), ['inicio', 'profissionalId']);
  const ultimo = (l) => Math.max(...l.map((h) => h.inicio));
  assert.ok(ultimo(pick) <= tsAt(d, '15:30'), 'cristalização de pickup (4h30) precisa começar até 15:30 para terminar às 20h');
  assert.ok(ultimo(peq) > ultimo(pick), 'a do pequeno (3h) cabe mais tarde que a da pickup');
});

test('link: fluxo completo com veículo — pedido, cadastro do cliente e do carro, avisos, Meus agendamentos e remarcar', () => {
  const d = dia(9);
  const h = publico.horarios({ profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], porte: 'pequeno', dayTs: d })[0];
  assert.ok(h);
  const n = st().clientes.length;
  const r = pedir(1, h.inicio);
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamentoId);
  assert.equal(a.status, 'a_confirmar'); assert.equal(a.origem, 'link'); assert.equal(a.porte, 'pequeno'); assert.ok(a.boxId);
  assert.deepEqual(a.veiculo, { placa: 'LNK-1001', marca: '', modelo: 'Gol', cor: '', porte: 'pequeno' });
  assert.equal(st().clientes.length, n + 1);
  const c = st().clientes.find((x) => x.id === a.clienteId);
  assert.equal(c.veiculos.length, 1); assert.equal(c.veiculos[0].placa, 'LNK-1001');
  assert.equal(a.precos['s-lav-simples'], 40);
  assert.ok(st().avisosPainel.some((x) => x.agendamentoId === a.id && /Gol LNK-1001/.test(x.texto)));
  const msg = st().mensagensCliente.find((x) => x.agendamentoId === a.id);
  assert.match(msg.texto, /Gol LNK-1001/);
  // Meus agendamentos (token do pedido)
  const meus = publico.meus(r.token);
  assert.ok(meus.ok !== false, JSON.stringify(meus));
  const meu = meus.futuros.find((x) => x.id === a.id);
  assert.deepEqual(meu.veiculo, { placa: 'LNK-1001', modelo: 'Gol', porte: 'pequeno' }); assert.equal(meu.total, 40);
  assert.ok(meu.retirada > a.inicio);
  // o mesmo cliente volta com a mesma placa: não duplica o veículo
  const h2 = publico.horarios({ profissionalId: 'u-davi', servicoIds: ['s-lav-simples'], porte: 'pequeno', dayTs: dia(10) })[0];
  const r2 = pedir(1, h2.inicio, { profissionalId: 'u-davi', placa: 'lnk-1001' });
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal(st().clientes.find((x) => x.id === c.id).veiculos.length, 1);
  // remarcar pelo link preserva veículo e porte
  const dias = publico.diasParaRemarcar(r.token, a.id, d, 10);
  assert.ok(dias.length > 0);
  const slots = publico.horariosParaRemarcar(r.token, a.id, dias[0]);
  assert.ok(slots.length > 0);
  const m = publico.remarcar(r.token, a.id, slots[0].inicio);
  assert.ok(m.ok, JSON.stringify(m));
  assert.equal(ag(a.id).porte, 'pequeno'); assert.equal(ag(a.id).veiculo.placa, 'LNK-1001'); assert.equal(ag(a.id).reagendado, true);
});

test('link: placa inválida, modelo vazio e porte inválido são recusados e nada é gravado', () => {
  const h = publico.horarios({ profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], porte: 'medio', dayTs: dia(9) })[0];
  const n = st().clientes.length;
  const m = st().mensagensCliente.length;
  for (const extra of [{ placa: 'XXX' }, { placa: '' }, { placa: undefined }, { modelo: '' }, { modelo: undefined }, { porte: 'gigante' }, { porte: undefined }, { placa: 12345 }]) {
    const r = pedir(2, h.inicio, extra);
    assert.equal(r.ok, false, JSON.stringify(extra));
  }
  assert.equal(st().clientes.length, n); assert.equal(st().mensagensCliente.length, m);
});

test('link: três boxes cheios escondem o horário (mesmo com esteticista livre); depois do serviço o box volta', () => {
  assert.ok(equipe.salvar({ nome: 'Rui Teste', apelido: 'Rui', cpf: '529.982.247-25', email: 'rui@apexestetica.com.br', senha: '1234', papel: 'profissional', telefone: '(55) 99999-0000' }).ok);
  const rui = st().usuarios.find((u) => u.apelido === 'Rui').id;
  const d = dia(9);
  ok(criar({ clienteId: 'c-marcelo', profissionalId: 'u-davi', inicio: tsAt(d, '10:00') }));
  ok(criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', veiculo: undefined, veiculoId: 've-i1', inicio: tsAt(d, '10:00') }));
  ok(criar({ clienteId: 'c-jon', profissionalId: 'u-marcelo', veiculo: undefined, veiculoId: 've-j1', inicio: tsAt(d, '10:00') }));
  const horas = publico.horarios({ profissionalId: rui, servicoIds: ['s-lav-simples'], porte: 'medio', dayTs: d }).map((x) => x.inicio);
  assert.ok(!horas.includes(tsAt(d, '10:00')), 'sem box livre');
  assert.ok(!horas.includes(tsAt(d, '10:30')), 'o box segue ocupado até 10:50');
  assert.ok(horas.includes(tsAt(d, '09:00')) && horas.includes(tsAt(d, '11:00')), 'antes e depois do serviço o box está livre');
  const r = pedir(3, tsAt(d, '10:00'), { profissionalId: rui, porte: 'medio' });
  assert.equal(r.ok, false);
});

test('link: ligado e desligado — desligado não oferece horário nem aceita pedido', () => {
  assert.ok(estabelecimento.salvar({ linkAgendamento: { ativo: false, diasMax: 30 } }).ok);
  assert.equal(publico.horarios({ profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], porte: 'medio', dayTs: dia(9) }).length, 0);
  assert.equal(pedir(4, tsAt(dia(9), '10:00')).ok, false);
});

// ---------- WhatsApp ----------
test('WhatsApp: disponibilidade e agendamento usam o porte e o veículo; sem eles, nada é oferecido', async () => {
  const { whatsapp } = await import('../src/services/api.js');
  const d = dia(9);
  assert.deepEqual(whatsapp.horariosLivres({ profissionalId: 'u-pablo', dayTs: d, servicoIds: ['s-lav-simples'] }), []);
  const livres = whatsapp.horariosLivres({ profissionalId: 'u-pablo', dayTs: d, servicoIds: ['s-lav-simples'], porte: 'medio' });
  assert.ok(livres.length > 10);
  const tel = '(55) 99711-4020'; // Marcelo
  const r = whatsapp.agendar({ telefone: tel, nome: 'Marcelo Santos', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: livres[0], veiculo: { placa: 'wpp-1234', modelo: 'Polo', porte: 'grande' } });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  assert.equal(a.porte, 'grande'); assert.equal(a.veiculo.placa, 'WPP-1234'); assert.equal(a.precos['s-lav-simples'], 60);
  assert.ok(st().clientes.find((c) => c.id === a.clienteId).veiculos.some((v) => v.placa === 'WPP-1234'));
  assert.equal(whatsapp.agendar({ telefone: tel, nome: 'Marcelo Santos', profissionalId: 'u-davi', servicoIds: ['s-lav-simples'], inicio: livres[1], veiculo: { placa: 'ruim', modelo: 'Polo', porte: 'grande' } }).ok, false);
});

// ---------- tema escuro por padrão ----------
test('visual: o tema escuro é o padrão e o claro é opcional (sem depender do sistema), com a mesma lista de cores nos dois', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const raiz = css.match(/:root\s*\{([^}]*)\}/)[1];
  assert.match(raiz, /color-scheme:\s*dark/);
  assert.match(css, /\[data-theme="light"\]\s*\{/);
  assert.doesNotMatch(css, /prefers-color-scheme/, 'o tema não segue o sistema');
  assert.match(raiz, /--acento:/);
});

// ---------- identidade da Apex (perfil do WhatsApp da loja) ----------
test('identidade: logo válida, tema verde→lima, endereço, telefone e expediente 09h–20h vêm no exemplo; o endereço sai na página pública', () => {
  const e = st().estabelecimento;
  assert.equal(logoValida(e.logo), true);
  assert.equal(e.temaCor, 'logo'); assert.equal(e.corTema, '#4ada54'); assert.equal(e.corTema2, '#d9e652');
  assert.ok(coresDoTema(e));
  assert.equal(e.telefone, '(55) 9235-8784');
  assert.match(e.endereco, /Visconde de Pelotas, 412.*Santa Maria/);
  for (const d of [1, 2, 3, 4, 5, 6]) assert.deepEqual(e.escala.semana[d].faixas, [['09:00', '20:00']]);
  assert.equal(e.escala.semana[0].aberto, false);
  assert.equal(publico.config().endereco, e.endereco);
  assert.deepEqual(st().usuarios.filter((u) => u.atende).map((u) => u.apelido).slice(0, 2), ['Davi', 'Pablo']);
  assert.equal(estabelecimento.salvar({ endereco: 'x'.repeat(201) }).ok, false);
  assert.ok(estabelecimento.salvar({ endereco: 'Rua Nova, 1' }).ok);
  assert.equal(st().estabelecimento.endereco, 'Rua Nova, 1');
});
