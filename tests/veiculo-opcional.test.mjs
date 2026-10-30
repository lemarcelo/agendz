/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v121: placa, modelo, porte e veículo podem deixar de ser obrigatórios no Atender e no link do cliente (estética); o que for informado sempre é conferido.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, estabelecimento, publico } from '../src/services/api.js';
import { limparVeiculoComRegras } from '../src/domain/veiculos.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const ag = (id) => st().agendamentos.find((a) => a.id === id);
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const regras = (local, futuro = []) => assert.ok(estabelecimento.salvar({ camposObrigatorios: { futuro, local } }).ok);

test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar();
  auth.logout(); assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});

test('limparVeiculoComRegras: o que não é exigido pode faltar; o que vem é conferido', () => {
  assert.deepEqual(limparVeiculoComRegras(null, []), { ok: true, veiculo: null, completo: false });
  assert.equal(limparVeiculoComRegras(null, ['placa']).ok, false);
  assert.equal(limparVeiculoComRegras({}, undefined).ok, false); // sem lista vale a regra antiga (tudo)
  const so = limparVeiculoComRegras({ placa: 'abc1d23' }, []);
  assert.ok(so.ok && !so.completo); assert.equal(so.veiculo.placa, 'ABC1D23'); assert.equal(so.veiculo.porte, 'medio');
  assert.match(limparVeiculoComRegras({ placa: 'XX' }, []).erro, /Placa inválida/);
  assert.match(limparVeiculoComRegras({ modelo: 'Onix', porte: 'gigante' }, []).erro, /porte/i);
  assert.match(limparVeiculoComRegras({ modelo: 'Onix' }, ['placa']).erro, /placa/i);
  assert.match(limparVeiculoComRegras({ placa: 'ABC1D23', modelo: 'Onix' }, ['porte']).erro, /porte/i);
  assert.ok(limparVeiculoComRegras({ placa: 'ABC1D23', modelo: 'Onix', porte: 'suv' }, ['placa', 'modelo', 'porte']).completo);
});

test('Atender sem veículo: com a regra vazia registra no porte médio, sem veículo no atendimento', () => {
  regras([]);
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'pix' });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  assert.ok(!a.veiculo); assert.equal(a.precos['s-lav-simples'], st().servicos.find((s) => s.id === 's-lav-simples').precos.medio);
});

test('Atender: cada campo do veículo só é exigido se marcado', () => {
  const base = { servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'pix' };
  regras(['placa']);
  assert.match(agenda.atender({ ...base, veiculo: { modelo: 'Onix' } }).erros[0], /placa/i);
  regras(['porte']);
  assert.match(agenda.atender({ ...base, veiculo: { modelo: 'Onix', placa: 'ABC1D23' } }).erros[0], /porte/i);
  regras(['modelo']);
  assert.match(agenda.atender({ ...base, veiculo: { placa: 'ABC1D23' } }).erros[0], /modelo/i);
  regras([]);
  // só a placa: vale como foto do atendimento (não entra no cadastro de um cliente sem modelo)
  const r = agenda.atender({ ...base, veiculo: { placa: 'ABC1D23' } });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  assert.equal(a.veiculo.placa, 'ABC1D23'); assert.equal(a.veiculo.modelo, ''); assert.equal(a.porte, 'medio');
  // placa informada errada continua recusada mesmo sem ser obrigatória
  assert.match(agenda.atender({ ...base, veiculo: { placa: 'ZZ99' } }).erros[0], /Placa inválida/);
});

test('agendamento futuro respeita a mesma regra (lista do futuro)', () => {
  regras([], []);
  const d = dia(3);
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', nome: 'Fulano', inicio: tsAt(d, '10:00'), status: 'confirmado' });
  assert.ok(r.ok, JSON.stringify(r));
  regras([], ['veiculo']);
  const r2 = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', nome: 'Fulano', inicio: tsAt(d, '14:00'), status: 'confirmado' });
  assert.equal(r2.ok, false); assert.match(r2.erros[0], /veículo/i);
});

test('regras do Atender aceitam os campos do veículo e recusam lixo', () => {
  assert.ok(estabelecimento.salvar({ camposObrigatorios: { futuro: ['veiculo', 'placa', 'modelo', 'porte'], local: ['placa'] } }).ok);
  assert.equal(estabelecimento.salvar({ camposObrigatorios: { futuro: ['cor'], local: [] } }).ok, false);
});

test('link do cliente: nome, placa, modelo e porte podem ser dispensados pelo dono', () => {
  const sv = 's-lav-simples';
  const pedir = (o) => { const d = dia(4); return publico.agendar({ servicoIds: [sv], inicio: tsAt(d, '10:00'), telefone: '(51) 97001-2001', profissionalId: 'u-pablo', ...o }); };
  // fábrica: tudo obrigatório
  assert.equal(pedir({ nome: 'Ana' }).ok, false);
  const link = (extra) => assert.ok(estabelecimento.salvar({ linkAgendamento: { ativo: true, diasMax: 30, telefoneObrigatorio: true, ...extra } }).ok);
  link({ veiculoObrigatorio: [] });
  const r = pedir({ nome: 'Ana' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(!ag(r.agendamentoId).veiculo);
  link({ veiculoObrigatorio: ['placa'] });
  assert.match(pedir({ nome: 'Beto', modelo: 'Onix' }).erros[0], /placa/i);
  // sem nome obrigatório e sem telefone obrigatório
  link({ veiculoObrigatorio: [], nomeObrigatorio: false, telefoneObrigatorio: false });
  const anon = publico.agendar({ servicoIds: [sv], profissionalId: 'u-pablo', inicio: tsAt(dia(5), '10:00') });
  assert.ok(anon.ok, JSON.stringify(anon));
  assert.equal(ag(anon.agendamentoId).nomeAvulso, 'Sem nome');
  // nome de uma letra continua recusado
  assert.equal(publico.agendar({ servicoIds: [sv], profissionalId: 'u-pablo', inicio: tsAt(dia(5), '14:00'), nome: 'A' }).ok, false);
  // validação da configuração
  assert.equal(estabelecimento.salvar({ linkAgendamento: { ativo: true, diasMax: 30, veiculoObrigatorio: ['cor'] } }).ok, false);
  assert.equal(estabelecimento.salvar({ linkAgendamento: { ativo: true, diasMax: 30, nomeObrigatorio: 'sim' } }).ok, false);
});
