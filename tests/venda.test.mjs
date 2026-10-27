// Venda de produto sem serviço (atendimento local só com produto) e vendedor diferente do esteticista: quem vendeu ganha a comissão do produto.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, comissoes, equipe, financeiro } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { comissaoDoAgendamento, partesDoAgendamento, relatorioDoProfissional } from '../src/domain/comissao.js';
import { relatorioMensal } from '../src/domain/reports.js';
import { monthStart } from '../src/domain/time.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a + JSON.stringify(r)); };
const ag = (id) => st().agendamentos.find((a) => a.id === id);
const mat = (id) => st().materiais.find((m) => m.id === id);
const mes = () => monthStart(Date.now());
test.beforeEach(() => {
  mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi');
  const c = equipe.salvar({ nome: 'Ana Atendente', apelido: 'Ana', cpf: '529.982.247-25', email: 'ana@x.com', telefone: '(55) 99999-0000', senha: '1234', papel: 'atendente', atende: false });
  assert.ok(c.ok, JSON.stringify(c));
});
const ana = () => st().usuarios.find((u) => u.apelido === 'Ana').id;
const pomada = (qtd = 2) => [{ materialId: 'pr-aromatizante', qtd }];

test('venda só de produto: sem serviço, nasce concluída, baixa estoque, e a comissão é do vendedor (não do esteticista da coluna)', () => {
  const antes = mat('pr-aromatizante').estoque;
  const r = agenda.registrarLocal({ produtos: pomada(2), vendedorId: ana() });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  assert.deepEqual(a.servicoIds, []); assert.equal(a.status, 'concluido'); assert.equal(a.local, true);
  assert.equal(a.produtos[0].vendedorId, ana());
  assert.equal(mat('pr-aromatizante').estoque, antes - 2);
  assert.ok(st().usuarios.find((u) => u.id === a.profissionalId && u.atende), 'fica na coluna de quem atende');
  const partes = partesDoAgendamento(st(), a);
  assert.equal(partes.length, 1); assert.equal(partes[0].quem, ana());
  assert.equal(partes[0].comissao, 9); assert.equal(partes[0].casa, 81);
  const rel = relatorioMensal(st(), { mesTs: mes() });
  assert.equal(rel.linhas.find((l) => l.a.id === a.id).total, 90, 'entra no faturamento');
});

test('recusas: nada escolhido, vendedor inexistente ou conta técnica, produto ruim, sem vendedor na venda só de produto', () => {
  assert.equal(agenda.registrarLocal({}).ok, false);
  assert.equal(agenda.registrarLocal({ servicoIds: [], produtos: [] }).ok, false);
  assert.equal(agenda.registrarLocal({ produtos: pomada(1), vendedorId: 'nao-existe' }).ok, false);
  assert.equal(agenda.registrarLocal({ produtos: [{ materialId: 'mt-shampoo', qtd: 1 }], vendedorId: ana() }).ok, false, 'material comum não é produto');
  assert.equal(agenda.registrarLocal({ produtos: pomada(0), vendedorId: ana() }).ok, false);
  assert.equal(agenda.registrarLocal({ produtos: pomada(9999), vendedorId: ana() }).ok, false);
  assert.equal(st().agendamentos.filter((a) => a.local).length, 0, 'nada ficou gravado');
});

test('serviço e produto com vendedor diferente: o esteticista fica só com o serviço; o vendedor, com a comissão do produto', () => {
  const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', produtos: pomada(2), vendedorId: ana() });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  const p = partesDoAgendamento(st(), a);
  assert.deepEqual(p.map((x) => x.quem), ['u-pablo', ana()]);
  assert.equal(p[0].comissao, 20); assert.equal(p[0].produtos.length, 0);
  assert.equal(p[1].comissao, 9); assert.equal(p[1].itens.length, 0);
  const total = comissaoDoAgendamento(st(), a);
  assert.equal(total.comissao, 29); assert.equal(total.casa, 20 + 81);
  // "Meus ganhos" do esteticista: só o serviço, sem valor cheio, casa nem percentual
  const k = relatorioDoProfissional(st(), { mesTs: mes(), profissionalId: 'u-pablo' });
  const dele = k.linhas.find((l) => l.id === a.id);
  assert.equal(dele.receber, 20); assert.deepEqual(dele.servicos, ['Lavagem simples']);
  assert.equal(JSON.stringify(k).match(/casa|pct|base|valor/i), null);
  // O vendedor vê a venda dele
  const v = relatorioDoProfissional(st(), { mesTs: mes(), profissionalId: ana() });
  assert.equal(v.totais.receber, 9); assert.deepEqual(v.linhas[0].servicos, ['2× Aromatizante automotivo (venda)']);
});

test('sem informar vendedor, quem vende é quem está lançando (se pode vender); sem permissão, cai para o esteticista do atendimento', () => {
  const r = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', produtos: pomada(1) });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(ag(r.agendamento.id).produtos[0].vendedorId, 'u-davi', 'o proprietário que lançou é o vendedor');
  como('ana');
  const r2 = agenda.registrarLocal({ produtos: pomada(1) });
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal(ag(r2.agendamento.id).produtos[0].vendedorId, ana());
  como('davi');
  assert.ok(equipe.salvar({ ...st().usuarios.find((u) => u.id === ana()), podeVender: false }).ok);
  como('ana');
  const r3 = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', produtos: pomada(1) });
  assert.ok(r3.ok, JSON.stringify(r3));
  assert.equal(ag(r3.agendamento.id).produtos[0].vendedorId, 'u-pablo', 'quem não pode vender não é vendedor: vale o esteticista');
  assert.equal(agenda.registrarLocal({ produtos: pomada(1) }).ok, false, 'sem serviço e sem permissão: ninguém vende');
  como('davi');
  assert.equal(agenda.registrarLocal({ produtos: pomada(1), vendedorId: ana() }).ok, false, 'vendedor sem permissão é recusado');
});

