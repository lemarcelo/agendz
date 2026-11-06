/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// E3 (troca de plano pagando só a diferença): a mensagem do WhatsApp e as contas puras (a conta compartilhada com o servidor está em planos-equivalencia.test.mjs).
import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { enderecosWhatsapp, textoPedidoTroca } from '../src/domain/whatsapp.js';
import { diferencaDaTroca, ehUpgrade, opcoesDeTroca } from '../src/domain/planos.js';

test('a mensagem do pedido diz o plano, a diferença deste mês e o preço dos meses seguintes, sem inventar nada', () => {
  const t = textoPedidoTroca({ nome: 'Degradê e Barba', preco: 120, diferenca: 33.75, descontoPct: 25, telefone: '(53) 99900-0001' });
  assert.equal(t, 'Olá! Quero mudar o meu plano para o Degradê e Barba. Pago só a diferença: R$ 33,75 neste mês (já com 25% de desconto); nos meses seguintes, R$ 120,00/mês. Meu telefone: (53) 99900-0001.');
  const sem = textoPedidoTroca({ nome: 'Plano X', preco: 99.9, diferenca: 10, descontoPct: 0, telefone: '' });
  assert.ok(!/desconto/.test(sem) && !/telefone/.test(sem), 'sem desconto e sem telefone a frase some');
  assert.match(sem, /R\$ 10,00 neste mês; nos meses seguintes, R\$ 99,90\/mês\.$/);
});

test('a mensagem limpa o telefone e cabe no limite; o endereço é https://wa.me, nunca whatsapp://', () => {
  const t = textoPedidoTroca({ nome: 'x'.repeat(200), preco: 1, diferenca: 1, descontoPct: 0, telefone: '<script>(53) 9' });
  assert.ok(t.length <= 500); assert.ok(!t.includes('<script>'));
  const { wa } = enderecosWhatsapp(t, '5551999991234');
  assert.match(wa, /^https:\/\/wa\.me\/5551999991234\?text=/);
  assert.ok(!wa.startsWith('whatsapp:'));
});

test('as opções saem do mais barato ao mais caro, com os serviços por nome e a diferença já descontada', () => {
  const s = {
    servicos: [{ id: 'a', nome: 'Corte' }, { id: 'b', nome: 'Barba' }, { id: 'c', nome: 'Sobrancelha' }],
    planos: [
      { id: 'p3', nome: 'Completo', preco: 150, cortes: 4, servicoIds: ['a', 'b', 'c'], ativo: true },
      { id: 'p2', nome: 'Corte e Barba', preco: 100, cortes: 3, servicoIds: ['a', 'b'], ativo: true },
      { id: 'p9', nome: 'Fora de venda', preco: 120, cortes: 3, servicoIds: ['a', 'b'], ativo: false },
      { id: 'p8', nome: 'Sem corte', preco: 300, cortes: 3, servicoIds: ['b', 'c'], ativo: true },
    ],
  };
  const atual = { preco: 60, servicoIds: ['a'] };
  const o = opcoesDeTroca(s, atual, 10);
  assert.equal(JSON.stringify(o.map((x) => x.planoId)), JSON.stringify(['p2', 'p3']));
  assert.equal(o[0].diferenca, 36); assert.equal(o[1].diferenca, 81);
  assert.equal(JSON.stringify(o[1].servicos), JSON.stringify(['Barba', 'Corte', 'Sobrancelha']));
  assert.equal(ehUpgrade(atual, s.planos[3]), false); assert.equal(diferencaDaTroca(100, 60, 0), 40);
});
