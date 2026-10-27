// Conversa do WhatsApp: já no primeiro contato mostra as opções; o cliente responde com número, palavra exata ou aproximada, ou toca no botão/lista.
// Dá para remover serviço (engano) com o valor de cada um; o cadastro de cliente novo só é pedido na hora de fechar o agendamento.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { chat } from '../src/services/chat.js';

const th = () => chat.threadAtual();
const ult = () => th().mensagens.filter((m) => m.de === 'bot').at(-1);
const falar = (t, v) => chat.enviar(t, v);
const rotulos = () => ult().botoes.map((b) => b.rotulo);
const NOVO = '(51) 98000-0001';
// Abre o agendamento até a lista de serviços de Lavagem: cliente conhecido escolhe o veículo; número novo informa placa, modelo e porte (2 = médio).
const abrir = () => {
  falar('oi'); falar('1');
  if (th().etapa === 'veiculo') falar('1');
  else { falar('ABC1D23'); falar('Civic'); falar('2'); }
  falar('1'); // categoria Lavagem: 1 simples, 2 detalhada, 3 de motor
};
// Relógio fixo (segunda de manhã): os exemplos da seed não dependem da hora em que o teste roda.
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); chat.reiniciar(); });

test('primeiro contato de número desconhecido: já mostra o menu numerado (sem pedir nome antes) e botões', () => {
  chat.trocarNumero(NOVO);
  falar('oi');
  const m = ult();
  assert.match(m.texto, /1 - Agendar horário/); assert.match(m.texto, /2 - Meus horários/); assert.match(m.texto, /3 - Meu crédito/); assert.match(m.texto, /4 - Meus dados/);
  assert.match(m.texto, /Responda com o número/);
  assert.doesNotMatch(m.texto, /qual é o seu nome/i);
  assert.deepEqual(rotulos(), ['Agendar horário', 'Meus horários', 'Meu crédito', 'Meus dados']);
  assert.equal(th().etapa, 'menu');
});

test('cliente conhecido: saudação com o nome e as mesmas opções', () => {
  falar('oi');
  assert.match(ult().texto, /Olá, Marcelo/); assert.equal(rotulos().length, 4);
});

test('escolher por número, por palavra exata e por palavra aproximada', () => {
  for (const entrada of ['1', 'agendar horário', 'marcar', 'agedar', 'agendr horario']) {
    chat.reiniciar(); falar('oi'); falar(entrada);
    assert.equal(th().etapa, 'veiculo', `"${entrada}" deveria abrir o agendamento (primeiro o veículo)`);
  }
  chat.reiniciar(); falar('oi'); falar('2');
  assert.match(ult().texto, /próximos horários|não tem horários/i);
  chat.reiniciar(); falar('oi'); falar('meus dados');
  assert.equal(th().etapa, 'dados_campo');
});

test('número fora da lista e texto sem sentido repetem as opções, sem travar', () => {
  falar('oi'); falar('9');
  assert.match(ult().texto, /Não existe essa opção/); assert.match(ult().texto, /1 - Agendar horário/);
  falar('blablabla');
  assert.match(ult().texto, /Não entendi/); assert.equal(rotulos().length, 4);
  falar('xyzxyz');
  assert.match(ult().texto, /Responda só com o número/);
});

test('"0", "menu" e "oi" voltam ao menu em qualquer etapa de escolha', () => {
  for (const volta of ['0', 'menu', 'voltar']) {
    chat.reiniciar(); falar('oi'); falar('1'); falar('1');
    falar(volta);
    assert.equal(th().etapa, 'menu', volta);
  }
});

