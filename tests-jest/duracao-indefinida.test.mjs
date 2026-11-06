// F (V60): serviço de duração indefinida — funções puras (domain/blocos.js) e a demonstração (cadastro, link do cliente, Atender com blocos e valor lançado).
// O servidor tem as mesmas regras (ServicoService, AgendaController, LinkPublicoService); os casos compartilhados estão em equivalencia/servicos.json.
import { test, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda, servicos, estabelecimento, publico } from '../src/services/api.js';
import { reiniciar } from '../tests/helpers.mjs';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import {
  blocosDeHorarios, deslocarBlocos, duracaoIndefinida, erroDeBlocos, horarioDoDia, mensagemDeCombinar, minutosDosBlocos, normalizarBlocos, textoDoPreco, validarIndefinida, valoresLancados, whatsappDaLoja,
} from '../src/domain/blocos.js';
import { erroCombinar } from '../src/domain/publico.js';

const MIN = 60000;
const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a); };
const ag = (id) => st().agendamentos.find((a) => a.id === id);
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const dinheiro = (n) => `R$ ${n}`;
beforeEach(() => { jest.useRealTimers(); jest.useFakeTimers({ doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] }); reiniciar(); como('davi'); });
afterEach(() => { jest.useRealTimers(); });

// ---------- funções puras ----------
test('blocos: ordena, funde vizinhos, recusa sobreposição, minuto exato e limites', () => {
  const h = 3600000;
  assert.deepEqual(normalizarBlocos([[4 * h, 5 * h], [1 * h, 2 * h], [2 * h, 3 * h]]), { ok: true, blocos: [[1 * h, 3 * h], [4 * h, 5 * h]] });
  assert.deepEqual(normalizarBlocos([]), { ok: true, blocos: null });
  assert.equal(normalizarBlocos([[1 * h, 3 * h], [2 * h, 4 * h]]).ok, false, 'sobrepostos');
  assert.equal(normalizarBlocos([[1 * h + 1, 2 * h]]).ok, false, 'minuto exato');
  assert.equal(normalizarBlocos([[2 * h, 2 * h]]).ok, false, 'fim depois do início');
  assert.equal(normalizarBlocos([[0, 25 * h]]).ok, false, 'até 24 h cada');
  assert.equal(normalizarBlocos(Array.from({ length: 201 }, (_, i) => [i * 2 * h, i * 2 * h + h])).ok, false, 'até 200 blocos');
  assert.equal(minutosDosBlocos([[0, 90 * MIN], [3 * h, 3 * h + 30 * MIN]]), 120);
});

test('blocos: indefinido exige blocos; blocos só com indefinido; mistura precisa somar o mínimo dos fixos', () => {
  const fixo = { nome: 'Corte', duracaoMin: 40 }, indef = { nome: 'Pintura', duracaoMin: null };
  assert.equal(duracaoIndefinida(indef), true); assert.equal(duracaoIndefinida(fixo), false);
  assert.match(erroDeBlocos([indef], null), /Marque os horários de Pintura/);
  assert.match(erroDeBlocos([fixo], [[0, 30 * MIN]]), /só vale para serviço de duração indefinida/);
  assert.equal(erroDeBlocos([fixo], null), null);
  assert.equal(erroDeBlocos([indef], [[0, 30 * MIN]]), null);
  assert.match(erroDeBlocos([fixo, indef], [[0, 30 * MIN]]), /somam 30 min.*ao menos 40 min/);
  assert.equal(erroDeBlocos([fixo, indef], [[0, 30 * MIN], [3600000, 3600000 + 30 * MIN]]), null, 'soma 60 >= 40, mesmo não contíguo');
});

