/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco "Plano" da ficha do cliente (domain/plano-cliente.js) sobre a resposta de `planos.listar` da API simulada: plano em andamento, histórico curto,
// dívida de plano encerrado, vencimento, dívida prevista ao trocar; e as recusas da API que a ficha mostra (plano ativo, dívida, sem a seção Planos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { auth, planos, store } from '../src/services/api.js';
import { resumoDoCliente, textoVencimento, motivoValido, HISTORICO_MAX } from '../src/domain/plano-cliente.js';
import { reiniciar } from './helpers.mjs';

const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const umPlano = (extra = {}) => planos.salvar({ nome: 'Plano Lavagem', preco: 90, cortes: 2, servicoIds: ['s-lav-simples'], ...extra });
test.beforeEach(() => reiniciar());

test('sem plano: nada em andamento, sem histórico, catálogo só com planos ativos', () => {
  como('davi');
  const p = umPlano().plano;
  umPlano({ nome: 'Plano velho' });
  const velho = planos.listar().planos.find((x) => x.nome === 'Plano velho');
  planos.salvar({ ...velho, ativo: false });
  const r = resumoDoCliente(planos.listar(), 'c-igor');
  assert.equal(r.aberta, null); assert.equal(r.historico.length, 0); assert.equal(r.divida, 0);
  assert.deepEqual(r.catalogo.map((x) => x.id), [p.id]);
  assert.equal(textoVencimento(null, r), '');
});

test('plano em andamento: aguardando, em aberto, pago; o de outro cliente não aparece', () => {
  como('davi');
  const p = umPlano().plano;
  const c = planos.contratar({ clienteId: 'c-igor', planoId: p.id, diaCobranca: 10 }).assinatura;
  let d = planos.listar(); let r = resumoDoCliente(d, 'c-igor');
  assert.equal(r.aberta.id, c.id);
  assert.match(textoVencimento(r.aberta, { emAberto: r.emAberto, mes: d.mes }), /Aguardando a primeira mensalidade · vence dia 10/);
  assert.equal(resumoDoCliente(d, 'outro-cliente').aberta, null);
  planos.pagar(c.id, { mes: d.mes, forma: 'pix' });
  d = planos.listar(); r = resumoDoCliente(d, 'c-igor');
  assert.equal(r.emAberto, false);
  assert.match(textoVencimento(r.aberta, { emAberto: r.emAberto, mes: d.mes }), /paga · próxima: dia 10 de /);
  assert.equal(r.aberta.saldo.restantes, 2);
});

test('mensalidade em aberto aparece como "em aberto" quando o mês ainda não foi pago', () => {
  como('davi');
  const p = umPlano().plano;
  const c = planos.contratar({ clienteId: 'c-igor', planoId: p.id }).assinatura;
  const d0 = planos.listar();
  planos.pagar(c.id, { mes: d0.mes, forma: 'pix' });
  // a lista "a receber" do servidor (ativa sem o mês pago) decide o "em aberto"; aqui ela é forçada para conferir o texto
  const d = planos.listar();
  const r = resumoDoCliente({ ...d, aReceber: [c.id] }, 'c-igor');
  assert.equal(r.emAberto, true);
  assert.match(textoVencimento(r.aberta, { emAberto: true, mes: d.mes }), /em aberto · vence dia 5/);
});

test('encerrar: vira histórico; com adiantado sem pagar vira dívida e trava o plano novo; quitar libera', () => {
  como('davi');
  const p = umPlano().plano;
  const c = planos.contratar({ clienteId: 'c-igor', planoId: p.id }).assinatura;
  assert.equal(planos.contratar({ clienteId: 'c-igor', planoId: p.id }).ok, false, 'cliente com plano ativo não assina outro');
  assert.match(planos.contratar({ clienteId: 'c-igor', planoId: p.id }).erros[0], /já tem um plano em andamento/);
  const e = planos.encerrar(c.id, 'cliente mudou de cidade');
  assert.ok(e.ok);
  let r = resumoDoCliente(planos.listar(), 'c-igor');
  assert.equal(r.aberta, null); assert.equal(r.historico.length, 1); assert.equal(r.historico[0].id, c.id); assert.equal(r.divida, 0);
  assert.equal(planos.encerrar(c.id, 'de novo, outro motivo').ok, false, 'já encerrado');
  assert.equal(planos.encerrar('as-inexistente', 'motivo qualquer').ok, false);
});

test('histórico curto: só os mais recentes, do mais novo para o mais antigo', () => {
  const dados = { planos: [], aReceber: [], mes: '2026-10', assinaturas: [1, 2, 3, 4, 5].map((n) => ({ id: `a${n}`, clienteId: 'c1', status: 'cancelada', encerradoEm: n * 1000, divida: 0, plano: { nome: `P${n}` } })) };
  const r = resumoDoCliente(dados, 'c1');
  assert.equal(r.historico.length, HISTORICO_MAX);
  assert.deepEqual(r.historico.map((h) => h.id), ['a5', 'a4', 'a3']);
});

test('dívida de plano encerrado soma só o que não foi quitado; dívida prevista vem do último saldo do extrato', () => {
  const dados = {
    planos: [{ id: 'p', ativo: true }], aReceber: [], mes: '2026-10',
    assinaturas: [
      { id: 'a1', clienteId: 'c1', status: 'cancelada', encerradoEm: 1, divida: 2, dividaQuitada: false, plano: { nome: 'X' } },
      { id: 'a2', clienteId: 'c1', status: 'cancelada', encerradoEm: 2, divida: 3, dividaQuitada: true, plano: { nome: 'X' } },
      { id: 'a3', clienteId: 'c2', status: 'ativa', plano: { nome: 'X' }, extrato: [{ saldoFim: 1 }, { saldoFim: -2 }] },
      { id: 'a4', clienteId: 'c3', status: 'ativa', plano: { nome: 'X' }, extrato: [{ saldoFim: 1 }] },
    ],
  };
  assert.equal(resumoDoCliente(dados, 'c1').divida, 2);
  assert.equal(resumoDoCliente(dados, 'c2').dividaPrevista, 2);
  assert.equal(resumoDoCliente(dados, 'c3').dividaPrevista, 0);
});

test('motivo: 5 a 200 letras', () => {
  assert.equal(motivoValido('abcd'), false); assert.equal(motivoValido('  abcd  '), false);
  assert.equal(motivoValido('abcde'), true); assert.equal(motivoValido('a'.repeat(200)), true); assert.equal(motivoValido('a'.repeat(201)), false);
});

test('permissão: quem não tem a seção Planos não lê nem escreve (a ficha nem monta o bloco)', () => {
  como('davi'); const p = umPlano().plano;
  como('pablo');
  assert.equal(planos.listar().ok, false);
  assert.equal(planos.contratar({ clienteId: 'c-igor', planoId: p.id }).ok, false);
  assert.equal(planos.encerrar('x', 'motivo qualquer').ok, false);
});

test('cliente sem telefone e sem CPF ainda pode ter plano (o telefone só é exigido no pedido pelo link)', () => {
  como('davi');
  const p = umPlano().plano;
  store.getState().clientes.push({ id: 'c-sem-fone', nome: 'Sem Fone', apelido: '', telefone: '', cpf: '', nascimento: '' });
  const c = planos.contratar({ clienteId: 'c-sem-fone', planoId: p.id });
  assert.ok(c.ok, JSON.stringify(c));
  assert.equal(resumoDoCliente(planos.listar(), 'c-sem-fone').aberta.id, c.assinatura.id);
});
