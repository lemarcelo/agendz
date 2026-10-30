/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Avaliações do atendimento (F5, fase 1): validação, token pessoal (hash, 90 dias, uso único), anonimato com a regra da loja ligada e desligada,
// resumo e filtros, permissão por seção, fila de mensagens em lote (telefone, cadastro, opt-out, duplicados, limite de 200, período).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { STATUS } from '../src/domain/rules.js';
import * as AV from '../src/domain/avaliacoes.js';
import { lerHashAvaliar, montarLinkAvaliar } from '../src/domain/link-publico.js';
import { store, auth, agenda, avaliacoes, clientes, equipe, mensagens, publico } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';

const DIA = 86400000;
const AGORA = new Date(2026, 9, 30, 12, 0).getTime();
const em = (d, h = 10) => new Date(2026, 9, d, h, 0).getTime();
const base = () => ({
  seq: 100,
  servicos: [{ id: 'sv1', nome: 'Corte' }, { id: 'sv2', nome: 'Barba' }],
  usuarios: [{ id: 'u1', nome: 'Bruno', apelido: 'Bruno' }, { id: 'u2', nome: 'Caio' }],
  clientes: [{ id: 'c1', nome: 'Ana Souza', telefone: '(51) 99999-0001' }],
  agendamentos: [], avaliacoes: [], avaliacaoAcessos: [],
});
let n = 0;
const atend = (s, extra = {}) => { const a = { id: `a${++n}`, clienteId: 'c1', profissionalId: 'u1', servicoIds: ['sv1'], inicio: em(20), status: STATUS.CONCLUIDO, ...extra }; s.agendamentos.push(a); return a; };

// ---------- validação ----------
test('nota: só inteiro de 1 a 5; 0, 6, NaN, decimal, texto e vazio são recusados', () => {
  for (const nota of [0, 6, NaN, 4.5, -1, '0', '6', 'abc', '', null, undefined, Infinity, [5], {}]) assert.equal(AV.validarAvaliacao({ nota }).ok, false, String(nota));
  for (const nota of [1, 2, 3, 4, 5, '5']) assert.equal(AV.validarAvaliacao({ nota }).dados.nota, Number(nota));
  assert.equal(AV.validarAvaliacao(null).ok, false);
});
test('texto: até 500 caracteres; 501 é recusado (não corta calado); sem texto vale; não-texto não vale', () => {
  assert.equal(AV.validarAvaliacao({ nota: 5, texto: 'a'.repeat(500) }).ok, true);
  const r = AV.validarAvaliacao({ nota: 5, texto: 'a'.repeat(501) });
  assert.equal(r.ok, false); assert.match(r.erro, /500/);
  assert.equal(AV.validarAvaliacao({ nota: 5 }).dados.texto, '');
  assert.equal(AV.validarAvaliacao({ nota: 5, texto: 123 }).ok, false);
  assert.equal(AV.validarAvaliacao({ nota: 5, texto: '  ótimo\u0007  ' }).dados.texto, 'ótimo', 'tira controle e espaços');
});
test('anônimo: só booleano; padrão falso', () => {
  assert.equal(AV.validarAvaliacao({ nota: 4 }).dados.anonimo, false);
  assert.equal(AV.validarAvaliacao({ nota: 4, anonimo: true }).dados.anonimo, true);
  for (const anonimo of ['true', 1, 'sim', {}]) assert.equal(AV.validarAvaliacao({ nota: 4, anonimo }).ok, false, String(anonimo));
});
test('motivo de ocultar: 5 a 200 letras', () => {
  assert.equal(AV.validarMotivo('abcd').ok, false);
  assert.equal(AV.validarMotivo('abcde').ok, true);
  assert.equal(AV.validarMotivo('a'.repeat(200)).ok, true);
  assert.equal(AV.validarMotivo('a'.repeat(201)).ok, false);
  assert.equal(AV.validarMotivo(undefined).ok, false);
});

