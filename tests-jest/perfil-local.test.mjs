/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Perfil do cliente no #agendar (nome, telefone, veículo) guardado só no navegador, para preencher a próxima visita.
import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { chavePerfil, lerPerfil, mesclarPerfil } from '../src/domain/perfil-local.js';

const VAZIO = { nome: '', tel: '', placa: '', modelo: '', marca: '', cor: '', porte: '' };

test('texto inválido ou vazio vira perfil vazio', () => {
  for (const t of [null, '', 'xx', '[]', '5']) assert.deepEqual(lerPerfil(t), VAZIO);
});
test('guarda os campos digitados, tira controle e limita o tamanho', () => {
  const p = lerPerfil(JSON.stringify({ nome: 'Ana\u0000Lima', tel: '(51) 99999-9999', placa: 'ABC1D23', modelo: 'x'.repeat(99) }));
  assert.equal(p.nome, 'Ana Lima');
  assert.equal(p.modelo.length, 40);
  assert.equal(p.placa, 'ABC1D23');
});
test('campo vazio no envio não apaga o que havia (barbearia não manda veículo)', () => {
  const antes = mesclarPerfil(null, { nome: 'Ana', tel: '1', placa: 'ABC1D23', modelo: 'Onix' });
  const depois = mesclarPerfil(antes, { nome: 'Ana Lima', tel: '1' });
  assert.equal(depois.nome, 'Ana Lima');
  assert.equal(depois.placa, 'ABC1D23');
});
test('barbearia: só nome e telefone são guardados', () => {
  assert.deepEqual(mesclarPerfil(null, { nome: 'Bia', tel: '2' }), { ...VAZIO, nome: 'Bia', tel: '2' });
});
test('chave por loja e cupom nunca é guardado', () => {
  assert.equal(chavePerfil('a/b c'), 'agendz-perfil-abc');
  assert.ok(!('cupom' in mesclarPerfil(null, { cupom: 'XXXX' })));
});