test('valor lançado: só em serviço indefinido, 2 casas, sem repetir', () => {
  const sv = [{ id: 'a', nome: 'Pintura', duracaoMin: null }, { id: 'b', nome: 'Corte', duracaoMin: 30 }];
  assert.deepEqual(valoresLancados(sv, [{ servicoId: 'a', valor: 80.456 }]), { ok: true, precos: { a: 80.46 } });
  assert.equal(valoresLancados(sv, [{ servicoId: 'b', valor: 10 }]).ok, false, 'fixo não aceita valor');
  assert.equal(valoresLancados(sv, [{ servicoId: 'a', valor: -1 }]).ok, false);
  assert.equal(valoresLancados(sv, [{ servicoId: 'a', valor: 1e6 }]).ok, false);
  assert.equal(valoresLancados(sv, [{ servicoId: 'a', valor: 1 }, { servicoId: 'a', valor: 2 }]).ok, false);
  assert.equal(valoresLancados(sv, [{ servicoId: 'z', valor: 1 }]).ok, false);
});

test('cadastro indefinido: valor, lista (2 a 10) e intervalo; preço de base = único, menor ou mínimo', () => {
  assert.deepEqual(validarIndefinida({ preco: 80 }).preco, 80);
  assert.equal(validarIndefinida({}).ok, false, 'sem preço');
  const lista = validarIndefinida({ precoModo: 'lista', precoOpcoes: [{ descricao: 'Simples', valor: 120 }, { descricao: 'Completa', valor: 90 }] });
  assert.equal(lista.ok, true); assert.equal(lista.preco, 90);
  assert.equal(validarIndefinida({ precoModo: 'lista', precoOpcoes: [{ descricao: 'Só uma', valor: 1 }] }).ok, false);
  assert.equal(validarIndefinida({ precoModo: 'lista', precoOpcoes: [{ descricao: '', valor: 1 }, { descricao: 'x', valor: 2 }] }).ok, false, 'descrição obrigatória');
  const faixa = validarIndefinida({ precoModo: 'faixa', preco: 50, precoMax: 150 });
  assert.equal(faixa.ok, true); assert.equal(faixa.preco, 50); assert.equal(faixa.precoMax, 150);
  assert.equal(validarIndefinida({ precoModo: 'faixa', preco: 150, precoMax: 150 }).ok, false, 'máximo maior que o mínimo');
  assert.equal(validarIndefinida({ precoModo: 'outro', preco: 1 }).ok, false);
  assert.equal(validarIndefinida({ preco: 1, duracaoTexto: 'x'.repeat(121) }).ok, false);
  assert.equal(validarIndefinida({ preco: 1, combinaIds: Array.from({ length: 21 }, (_, i) => `u${i}`) }).ok, false);
});

test('texto do preço, mensagem do botão e WhatsApp da loja', () => {
  assert.equal(textoDoPreco({ preco: 80, precoModo: 'fixo' }, dinheiro), 'R$ 80');
  assert.equal(textoDoPreco({ preco: 80, precoModo: 'faixa', precoMax: 150 }, dinheiro), 'R$ 80 a R$ 150');
  assert.equal(textoDoPreco({ preco: 80, precoModo: 'lista', precoOpcoes: [{ descricao: 'a', valor: 80 }] }, dinheiro), 'A partir de R$ 80');
  assert.equal(mensagemDeCombinar('Pintura', '', ''), 'Olá! Quero combinar o agendamento de Pintura.');
  assert.equal(mensagemDeCombinar('Pintura', 'Oi, tenho um carro', 'Ana'), 'Oi, tenho um carro\n— Ana');
  assert.deepEqual(whatsappDaLoja('(53) 99999-9999'), { ok: true, valor: '5553999999999' });
  assert.deepEqual(whatsappDaLoja('555399999999'), { ok: true, valor: '555399999999' });
  assert.deepEqual(whatsappDaLoja(''), { ok: true, valor: null });
  assert.equal(whatsappDaLoja('12345').ok, false);
});

test('tela do Atender: horários de 30 min marcados viram blocos; remarcar desloca os blocos juntos', () => {
  const d = '2026-03-10';
  const t = (m) => horarioDoDia(d, m);
  const blocos = blocosDeHorarios([t(540), t(600), t(570), t(780)]);
  assert.deepEqual(blocos, [[t(540), t(630)], [t(780), t(810)]]);
  assert.equal(minutosDosBlocos(blocos), 120);
  assert.deepEqual(blocosDeHorarios([]), []);
  assert.deepEqual(deslocarBlocos(blocos, t(540), t(540) + 86400000), [[t(540) + 86400000, t(630) + 86400000], [t(780) + 86400000, t(810) + 86400000]]);
  assert.equal(deslocarBlocos(undefined, 0, 1), undefined);
});

