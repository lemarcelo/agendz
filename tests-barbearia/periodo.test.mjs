// Entrega A: comissão por período (De/Até), "Meus ganhos" para atendente/admin e trava de itens depois de a comissão ser paga.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, comissoes, equipe, financeiro } from '../src/services/api.js';
import { ERRO_COMISSAO_PAGA } from '../src/domain/rules.js';
import { monthStart } from '../src/domain/time.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a + JSON.stringify(r)); };
const dia = (d) => new Date(`2026-10-${String(d).padStart(2, '0')}T12:00:00-03:00`).getTime();
const irPara = (d) => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date(`2026-10-${String(d).padStart(2, '0')}T07:00:00-03:00`) }); };
const ana = () => st().usuarios.find((u) => u.apelido === 'Ana').id;
const pomada = (qtd = 1) => [{ materialId: 'pr-pomada', qtd }];
test.beforeEach(() => {
  irPara(12); store.reiniciar(); como('alan');
  const c = equipe.salvar({ nome: 'Ana Atendente', apelido: 'Ana', cpf: '529.982.247-25', email: 'ana@x.com', telefone: '(55) 99999-0000', senha: '1234', papel: 'atendente', atende: false });
  assert.ok(c.ok, JSON.stringify(c));
});

test('comissão por período: paga só o que está dentro de De/Até, na data do atendimento', () => {
  const v1 = agenda.registrarLocal({ produtos: pomada(2), vendedorId: ana() }); assert.ok(v1.ok);
  irPara(20); como('alan');
  const v2 = agenda.registrarLocal({ produtos: pomada(1), vendedorId: ana() }); assert.ok(v2.ok);
  const per = { deTs: dia(12), ateTs: dia(14) };
  const r = comissoes.relatorio(per);
  assert.equal(r.profissionais.find((b) => b.id === ana()).aPagar, 9, 'só a venda do dia 12');
  const p = comissoes.pagar(ana(), per);
  assert.ok(p.ok, JSON.stringify(p)); assert.equal(p.valor, 9); assert.equal(p.atendimentos, 1);
  const desp = st().financeiro.lancamentos.find((l) => l.categoria === 'Comissões' && /Ana/.test(l.descricao));
  assert.match(desp.descricao, /Comissão de Ana \(12\/10\/2026 a 14\/10\/2026\)/);
  assert.equal(comissoes.pagar(ana(), per).ok, false, 'não paga de novo');
  const mesInteiro = comissoes.relatorio(monthStart(Date.now()));
  assert.equal(mesInteiro.profissionais.find((b) => b.id === ana()).aPagar, 4.5, 'a venda do dia 20 continua em aberto');
  const q = comissoes.pagar(ana(), { deTs: dia(1), ateTs: dia(31) });
  assert.ok(q.ok); assert.equal(q.valor, 4.5);
  assert.ok(st().financeiro.lancamentos.some((l) => /Comissão de Ana \(outubro de 2026\)/.test(l.descricao)), 'mês inteiro mantém "mês/ano"');
});

test('período: o dia final entra inteiro, o inverso e o longo demais são recusados', () => {
  agenda.registrarLocal({ produtos: pomada(1), vendedorId: ana() });
  assert.equal(comissoes.relatorio({ deTs: dia(12), ateTs: dia(12) }).profissionais.find((b) => b.id === ana()).aPagar, 4.5, 'um dia só');
  assert.equal(comissoes.relatorio({ deTs: dia(13), ateTs: dia(30) }).profissionais.find((b) => b.id === ana()), undefined);
  assert.equal(comissoes.relatorio({ deTs: dia(20), ateTs: dia(12) }).ok, false, 'fim antes do início');
  assert.equal(comissoes.relatorio({ deTs: dia(1), ateTs: dia(1) + 400 * 86400000 }).ok, false, 'mais de 366 dias');
  assert.equal(comissoes.relatorio({ deTs: dia(1) }).ok, false);
  assert.equal(comissoes.pagar(ana(), { deTs: dia(20), ateTs: dia(12) }).ok, false);
  assert.ok(comissoes.relatorio({ deTs: dia(1), ateTs: dia(1) + 365 * 86400000 }).ok, '366 dias cabem');
});

test('Meus ganhos: atendente e admin veem só as linhas deles; o relatório geral e o pagamento continuam do proprietário', () => {
  agenda.registrarLocal({ produtos: pomada(2), vendedorId: ana() });
  como('ana');
  const m = comissoes.meuMes({ deTs: dia(1), ateTs: dia(31) });
  assert.ok(m.ok, JSON.stringify(m)); assert.equal(m.totais.aReceber, 9); assert.equal(m.linhas.length, 1);
  assert.equal(JSON.stringify(m).includes('casa'), false, 'sem parte do estabelecimento');
  assert.equal(comissoes.relatorio({ deTs: dia(1), ateTs: dia(31) }).ok, false);
  assert.equal(comissoes.pagar(ana(), { deTs: dia(1), ateTs: dia(31) }).ok, false);
  como('alan');
  const ad = equipe.salvar({ nome: 'Beto Admin', apelido: 'Beto', cpf: '111.444.777-35', email: 'beto@x.com', telefone: '(55) 98888-0000', senha: '1234', papel: 'admin', atende: false });
  assert.ok(ad.ok, JSON.stringify(ad));
  como('beto');
  const b = comissoes.meuMes(monthStart(Date.now()));
  assert.ok(b.ok); assert.equal(b.linhas.length, 0, 'nada vendido: lista vazia, sem ver as da Ana');
});

test('depois da comissão paga: não adiciona nem retira produto, não troca serviços; o cancelamento segue valendo', () => {
  const r = agenda.registrarLocal({ servicoIds: ['s-tesoura'], profissionalId: 'u-kiko', produtos: pomada(2), vendedorId: ana() });
  assert.ok(r.ok); const id = r.agendamento.id;
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-pomada', qtd: 1, vendedorId: ana() }).ok, 'antes de pagar ainda pode');
  assert.ok(comissoes.pagar('u-kiko', monthStart(Date.now())).ok);
  const linha = st().agendamentos.find((a) => a.id === id).produtos[0];
  for (const x of [agenda.adicionarProduto(id, { materialId: 'pr-pomada', qtd: 1, vendedorId: ana() }), agenda.removerProduto(id, linha.materialId), agenda.editarServicos(id, ['s-barba'])]) {
    assert.equal(x.ok, false); assert.equal(x.erros[0], ERRO_COMISSAO_PAGA);
  }
  assert.ok(comissoes.pagar(ana(), monthStart(Date.now())).ok);
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-pomada', qtd: 1, vendedorId: ana() }).ok, false, 'também depois de pagar o vendedor');
});
