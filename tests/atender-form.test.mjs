/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Regras puras do formulário Atender do site real (src/domain/atender-form.js). A decisão final é do servidor; aqui só o que a tela sabe antes de enviar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REGRAS_DE_FABRICA, FORMAS_PAGAMENTO, formaEfetiva, exige, tipoDoAtendimento, ehRetroativo, camposFaltando, resumoDosServicos, filtrarServicos, filtrarProdutos, qtdValida, resumoDosProdutos, vendedorPadrao, faltaItem } from '../src/domain/atender-form.js';

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

// ---------- 5d-4c: forma de pagamento e campos obrigatórios das regras ----------
test('forma efetiva: a escolhida, senão o padrão; vazio quando não há padrão', () => {
  assert.equal(formaEfetiva(REGRAS_DE_FABRICA, ''), 'pix');
  assert.equal(formaEfetiva({ ...REGRAS_DE_FABRICA, formaPagamentoPadrao: 'dinheiro' }, ''), 'dinheiro');
  assert.equal(formaEfetiva({ ...REGRAS_DE_FABRICA, formaPagamentoPadrao: 'dinheiro' }, 'cartao'), 'cartao');
  assert.equal(formaEfetiva({ ...REGRAS_DE_FABRICA, formaPagamentoPadrao: '' }, ''), '', 'sem padrão e nada escolhido: precisa escolher');
  assert.equal(formaEfetiva(REGRAS_DE_FABRICA, 'boleto'), '', 'forma inventada não vale');
  assert.equal(formaEfetiva(undefined, ''), 'pix', 'sem regras carregadas vale a de fábrica');
  assert.deepEqual(FORMAS_PAGAMENTO.map(([k]) => k), ['pix', 'dinheiro', 'cartao']);
});

test('campos obrigatórios seguem as regras, na ordem delas, com o rótulo da tela', () => {
  const regras = { formaPagamentoPadrao: '', futuro: ['nome'], local: ['formaPagamento', 'telefone', 'vendedor', 'profissional'] };
  const vazio = { nome: '', telefone: '', cliente: null, profissionalId: '', vendedorId: '', temProdutos: true, forma: '' };
  assert.deepEqual(camposFaltando('local', vazio, regras), ['forma de pagamento', 'telefone', 'vendedor', 'profissional']);
  assert.deepEqual(camposFaltando('local', { ...vazio, forma: 'pix', telefone: '(11) 97777-6666', vendedorId: 'v', profissionalId: 'p' }, regras), []);
  assert.deepEqual(camposFaltando('local', { ...vazio, temProdutos: false }, { ...regras, local: ['vendedor'] }), [], 'sem produto o vendedor não é exigido');
  assert.deepEqual(camposFaltando('futuro', { ...vazio, telefone: '' }, regras), ['nome'], 'o futuro só exige o que a regra do futuro manda');
  assert.deepEqual(camposFaltando('futuro', { ...vazio, forma: '' }, { ...regras, futuro: ['formaPagamento'] }), [], 'forma de pagamento não existe no agendamento');
  assert.deepEqual(camposFaltando('futuro', vazio), ['nome', 'telefone'], 'sem regras: padrão de fábrica');
  assert.deepEqual(camposFaltando('local', vazio), [], 'sem regras o atendimento feito não exige nada');
  assert.equal(exige(regras, 'local', 'telefone'), true);
  assert.equal(exige(regras, 'futuro', 'telefone'), false);
  assert.equal(exige(undefined, 'futuro', 'telefone'), true);
});

// ---------- estética: veículo, porte e box ----------
import { servicoNoPorte, faltaVeiculo, faltaVeiculoNovo, porteDoAtendimento, boxesAtivos, erroDosBoxes } from '../src/domain/atender-form.js';

const SRV = { id: 's1', preco: 80, duracaoMin: 60, precos: { pequeno: 60, medio: 80, grande: 100, suv: 120, pickup: 150 }, duracoes: { pequeno: 45, medio: 60, grande: 75, suv: 90, pickup: 120 } };

test('preço e tempo seguem o porte; sem porte vale o médio; serviço sem mapa por porte fica como está', () => {
  assert.deepEqual(servicoNoPorte(SRV, 'pickup'), { preco: 150, duracaoMin: 120 });
  assert.deepEqual(servicoNoPorte(SRV, 'invalido'), { preco: 80, duracaoMin: 60 });
  assert.deepEqual(servicoNoPorte(SRV, undefined), { preco: 80, duracaoMin: 60 });
  assert.deepEqual(servicoNoPorte({ preco: 40, duracaoMin: 30 }, 'suv'), { preco: 40, duracaoMin: 30 });
  assert.deepEqual(resumoDosServicos([SRV, { id: 's2', preco: 20, duracaoMin: 10 }], ['s1', 's2'], 'suv'), { qtd: 2, total: 140, minutos: 100 });
  assert.equal(resumoDosServicos([SRV], ['s1']).total, 80, 'sem porte (barbearia) a soma é a do cadastro');
});

test('veículo: serviço exige; só produto não; novo precisa de placa válida, modelo e porte', () => {
  assert.equal(faltaVeiculo(false, ['s1'], null, null), '', 'tipo sem veículo nunca pede');
  assert.equal(faltaVeiculo(true, [], null, null), '', 'só produto não pede veículo');
  assert.match(faltaVeiculo(true, ['s1'], null, null), /Escolha o veículo/);
  assert.equal(faltaVeiculo(true, ['s1'], { id: 'v1' }, null), '');
  assert.match(faltaVeiculo(true, ['s1'], null, { placa: '', modelo: 'Onix', porte: 'medio' }), /placa/);
  assert.match(faltaVeiculoNovo({ placa: 'ABC', modelo: 'Onix', porte: 'medio' }), /Placa inválida/);
  assert.match(faltaVeiculoNovo({ placa: 'ABC1D23', modelo: ' ', porte: 'medio' }), /modelo/);
  assert.match(faltaVeiculoNovo({ placa: 'ABC-1234', modelo: 'Gol', porte: '' }), /porte/);
  assert.equal(faltaVeiculoNovo({ placa: 'ABC-1234', modelo: 'Gol', porte: 'pequeno' }), '');
  assert.equal(porteDoAtendimento({ porte: 'suv' }, null), 'suv');
  assert.equal(porteDoAtendimento(null, { porte: 'grande' }), 'grande');
  assert.equal(porteDoAtendimento(null, { porte: '' }), 'medio');
});

test('boxes: só os ativos entram no formulário; o editor barra vazio, repetido (sem diferenciar maiúscula), nome longo e todos inativos', () => {
  assert.deepEqual(boxesAtivos([{ id: 'a', ativo: true }, { id: 'b', ativo: false }, { id: 'c' }]).map((b) => b.id), ['a', 'c']);
  assert.match(erroDosBoxes([]), /ao menos um box/);
  assert.match(erroDosBoxes([{ nome: 'Box 1' }, { nome: 'box 1' }]), /mesmo nome/);
  assert.match(erroDosBoxes([{ nome: '' }]), /nome/);
  assert.match(erroDosBoxes([{ nome: 'x'.repeat(31) }]), /nome/);
  assert.match(erroDosBoxes([{ nome: 'A', ativo: false }]), /ao menos um box ativo/);
  assert.match(erroDosBoxes(Array.from({ length: 21 }, (_, i) => ({ nome: `B${i}` }))), /20/);
  assert.equal(erroDosBoxes([{ nome: 'A' }, { nome: 'B', ativo: false }]), '');
});