test('serviços: categorias, lista numerada com o valor de cada um; vários de uma vez ("1,3"); nome exato; nome ambíguo pergunta qual', () => {
  falar('oi'); falar('1'); falar('1'); // agendar → veículo
  assert.match(ult().texto, /Que tipo de serviço/); assert.match(ult().texto, /1 - Lavagem/); assert.match(ult().texto, /2 - Interior/);
  falar('1');
  const lista = ult().texto;
  assert.match(lista, /1 - Lavagem simples — R\$ 40,00/); assert.match(lista, /3 - Lavagem de motor — R\$ 35,00/);
  falar('1,3');
  assert.deepEqual(th().ctx.servicoIds, ['s-lav-simples', 's-lav-motor']);
  assert.match(ult().texto, /Seus serviços:/); assert.match(ult().texto, /• Lavagem simples — R\$ 40,00/); assert.match(ult().texto, /Total: R\$ 75,00/);
  // por nome exato: "motor" não confunde com os outros
  chat.reiniciar(); falar('oi'); falar('1'); falar('1'); falar('1'); falar('lavagem de motor');
  assert.deepEqual(th().ctx.servicoIds, ['s-lav-motor']);
  // ambíguo: "lavagem" serve para três serviços
  chat.reiniciar(); falar('oi'); falar('1'); falar('1'); falar('1'); falar('lavagem');
  assert.match(ult().texto, /Qual destas/); assert.equal(ult().botoes.filter((b) => /Lavagem/.test(b.rotulo)).length, 3);
  assert.deepEqual(th().ctx.servicoIds, []);
});

test('o preço do serviço segue o porte do veículo (catálogo real do Apex): pequeno e SUV pagam valores diferentes', () => {
  chat.reiniciar(); store.reiniciar(); // catálogo de exemplo, sem o ajuste "simples"
  chat.trocarNumero(NOVO);
  falar('oi'); falar('1'); falar('ABC1D23'); falar('Kwid'); falar('1'); falar('1'); // pequeno, Lavagem
  assert.match(ult().texto, /1 - Lavagem simples — R\$ 40,00/);
  chat.reiniciar(); chat.trocarNumero(NOVO);
  falar('oi'); falar('1'); falar('ABC1D23'); falar('Creta'); falar('4'); falar('1'); // SUV, Lavagem
  assert.match(ult().texto, /1 - Lavagem simples — R\$ 70,00/);
});

test('veículo novo pelo robô: placa inválida é recusada, placa antiga e Mercosul valem e o veículo entra no cadastro', () => {
  chat.trocarNumero(NOVO);
  falar('oi'); falar('1');
  assert.equal(th().etapa, 'vei_placa');
  falar('XXX'); assert.equal(th().etapa, 'vei_placa'); assert.match(ult().texto, /Placa inválida/);
  falar('abc-1234'); assert.equal(th().etapa, 'vei_modelo');
  falar('Gol'); assert.equal(th().etapa, 'vei_porte');
  falar('porte inexistente'); assert.equal(th().etapa, 'vei_porte');
  falar('1'); assert.equal(th().ctx.porte, 'pequeno'); assert.deepEqual(th().ctx.veiculoNovo, { placa: 'ABC-1234', modelo: 'Gol', porte: 'pequeno' });
  assert.equal(th().etapa, 'servicos');
});

test('remover serviço escolhido por engano: mostra o valor de cada um e o total que sobra', () => {
  abrir(); falar('1,2'); // simples + detalhada (vários números de uma vez)
  falar('adicionar'); falar('2'); falar('1'); // Interior → Higienização interna
  assert.match(ult().texto, /Total: R\$ 120,00/);
  assert.ok(rotulos().includes('Remover um serviço'));
  falar('remover');
  assert.match(ult().texto, /Qual serviço você quer remover\?/);
  assert.match(ult().texto, /Lavagem detalhada — R\$ 40,00/); assert.match(ult().texto, /Total: R\$ 120,00/);
  falar('2'); // remove o segundo da lista (Lavagem detalhada)
  assert.deepEqual(th().ctx.servicoIds, ['s-lav-simples', 's-higien-interna']);
  assert.match(ult().texto, /Removi Lavagem detalhada \(R\$ 40,00\)/); assert.match(ult().texto, /Total: R\$ 80,00/);
  // por nome, e "manter como está" não remove
  falar('tirar'); falar('manter');
  assert.deepEqual(th().ctx.servicoIds, ['s-lav-simples', 's-higien-interna']);
  falar('tirar'); falar('higienizacao');
  assert.deepEqual(th().ctx.servicoIds, ['s-lav-simples']);
  // sem nenhum serviço: volta a escolher, e não deixa continuar vazio
  falar('remover'); falar('1');
  assert.deepEqual(th().ctx.servicoIds, []);
  assert.match(ult().texto, /sem serviços/); assert.match(ult().texto, /1 - Lavagem/);
});

