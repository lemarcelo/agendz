/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço em todas as modalidades: na estética (Apex) o plano não depende de veículo/porte/box para existir, o item coberto sai de graça
// pelo desconto na linha com o preço do PORTE do veículo, e conflito, status e comissão seguem como sem plano. Também: produto incluído, validade e observações.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, clientes, planos } from '../src/services/api.js';
import { itensDoAgendamento } from '../src/domain/reports.js';
import { modelosDePlanoDoTipo, formularioDoModelo } from '../src/domain/catalogo.js';
import { VALIDADE_MAX } from '../src/domain/planos.js';

const HOJE = new Date('2026-10-12T07:00:00-03:00'); // segunda de manhã
const DIA = 86400000;
const st = () => store.getState();
const em = (dias, hh, mm = 0) => new Date(HOJE.getTime() - 3 * 3600000 + dias * DIA).setUTCHours(hh + 3, mm, 0, 0);
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const ok = (r) => { assert.ok(r.ok, JSON.stringify(r)); return r; };

let CLI; let assin;
const VEI = { placa: 'TST7777', modelo: 'Modelo Teste', porte: 'grande' };
function preparar(extra = {}) {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: HOJE });
  store.reiniciar();
  store.entrarNaLoja('apex');
  como('davi');
  const p = ok(planos.salvar({ nome: 'Lavagem Mensal', preco: 120, cortes: 2, servicoIds: ['s-lav-simples'], adianta: 0, acumuloMeses: 1, intervaloDias: 0, ...extra })).plano;
  CLI = ok(clientes.salvar({ nome: 'Rafael Assinante', telefone: '(51) 98123-4567' })).cliente.id;
  assin = ok(planos.contratar({ clienteId: CLI, planoId: p.id })).assinatura.id;
  ok(planos.pagar(assin, { mes: '2026-10', forma: 'pix' }));
  return p;
}
const criar = (o = {}) => agenda.criar({ clienteId: CLI, profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], veiculo: VEI, status: 'confirmado', inicio: em(1, 10), assinaturaId: assin, ...o });

test.beforeEach(() => preparar());

test('estética: o plano é criado e contratado sem veículo, porte nem box', () => {
  const p = st().planos.find((x) => x.nome === 'Lavagem Mensal');
  assert.ok(p && !('boxId' in p) && !('veiculo' in p) && !('porte' in p));
  assert.ok(st().assinaturas.find((a) => a.id === assin));
});

test('estética: o item coberto sai de graça com o preço do porte (desconto na linha) e consome 1 atendimento', () => {
  const r = ok(criar());
  const a = st().agendamentos.find((x) => x.id === r.agendamento.id);
  const tabela = st().servicos.find((s) => s.id === 's-lav-simples').precos.grande;
  assert.equal(a.planoUso.assinaturaId, assin);
  const itens = itensDoAgendamento(st(), a);
  const linha = itens.find((i) => i.servicoId === 's-lav-simples' || i.id === 's-lav-simples') || itens[0];
  assert.equal(linha.desconto, tabela, 'desconto = preço do porte do veículo');
  assert.equal(a.status, 'confirmado', 'status não muda por causa do plano');
});

test('estética: o plano não muda conflito (mesmo box/profissional no mesmo horário continua recusado)', () => {
  ok(criar());
  const outro = criar({ clienteId: 'c-marcelo', assinaturaId: undefined, veiculo: { placa: 'TST7778', modelo: 'X', porte: 'medio' } });
  assert.equal(outro.ok, false, 'mesmo profissional e horário: recusa igual a sem plano');
});

test('produto incluído no plano sai de graça em 1 unidade; a segunda unidade volta ao preço de tabela', () => {
  const mat = st().materiais.find((m) => m.id === 'pr-aromatizante');
  preparar({ produtoIds: [mat.id] });
  const id = ok(criar()).agendamento.id;
  assert.ok(st().agendamentos.find((x) => x.id === id).planoUso.produtosIncluidos.includes(mat.id));
  ok(agenda.adicionarProduto(id, { materialId: mat.id, qtd: 1 }));
  let linha = st().agendamentos.find((x) => x.id === id).produtos.find((p) => p.materialId === mat.id);
  assert.equal(linha.preco, 0); assert.equal(linha.precoTabela, 45); assert.equal(linha.plano, true);
  ok(agenda.adicionarProduto(id, { materialId: mat.id, qtd: 1 }));
  linha = st().agendamentos.find((x) => x.id === id).produtos.find((p) => p.materialId === mat.id);
  assert.equal(linha.qtd, 2); assert.equal(linha.preco, 45, 'passou de 1 unidade: preço normal');
  assert.ok(!linha.plano);
});

test('validade e observações: salvar limita, saneia e recusa fora da faixa', () => {
  const ruim = planos.salvar({ nome: 'Plano ruim', preco: 100, cortes: 2, servicoIds: ['s-lav-simples'], validadeMeses: VALIDADE_MAX + 1 });
  assert.equal(ruim.ok, false);
  const bom = ok(planos.salvar({ nome: 'Plano bom', preco: 100, cortes: 2, servicoIds: ['s-lav-simples'], validadeMeses: 6, observacoes: '  Só com agendamento.  ' })).plano;
  assert.equal(bom.validadeMeses, 6);
  assert.equal(bom.observacoes, 'Só com agendamento.');
});

test('modelos sugeridos: a estética tem os seus e o formulário vem sem salvar nada', () => {
  const antes = st().planos.length;
  const modelos = modelosDePlanoDoTipo('estetica_automotiva');
  assert.equal(modelos.length, 3);
  const f = formularioDoModelo(modelos[0], st().servicos, st().materiais);
  assert.ok(f.form.nome && f.form.preco > 0);
  assert.equal(st().planos.length, antes);
});
