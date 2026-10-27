// Entrega B: forma de pagamento do atendimento local (receita, complemento, estorno), integração Pix ligada/desligada e produto na cobrança Pix.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, estabelecimento, financeiro } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a); };
const lancs = (id) => st().financeiro.lancamentos.filter((l) => l.agendamentoId === id);
const liquido = (id) => lancs(id).reduce((t, l) => t + (l.tipo === 'credito' ? l.valor : -l.valor), 0);
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi'); });

test('atendimento local gera receita na forma padrão (Pix) e na forma escolhida, com a conta da forma', () => {
  const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' });
  assert.ok(r.ok, JSON.stringify(r));
  const [l] = lancs(r.agendamento.id);
  assert.equal(l.tipo, 'credito'); assert.equal(l.valor, 40); assert.equal(l.forma, 'pix'); assert.equal(l.categoria, 'Atendimentos (Pix)'); assert.equal(l.origem, 'atendimento');
  const ct2 = financeiro.salvarConta({ apelido: 'Caixa físico', banco: 'Sicredi', agencia: '0101', conta: '12345-6' });
  assert.ok(ct2.ok, JSON.stringify(ct2));
  assert.ok(estabelecimento.salvar({ contaPorForma: { dinheiro: ct2.conta.id } }).ok);
  const d = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'dinheiro' });
  assert.equal(lancs(d.agendamento.id)[0].contaId, ct2.conta.id, 'dinheiro vai para a conta do dinheiro');
  assert.equal(lancs(d.agendamento.id)[0].forma, 'dinheiro');
  assert.equal(agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'boleto' }).ok, false);
  assert.equal(estabelecimento.salvar({ contaPorForma: { pix: 'nao-existe' } }).ok, false);
});

test('sem forma padrão, o atendimento local obriga escolher a forma', () => {
  assert.ok(estabelecimento.salvar({ formaPagamentoPadrao: '' }).ok);
  const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' });
  assert.equal(r.ok, false); assert.match(r.erros[0], /forma de pagamento/i);
  assert.ok(agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'cartao' }).ok);
  assert.equal(estabelecimento.salvar({ formaPagamentoPadrao: 'boleto' }).ok, false);
});

test('produto acrescentado depois vira nova receita; produto retirado e cancelamento viram estorno', () => {
  const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'cartao' });
  const id = r.agendamento.id;
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1, vendedorId: 'u-pablo' }).ok);
  assert.equal(lancs(id).length, 2); assert.equal(lancs(id).find((l) => /Complemento/.test(l.descricao)).valor, 45); assert.equal(liquido(id), 85);
  assert.ok(agenda.removerProduto(id, 'pr-aromatizante').ok);
  const est = lancs(id).find((l) => l.estorno); assert.equal(est.valor, 45); assert.equal(est.tipo, 'despesa'); assert.equal(est.categoria, 'Estornos'); assert.equal(liquido(id), 40);
  assert.ok(agenda.cancelar(id).ok);
  assert.equal(liquido(id), 0, 'cancelado: nada de receita líquida');
  assert.ok(agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' }).ok);
  assert.equal(lancs(id).length, 4, 'registrar outro atendimento não duplica lançamentos do anterior');
});

test('esteticista registra a forma de pagamento mas não vê o financeiro', () => {
  como('pablo');
  const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], formaPagamento: 'dinheiro' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(financeiro.removerLancamento('f1').ok, false);
  como('davi'); assert.equal(lancs(r.agendamento.id).length, 1);
});

test('sem integração Pix: cobrança, envio e sincronização ficam bloqueados; o Pix local segue como registro', () => {
  const g = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada'], inicio: tsAt(dia(9), '10:00'), status: 'confirmado' });
  assert.ok(g.ok, JSON.stringify(g));
  assert.ok(estabelecimento.salvar({ usaIntegracaoPix: false }).ok);
  const c = financeiro.gerarCobranca(g.agendamento.id, { cpf: '284.510.937-79' });
  assert.equal(c.ok, false); assert.match(c.erros[0], /integração Pix/);
  assert.equal(financeiro.sincronizar(st().financeiro.contas[0].id).ok, false);
  const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'pix' });
  assert.ok(r.ok); assert.equal(lancs(r.agendamento.id)[0].forma, 'pix');
  assert.ok(estabelecimento.salvar({ usaIntegracaoPix: true }).ok);
  assert.ok(financeiro.gerarCobranca(g.agendamento.id, { cpf: '284.510.937-79' }).ok);
  assert.equal(estabelecimento.salvar({ usaIntegracaoPix: 'sim' }).ok, false);
});