test('fluxo completo de cliente novo: cadastro só no fim, remover serviço no resumo e agendar com o valor certo', () => {
  chat.trocarNumero(NOVO);
  abrir(); falar('2,3'); // detalhada + lavagem de motor
  falar('continuar');
  assert.equal(th().etapa, 'dia');
  falar('1'); // primeiro dia
  assert.equal(th().etapa, 'hora');
  falar('1'); // primeiro horário
  // esteticista (se houver mais de um livre) e depois o cadastro
  if (th().etapa === 'profissional') falar('1');
  assert.equal(th().etapa, 'cad_nome');
  assert.match(ult().texto, /qual é o seu nome/i);
  falar('Beto');
  assert.equal(th().etapa, 'cad_cpf'); assert.deepEqual(rotulos().slice(0, 1), ['Pular']);
  falar('pular'); falar('pular');
  assert.equal(th().etapa, 'resumo');
  assert.match(ult().texto, /• Lavagem detalhada — R\$ 40,00/); assert.match(ult().texto, /• Lavagem de motor — R\$ 35,00/); assert.match(ult().texto, /Total: R\$ 75,00/); assert.match(ult().texto, /🚗 Civic ABC1D23/);
  assert.deepEqual(rotulos().slice(0, 3), ['Sim, agendar', 'Remover serviço', 'Não']);
  // engano: tira a lavagem de motor pelo resumo
  falar('2'); assert.equal(th().etapa, 'resumo_rm');
  falar('2');
  assert.equal(th().etapa, 'resumo'); assert.match(ult().texto, /Removi Lavagem de motor/); assert.match(ult().texto, /Total: R\$ 40,00/);
  assert.equal(rotulos().includes('Remover serviço'), true);
  falar('1');
  assert.match(ult().texto, /Agendado/);
  const a = store.getState().agendamentos.at(-1);
  assert.deepEqual(a.servicoIds, ['s-lav-detalhada']);
  assert.equal(store.getState().clientes.find((c) => c.id === a.clienteId).nome, 'Beto');
});

test('dia e hora escritos à mão continuam valendo (14:20 não vira a opção 14:00 por aproximação)', () => {
  abrir(); falar('2'); falar('continuar');
  falar('amanhã');
  assert.equal(th().etapa, 'hora');
  const primeira = th().base[0].rotulo;
  falar(primeira); // escrita à mão do horário listado
  assert.notEqual(th().etapa, 'hora', 'horário escrito deveria ser aceito');
  // um horário que não existe não é adivinhado
  chat.reiniciar(); abrir(); falar('2'); falar('continuar'); falar('amanhã');
  falar('03:17');
  assert.equal(th().etapa, 'hora'); assert.match(ult().texto, /não está livre/i);
});

test('nome de cliente novo nunca vira opção (nem "Mena" por "menu")', () => {
  chat.trocarNumero(NOVO);
  abrir(); falar('2'); falar('continuar'); falar('1'); falar('1');
  if (th().etapa === 'profissional') falar('1');
  falar('Mena');
  assert.equal(th().etapa, 'cad_cpf');
  assert.equal(th().ctx.nome, 'Mena');
});

test('as opções cabem na lista da Meta: no máximo 10 linhas por mensagem', () => {
  falar('oi'); falar('1'); falar('1'); // agendar → veículo → categorias
  assert.ok(ult().botoes.length <= 10);
  falar('1'); falar('1'); falar('continuar');
  assert.ok(ult().botoes.length <= 10);
  falar('1');
  assert.ok(ult().botoes.length <= 10, 'horários + "Outro dia" + "Voltar ao menu"');
  assert.ok(ult().botoes.some((b) => b.rotulo === 'Outro dia'));
});
