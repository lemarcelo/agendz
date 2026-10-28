/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda do site real (src/services/api-real.js, `agenda` e `profissionais`): rotas e corpos, validação antes da rede, leitura defensiva da resposta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agenda, configurar, produtos, profissionais } from '../src/services/api-real.js';
import { agruparPorDia } from '../src/domain/agenda-grupos.js';

const ID = '00000000-0000-4000-8000-000000000101';
const PROF = '00000000-0000-4000-8000-000000000001';
const MAT = '00000000-0000-4000-8000-000000000077';
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined }); return { ok: status < 400, status, json: async () => resposta }; };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('listar: período em UTC na consulta; período inválido nem sai do cliente', async () => {
  servidor([]);
  const de = Date.parse('2026-10-28T03:00:00Z'), ate = Date.parse('2026-11-04T03:00:00Z');
  assert.deepEqual(await agenda.listar({ de, ate }), { ok: true, agendamentos: [] });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/agendamentos?de=2026-10-28T03%3A00%3A00.000Z&ate=2026-11-04T03%3A00%3A00.000Z');
  assert.equal((await agenda.listar({ de: ate, ate: de })).ok, false);
  assert.equal((await agenda.listar({ de: NaN, ate })).ok, false);
  assert.equal(chamadas.length, 1);
});

test('leitura defensiva: status desconhecido vira "a confirmar", id ruim some, instante inválido vira nulo, texto é cortado', async () => {
  servidor([{ id: ID, clienteId: 'x', profissionalId: PROF, inicio: 'ontem', status: 'hackeado', total: 'muito', servicos: [{ nome: 'x'.repeat(500), preco: 10, duracaoMin: 30 }],
    conflitosPendentes: [ID, 'lixo'], origem: 'link', historico: [{ em: '2026-10-28T12:00:00Z', autor: 'Alan', campo: 'status', de: 'A confirmar', para: 'Confirmado' }], extra: 'ignorado' }]);
  const r = await agenda.listar({ de: 1, ate: 2 });
  const a = r.agendamentos[0];
  assert.equal(a.clienteId, null); assert.equal(a.inicio, null); assert.equal(a.status, 'a_confirmar'); assert.equal(a.total, 0);
  assert.equal(a.servicos[0].nome.length, 100); assert.deepEqual(a.conflitosPendentes, [ID]); assert.equal(a.origem, 'link');
  assert.equal(a.historico[0].em, Date.parse('2026-10-28T12:00:00Z')); assert.ok(!('extra' in a));
});

test('mudarStatus e remarcar: rota e corpo certos; id, status e data inválidos não saem do cliente', async () => {
  servidor({ id: ID, clienteId: null, profissionalId: PROF, inicio: '2026-10-29T13:00:00Z', status: 'confirmado' });
  assert.equal((await agenda.mudarStatus(ID, 'confirmado')).agendamento.status, 'confirmado');
  assert.deepEqual(chamadas[0], { url: `https://loja.teste/api/agendamentos/${ID}/status`, metodo: 'PUT', corpo: { status: 'confirmado' } });
  const ts = Date.parse('2026-10-29T17:00:00-03:00');
  await agenda.remarcar(ID, { inicio: ts, profissionalId: PROF, encaixe: true, status: 'confirmado', lixo: 1 });
  assert.deepEqual(chamadas[1].corpo, { inicio: '2026-10-29T20:00:00.000Z', profissionalId: PROF, encaixe: true, status: 'confirmado' });
  await agenda.remarcar(ID, { inicio: ts });
  assert.deepEqual(chamadas[2].corpo, { inicio: '2026-10-29T20:00:00.000Z' }, 'sem profissional nem status: só a data');
  const antes = chamadas.length;
  for (const r of [await agenda.mudarStatus('1; drop', 'confirmado'), await agenda.mudarStatus(ID, 'qualquer'), await agenda.remarcar(ID, { inicio: 'amanhã' }), await agenda.remarcar(ID, { inicio: ts, profissionalId: 'x' }), await agenda.remarcar(ID, { inicio: ts, status: 'x' }), await agenda.obter('x')]) assert.equal(r.ok, false);
  assert.equal(chamadas.length, antes);
});

test('erro do servidor chega com a mensagem dele (conflito, expediente, permissão)', async () => {
  servidor({ mensagem: 'Esse horário já está ocupado por um agendamento confirmado.' }, 409);
  const r = await agenda.remarcar(ID, { inicio: Date.parse('2026-10-29T17:00:00-03:00') });
  assert.deepEqual([r.ok, r.status, r.erro], [false, 409, 'Esse horário já está ocupado por um agendamento confirmado.']);
});

