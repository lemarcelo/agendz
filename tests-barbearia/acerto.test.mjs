// Valor pago que sobrou (agendamento cancelado, ou serviço excluído): o barbeiro escolhe crédito, despesa (devolvido pelo banco) ou devolvido por fora.
// Crédito é avisado ao cliente no WhatsApp só depois da confirmação; novo agendamento avisa do agendamento pago pendente de análise;
// a saída do banco concilia com a despesa e não soma ao que o cliente pagou.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, financeiro, bancoSimulado } from '../src/services/api.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { creditoDoCliente, pendenciasDeAnalise, situacaoPorConta } from '../src/domain/financeiro.js';

const st = () => store.getState();
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const CPF = '284.510.937-79';
const sit = (id) => situacaoPorConta(st(), st().agendamentos.find((x) => x.id === id))[0];
const aviso = (tipo) => st().avisosPainel.filter((x) => x.tipo === tipo);
// Máquina (40) + Barba (35) = 75, pago por Pix.
function pago(n = 9) {
  como('alan');
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-kiko', servicoIds: ['s-maquina', 's-barba'], inicio: tsAt(dia(n), '10:00'), status: 'confirmado' });
  assert.ok(r.ok, JSON.stringify(r));
  const c = financeiro.gerarCobranca(r.agendamento.id, { cpf: CPF }).cobranca;
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  return { a: r.agendamento, c };
}
test.beforeEach(() => store.reiniciar());

test('excluir um serviço de agendamento pago deixa a diferença pendente de decisão: nada é decidido nem enviado sozinho', () => {
  const { a } = pago();
  const m = st().mensagensCliente.length;
  assert.ok(agenda.editarServicos(a.id, ['s-maquina']).ok);
  assert.equal(pendenciasDeAnalise(st(), 'c-marcelo').length, 1);
  assert.equal(pendenciasDeAnalise(st(), 'c-marcelo')[0].valor, 35);
  assert.equal(st().financeiro.creditos.length + st().financeiro.baixas.length, 0);
  assert.equal(st().mensagensCliente.length, m);
});

test('destino "crédito": vira crédito, o cliente é avisado no WhatsApp com o valor e o saldo, e a pendência some', () => {
  const { a } = pago();
  agenda.editarServicos(a.id, ['s-maquina']);
  const m = st().mensagensCliente.length;
  const r = financeiro.acertarValorPago(a.id, 'credito');
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(creditoDoCliente(st(), 'c-marcelo', undefined, store.agora()), 35);
  const msg = st().mensagensCliente[0];
  assert.equal(st().mensagensCliente.length, m + 1);
  assert.equal(msg.modeloNome, 'Crédito registrado'); assert.match(msg.texto, /35,00/);
  assert.equal(pendenciasDeAnalise(st(), 'c-marcelo').length, 0);
  assert.equal(sit(a.id).falta, 0);
  assert.equal(financeiro.acertarValorPago(a.id, 'credito').ok, false, 'não acerta duas vezes');
});

test('destino "despesa": lança a despesa Devoluções; a saída do banco concilia com ela e não soma ao que o cliente pagou', () => {
  como('alan');
  financeiro.conectarOpenFinance('ct1');
  const { a, c } = pago();
  agenda.editarServicos(a.id, ['s-maquina']);
  const m = st().mensagensCliente.length;
  assert.ok(financeiro.acertarValorPago(a.id, 'despesa').ok);
  assert.equal(st().mensagensCliente.length, m, 'despesa não avisa o cliente');
  const l = st().financeiro.lancamentos.find((x) => x.origem === 'devolucao');
  assert.equal(l.tipo, 'despesa'); assert.equal(l.valor, 35); assert.equal(l.categoria, 'Devoluções'); assert.equal(l.conciliado, false);
  assert.equal(creditoDoCliente(st(), 'c-marcelo', undefined, store.agora()), 0);
  // o cliente pagou 75 e continua com 75 pagos; o débito do banco só concilia a despesa
  const antes = st().financeiro.cobrancas.find((x) => x.id === c.id).valor;
  bancoSimulado.lancar({ tipo: 'debito', valor: 35, descricao: 'Pix enviado', nome: 'Marcelo Santos' });
  assert.equal(st().financeiro.lancamentos.find((x) => x.id === l.id).conciliado, true);
  assert.equal(st().financeiro.extrato.filter((e) => e.tipo === 'debito' && e.valor === 35 && e.status === 'conciliado').length, 1);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).valor, antes);
  assert.equal(st().financeiro.cobrancas.filter((x) => x.status === 'paga').length, 1, 'a saída não vira pagamento');
  assert.equal(st().financeiro.lancamentos.filter((x) => x.tipo === 'credito').length, 1, 'nenhuma receita nova');
  assert.equal(pendenciasDeAnalise(st(), 'c-marcelo').length, 0);
});

