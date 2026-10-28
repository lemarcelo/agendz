/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Regras puras do formulário Atender do site real (src/domain/atender-form.js). A decisão final é do servidor; aqui só o que a tela sabe antes de enviar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tipoDoAtendimento, ehRetroativo, camposFaltando, resumoDosServicos, filtrarServicos } from '../src/domain/atender-form.js';

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
