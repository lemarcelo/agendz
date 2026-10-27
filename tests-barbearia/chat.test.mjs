// Conversa do WhatsApp: já no primeiro contato mostra as opções; o cliente responde com número, palavra exata ou aproximada, ou toca no botão/lista.
// Dá para remover serviço (engano) com o valor de cada um; o cadastro de cliente novo só é pedido na hora de fechar o agendamento.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/services/api.js';
import { chat } from '../src/services/chat.js';

const th = () => chat.threadAtual();
const ult = () => th().mensagens.filter((m) => m.de === 'bot').at(-1);
const falar = (t, v) => chat.enviar(t, v);
const rotulos = () => ult().botoes.map((b) => b.rotulo);
const NOVO = '(51) 98000-0001';
// Relógio fixo (segunda de manhã): os exemplos da seed não dependem da hora em que o teste roda.
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); store.reiniciar(); chat.reiniciar(); });

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
    assert.equal(th().etapa, 'servicos', `"${entrada}" deveria abrir o agendamento`);
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

test('serviços: lista numerada com o valor de cada um; vários de uma vez ("1,4"); nome exato; nome ambíguo pergunta qual', () => {
  falar('oi'); falar('1');
  const lista = ult().texto;
  assert.match(lista, /1 - Corte somente tesoura — R\$ 40,00/); assert.match(lista, /4 - Barba — R\$ 35,00/);
  falar('1,4');
  assert.deepEqual(th().ctx.servicoIds, ['s-tesoura', 's-barba']);
  assert.match(ult().texto, /Seus serviços:/); assert.match(ult().texto, /• Corte somente tesoura — R\$ 40,00/); assert.match(ult().texto, /Total: R\$ 75,00/);
  // por nome exato: "Barba" não confunde com "Barba Degradê"
  chat.reiniciar(); falar('oi'); falar('1'); falar('barba');
  assert.deepEqual(th().ctx.servicoIds, ['s-barba']);
  // ambíguo: "corte" serve para três serviços
  chat.reiniciar(); falar('oi'); falar('1'); falar('corte');
  assert.match(ult().texto, /Qual destas/); assert.equal(ult().botoes.filter((b) => /Corte/.test(b.rotulo)).length, 3);
  assert.deepEqual(th().ctx.servicoIds, []);
});

test('remover serviço escolhido por engano: mostra o valor de cada um e o total que sobra', () => {
  falar('oi'); falar('1'); falar('1,2,3'); // três cortes por engano: tesoura, máquina, degradê (vários números de uma vez)
  assert.match(ult().texto, /Total: R\$ 120,00/);
  assert.ok(rotulos().includes('Remover um serviço'));
  falar('remover');
  assert.match(ult().texto, /Qual serviço você quer remover\?/);
  assert.match(ult().texto, /Corte na máquina — R\$ 40,00/); assert.match(ult().texto, /Total: R\$ 120,00/);
  falar('2'); // remove o segundo da lista (Corte na máquina)
  assert.deepEqual(th().ctx.servicoIds, ['s-tesoura', 's-degrade']);
  assert.match(ult().texto, /Removi Corte na máquina \(R\$ 40,00\)/); assert.match(ult().texto, /Total: R\$ 80,00/);
  // por nome, e "manter como está" não remove
  falar('tirar'); falar('manter');
  assert.deepEqual(th().ctx.servicoIds, ['s-tesoura', 's-degrade']);
  falar('tirar'); falar('degrade');
  assert.deepEqual(th().ctx.servicoIds, ['s-tesoura']);
  // sem nenhum serviço: volta a escolher, e não deixa continuar vazio
  falar('remover'); falar('1');
  assert.deepEqual(th().ctx.servicoIds, []);
  assert.match(ult().texto, /sem serviços/); assert.match(ult().texto, /1 - Corte somente tesoura/);
});

test('fluxo completo de cliente novo: cadastro só no fim, remover serviço no resumo e agendar com o valor certo', () => {
  chat.trocarNumero(NOVO);
  falar('oi'); falar('1'); falar('2,4'); // máquina + barba
  falar('continuar');
  assert.equal(th().etapa, 'dia');
  falar('1'); // primeiro dia
  assert.equal(th().etapa, 'hora');
  falar('1'); // primeiro horário
  // barbeiro (se houver mais de um livre) e depois o cadastro
  if (th().etapa === 'profissional') falar('1');
  assert.equal(th().etapa, 'cad_nome');
  assert.match(ult().texto, /qual é o seu nome/i);
  falar('Beto');
  assert.equal(th().etapa, 'cad_cpf'); assert.deepEqual(rotulos().slice(0, 1), ['Pular']);
  falar('pular'); falar('pular');
  assert.equal(th().etapa, 'resumo');
  assert.match(ult().texto, /• Corte na máquina — R\$ 40,00/); assert.match(ult().texto, /• Barba — R\$ 35,00/); assert.match(ult().texto, /Total: R\$ 75,00/);
  assert.deepEqual(rotulos().slice(0, 3), ['Sim, agendar', 'Remover serviço', 'Não']);
  // engano: tira a barba pelo resumo
  falar('2'); assert.equal(th().etapa, 'resumo_rm');
  falar('2');
  assert.equal(th().etapa, 'resumo'); assert.match(ult().texto, /Removi Barba/); assert.match(ult().texto, /Total: R\$ 40,00/);
  assert.equal(rotulos().includes('Remover serviço'), true);
  falar('1');
  assert.match(ult().texto, /Agendado/);
  const a = store.getState().agendamentos.at(-1);
  assert.deepEqual(a.servicoIds, ['s-maquina']);
  assert.equal(store.getState().clientes.find((c) => c.id === a.clienteId).nome, 'Beto');
});

test('dia e hora escritos à mão continuam valendo (14:20 não vira a opção 14:00 por aproximação)', () => {
  falar('oi'); falar('1'); falar('2'); falar('continuar');
  falar('amanhã');
  assert.equal(th().etapa, 'hora');
  const primeira = th().base[0].rotulo;
  falar(primeira); // escrita à mão do horário listado
  assert.notEqual(th().etapa, 'hora', 'horário escrito deveria ser aceito');
  // um horário que não existe não é adivinhado
  chat.reiniciar(); falar('oi'); falar('1'); falar('2'); falar('continuar'); falar('amanhã');
  falar('03:17');
  assert.equal(th().etapa, 'hora'); assert.match(ult().texto, /não está livre/i);
});

test('nome de cliente novo nunca vira opção (nem "Mena" por "menu")', () => {
  chat.trocarNumero(NOVO);
  falar('oi'); falar('1'); falar('2'); falar('continuar'); falar('1'); falar('1');
  if (th().etapa === 'profissional') falar('1');
  falar('Mena');
  assert.equal(th().etapa, 'cad_cpf');
  assert.equal(th().ctx.nome, 'Mena');
});

test('as opções cabem na lista da Meta: no máximo 10 linhas por mensagem', () => {
  falar('oi'); falar('1');
  assert.ok(ult().botoes.length <= 10);
  falar('1'); falar('continuar');
  assert.ok(ult().botoes.length <= 10);
  falar('1');
  assert.ok(ult().botoes.length <= 10, 'horários + "Outro dia" + "Voltar ao menu"');
  assert.ok(ult().botoes.some((b) => b.rotulo === 'Outro dia'));
});