test('destino "devolvido por fora": só registra; sem lançamento, sem crédito, sem mensagem', () => {
  const { a } = pago();
  agenda.cancelar(a.id); store.avancar(60000);
  const lanc = st().financeiro.lancamentos.length, m = st().mensagensCliente.length;
  assert.ok(financeiro.acertarValorPago(a.id, 'fora').ok);
  assert.equal(st().financeiro.lancamentos.length, lanc);
  assert.equal(st().financeiro.baixas.length, 1); assert.equal(st().financeiro.baixas[0].valor, 75);
  assert.equal(creditoDoCliente(st(), 'c-marcelo', undefined, store.agora()), 0);
  assert.equal(st().mensagensCliente.length, m);
  assert.equal(aviso('devolver').every((x) => x.lido), true);
  assert.equal(agenda.alterarStatus(a.id, 'confirmado').ok, false, 'valor acertado: precisa de novo agendamento');
});

test('agendar de novo com agendamento pago pendente: o painel é avisado dizendo exatamente qual agendamento; acertar o resolve', () => {
  const { a } = pago(9);
  agenda.cancelar(a.id); store.avancar(60000);
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-kiko', servicoIds: ['s-maquina'], inicio: tsAt(dia(10), '10:00'), status: 'confirmado' });
  assert.ok(r.ok, JSON.stringify(r));
  const av = aviso('revisar');
  assert.equal(av.length, 1);
  assert.equal(av[0].agendamentoId, r.agendamento.id); assert.equal(av[0].pendenteId, a.id);
  assert.match(av[0].texto, /pendente de análise/); assert.match(av[0].texto, /Corte na máquina \+ Barba/); assert.match(av[0].texto, /R\$ 75,00/); assert.match(av[0].texto, /cancelado/);
  assert.equal(av[0].lido, false);
  assert.ok(financeiro.acertarValorPago(a.id, 'credito').ok);
  assert.equal(aviso('revisar')[0].lido, true);
  // sem pendência, agendar não avisa
  const r2 = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-kiko', servicoIds: ['s-maquina'], inicio: tsAt(dia(11), '10:00'), status: 'confirmado' });
  assert.ok(r2.ok); assert.equal(aviso('revisar').length, 1);
});

test('permissões: despesa exige o Financeiro; outro barbeiro não acerta agendamento alheio; destino inválido é recusado', () => {
  const { a } = pago();
  agenda.cancelar(a.id); store.avancar(60000);
  como('tailuan'); // barbeiro: sem Financeiro e agenda de outro
  assert.equal(financeiro.acertarValorPago(a.id, 'credito').ok, false);
  assert.equal(financeiro.acertarValorPago(a.id, 'despesa').ok, false);
  como('kiko'); // dono do agendamento, mas sem a seção Financeiro
  assert.equal(financeiro.acertarValorPago(a.id, 'despesa').ok, false, 'despesa mexe no financeiro');
  assert.equal(financeiro.acertarValorPago(a.id, 'qualquer').ok, false);
  assert.ok(financeiro.acertarValorPago(a.id, 'fora').ok);
});

test('acertos parciais somam no máximo o que foi pago: crédito de parte e o resto por fora', () => {
  const { a } = pago();
  agenda.editarServicos(a.id, ['s-maquina']);               // 35 a mais
  assert.ok(financeiro.acertarValorPago(a.id, 'fora').ok);   // 35 devolvidos por fora
  agenda.cancelar(a.id); store.avancar(60000);
  assert.ok(financeiro.acertarValorPago(a.id, 'credito').ok); // o que sobrou (40) vira crédito
  assert.equal(creditoDoCliente(st(), 'c-marcelo', undefined, store.agora()), 40);
  assert.equal(st().financeiro.baixas.reduce((t, x) => t + x.valor, 0) + st().financeiro.creditos.reduce((t, x) => t + x.valor, 0), 75);
});
