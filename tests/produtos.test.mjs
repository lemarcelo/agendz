// Adicionar serviços (sem mudar o status) e produtos (material do tipo produto) a agendamentos e atendimentos locais.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, estoque, servicos, comissoes } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { relatorioMensal, totalProdutos, totalAgendamento } from '../src/domain/reports.js';
import { comissaoDoAgendamento } from '../src/domain/comissao.js';
import { monthStart } from '../src/domain/time.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a); };
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi'); });
const mat = (id) => st().materiais.find((m) => m.id === id);
const local = (extra = {}) => { const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', vendedorId: 'u-pablo', ...extra }); assert.ok(r.ok, JSON.stringify(r)); return r.agendamento.id; };
const ag = (id) => st().agendamentos.find((a) => a.id === id);

test('adicionar serviço a atendimento local concluído: não muda o status, entra no valor, no relatório, na comissão e baixa o estoque', () => {
  const id = local();
  const pomada = mat('mt-shampoo').estoque; const lamina = mat('mt-argila').estoque;
  const antes = totalAgendamento(st(), ag(id));
  const r = agenda.adicionarServicos(id, ['s-lav-motor']);
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(id);
  assert.equal(a.status, 'concluido'); assert.deepEqual(a.servicoIds, ['s-lav-simples', 's-lav-motor']); assert.ok(a.servicosFeitos.includes('s-lav-motor'));
  assert.equal(totalAgendamento(st(), a), antes + 35);
  assert.equal(a.comissoes['s-lav-motor'], 50);
  assert.equal(comissaoDoAgendamento(st(), a).itens.length, 2);
  assert.equal(mat('mt-argila').estoque, lamina - 1, 'material da barba baixou na diferença');
  assert.equal(mat('mt-shampoo').estoque, pomada, 'o que já tinha baixado não baixa de novo');
  const rel = relatorioMensal(st(), { mesTs: monthStart(Date.now()) });
  assert.equal(rel.linhas.find((l) => l.a.id === id).servicos, 75);
});

test('adicionar serviço a agendamento confirmado mantém o status; repetido, cancelado e inexistente são recusados', () => {
  const r0 = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: new Date('2026-10-14T14:00:00-03:00').getTime(), status: 'confirmado' });
  assert.ok(r0.ok, JSON.stringify(r0));
  const id = r0.agendamento.id;
  assert.ok(agenda.adicionarServicos(id, ['s-lav-motor']).ok);
  assert.equal(ag(id).status, 'confirmado');
  assert.equal(agenda.adicionarServicos(id, ['s-lav-motor']).ok, false, 'repetido');
  assert.equal(agenda.adicionarServicos(id, ['nao-existe']).ok, false);
  assert.equal(agenda.adicionarServicos(id, []).ok, false);
  assert.ok(agenda.cancelar(id).ok);
  assert.equal(agenda.adicionarServicos(id, ['s-higien-interna']).ok, false, 'cancelado não recebe');
});

test('material tem tipo: produto exige preço, não entra como material de serviço, e a troca de tipo é protegida', () => {
  const r = estoque.salvarMaterial({ nome: 'Shampoo', tipo: 'produto', preco: 30, unidade: 'un', estoque: 5, custo: 12 });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.material.tipo, 'produto'); assert.equal(r.material.preco, 30);
  assert.equal(estoque.salvarMaterial({ nome: 'Sem preço', tipo: 'produto' }).ok, false);
  assert.equal(estoque.salvarMaterial({ nome: 'Tipo ruim', tipo: 'xyz' }).ok, false);
  assert.equal(estoque.salvarMaterial({ id: 'mt-shampoo', nome: 'Pomada modeladora', tipo: 'produto', preco: 10 }).ok, false, 'usado em serviços como material');
  const sv = st().servicos.find((s) => s.id === 's-lav-motor');
  assert.equal(servicos.salvar({ ...sv, materiais: [{ materialId: r.material.id, qtd: 1 }] }).ok, false, 'produto não é material de serviço');
  assert.equal(mat('mt-shampoo').tipo ?? 'material', 'material');
});

test('produto em atendimento local: soma no total, sai do estoque, não entra no desconto, comissiona pelo percentual do produto, e vira linha no relatório', () => {
  const id = local({ produtos: [{ materialId: 'pr-aromatizante', qtd: 2 }] });
  const a = ag(id);
  assert.deepEqual(a.produtos, [{ materialId: 'pr-aromatizante', qtd: 2, preco: 45, pct: 10, vendedorId: 'u-pablo' }]);
  assert.equal(mat('pr-aromatizante').estoque, 10);
  assert.equal(totalProdutos(st(), a), 90);
  const c = comissaoDoAgendamento(st(), a);
  assert.equal(c.base, 130); assert.equal(c.produtos[0].pct, 10);
  assert.equal(c.comissao, 20 + 9, 'serviço 50% de 40 + produto 10% de 90');
  assert.equal(c.casa, 101);
  const rel = relatorioMensal(st(), { mesTs: monthStart(Date.now()) });
  const l = rel.linhas.find((x) => x.a.id === id);
  assert.equal(l.produtos, 90); assert.equal(l.total, 130);
  assert.equal(rel.totais.produtos, 90); assert.equal(rel.porProduto[0].qtd, 2);
  // custo do produto entra no custo de materiais
  assert.ok(rel.custoMateriais >= 44);
});