test('profissionais: só id válido, papel conhecido e atende', async () => {
  servidor([{ id: PROF, nome: 'Alan', papel: 'dono', atende: true }, { id: 'ruim', nome: 'X', papel: 'dono', atende: true }, { id: ID, nome: 'Kiko', papel: 'chefe', atende: false }]);
  const r = await profissionais.listar();
  assert.deepEqual(r.profissionais, [{ id: PROF, nome: 'Alan', papel: 'dono', atende: true, podeVender: true }, { id: ID, nome: 'Kiko', papel: 'profissional', atende: false, podeVender: true }]);
});

test('agruparPorDia junta por dia mantendo a ordem', () => {
  const dia = Date.parse('2026-10-29T12:00:00-03:00');
  const g = agruparPorDia([{ inicio: dia }, { inicio: dia + 3600000 }, { inicio: dia + 86400000 }]);
  assert.equal(g.length, 2); assert.equal(g[0].lista.length, 2);
});

test('atender: rota e corpo certos, só o que o servidor aceita; entrada ruim nem sai do cliente', async () => {
  servidor({ id: ID, clienteId: null, profissionalId: PROF, inicio: '2026-10-28T13:00:00Z', status: 'concluido', origem: 'atendimento', nomeAvulso: 'Balcão', motivoRetroativo: 'Esqueci de lançar' });
  const SRV = '00000000-0000-4000-8000-000000000050';
  const r = await agenda.atender({ servicoIds: [SRV], nome: 'Ana', telefone: '(11) 97777-6666', clienteId: ID, profissionalId: PROF, inicio: Date.parse('2026-10-26T15:00:00-03:00'), motivoRetroativo: 'Esqueci de lançar', status: 'confirmado', encaixe: false, formaPagamento: 'pix', campoQualquer: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.agendamento.origem, 'atendimento'); assert.equal(r.agendamento.nomeAvulso, 'Balcão'); assert.equal(r.agendamento.motivoRetroativo, 'Esqueci de lançar');
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/atendimentos', metodo: 'POST', corpo: { servicoIds: [SRV], nome: 'Ana', telefone: '(11) 97777-6666', motivoRetroativo: 'Esqueci de lançar', clienteId: ID, profissionalId: PROF, inicio: '2026-10-26T18:00:00.000Z', status: 'confirmado', encaixe: false } });
  await agenda.atender({ servicoIds: [SRV], nome: '  ', telefone: '' });
  assert.deepEqual(chamadas[1].corpo, { servicoIds: [SRV] }, 'texto em branco não vai; sem data o servidor decide "agora"');
  const antes = chamadas.length;
  for (const x of [await agenda.atender({ servicoIds: [] }), await agenda.atender({}), await agenda.atender({ servicoIds: ['1; drop'] }), await agenda.atender({ servicoIds: [SRV], clienteId: 'x' }),
    await agenda.atender({ servicoIds: [SRV], profissionalId: 'x' }), await agenda.atender({ servicoIds: [SRV], inicio: 'amanhã' }), await agenda.atender({ servicoIds: [SRV], status: 'concluido' })]) assert.equal(x.ok, false);
  assert.equal(chamadas.length, antes);
  assert.equal((await agenda.atender({ servicoIds: [] })).erro, 'Escolha ao menos um serviço ou um produto.');
});

test('atender com produtos: só materialId e qtd inteira de 1 a 999 saem; vendedor entra; produto ruim nem sai do cliente', async () => {
  servidor({ id: ID, profissionalId: PROF, inicio: '2026-10-28T13:00:00Z', status: 'concluido', origem: 'atendimento',
    produtos: [{ materialId: MAT, nome: 'Pomada', qtd: 2, preco: 45, vendedorId: PROF, comissaoPct: 10 }], totalProdutos: 90, total: 0 });
  const r = await agenda.atender({ servicoIds: [], produtos: [{ materialId: MAT, qtd: 2, preco: 1, comissaoPct: 99 }], vendedorId: PROF, profissionalId: PROF });
  assert.equal(r.ok, true);
  assert.deepEqual(chamadas[0].corpo, { servicoIds: [], produtos: [{ materialId: MAT, qtd: 2 }], vendedorId: PROF, profissionalId: PROF }, 'preço e comissão do cliente nunca vão: o servidor congela os dele');
  assert.deepEqual(r.agendamento.produtos, [{ materialId: MAT, nome: 'Pomada', qtd: 2, preco: 45, vendedorId: PROF }], 'a comissão não é lida da resposta');
  assert.equal(r.agendamento.totalProdutos, 90);
  const antes = chamadas.length;
  for (const x of [await agenda.atender({ servicoIds: [], produtos: [{ materialId: 'x', qtd: 1 }] }), await agenda.atender({ servicoIds: [], produtos: [{ materialId: MAT, qtd: 0 }] }),
    await agenda.atender({ servicoIds: [], produtos: [{ materialId: MAT, qtd: 1.5 }] }), await agenda.atender({ servicoIds: [], produtos: [{ materialId: MAT, qtd: 1000 }] }),
    await agenda.atender({ servicoIds: [], produtos: Array.from({ length: 11 }, () => ({ materialId: MAT, qtd: 1 })) }), await agenda.atender({ servicoIds: [], produtos: [{ materialId: MAT, qtd: 1 }], vendedorId: 'x' })]) assert.equal(x.ok, false);
  assert.equal(chamadas.length, antes);
});

test('produtos.listar: só ativos, sem comissão nem custo, números e texto saneados', async () => {
  servidor([{ id: MAT, codigo: '7', nome: 'Pomada', preco: 45, estoque: 3, ativo: true, comissaoPct: 10, custo: 22 }, { id: ID, nome: 'Velho', preco: 1, ativo: false }, { id: 'lixo', nome: 'x' }]);
  const r = await produtos.listar();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/produtos');
  assert.deepEqual(r.produtos, [{ id: MAT, codigo: '7', nome: 'Pomada', preco: 45, estoque: 3, ativo: true }]);
});

test('profissionais.listar: podeVender vem do servidor e, se faltar, vale como pode', async () => {
  servidor([{ id: PROF, nome: 'Alan', papel: 'dono', atende: true, podeVender: false }, { id: ID, nome: 'Kiko', papel: 'profissional', atende: true }]);
  const r = await profissionais.listar();
  assert.deepEqual(r.profissionais.map((p) => p.podeVender), [false, true]);
});

test('atender: mensagem do servidor chega inteira à tela', async () => {
  servidor({ mensagem: 'Informe o motivo do lançamento de um dia anterior (por que não foi registrado na hora).' }, 400);
  const r = await agenda.atender({ servicoIds: ['00000000-0000-4000-8000-000000000050'], inicio: Date.parse('2026-10-26T15:00:00-03:00') });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Informe o motivo do lançamento de um dia anterior/);
});