// ---------- demonstração: cadastro ----------
const criarIndef = (extra = {}) => {
  const r = servicos.salvar({ nome: 'Pintura de peça', duracaoIndefinida: true, preco: 200, duracaoTexto: 'De 1 a 3 dias', ...extra });
  assert.ok(r.ok, JSON.stringify(r));
  return (r.servico || st().servicos.find((x) => x.nome === 'Pintura de peça'));
};

test('demo: serviço indefinido grava duração nula, textos e lista; fixo nunca guarda esses campos', () => {
  const s = criarIndef({ precoModo: 'lista', preco: undefined, precoOpcoes: [{ descricao: 'Peça pequena', valor: 150 }, { descricao: 'Peça grande', valor: 300 }], combinarMsg: 'Oi!' });
  const g = st().servicos.find((x) => x.id === s.id);
  assert.equal(g.duracao, null); assert.equal(g.preco, 150); assert.equal(g.precoModo, 'lista'); assert.equal(g.precoOpcoes.length, 2); assert.equal(g.duracaoTexto, 'De 1 a 3 dias');
  assert.equal(servicos.salvar({ nome: 'X combo', duracaoIndefinida: true, preco: 1, combo: true, componentes: ['a', 'b'] }).ok, false, 'combo não pode ser indefinido');
  assert.equal(servicos.salvar({ nome: 'Sem preço', duracaoIndefinida: true }).ok, false);
  const fixo = servicos.salvar({ id: 's-lav-simples', nome: 'Lavagem simples', preco: 50, duracao: 40, duracaoTexto: 'lixo', precoModo: 'lista' });
  const f = st().servicos.find((x) => x.id === 's-lav-simples');
  assert.ok(fixo.ok || f); assert.equal(f.duracaoTexto, null); assert.equal(f.precoModo, 'fixo');
});

test('demo: WhatsApp do estabelecimento é guardado só com 55+DDD+número', () => {
  assert.ok(estabelecimento.salvar({ whatsappLoja: '(53) 99999-9999' }).ok);
  assert.equal(st().estabelecimento.whatsappLoja, '5553999999999');
  assert.equal(estabelecimento.salvar({ whatsappLoja: '123' }).ok, false);
  assert.ok(estabelecimento.salvar({ whatsappLoja: '' }).ok);
  assert.ok(!st().estabelecimento.whatsappLoja);
});

// ---------- demonstração: link do cliente ----------
test('demo link: o serviço indefinido sai com combinar (destino: quem combina, senão a loja, senão vazio) e nunca entra no pedido', () => {
  const s = criarIndef({ combinaIds: ['u-pablo'] });
  const pablo = st().usuarios.find((u) => u.id === 'u-pablo');
  const tel55 = `55${pablo.telefone.replace(/\D/g, '')}`; // o DDD de Pablo é 55: o código do país vem antes
  const doLink = () => publico.config().servicos.find((x) => x.id === s.id);
  assert.equal(doLink().combinar.whatsapp, tel55, 'telefone de quem combina');
  assert.equal(doLink().combinar.duracaoTexto, 'De 1 a 3 dias');
  servicos.salvar({ id: s.id, nome: s.nome, duracaoIndefinida: true, preco: 200, combinaIds: [] });
  assert.equal(doLink().combinar.whatsapp, '', 'sem ninguém e sem WhatsApp da loja: vazio');
  estabelecimento.salvar({ whatsappLoja: '(53) 99999-9999' });
  assert.equal(doLink().combinar.whatsapp, '5553999999999', 'cai no WhatsApp do estabelecimento');
  const txt = JSON.stringify(publico.config());
  assert.ok(!txt.includes('combinaIds'), 'a página não recebe a lista de pessoas');
  // pedido e horários recusam o indefinido
  const d = dia(3);
  assert.deepEqual(publico.horarios({ profissionalId: 'u-pablo', servicoIds: [s.id], dayTs: d }), []);
  const r = publico.agendar({ nome: 'Ana Souza', telefone: '(51) 98888-1111', servicoIds: [s.id], profissionalId: 'u-pablo', inicio: tsAt(d, 600) });
  assert.equal(r.ok, false); assert.equal(r.erros[0], erroCombinar(s.nome));
});