test('adicionar e retirar produto depois: só a diferença mexe no estoque; sem estoque, recusa; log registra', () => {
  const id = local();
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-cera-spray', qtd: 3 }).ok);
  assert.equal(mat('pr-cera-spray').estoque, 5);
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-cera-spray', qtd: 1 }).ok);
  assert.equal(ag(id).produtos[0].qtd, 4); assert.equal(mat('pr-cera-spray').estoque, 4);
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-cera-spray', qtd: 5 }).ok, false, 'estoque insuficiente');
  assert.ok(agenda.removerProduto(id, 'pr-cera-spray').ok);
  assert.equal(mat('pr-cera-spray').estoque, 8, 'volta ao estoque');
  assert.ok(ag(id).log.some((l) => l.campo === 'produtos'));
  for (const q of [0, -1, 1.5, 1000, 'abc']) assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-cera-spray', qtd: q }).ok, false, String(q));
  assert.equal(agenda.adicionarProduto(id, { materialId: 'mt-shampoo', qtd: 1 }).ok, false, 'material não é produto');
  assert.equal(agenda.adicionarProduto(id, { materialId: 'nada', qtd: 1 }).ok, false);
});

test('produto em agendamento ainda não concluído só baixa ao concluir; cancelado não recebe; esteticista só mexe no dele', () => {
  const r0 = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: new Date('2026-10-14T14:00:00-03:00').getTime(), status: 'confirmado' });
  const id = r0.agendamento.id;
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1 }).ok);
  assert.equal(mat('pr-aromatizante').estoque, 12, 'ainda não baixou');
  assert.ok(agenda.alterarStatus(id, 'concluido').ok);
  assert.equal(mat('pr-aromatizante').estoque, 11);
  assert.ok(agenda.alterarStatus(id, 'confirmado').ok);
  assert.equal(mat('pr-aromatizante').estoque, 12, 'estorno ao deixar de estar concluído');
  como('marcelo');
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1 }).ok, false, 'agendamento de outro esteticista');
  assert.equal(agenda.adicionarServicos(id, ['s-lav-motor']).ok, false);
  como('davi');
  assert.ok(agenda.cancelar(id).ok);
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1 }).ok, false, 'cancelado');
});

test('comissão do produto: percentual opcional, congelado ao vender, só o proprietário define; produto sem percentual não comissiona', () => {
  // sem percentual (óleo): tudo é do estabelecimento
  const id = local({ produtos: [{ materialId: 'pr-cera-spray', qtd: 1 }] });
  let c = comissaoDoAgendamento(st(), ag(id));
  assert.equal(c.produtos[0].comissao, 0); assert.equal(c.comissao, 20); // só o serviço
  // define 20% no óleo: o atendimento antigo não muda; o novo usa 20%
  const o = mat('pr-cera-spray');
  assert.ok(estoque.salvarMaterial({ ...o, comissaoPct: 20 }).ok);
  assert.equal(mat('pr-cera-spray').comissaoPct, 20);
  c = comissaoDoAgendamento(st(), ag(id));
  assert.equal(c.produtos[0].pct, 0, 'congelado');
  const id2 = local({ produtos: [{ materialId: 'pr-cera-spray', qtd: 2 }] });
  assert.equal(comissaoDoAgendamento(st(), ag(id2)).produtos[0].comissao, 15.2); // 20% de 76
  // validações e permissão
  for (const v of [101, -5, 'abc']) assert.equal(estoque.salvarMaterial({ ...mat('pr-cera-spray'), comissaoPct: v }).ok, false, String(v));
  assert.ok(estoque.salvarMaterial({ ...mat('pr-cera-spray'), comissaoPct: '' }).ok); assert.equal(mat('pr-cera-spray').comissaoPct, null);
  assert.equal(estoque.salvarMaterial({ ...mat('mt-shampoo'), comissaoPct: 30 }).ok, true); assert.equal(mat('mt-shampoo').comissaoPct, null, 'material não comissiona');
});

