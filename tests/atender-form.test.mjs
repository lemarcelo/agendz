/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Regras puras do formulário Atender do site real (src/domain/atender-form.js). A decisão final é do servidor; aqui só o que a tela sabe antes de enviar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tipoDoAtendimento, ehRetroativo, camposFaltando, resumoDosServicos, filtrarServicos, filtrarProdutos, qtdValida, resumoDosProdutos, vendedorPadrao, faltaItem } from '../src/domain/atender-form.js';

const AGORA = new Date('2026-10-28T10:00:00-03:00').getTime();
const MIN = 60000, DIA = 86400000;

test('data futura (mais de 1 min) é agendamento; agora, passado e até 1 min à frente são atendimento já feito', () => {
  assert.equal(tipoDoAtendimento(AGORA + 2 * MIN, AGORA), 'futuro');
  assert.equal(tipoDoAtendimento(AGORA + MIN, AGORA), 'local');
  assert.equal(tipoDoAtendimento(AGORA, AGORA), 'local');
  assert.equal(tipoDoAtendimento(AGORA - 3 * DIA, AGORA), 'local');
  assert.equal(tipoDoAtendimento(null, AGORA), 'local');
  assert.equal(tipoDoAtendimento(NaN, AGORA), 'local');
});

test('retroativo é só o que aconteceu antes de hoje 00:00; hoje, mesmo em hora anterior, não pede motivo', () => {
  assert.equal(ehRetroativo(new Date('2026-10-27T23:59:00-03:00').getTime(), AGORA), true);
  assert.equal(ehRetroativo(new Date('2026-10-28T00:00:00-03:00').getTime(), AGORA), false);
  assert.equal(ehRetroativo(new Date('2026-10-28T07:00:00-03:00').getTime(), AGORA), false);
  assert.equal(ehRetroativo(AGORA + DIA, AGORA), false, 'futuro nunca é retroativo');
  assert.equal(ehRetroativo(null, AGORA), false);
});

test('agendamento pede nome e telefone; cadastro escolhido com nome e telefone dispensa; atendimento local não pede nada', () => {
  assert.deepEqual(camposFaltando('local', { nome: '', telefone: '', cliente: null }), []);
  assert.deepEqual(camposFaltando('futuro', { nome: '', telefone: '', cliente: null }), ['nome', 'telefone']);
  assert.deepEqual(camposFaltando('futuro', { nome: ' ', telefone: '1199', cliente: null }), ['nome', 'telefone'], 'telefone curto não vale');
  assert.deepEqual(camposFaltando('futuro', { nome: 'Ana', telefone: '(11) 97777-6666', cliente: null }), []);
  assert.deepEqual(camposFaltando('futuro', { nome: '', telefone: '', cliente: { semNome: false } }), []);
  assert.deepEqual(camposFaltando('futuro', { nome: '', telefone: '', cliente: { semNome: true } }), ['nome'], 'cadastro só com telefone ainda precisa de nome');
});

test('resumo soma só os serviços marcados', () => {
  const lista = [{ id: 'a', preco: 45, duracaoMin: 45 }, { id: 'b', preco: 30, duracaoMin: 30 }, { id: 'c', preco: 10, duracaoMin: 5 }];
  assert.deepEqual(resumoDosServicos(lista, ['a', 'b']), { qtd: 2, total: 75, minutos: 75 });
  assert.deepEqual(resumoDosServicos(lista, []), { qtd: 0, total: 0, minutos: 0 });
  assert.deepEqual(resumoDosServicos(lista, ['x']), { qtd: 0, total: 0, minutos: 0 });
});

test('busca de serviço por nome ou código, sem acento nem maiúscula', () => {
  const lista = [{ id: 'a', nome: 'Pigmentação', codigo: '12' }, { id: 'b', nome: 'Corte', codigo: '1' }];
  assert.deepEqual(filtrarServicos(lista, 'pigmentacao').map((s) => s.id), ['a']);
  assert.deepEqual(filtrarServicos(lista, 'CORTE').map((s) => s.id), ['b']);
  assert.deepEqual(filtrarServicos(lista, '1').map((s) => s.id), ['a', 'b']);
  assert.deepEqual(filtrarServicos(lista, '  ').map((s) => s.id), ['a', 'b']);
});

test('produtos: busca por nome ou código, quantidade de 1 a 999 e soma só do que existe', () => {
  const lista = [{ id: 'a', nome: 'Pomada Modeladora', codigo: '3', preco: 45.5 }, { id: 'b', nome: 'Óleo', codigo: '31', preco: 20 }];
  assert.deepEqual(filtrarProdutos(lista, 'pomada').map((p) => p.id), ['a']);
  assert.deepEqual(filtrarProdutos(lista, 'oleo').map((p) => p.id), ['b']);
  assert.deepEqual(filtrarProdutos(lista, '3').map((p) => p.id), ['a', 'b']);
  assert.deepEqual([qtdValida('2'), qtdValida(0), qtdValida(''), qtdValida('abc'), qtdValida(5000), qtdValida(2.9)], [2, 1, 1, 1, 999, 2]);
  assert.deepEqual(resumoDosProdutos(lista, [{ materialId: 'a', qtd: 2 }, { materialId: 'b', qtd: 1 }, { materialId: 'x', qtd: 9 }]), { linhas: 3, qtd: 3, total: 111 });
});

test('vendedor padrão: quem lança, se pode vender; senão quem atende; senão o primeiro que pode; ninguém = vazio', () => {
  const eq = [{ id: 'a', podeVender: true }, { id: 'b', podeVender: false }, { id: 'c', podeVender: true }];
  assert.equal(vendedorPadrao(eq, 'c', 'a'), 'c');
  assert.equal(vendedorPadrao(eq, 'b', 'c'), 'c');
  assert.equal(vendedorPadrao(eq, 'z', 'z'), 'a');
  assert.equal(vendedorPadrao([{ id: 'b', podeVender: false }], 'b', 'b'), '');
});

test('serviço ou produto; horário futuro exige serviço', () => {
  assert.match(faltaItem('local', [], []), /ao menos um serviço ou um produto/);
  assert.equal(faltaItem('local', [], [{}]), '', 'só produto vale no atendimento de agora');
  assert.match(faltaItem('futuro', [], [{}]), /Produto sozinho só no atendimento de agora/);
  assert.equal(faltaItem('futuro', ['s'], [{}]), '');
});
