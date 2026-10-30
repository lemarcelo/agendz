/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v119: trocar a forma de pagamento do agendamento (segurar o cartão). Domínio + API simulada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';

const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const VEI = { placa: 'ABC1D23', marca: 'Honda', modelo: 'Civic', cor: 'Prata', porte: 'medio' };
const atender = (extra = {}) => {
  const d = { servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'dinheiro', clienteId: 'c-igor', ...extra };
  const v = store.getState().clientes.find((c) => c.id === d.clienteId)?.veiculos?.[0];
  if (v) d.veiculoId = v.id; else d.veiculo = VEI;
  const r = agenda.atender(d); assert.ok(r.ok, JSON.stringify(r)); return r.agendamento.id;
};
const futuro = () => { const d = new Date(); d.setDate(d.getDate() + 3); if (d.getDay() === 0) d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d.getTime(); };
const ag = (id) => store.getState().agendamentos.find((x) => x.id === id);
const lancs = (id) => store.getState().financeiro.lancamentos.filter((l) => l.agendamentoId === id && l.origem === 'atendimento');
test.beforeEach(() => reiniciar());

test('concluído local: a receita já lançada muda de forma, conta e categoria; o histórico registra; igual não repete', () => {
  como('davi');
  const id = atender();
  assert.equal(ag(id).pagamento.forma, 'dinheiro');
  const antes = lancs(id); assert.equal(antes.length, 1); assert.equal(antes[0].forma, 'dinheiro');
  const r = agenda.mudarFormaPagamento(id, 'cartao'); assert.ok(r.ok, JSON.stringify(r));
  assert.equal(ag(id).pagamento.forma, 'cartao');
  const depois = lancs(id); assert.equal(depois.length, 1, 'continua uma receita só');
  assert.equal(depois[0].forma, 'cartao'); assert.match(depois[0].categoria, /Cartão/); assert.match(depois[0].descricao, /\(Cartão\)/); assert.doesNotMatch(depois[0].descricao, /Dinheiro/);
  assert.equal(depois[0].valor, antes[0].valor);
  const log = ag(id).log.filter((l) => l.campo === 'forma de pagamento'); assert.equal(log.length, 1); assert.equal(log[0].de, 'Dinheiro'); assert.equal(log[0].para, 'Cartão');
  assert.ok(agenda.mudarFormaPagamento(id, 'cartao').ok);
  assert.equal(ag(id).log.filter((l) => l.campo === 'forma de pagamento').length, 1, 'mesma forma: sem novo registro');
  assert.equal(lancs(id).length, 1, 'o relógio não lança de novo');
});
test('recusa: pagamento conciliado com o banco, cancelado, forma inválida, id estranho', () => {
  como('davi');
  const id = atender();
  lancs(id)[0].conciliado = true; // simula a conciliação (estado direto só no teste)
  const r = agenda.mudarFormaPagamento(id, 'pix'); assert.equal(r.ok, false); assert.match(r.erros[0], /conciliado/);
  assert.equal(ag(id).pagamento.forma, 'dinheiro'); assert.equal(lancs(id)[0].forma, 'dinheiro', 'nada mudou');
  for (const f of ['boleto', '', undefined, null, 7, { $ne: 1 }, ['pix']]) assert.equal(agenda.mudarFormaPagamento(id, f).ok, false, String(f));
  for (const i of ['', undefined, null, 5, { a: 1 }, 'x'.repeat(80), 'nao-existe']) assert.equal(agenda.mudarFormaPagamento(i, 'pix').ok, false, String(i));
  const id2 = atender({ inicio: futuro() });
  assert.ok(agenda.cancelar(id2).ok);
  const c = agenda.mudarFormaPagamento(id2, 'pix'); assert.equal(c.ok, false); assert.match(c.erros[0], /cancelad/);
});
test('agendamento futuro: guarda a escolha, sem receita no financeiro', () => {
  como('davi');
  const id = atender({ inicio: futuro() });
  const antes = store.getState().financeiro.lancamentos.length;
  assert.ok(agenda.mudarFormaPagamento(id, 'pix').ok);
  assert.equal(ag(id).pagamento.forma, 'pix');
  assert.equal(store.getState().financeiro.lancamentos.length, antes, 'futuro não lança dinheiro');
  assert.ok(agenda.mudarFormaPagamento(id, 'cartao').ok);
  assert.equal(ag(id).log.filter((l) => l.campo === 'forma de pagamento').length, 2);
});
test('permissão: profissional só nos próprios; sem login nada', () => {
  como('davi');
  const doPablo = atender(); const doMarcelo = atender({ profissionalId: 'u-marcelo', clienteId: 'c-jon' });
  como('pablo');
  assert.ok(agenda.mudarFormaPagamento(doPablo, 'cartao').ok);
  const r = agenda.mudarFormaPagamento(doMarcelo, 'cartao'); assert.equal(r.ok, false);
  assert.equal(ag(doMarcelo).pagamento.forma, 'dinheiro', 'o de outro profissional não mudou');
  auth.logout();
  assert.equal(agenda.mudarFormaPagamento(doPablo, 'pix').ok, false);
  assert.equal(ag(doPablo).pagamento.forma, 'cartao');
});