test('relatório do esteticista inclui a comissão do produto e o nome dele, sem preço nem parte da casa', () => {
  como('pablo');
  const id = local({ produtos: [{ materialId: 'pr-aromatizante', qtd: 2 }] });
  const rel = comissoes.meuMes(monthStart(Date.now()));
  const l = rel.linhas.find((x) => x.id === id);
  assert.ok(l.servicos.includes('2× Aromatizante automotivo (venda)'));
  assert.equal(l.receber, 29);
  assert.ok(!JSON.stringify(rel).includes('casa'));
});


test('agendamento de cliente já concluído também recebe serviço e produto, sem mudar o status nem cobrar nada', () => {
  const concl = st().agendamentos.find((a) => a.status === 'concluido' && !a.local && a.clienteId);
  assert.ok(concl, 'a seed tem atendimento concluído de cliente');
  const novo = st().servicos.find((s) => !concl.servicoIds.includes(s.id) && s.ativo !== false);
  const cobr = st().financeiro.cobrancas.length;
  const total = totalAgendamento(st(), concl);
  assert.ok(agenda.adicionarServicos(concl.id, [novo.id]).ok);
  assert.ok(agenda.adicionarProduto(concl.id, { materialId: 'pr-cera-spray', qtd: 1 }).ok);
  const a = ag(concl.id);
  assert.equal(a.status, 'concluido');
  assert.ok(a.servicosFeitos.includes(novo.id));
  assert.equal(totalAgendamento(st(), a), total + novo.preco);
  assert.equal(totalProdutos(st(), a), 38);
  assert.equal(st().financeiro.cobrancas.length, cobr, 'concluído não gera cobrança nova');
  assert.equal(st().mensagensCliente.filter((m) => m.agendamentoId === a.id && m.em >= Date.now()).length, 0);
});

// ---------- v52: status escolhido à mão depois do horário é respeitado ----------
test('status escolhido manualmente com o horário já passado não é desfeito pelo sistema (confirmado e a confirmar)', () => {
  const id = local();
  const passado = st().agendamentos.find((a) => a.status === 'concluido' && !a.local && a.clienteId && a.inicio < Date.now());
  // concluído -> confirmado, horário já passou: continua confirmado
  assert.ok(agenda.alterarStatus(passado.id, 'confirmado').ok);
  store.avancar(60 * 60 * 1000);
  assert.equal(ag(passado.id).status, 'confirmado', 'não conclui sozinho');
  // confirmado -> a confirmar: continua, sem cancelar por falta de confirmação e sem mensagem ao cliente
  const msgs = st().mensagensCliente.length;
  assert.ok(agenda.alterarStatus(passado.id, 'a_confirmar').ok);
  store.avancar(24 * 60 * 60 * 1000);
  assert.equal(ag(passado.id).status, 'a_confirmar', 'não cancela sozinho');
  assert.equal(ag(passado.id).faltaConfirmacao, null);
  assert.equal(st().mensagensCliente.length, msgs, 'nenhuma mensagem ao cliente');
  // concluído e cancelado escolhidos à mão continuam
  assert.ok(agenda.alterarStatus(passado.id, 'cancelado').ok); store.avancar(3600000);
  assert.equal(ag(passado.id).status, 'cancelado');
  assert.ok(agenda.alterarStatus(passado.id, 'concluido').ok); store.avancar(3600000);
  assert.equal(ag(passado.id).status, 'concluido');
  assert.ok(id);
});

test('sem escolha manual o fluxo automático continua: confirmado futuro conclui sozinho; a confirmar vencido cancela', () => {
  const futuro = st().agendamentos.find((a) => a.status === 'confirmado' && a.inicio > Date.now());
  const pend = st().agendamentos.find((a) => a.status === 'a_confirmar' && a.inicio > Date.now());
  assert.ok(agenda.alterarStatus(futuro.id, 'confirmado').ok);
  store.avancar(5 * 24 * 60 * 60 * 1000);
  assert.equal(ag(futuro.id).status, 'concluido', 'escolha feita antes do horário não congela');
  assert.equal(ag(pend.id).statusManual ?? null, null);
  store.avancar(5 * 24 * 60 * 60 * 1000);
  assert.equal(ag(pend.id).status, 'cancelado');
});

test('remarcar libera o status manual de volta ao fluxo automático', () => {
  const passado = st().agendamentos.find((a) => a.status === 'concluido' && !a.local && a.clienteId && a.inicio < Date.now());
  agenda.alterarStatus(passado.id, 'a_confirmar');
  assert.ok(ag(passado.id).statusManual);
  const novoInicio = new Date('2026-10-20T10:00:00-03:00').getTime();
  const r = agenda.remarcar(passado.id, { inicio: novoInicio, profissionalId: passado.profissionalId, status: 'a_confirmar' });
  assert.ok(r.ok, JSON.stringify(r.erros));
  store.avancar(40 * 24 * 60 * 60 * 1000); assert.equal(ag(passado.id).status, 'cancelado', 'volta a valer a regra automática');
});