test('esteticista registra no próprio nome e é o próprio vendedor, mesmo que informe outro', () => {
  como('marcelo');
  const r = agenda.registrarLocal({ produtos: pomada(1), vendedorId: 'u-pablo', profissionalId: 'u-pablo' });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  assert.equal(a.profissionalId, 'u-marcelo'); assert.equal(a.produtos[0].vendedorId, 'u-marcelo');
  const linhasDe = (u) => relatorioDoProfissional(st(), { mesTs: mes(), profissionalId: u }).linhas.filter((l) => l.id === a.id);
  assert.equal(linhasDe('u-marcelo')[0].receber, 4.5);
  assert.equal(linhasDe('u-pablo').length, 0);
});

test('adicionar produto a atendimento de outro esteticista: a recepção escolhe o vendedor; o esteticista vende como ele mesmo; vendedor diferente na mesma linha é recusado', () => {
  const id = agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' }).agendamento.id;
  como('ana');
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1, vendedorId: 'u-marcelo' }).ok);
  assert.equal(ag(id).produtos[0].vendedorId, 'u-marcelo');
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1, vendedorId: ana() }).ok, false, 'outro vendedor na mesma linha');
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1, vendedorId: 'fantasma' }).ok, false);
  assert.ok(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1, vendedorId: 'u-marcelo' }).ok, 'mesmo vendedor soma');
  assert.equal(ag(id).produtos[0].qtd, 2);
  como('marcelo');
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1 }).ok, false, 'não é atendimento dele');
  como('pablo');
  assert.equal(agenda.adicionarProduto(id, { materialId: 'pr-aromatizante', qtd: 1, vendedorId: 'u-marcelo' }).ok, false, 'esteticista vende como ele mesmo: a linha é de outro vendedor');
});

test('pagar comissão: cada um recebe a sua parte; pagar o esteticista não paga o vendedor e vice-versa; não paga duas vezes', () => {
  const base = comissoes.relatorio(mes());
  const pablo0 = base.profissionais.find((b) => b.id === 'u-pablo').aPagar; // atendimentos de exemplo do mês
  agenda.registrarLocal({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', produtos: pomada(2), vendedorId: ana() });
  agenda.registrarLocal({ produtos: pomada(1), vendedorId: ana() });
  const r1 = comissoes.relatorio(mes());
  assert.equal(r1.profissionais.find((b) => b.id === ana()).aPagar, 13.5);
  assert.equal(r1.profissionais.find((b) => b.id === 'u-pablo').aPagar, pablo0 + 20);
  assert.equal(r1.totais.casa, base.totais.casa + 20 + 81 + 40.5);
  const p = comissoes.pagar('u-pablo', mes());
  assert.ok(p.ok, JSON.stringify(p)); assert.equal(p.valor, pablo0 + 20);
  assert.equal(comissoes.relatorio(mes()).profissionais.find((b) => b.id === ana()).aPagar, 13.5, 'a parte da Ana continua em aberto');
  const q = comissoes.pagar(ana(), mes());
  assert.ok(q.ok, JSON.stringify(q)); assert.equal(q.valor, 13.5); assert.equal(q.atendimentos, 2);
  assert.equal(comissoes.pagar(ana(), mes()).ok, false); assert.equal(comissoes.pagar('u-pablo', mes()).ok, false);
  assert.ok(st().agendamentos.filter((a) => a.local).every((a) => partesDoAgendamento(st(), a).every((x) => x.paga)));
  const k = relatorioDoProfissional(st(), { mesTs: mes(), profissionalId: ana() });
  assert.equal(k.totais.aReceber, 0); assert.equal(k.totais.jaPago, 13.5);
});

test('proprietário vendendo fica com tudo (sem percentual de produto) e não aparece como comissão a pagar', () => {
  const r = agenda.registrarLocal({ produtos: pomada(2), vendedorId: 'u-davi' });
  assert.ok(r.ok, JSON.stringify(r));
  const p = partesDoAgendamento(st(), ag(r.agendamento.id))[0];
  assert.equal(p.comissao, 90); assert.equal(p.casa, 0);
  const rel = comissoes.relatorio(mes());
  assert.equal(rel.profissionais.find((b) => b.id === 'u-davi').aPagar, 0);
  assert.equal(comissoes.pagar('u-davi', mes()).ok, false);
});

test('produto sem comissão: venda só de produto vira tudo do estabelecimento', () => {
  como('davi');
  const m = mat('pr-aromatizante');
  assert.ok(require_salvar(m, { comissaoPct: null }));
  const r = agenda.registrarLocal({ produtos: pomada(1), vendedorId: ana() });
  assert.ok(r.ok, JSON.stringify(r));
  const p = partesDoAgendamento(st(), ag(r.agendamento.id))[0];
  assert.equal(p.comissao, 0); assert.equal(p.casa, 45);
});
import { estoque } from '../src/services/api.js';
function require_salvar(m, patch) { return estoque.salvarMaterial({ ...m, ...patch }).ok; }
void financeiro;