// ---------- hash e token ----------
test('sha256 síncrono confere com o do Node (vazio, acento, 55 e 56 bytes, texto longo)', () => {
  for (const t of ['', 'abc', 'avaliação ✓', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) assert.equal(AV.sha256hex(t), createHash('sha256').update(t).digest('hex'), t.slice(0, 10));
});
test('token: 48 hex, só o hash fica guardado, 90 dias, uso único, errado e vencido caem na mesma resposta', () => {
  const s = base(); const a = atend(s);
  const t = AV.emitirAcesso(s, a.id, AGORA);
  assert.match(t, /^[0-9a-f]{48}$/);
  assert.equal(JSON.stringify(s.avaliacaoAcessos).includes(t), false, 'o token em si nunca é guardado');
  assert.equal(s.avaliacaoAcessos[0].hash, createHash('sha256').update(t).digest('hex'));
  assert.equal(s.avaliacaoAcessos[0].expiraEm - AGORA, 90 * DIA);
  assert.ok(AV.acharAcesso(s, t, AGORA + 89 * DIA));
  assert.equal(AV.acharAcesso(s, t, AGORA + 90 * DIA), null, 'vencido');
  assert.equal(AV.acharAcesso(s, t.slice(1) + '0', AGORA), null, 'errado');
  assert.equal(AV.acharAcesso(s, t.toUpperCase(), AGORA), null, 'formato');
  assert.equal(AV.acharAcesso(s, 'x', AGORA), null); assert.equal(AV.acharAcesso(s, null, AGORA), null); assert.equal(AV.acharAcesso(s, { toString: () => t }, AGORA), null);
});
test('token reusado: depois de avaliar o link não vale mais, e a mensagem é a mesma de qualquer erro', () => {
  const s = base(); const a = atend(s);
  const t = AV.emitirAcesso(s, a.id, AGORA);
  assert.deepEqual(AV.registrarAvaliacao(s, t, { nota: 5 }, AGORA), { ok: true });
  const de = AV.registrarAvaliacao(s, t, { nota: 1 }, AGORA);
  assert.deepEqual(de, { ok: false, erros: [AV.ERRO_AVALIACAO] });
  assert.deepEqual(AV.registrarAvaliacao(s, 'f'.repeat(48), { nota: 1 }, AGORA), de, 'errado = reusado');
  assert.equal(s.avaliacoes.length, 1);
  assert.equal(s.avaliacoes[0].nota, 5);
});
test('pedir de novo troca o link anterior (um vivo por agendamento); outro agendamento não é afetado', () => {
  const s = base(); const a = atend(s); const b = atend(s);
  const t1 = AV.emitirAcesso(s, a.id, AGORA); const tb = AV.emitirAcesso(s, b.id, AGORA);
  const t2 = AV.emitirAcesso(s, a.id, AGORA + 1000);
  assert.equal(AV.acharAcesso(s, t1, AGORA + 2000), null);
  assert.ok(AV.acharAcesso(s, t2, AGORA + 2000)); assert.ok(AV.acharAcesso(s, tb, AGORA + 2000));
});
test('token válido de atendimento que deixou de ser concluído ou já tem avaliação não avalia', () => {
  const s = base(); const a = atend(s);
  const t = AV.emitirAcesso(s, a.id, AGORA);
  a.status = STATUS.CANCELADO;
  assert.equal(AV.registrarAvaliacao(s, t, { nota: 5 }, AGORA).ok, false);
  a.status = STATUS.CONCLUIDO; a.servicoIds = [];
  assert.equal(AV.registrarAvaliacao(s, t, { nota: 5 }, AGORA).ok, false, 'só produto');
});
test('token válido com nota inválida: o erro de nota aparece, o token não é gasto', () => {
  const s = base(); const a = atend(s);
  const t = AV.emitirAcesso(s, a.id, AGORA);
  assert.match(AV.registrarAvaliacao(s, t, { nota: 6 }, AGORA).erros[0], /nota/);
  assert.ok(AV.acharAcesso(s, t, AGORA));
});
test('avaliação guarda o profissional e os serviços do atendimento (por serviço e por profissional)', () => {
  const s = base(); const a = atend(s, { servicoIds: ['sv1', 'sv2'] });
  AV.registrarAvaliacao(s, AV.emitirAcesso(s, a.id, AGORA), { nota: 4, texto: 'bom' }, AGORA);
  assert.deepEqual(s.avaliacoes[0].servicoIds, ['sv1', 'sv2']); assert.equal(s.avaliacoes[0].profissionalId, 'u1');
});
test('link: token vai no fragmento, com ou sem loja; formato errado não é link', () => {
  const t = 'a'.repeat(48);
  assert.deepEqual(lerHashAvaliar(`#avaliar/${t}`), { loja: '', token: t });
  assert.deepEqual(lerHashAvaliar(`#avaliar@dalforno/${t}`), { loja: 'dalforno', token: t });
  for (const h of ['#avaliar', '#avaliar/abc', `#avaliar/${t}x`, `#avaliar/${'A'.repeat(48)}`, `#avaliar@/${t}`, `?avaliar=${t}`, '']) assert.equal(lerHashAvaliar(h), null, h);
  assert.equal(montarLinkAvaliar({ base: 'https://x.io/', lojaNoLink: 'apex', token: t }), `https://x.io/#avaliar@apex/${t}`);
  assert.equal(montarLinkAvaliar({ base: 'https://x.io/', token: t }), `https://x.io/#avaliar/${t}`);
});

// ---------- anonimato ----------
test('anônimo com a regra DESLIGADA: o DTO é "Anônimo" e não tem nenhum campo de identidade', () => {
  const s = base(); const a = atend(s);
  AV.registrarAvaliacao(s, AV.emitirAcesso(s, a.id, AGORA), { nota: 5, anonimo: true, texto: 'ótimo' }, AGORA);
  const d = AV.paraPainel(s, s.avaliacoes[0]);
  assert.equal(d.cliente, 'Anônimo'); assert.equal(d.revelado, false);
  assert.equal('clienteId' in d, false); assert.equal('agendamentoId' in d, false);
  assert.equal(JSON.stringify(d).includes('Ana'), false); assert.equal(JSON.stringify(d).includes('c1'), false); assert.equal(JSON.stringify(d).includes(a.id), false);
});
test('anônimo com a regra LIGADA: mostra o nome real e marca como revelado ("avaliado como anônimo")', () => {
  const s = base(); const a = atend(s);
  AV.registrarAvaliacao(s, AV.emitirAcesso(s, a.id, AGORA), { nota: 5, anonimo: true }, AGORA);
  s.regrasPlataforma = { avaliacaoMostraAnonimo: true };
  const d = AV.paraPainel(s, s.avaliacoes[0]);
  assert.equal(d.cliente, 'Ana Souza'); assert.equal(d.revelado, true); assert.equal(d.anonimo, true);
});
test('não anônimo mostra o nome nas duas regras e não marca revelado', () => {
  const s = base(); const a = atend(s);
  AV.registrarAvaliacao(s, AV.emitirAcesso(s, a.id, AGORA), { nota: 3 }, AGORA);
  for (const regra of [false, true]) { s.regrasPlataforma = { avaliacaoMostraAnonimo: regra }; const d = AV.paraPainel(s, s.avaliacoes[0]); assert.equal(d.cliente, 'Ana Souza'); assert.equal(d.revelado, false); }
});
test('regra ausente ou diferente de true conta como desligada', () => {
  const s = base(); assert.equal(AV.mostraAnonimo(s), false);
  for (const v of ['true', 1, 'sim', null]) { s.regrasPlataforma = { avaliacaoMostraAnonimo: v }; assert.equal(AV.mostraAnonimo(s), false, String(v)); }
});

// ---------- resumo e filtros ----------
test('resumo: média com 1 casa, total e distribuição; sem avaliação não inventa média', () => {
  assert.deepEqual(AV.resumir([]), { total: 0, media: null, distribuicao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const r = AV.resumir([{ nota: 5 }, { nota: 4 }, { nota: 4 }]);
  assert.equal(r.total, 3); assert.equal(r.media, 4.3); assert.deepEqual(r.distribuicao, { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 });
});
test('filtros: período (dias inclusive), profissional e serviço; datas inválidas e > 366 dias são recusados', () => {
  const lista = [{ em: em(10), profissionalId: 'u1', servicoIds: ['sv1'] }, { em: em(20), profissionalId: 'u2', servicoIds: ['sv2'] }, { em: em(30, 23), profissionalId: 'u1', servicoIds: ['sv1', 'sv2'] }];
  assert.equal(AV.filtrarAvaliacoes(lista, {}).lista.length, 3);
  assert.equal(AV.filtrarAvaliacoes(lista, { de: '2026-10-20', ate: '2026-10-30' }).lista.length, 2, 'o último dia vale até 23h59');
  assert.equal(AV.filtrarAvaliacoes(lista, { profissionalId: 'u1' }).lista.length, 2);
  assert.equal(AV.filtrarAvaliacoes(lista, { servicoId: 'sv2' }).lista.length, 2);
  assert.equal(AV.filtrarAvaliacoes(lista, { servicoId: 'sv2', profissionalId: 'u2', de: '2026-10-01', ate: '2026-10-31' }).lista.length, 1);
  for (const f of [{ de: '2026-10-30', ate: '2026-10-01' }, { de: '2026-02-30', ate: '2026-03-01' }, { de: 'x', ate: '2026-10-01' }, { de: '2026-10-01' }, { de: '2025-01-01', ate: '2026-10-01' }, { profissionalId: 'x'.repeat(61) }, { servicoId: 5 }]) assert.ok(AV.filtrarAvaliacoes(lista, f).erro, JSON.stringify(f));
  assert.equal(AV.filtrarAvaliacoes(lista, { de: '2025-10-30', ate: '2026-10-30' }).erro, undefined, '366 dias inclusive');
  assert.ok(AV.filtrarAvaliacoes(lista, { de: '2025-10-29', ate: '2026-10-30' }).erro, '367 dias');
});

// ---------- pedido (estrela) ----------
test('quem pode receber o pedido: concluído, com serviço, cadastro e telefone de WhatsApp; opt-out fica de fora', () => {
  const s = base();
  assert.equal(AV.situacaoDoPedido(s, atend(s)), 'ok');
  assert.equal(AV.situacaoDoPedido(s, atend(s, { status: STATUS.CONFIRMADO })), 'nao_concluido');
  assert.equal(AV.situacaoDoPedido(s, atend(s, { servicoIds: [], produtos: [{ materialId: 'p', qtd: 1 }] })), 'sem_servico');
  assert.equal(AV.situacaoDoPedido(s, atend(s, { clienteId: null, nomeAvulso: 'Fulano' })), 'sem_cadastro');
  assert.equal(AV.situacaoDoPedido(s, atend(s, { clienteId: 'c-sumiu' })), 'sem_cadastro');
  s.clientes.push({ id: 'c2', nome: 'Sem Fone', telefone: '' }, { id: 'c3', nome: 'Fone Ruim', telefone: '123' }, { id: 'c4', nome: 'Exterior', telefone: '+54 11 5555-1234' }, { id: 'c5', nome: 'Opt', telefone: '(51) 98888-0000', semMensagens: true });
  for (const id of ['c2', 'c3', 'c4']) assert.equal(AV.situacaoDoPedido(s, atend(s, { clienteId: id })), 'sem_telefone', id);
  assert.equal(AV.situacaoDoPedido(s, atend(s, { clienteId: 'c5' })), 'sem_mensagens');
  assert.equal(AV.situacaoDoPedido(s, undefined), 'nao_concluido');
  for (const m of ['sem_cadastro', 'sem_telefone', 'sem_servico', 'sem_mensagens', 'nao_concluido']) assert.ok(AV.MOTIVOS_SEM_PEDIDO[m].length > 20, m);
});
test('texto do pedido: primeiro nome, loja e link; modelo valida variáveis e exige {link} só na avaliação', () => {
  const t = AV.textoPedidoAvaliacao({ nomeEstab: 'Dalforno', nomeCliente: 'Ana Souza', link: 'https://x.io/#avaliar/abc' });
  assert.match(t, /^Olá, Ana! /); assert.match(t, /Dalforno/); assert.ok(t.endsWith('https://x.io/#avaliar/abc'));
  assert.equal(AV.validarModelo('Oi {nome}, avalie: {link}', 'avaliacao').ok, true);
  assert.match(AV.validarModelo('Oi {nome}', 'avaliacao').erro, /\{link\}/);
  assert.match(AV.validarModelo('Oi {nome} {cpf} {link}', 'avaliacao').erro, /cpf/);
  assert.equal(AV.validarModelo('Oi {nome}, temos novidade', 'aviso').ok, true);
  assert.match(AV.validarModelo('Oi {nome} {link}', 'aviso').erro, /só vale/);
  assert.equal(AV.validarModelo('abc', 'aviso').ok, false); assert.equal(AV.validarModelo('a'.repeat(301), 'aviso').ok, false); assert.equal(AV.validarModelo(5, 'aviso').ok, false);
  assert.equal(AV.aplicarModelo('Oi {nome}!', { nome: '' }), 'Oi tudo bem!');
});

// ---------- fila em lote ----------
const FILTRO = { de: '2026-10-01', ate: '2026-10-31' };
test('fila: só quem tem telefone, uma linha por pessoa, conta os que ficaram de fora e por quê', () => {
  const s = base();
  s.clientes.push({ id: 'c2', nome: 'Sem Fone', telefone: '' }, { id: 'c5', nome: 'Opt', telefone: '(51) 98888-0000', semMensagens: true }, { id: 'c6', nome: 'Bia', telefone: '(51) 97777-0000' }, { id: 'c7', nome: 'Bia Outra Ficha', telefone: '(51) 97777-0000' });
  atend(s, { inicio: em(5) }); atend(s, { inicio: em(25) });                  // c1 duas vezes: uma linha só, a mais recente
  atend(s, { clienteId: 'c2' }); atend(s, { clienteId: 'c2' });             // sem telefone (uma pessoa)
  atend(s, { clienteId: null, nomeAvulso: 'Fulano' });                       // sem cadastro
  atend(s, { clienteId: 'c5' });                                            // opt-out
  atend(s, { clienteId: 'c6', inicio: em(10) }); atend(s, { clienteId: 'c7', inicio: em(11) }); // mesmo número em duas fichas
  atend(s, { servicoIds: [], produtos: [{ materialId: 'p', qtd: 1 }], clienteId: 'c6' }); // só produto não conta
  atend(s, { status: STATUS.CANCELADO, clienteId: 'c6' });
  const r = AV.montarFila(s, FILTRO);
  assert.equal(r.erro, undefined);
  assert.deepEqual(r.itens.map((i) => i.clienteId), ['c1', 'c7'], 'ordem: mais recente primeiro');
  assert.equal(r.itens[0].agendamentoId, s.agendamentos[1].id, 'o atendimento mais recente da pessoa');
  assert.deepEqual(r.contagem, { atendimentos: 8, semCadastro: 1, semTelefone: 1, semMensagens: 1, duplicados: 2, jaAvaliou: 0, excedente: 0 });
  assert.match(r.itens[0].telefoneMascarado, /^\(51\) •••••-0001$/); assert.equal(JSON.stringify(r).includes('99999-0001'), false, 'telefone inteiro nunca na lista');
});
test('fila: período, profissional e serviço filtram; quem já avaliou fica fora do pedido, mas entra num aviso', () => {
  const s = base();
  s.clientes.push({ id: 'c2', nome: 'Duda', telefone: '(51) 96666-0000' });
  atend(s, { inicio: em(3) });
  const b = atend(s, { clienteId: 'c2', profissionalId: 'u2', servicoIds: ['sv2'], inicio: em(15) });
  assert.equal(AV.montarFila(s, { de: '2026-10-10', ate: '2026-10-20' }).itens.length, 1);
  assert.equal(AV.montarFila(s, { ...FILTRO, profissionalId: 'u1' }).itens.map((i) => i.clienteId).join(), 'c1');
  assert.equal(AV.montarFila(s, { ...FILTRO, servicoId: 'sv2' }).itens.map((i) => i.clienteId).join(), 'c2');
  AV.registrarAvaliacao(s, AV.emitirAcesso(s, b.id, AGORA), { nota: 5 }, AGORA);
  const r = AV.montarFila(s, FILTRO);
  assert.equal(r.itens.map((i) => i.clienteId).join(), 'c1'); assert.equal(r.contagem.jaAvaliou, 1);
  assert.equal(AV.montarFila(s, { ...FILTRO, tipo: 'aviso' }).itens.length, 2, 'aviso comum não depende de avaliação');
});
test('fila: limite de 200 contatos (o resto vira "excedente"); duplicados não gastam vaga', () => {
  const s = base();
  for (let i = 0; i < 230; i++) { s.clientes.push({ id: `x${i}`, nome: `Cli ${i}`, telefone: `(51) 9${String(5000 + i).padStart(4, '0')}-${String(1000 + i).slice(-4)}` }); atend(s, { clienteId: `x${i}`, inicio: em(1 + (i % 28)) }); }
  const r = AV.montarFila(s, FILTRO);
  assert.equal(r.itens.length, 200); assert.equal(r.contagem.excedente, 30);
  assert.equal(new Set(r.itens.map((i) => i.clienteId)).size, 200);
});
test('fila: período obrigatório, máximo de 366 dias, datas válidas e tipo conhecido', () => {
  const s = base();
  for (const f of [{}, { de: '2026-10-01' }, { de: '2026-10-31', ate: '2026-10-01' }, { de: '2025-01-01', ate: '2026-10-30' }, { ...FILTRO, tipo: 'spam' }, { ...FILTRO, servicoId: 7 }]) assert.ok(AV.montarFila(s, f).erro, JSON.stringify(f));
  assert.equal(AV.montarFila(s, { de: '2025-10-30', ate: '2026-10-30' }).erro, undefined);
  assert.deepEqual(AV.montarFila(s, FILTRO).itens, [], 'sem atendimento: lista vazia, não erro');
});
test('fila: quem só enxerga os próprios (soDe) nunca vê atendimento de outro profissional', () => {
  const s = base();
  s.clientes.push({ id: 'c2', nome: 'Duda', telefone: '(51) 96666-0000' });
  atend(s); atend(s, { clienteId: 'c2', profissionalId: 'u2' });
  assert.equal(AV.montarFila(s, { ...FILTRO, profissionalId: 'u2' }, { soDe: 'u1' }).itens.map((i) => i.clienteId).join(), 'c1');
});

// ---------- pela API simulada ----------
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
// Atendimento local concluído (agora) do cliente com telefone; devolve o id.
const VEI = { placa: 'ABC1D23', marca: 'Honda', modelo: 'Civic', cor: 'Prata', porte: 'medio' };
const concluir = (extra = {}) => {
  const d = { servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'pix', clienteId: 'c-igor', ...extra };
  if (d.clienteId) { const v = store.getState().clientes.find((c) => c.id === d.clienteId)?.veiculos?.[0]; if (v) d.veiculoId = v.id; else d.veiculo = VEI; }
  const r = agenda.atender(d); assert.ok(r.ok, JSON.stringify(r)); return r.agendamento.id;
};
const avaliarDe = (token, extra = {}) => publico.avaliar({ token, nota: 5, texto: 'Muito bom', ...extra });
test.beforeEach(() => reiniciar());

test('API: pedir gera token UMA vez, marca avaliacaoPedida e o cliente avalia pelo link; o link não vale de novo', () => {
  como('davi');
  const id = concluir();
  const sit = avaliacoes.situacao(id); assert.equal(sit.motivo, 'ok'); assert.equal(sit.pedidaEm, null);
  const p = avaliacoes.pedir(id); assert.ok(p.ok, JSON.stringify(p)); assert.match(p.token, /^[0-9a-f]{48}$/); assert.ok(p.telefone);
  assert.ok(avaliacoes.situacao(id).pedidaEm, 'marca visual "pedida em"');
  assert.equal(JSON.stringify(store.getState().avaliacaoAcessos).includes(p.token), false);
  const d = publico.dadosAvaliacao(p.token); assert.ok(d.ok); assert.ok(d.servicos.length); assert.equal(JSON.stringify(d).includes('Igor'), false, 'a página do cliente não traz o nome');
  auth.logout();
  assert.equal(avaliarDe(p.token).ok, true);
  assert.equal(publico.dadosAvaliacao(p.token).ok, false);
  assert.deepEqual(avaliarDe(p.token), { ok: false, erros: [AV.ERRO_AVALIACAO] });
  como('davi'); assert.equal(avaliacoes.pedir(id).ok, false, 'já avaliou'); assert.equal(avaliacoes.situacao(id).jaAvaliou, true);
});
test('API pública: token errado, vencido e formato ruim dão a mesma resposta; nota ruim e texto grande dão erro específico só com token válido', () => {
  como('davi'); const t = avaliacoes.pedir(concluir()).token; auth.logout();
  const generico = { ok: false, erros: [AV.ERRO_AVALIACAO] };
  for (const tk of ['0'.repeat(48), 'abc', null, undefined, 5, {}, 'g'.repeat(48)]) { assert.deepEqual(publico.dadosAvaliacao(tk), generico); assert.deepEqual(publico.avaliar({ token: tk, nota: 5 }), generico); }
  assert.match(publico.avaliar({ token: t, nota: 6 }).erros[0], /nota/);
  assert.match(publico.avaliar({ token: t, nota: 0 }).erros[0], /nota/);
  assert.match(publico.avaliar({ token: t, nota: 5, texto: 'a'.repeat(501) }).erros[0], /500/);
  assert.deepEqual(publico.avaliar({ token: '1'.repeat(48), nota: 6 }), generico, 'sem token válido não se aprende nada sobre os campos');
  store.avancar(91 * DIA);
  assert.deepEqual(publico.dadosAvaliacao(t), generico); assert.deepEqual(publico.avaliar({ token: t, nota: 5 }), generico);
});
test('API pública: isca preenchida finge sucesso e não grava; abuso de tentativas inválidas é limitado', () => {
  como('davi'); const id = concluir(); const t = avaliacoes.pedir(id).token; auth.logout();
  assert.deepEqual(publico.avaliar({ token: t, nota: 5, site: 'http://spam' }), { ok: true });
  assert.equal((store.getState().avaliacoes || []).length, 0);
  let barrou = false;
  for (let i = 0; i < 80; i++) if (/Muitas tentativas/.test(publico.dadosAvaliacao('0'.repeat(48)).erros[0])) barrou = true;
  assert.ok(barrou, 'depois de muitas tentativas inválidas: aguarde');
  assert.ok(publico.dadosAvaliacao(t).ok, 'link válido continua valendo mesmo sob ataque');
});
test('API: anônimo com a regra desligada nunca entrega identidade ao painel; ligada pelo Admin mostra o nome e a marca', () => {
  como('davi'); const t = avaliacoes.pedir(concluir()).token; auth.logout();
  assert.ok(avaliarDe(t, { anonimo: true, texto: 'Ótimo' }).ok);
  como('davi');
  let l = avaliacoes.listar({}); assert.equal(l.avaliacoes.length, 1);
  assert.equal(l.avaliacoes[0].cliente, 'Anônimo'); assert.equal(l.mostraAnonimo, false);
  assert.equal(JSON.stringify(l).includes('Igor'), false); assert.equal(JSON.stringify(l).includes('c-igor'), false);
  assert.equal(avaliacoes.ocultar('x', { motivo: 'abcde' }).ok, false);
  assert.equal(store.simularAdmin('avaliacaoMostraAnonimo', true, 'abc').ok, false, 'o Admin também dá motivo');
  assert.equal(store.simularAdmin('outraRegra', true, 'motivo válido').ok, false);
  assert.ok(store.simularAdmin('avaliacaoMostraAnonimo', true, 'Pedido do cliente do plano').ok);
  l = avaliacoes.listar({});
  assert.match(l.avaliacoes[0].cliente, /Igor/); assert.equal(l.avaliacoes[0].revelado, true); assert.equal(l.avaliacoes[0].anonimo, true);
});
test('API: a loja não tem como mudar a regra de anonimato (estabelecimento.salvar ignora o campo)', async () => {
  como('davi');
  const { estabelecimento } = await import('../src/services/api.js');
  estabelecimento.salvar({ avaliacaoMostraAnonimo: true, regrasPlataforma: { avaliacaoMostraAnonimo: true } });
  assert.equal(AV.mostraAnonimo(store.getState()), false);
});
test('API permissão: sem a seção só o profissional vê, e só as próprias; atendente sem a seção não vê nem chama; o dono libera por pessoa', () => {
  como('davi');
  const eu = concluir({ profissionalId: 'u-pablo' }); const outro = concluir({ profissionalId: 'u-marcelo', clienteId: 'c-jon' });
  for (const id of [eu, outro]) { const t = avaliacoes.pedir(id).token; auth.logout(); assert.ok(avaliarDe(t, { nota: id === eu ? 5 : 2 }).ok); como('davi'); }
  assert.equal(avaliacoes.listar({}).avaliacoes.length, 2);
  const c = equipe.salvar({ nome: 'Ana Atendente', apelido: 'Ana', cpf: '529.982.247-25', email: 'ana@x.com', telefone: '(55) 99999-0000', senha: '1234', papel: 'atendente', atende: false });
  assert.ok(c.ok, JSON.stringify(c));
  como('pablo');
  const minhas = avaliacoes.listar({}); assert.equal(minhas.soMinhas, true); assert.deepEqual(minhas.avaliacoes.map((x) => x.nota), [5]);
  assert.equal(avaliacoes.listar({ profissionalId: 'u-marcelo' }).avaliacoes.length, 1, 'pedir o filtro de outro é ignorado: continuam as dele');
  assert.equal(avaliacoes.listar({ profissionalId: 'u-marcelo' }).avaliacoes[0].profissionalId, 'u-pablo');
  assert.equal(avaliacoes.resumo({}).total, 1); assert.equal(avaliacoes.resumo({}).media, 5);
  assert.equal(avaliacoes.ocultar(minhas.avaliacoes[0].id, { motivo: 'não gostei' }).ok, false, 'profissional não oculta');
  assert.equal(mensagens.fila({ ...FILTRO }).ok, false, 'a fila em lote exige a seção');
  como('ana');
  for (const r of [avaliacoes.listar({}), avaliacoes.resumo({}), mensagens.fila(FILTRO), mensagens.iniciarFila({ ...FILTRO, modelo: 'Oi {nome} {link}' }), mensagens.filaAtual()]) assert.equal(r.ok, false);
  como('davi'); const ana = store.getState().usuarios.find((u) => u.apelido === 'Ana');
  const { senha: _s, ...semSenha } = ana; const lib = equipe.salvar({ ...semSenha, permissoes: { avaliacoes: true } }); assert.ok(lib.ok, JSON.stringify(lib));
  como('ana'); assert.equal(avaliacoes.listar({}).avaliacoes.length, 2); assert.equal(avaliacoes.ocultar(minhas.avaliacoes[0].id, { motivo: 'não gostei' }).ok, false, 'liberar a seção não dá o poder de ocultar');
  auth.logout(); assert.equal(avaliacoes.listar({}).ok, false); assert.equal(avaliacoes.pedir(eu).ok, false);
});
test('API: pedir só para quem enxerga o agendamento (profissional não pede o de outro) e só concluído', () => {
  como('davi'); const outro = concluir({ profissionalId: 'u-marcelo', clienteId: 'c-jon' });
  const futuro = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', clienteId: 'c-igor', inicio: Date.now() + 3 * DIA });
  como('pablo');
  assert.equal(avaliacoes.pedir(outro).ok, false); assert.equal(avaliacoes.situacao(outro).ok, false);
  if (futuro.ok) { como('davi'); const r = avaliacoes.pedir(futuro.agendamento.id); assert.equal(r.ok, false); assert.equal(r.motivo, 'nao_concluido'); }
  como('davi'); assert.equal(avaliacoes.pedir('nao-existe').ok, false); assert.equal(avaliacoes.pedir(5).ok, false);
});
test('API: atendimento sem telefone e sem cadastro devolvem o motivo (não silêncio), e não geram token', () => {
  como('davi');
  const semCadastro = concluir({ clienteId: undefined, nome: 'Passante' });
  const r = avaliacoes.pedir(semCadastro); assert.equal(r.ok, false); assert.equal(r.motivo, 'sem_cadastro'); assert.match(r.erros[0], /sem cadastro/);
  const cs = clientes.salvar({ nome: 'Sem Zap', telefone: '(51) 98888-7777' }); assert.ok(cs.ok);
  const id = concluir({ clienteId: cs.cliente.id });
  store.getState().clientes.find((c) => c.id === cs.cliente.id).telefone = '123';
  const r2 = avaliacoes.pedir(id); assert.equal(r2.motivo, 'sem_telefone'); assert.match(r2.erros[0], /sem telefone/);
  assert.equal((store.getState().avaliacaoAcessos || []).length, 0);
});
test('API: ocultar exige o dono e um motivo, não apaga, sai do resumo e da lista dos outros, e dá para reexibir', () => {
  como('davi'); const t = avaliacoes.pedir(concluir()).token; auth.logout(); avaliarDe(t, { nota: 1, texto: 'ruim' });
  como('davi'); const id = avaliacoes.listar({}).avaliacoes[0].id;
  assert.equal(avaliacoes.ocultar(id, { motivo: 'abc' }).ok, false); assert.equal(avaliacoes.ocultar(id, {}).ok, false); assert.equal(avaliacoes.ocultar(id).ok, false);
  assert.ok(avaliacoes.ocultar(id, { motivo: 'Ofensa a terceiros' }).ok);
  assert.equal(avaliacoes.ocultar(id, { motivo: 'Ofensa a terceiros' }).ok, false, 'já oculta');
  assert.equal(store.getState().avaliacoes.length, 1, 'ocultar não apaga');
  assert.equal(avaliacoes.listar({}).avaliacoes[0].oculta, true); assert.equal(avaliacoes.listar({}).avaliacoes[0].motivoOculta, 'Ofensa a terceiros');
  assert.equal(avaliacoes.resumo({}).total, 0);
  como('pablo'); assert.equal(avaliacoes.listar({}).avaliacoes.length, 0); assert.equal(avaliacoes.resumo({}).total, 0);
  como('davi'); assert.ok(avaliacoes.reexibir(id, { motivo: 'Revisado e liberado' }).ok);
  assert.equal(avaliacoes.resumo({}).total, 1); assert.equal(store.getState().avaliacoes[0].historico.length, 2);
});
test('API: filtro por serviço e por profissional, lista e resumo usam o mesmo filtro', () => {
  como('davi');
  const a = concluir({ servicoIds: ['s-lav-simples'] }); const b = concluir({ servicoIds: ['s-lav-detalhada'], profissionalId: 'u-marcelo', clienteId: 'c-jon' });
  for (const [id, nota] of [[a, 5], [b, 3]]) { const t = avaliacoes.pedir(id).token; auth.logout(); avaliarDe(t, { nota }); como('davi'); }
  assert.equal(avaliacoes.resumo({ servicoId: 's-lav-detalhada' }).media, 3);
  assert.equal(avaliacoes.listar({ profissionalId: 'u-pablo' }).avaliacoes.length, 1);
  assert.equal(avaliacoes.resumo({}).media, 4);
  assert.equal(avaliacoes.listar({ de: '2020-01-01', ate: '2020-12-31' }).avaliacoes.length, 0);
  assert.equal(avaliacoes.listar({ de: '2020-01-01', ate: '2026-12-31' }).ok, false, 'período grande demais');
  assert.equal(avaliacoes.listar({ servicoId: { $ne: 1 } }).ok, false);
});
test('API fila: prévia, iniciar, abrir (token e telefone só aqui), marcar enviado/pulou, pausa e encerrar', () => {
  como('davi');
  const ids = [concluir(), concluir({ clienteId: 'c-jon', profissionalId: 'u-marcelo' })];
  const hoje = new Date().toISOString().slice(0, 10);
  const f = { de: hoje, ate: hoje };
  const pre = mensagens.fila(f); assert.ok(pre.ok, JSON.stringify(pre)); assert.equal(pre.itens.length, 2); assert.equal(JSON.stringify(pre).includes('c-igor-fone'), false);
  assert.equal(mensagens.fila({ ...f, ate: undefined }).ok, false);
  assert.equal(mensagens.iniciarFila({ ...f, modelo: 'Oi {nome}' }).ok, false, 'avaliação sem {link}');
  const ini = mensagens.iniciarFila({ ...f, modelo: 'Oi {nome}, avalie: {link}' }); assert.ok(ini.ok, JSON.stringify(ini));
  assert.equal(mensagens.iniciarFila({ ...f, modelo: 'Oi {nome}, avalie: {link}' }).ok, false, 'uma fila aberta por pessoa');
  const fila = ini.fila; assert.equal(JSON.stringify(fila).match(/\d{5}-\d{4}/g), null, 'sem telefone inteiro na fila');
  assert.equal(mensagens.marcarItem(fila.id, fila.itens[0].id, 'enviado').ok, false, 'enviado só depois de aberto');
  const ab = mensagens.abrirItem(fila.id, fila.itens[0].id); assert.ok(ab.ok); assert.match(ab.token, /^[0-9a-f]{48}$/); assert.ok(ab.telefone);
  assert.ok(mensagens.marcarItem(fila.id, fila.itens[0].id, 'enviado').ok);
  assert.equal(mensagens.abrirItem(fila.id, fila.itens[0].id).ok, false, 'já tratado');
  assert.ok(mensagens.marcarItem(fila.id, fila.itens[1].id, 'pulou').ok);
  assert.equal(mensagens.marcarItem(fila.id, fila.itens[1].id, 'enviado').ok, false);
  assert.equal(mensagens.marcarItem(fila.id, fila.itens[1].id, 'hackeado').ok, false);
  const atual = mensagens.filaAtual().fila; assert.deepEqual(atual.itens.map((i) => i.status), ['enviado', 'pulou']);
  como('pablo'); assert.equal(mensagens.abrirItem(fila.id, fila.itens[0].id).ok, false);
  como('davi'); assert.ok(mensagens.encerrarFila(fila.id).ok); assert.equal(mensagens.filaAtual().fila, null);
  assert.equal(mensagens.abrirItem(fila.id, fila.itens[0].id).ok, false, 'encerrada');
  assert.ok(ids.length === 2);
});
test('API fila: contato que ficou impossível depois de entrar na fila é pulado e a recusa fica registrada', () => {
  como('davi'); concluir();
  const hoje = new Date().toISOString().slice(0, 10);
  const fila = mensagens.iniciarFila({ de: hoje, ate: hoje, modelo: 'Oi {nome}: {link}' }).fila;
  store.getState().clientes.find((c) => c.id === 'c-igor').semMensagens = true;
  const r = mensagens.abrirItem(fila.id, fila.itens[0].id);
  assert.equal(r.ok, false); assert.equal(r.motivo, 'sem_mensagens');
  assert.equal(mensagens.filaAtual().fila.itens[0].status, 'pulou', 'persistir: a recusa deixa o registro');
});
test('API: opt-out do cliente (semMensagens) é só booleano e tira da fila e da estrela', () => {
  como('davi');
  const id = concluir();
  assert.equal(clientes.salvar({ id: 'c-igor', nome: 'Igor', telefone: '(51) 99999-0001', semMensagens: 'sim' }).ok, false);
  const c = store.getState().clientes.find((x) => x.id === 'c-igor');
  assert.ok(clientes.salvar({ id: c.id, nome: c.nome, telefone: c.telefone, semMensagens: true }).ok);
  assert.equal(avaliacoes.situacao(id).motivo, 'sem_mensagens');
  const hoje = new Date().toISOString().slice(0, 10);
  const pre = mensagens.fila({ de: hoje, ate: hoje }); assert.equal(pre.itens.length, 0); assert.equal(pre.contagem.semMensagens, 1);
  assert.equal(mensagens.iniciarFila({ de: hoje, ate: hoje, modelo: 'Oi {nome}: {link}' }).ok, false, 'fila vazia não é criada');
});
test('API fila aviso: sem {link}, sem token e sem marcar avaliação pedida', () => {
  como('davi'); const id = concluir();
  const hoje = new Date().toISOString().slice(0, 10);
  const fila = mensagens.iniciarFila({ tipo: 'aviso', de: hoje, ate: hoje, modelo: 'Oi {nome}, promoção de sexta!' }).fila;
  const ab = mensagens.abrirItem(fila.id, fila.itens[0].id); assert.ok(ab.ok); assert.equal(ab.token, null);
  assert.equal(avaliacoes.situacao(id).pedidaEm, null); assert.equal((store.getState().avaliacaoAcessos || []).length, 0);
});