// ---------- demonstração: Atender com blocos ----------
test('demo atender: indefinido exige blocos; blocos fora de indefinido são recusados; valor lançado vira o preço do atendimento', () => {
  const s = criarIndef();
  const d = dia(8);
  const hr = (m) => tsAt(d, m);
  const sem = agenda.atender({ servicoIds: [s.id], profissionalId: 'u-pablo', inicio: hr(540) });
  assert.equal(sem.ok, false); assert.match(sem.erros[0], /Marque os horários de Pintura/);
  const fixoComBlocos = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', blocos: [[hr(540), hr(600)]] });
  assert.equal(fixoComBlocos.ok, false); assert.match(fixoComBlocos.erros[0], /só vale para serviço de duração indefinida/);
  const ok = agenda.atender({ servicoIds: [s.id], profissionalId: 'u-pablo', blocos: [[hr(780), hr(840)], [hr(540), hr(600)]], valores: [{ servicoId: s.id, valor: 345.5 }], status: 'confirmado' });
  assert.ok(ok.ok, JSON.stringify(ok));
  const a = ag(ok.agendamento.id);
  assert.equal(a.inicio, hr(540), 'início = primeiro bloco');
  assert.deepEqual(a.blocos, [[hr(540), hr(600)], [hr(780), hr(840)]]);
  assert.equal(a.precos[s.id], 345.5, 'valor lançado é o preço do item (base de total e comissão)');
});

test('demo atender: um bloco ocupado por outro agendamento barra; livre entre os blocos pode ser usado', () => {
  const s = criarIndef();
  const d = dia(9);
  const hr = (m) => tsAt(d, m);
  const a1 = agenda.atender({ servicoIds: [s.id], profissionalId: 'u-pablo', blocos: [[hr(540), hr(600)], [hr(780), hr(840)]], status: 'confirmado' });
  assert.ok(a1.ok, JSON.stringify(a1));
  const choque = agenda.atender({ servicoIds: [s.id], profissionalId: 'u-pablo', blocos: [[hr(570), hr(630)]], status: 'confirmado' });
  assert.equal(choque.ok, false, 'sobrepõe o 1º bloco');
  const vao = agenda.atender({ servicoIds: [s.id], profissionalId: 'u-pablo', blocos: [[hr(660), hr(720)]], status: 'confirmado' });
  assert.ok(vao.ok, `o vão entre os blocos está livre: ${JSON.stringify(vao)}`);
});

test('demo atender: mistura com serviço fixo — a soma dos blocos precisa atender o mínimo do fixo', () => {
  const s = criarIndef();
  const fixo = st().servicos.find((x) => x.id === 's-lav-simples');
  const min = Number(fixo.duracao);
  const d = dia(10);
  const hr = (m) => tsAt(d, m);
  const curto = agenda.atender({ servicoIds: [s.id, 's-lav-simples'], profissionalId: 'u-pablo', blocos: [[hr(540), hr(540 + Math.max(1, min - 10))]], status: 'confirmado' });
  assert.equal(curto.ok, false); assert.match(curto.erros[0], /ao menos/);
  const bom = agenda.atender({ servicoIds: [s.id, 's-lav-simples'], profissionalId: 'u-pablo', blocos: [[hr(540), hr(540 + min)]], status: 'confirmado' });
  assert.ok(bom.ok, JSON.stringify(bom));
});

test('demo atender: valor lançado só vale em serviço indefinido', () => {
  const s = criarIndef();
  const d = dia(11);
  const r = agenda.atender({ servicoIds: [s.id, 's-lav-simples'], profissionalId: 'u-pablo', blocos: [[tsAt(d, 540), tsAt(d, 660)]], valores: [{ servicoId: 's-lav-simples', valor: 5 }], status: 'confirmado' });
  assert.equal(r.ok, false); assert.match(r.erros[0], /é fixo/);
});