test('produto acrescentado a agendamento já pago por Pix avisa a diferença e a cobrança da diferença inclui o produto', () => {
  const g = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada'], inicio: tsAt(dia(9), '10:00'), status: 'confirmado' });
  const id = g.agendamento.id;
  const c = financeiro.gerarCobranca(id, { cpf: '284.510.937-79' });
  assert.ok(c.ok, JSON.stringify(c)); assert.equal(c.cobranca.valor, 40);
  assert.ok(financeiro.confirmarManual(c.cobranca.id, 'recebido').ok);
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1, vendedorId: 'u-pablo' }).ok);
  assert.ok(st().avisosPainel.some((x) => /faltam R\$\s?45,00/.test(x.texto)), 'avisa o que falta');
  const d = financeiro.gerarCobranca(id, { cpf: '284.510.937-79' });
  assert.ok(d.ok, JSON.stringify(d)); assert.equal(d.cobranca.valor, 45); assert.equal(d.cobranca.complementar, true);
});

// ---------- conciliação em grupo ----------
import { bancoSimulado } from '../src/services/api.js';
const extratoPix = (valor, nome = 'Cliente') => { const r = bancoSimulado.lancar({ contaId: 'ct1', tipo: 'credito', valor, descricao: `Pix de ${nome}`, nome, cpf: '284.510.937-79' }); assert.ok(r.ok, JSON.stringify(r)); };
const preparar = () => {
  assert.ok(financeiro.conectarOpenFinance('ct1').ok);
  const a = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' });          // 40
  const b = agenda.registrarLocal({ produtos: [{ materialId: 'pr-aromatizante', qtd: 1 }], vendedorId: 'u-pablo' }); // 45
  assert.ok(a.ok && b.ok);
  return [lancs(a.agendamento.id)[0].id, lancs(b.agendamento.id)[0].id];
};

test('conciliação em grupo: dois lançamentos do balcão casam com um Pix do banco; soma tem de bater; dá para desfazer', () => {
  const [l1, l2] = preparar();
  extratoPix(85); assert.ok(financeiro.sincronizar('ct1').ok);
  const ex = st().financeiro.extrato.find((e) => e.valor === 85);
  assert.equal(ex.status, 'a_classificar', 'receita do balcão não casa sozinha');
  const sug = financeiro.sugestoesConciliacao('ct1').sugestoes;
  assert.equal(sug.length, 1); assert.deepEqual([...sug[0].lancamentoIds].sort(), [l1, l2].sort()); assert.equal(sug[0].extratoId, ex.id);
  // soma errada: só um dos dois
  const ruim = financeiro.conciliarGrupo({ extratoIds: [ex.id], lancamentoIds: [l1] });
  assert.equal(ruim.ok, false); assert.match(ruim.erros[0], /diferença de R\$\s?45,00/);
  const bom = financeiro.conciliarGrupo({ extratoIds: [ex.id], lancamentoIds: [l1, l2] });
  assert.ok(bom.ok, JSON.stringify(bom));
  assert.equal(st().financeiro.extrato.find((e) => e.id === ex.id).status, 'conciliado');
  assert.ok(st().financeiro.lancamentos.filter((l) => [l1, l2].includes(l.id)).every((l) => l.conciliado));
  assert.equal(financeiro.removerLancamento(l1).ok, false, 'conciliado não se remove');
  assert.equal(financeiro.conciliarGrupo({ extratoIds: [ex.id], lancamentoIds: [l1, l2] }).ok, false, 'cada item entra em um só grupo');
  assert.ok(financeiro.desfazerConciliacao(bom.conciliacao.id).ok);
  assert.equal(st().financeiro.extrato.find((e) => e.id === ex.id).status, 'a_classificar');
  assert.ok(st().financeiro.lancamentos.filter((l) => [l1, l2].includes(l.id)).every((l) => !l.conciliado));
});

test('conciliação em grupo: vários itens do banco × vários lançamentos; só mesma conta e mesmo sentido; esteticista não concilia', () => {
  const [l1, l2] = preparar();
  extratoPix(60); extratoPix(25); assert.ok(financeiro.sincronizar('ct1').ok);
  const exs = st().financeiro.extrato.filter((e) => [60, 25].includes(e.valor)).map((e) => e.id);
  const r = financeiro.conciliarGrupo({ extratoIds: exs, lancamentoIds: [l1, l2] });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.conciliacao.valor, 85);
  como('pablo');
  assert.equal(financeiro.conciliarGrupo({ extratoIds: exs, lancamentoIds: [l1] }).ok, false);
  assert.equal(financeiro.sugestoesConciliacao('ct1').ok, false);
  como('davi');
  assert.equal(financeiro.conciliarGrupo({ extratoIds: [], lancamentoIds: [l1] }).ok, false);
  assert.equal(financeiro.conciliarGrupo({ extratoIds: ['x'], lancamentoIds: ['y'] }).ok, false);
});