test('atender: leva Idempotency-Key; o mesmo pedido de novo repete a chave, outro pedido ou um sucesso gera chave nova', async () => {
  const SRV = '00000000-0000-4000-8000-000000000050';
  chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ cab: init.headers }); const passa = chamadas.length === 4; return { ok: passa, status: passa ? 201 : 400, json: async () => ({ id: ID, profissionalId: PROF, inicio: '2026-10-28T13:00:00Z', status: 'concluido', mensagem: 'recusado' }) }; };
  const chaveDe = (i) => chamadas[i].cab['Idempotency-Key'];
  await agenda.atender({ servicoIds: [SRV], telefone: '11977776666' }); // 0: pedido A, recusado
  await agenda.atender({ servicoIds: [SRV], telefone: '11977776666' }); // 1: o mesmo pedido A outra vez
  await agenda.atender({ servicoIds: [SRV], telefone: '11988887777' }); // 2: pedido B, recusado
  const ok = await agenda.atender({ servicoIds: [SRV], telefone: '11988887777' }); // 3: o mesmo pedido B, agora passa
  await agenda.atender({ servicoIds: [SRV], telefone: '11988887777' }); // 4: depois do sucesso, o mesmo pedido de propósito
  assert.match(chaveDe(0), /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(chaveDe(0), chaveDe(1), 'mesmo pedido: mesma chave');
  assert.notEqual(chaveDe(1), chaveDe(2), 'outro pedido: chave nova');
  assert.equal(chaveDe(2), chaveDe(3), 'repetição do pedido B: mesma chave');
  assert.equal(ok.ok, true);
  assert.notEqual(chaveDe(3), chaveDe(4), 'depois de um sucesso: chave nova');
});

test('resposta perdida com o aparelho online: com chave, reenvia sozinho a MESMA chave e entrega o resultado; sem chave, não reenvia', async () => {
  const SRV = '00000000-0000-4000-8000-000000000050';
  chamadas = [];
  let queda = 2;
  globalThis.fetch = async (url, init) => {
    chamadas.push({ metodo: init.method, cab: init.headers });
    if (queda-- > 0) throw new TypeError('Failed to fetch');
    return { ok: true, status: 201, json: async () => ({ id: ID, profissionalId: PROF, inicio: '2026-10-28T13:00:00Z', status: 'concluido' }) };
  };
  const r = await agenda.atender({ servicoIds: [SRV], telefone: '11966665555' });
  assert.equal(r.ok, true);
  assert.equal(chamadas.length, 3, 'duas quedas e o terceiro envio passou');
  assert.equal(new Set(chamadas.map((c) => c.cab['Idempotency-Key'])).size, 1, 'a mesma chave nas três tentativas');
  // sem chave (qualquer outra escrita): uma queda online devolve o erro, nada é reenviado
  chamadas = []; queda = 1;
  const s = await agenda.mudarStatus(ID, 'confirmado');
  assert.equal(s.ok, false); assert.equal(s.status, 0);
  assert.equal(chamadas.length, 1);
});
