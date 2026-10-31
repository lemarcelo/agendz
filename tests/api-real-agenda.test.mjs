/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda do site real (src/services/api-real.js, `agenda` e `profissionais`): rotas e corpos, validação antes da rede, leitura defensiva da resposta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agenda, comissoes, configurar, consultaDoPeriodo, portes, produtos, profissionais, regras, servicos } from '../src/services/api-real.js';
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
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/atendimentos', metodo: 'POST', corpo: { servicoIds: [SRV], nome: 'Ana', telefone: '(11) 97777-6666', motivoRetroativo: 'Esqueci de lançar', clienteId: ID, profissionalId: PROF, inicio: '2026-10-26T18:00:00.000Z', status: 'confirmado', encaixe: false, formaPagamento: 'pix' } });
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

test('comissões: período vira consulta; entrada ruim nem sai do cliente; leitura defensiva sem percentual nem valor cheio no "meu"', async () => {
  assert.deepEqual(consultaDoPeriodo({ mes: '2026-10' }), { q: 'mes=2026-10' });
  assert.deepEqual(consultaDoPeriodo({ de: '2026-10-01', ate: '2026-10-31' }), { q: 'de=2026-10-01&ate=2026-10-31' });
  for (const x of [null, {}, { mes: '2026-13' }, { de: '2026-10-01' }, { de: '1; drop', ate: '2026-10-31' }]) assert.ok(consultaDoPeriodo(x).erro, JSON.stringify(x));
  assert.match(consultaDoPeriodo({ de: '2026-10-31', ate: '2026-10-01' }).erro, /não pode ser antes/);
  servidor({ totais: { atendimentos: 1, receber: 40, jaPago: 0, aReceber: 40 }, previsto: { atendimentos: 1, receber: 10 },
    linhas: [{ agendamentoId: ID, inicio: '2026-10-28T13:00:00Z', local: true, servicos: ['Lavagem'], receber: 40, paga: false, cancelada: false, base: 80, casa: 40, pct: 50 }] });
  const r = await comissoes.meu({ mes: '2026-10' });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/comissoes/meu?mes=2026-10');
  assert.equal(r.totais.receber, 40); assert.equal(r.linhas[0].receber, 40);
  assert.ok(!('base' in r.linhas[0]) && !('casa' in r.linhas[0]) && !('pct' in r.linhas[0]) && !('casa' in r.totais), 'nada do valor cheio chega à tela');
  const antes = chamadas.length;
  assert.equal((await comissoes.meu({})).ok, false);
  assert.equal(chamadas.length, antes);
});

test('comissões: pagar leva chave e a repete no mesmo pedido; pedido ruim nem sai; cancelar exige id e limite do motivo', async () => {
  servidor({ valor: 80, atendimentos: 2 }, 201);
  const per = { de: '2026-10-01', ate: '2026-10-31' };
  const r = await comissoes.pagar(PROF, per);
  assert.deepEqual(r, { ok: true, valor: 80, atendimentos: 2 });
  assert.deepEqual(chamadas[0].corpo, { profissionalId: PROF, de: '2026-10-01', ate: '2026-10-31' });
  const antes = chamadas.length;
  for (const x of [await comissoes.pagar('x', per), await comissoes.pagar(PROF, {}), await comissoes.cancelar('x', { motivo: 'abc' }), await comissoes.cancelar(ID, { quem: 'x', motivo: 'Cortesia' }),
    await comissoes.cancelar(ID, { motivo: 'a'.repeat(301) }), await comissoes.restaurar('x'), await comissoes.restaurar(ID, { quem: '1; drop' })]) assert.equal(x.ok, false);
  assert.equal(chamadas.length, antes);
  servidor(null, 204);
  assert.equal((await comissoes.cancelar(ID, { quem: PROF, motivo: '  Cortesia da casa ' })).ok, true);
  assert.deepEqual(chamadas[0], { url: `https://loja.teste/api/agendamentos/${ID}/comissao/cancelar`, metodo: 'POST', corpo: { quem: PROF, motivo: 'Cortesia da casa' } });
  assert.equal((await comissoes.restaurar(ID)).ok, true);
  assert.deepEqual(chamadas[1].corpo, {});
});

// ---------- 5d-4c: forma de pagamento e regras do Atender ----------
test('atender: a forma de pagamento vai no corpo só se for válida; forma inventada nem sai do cliente', async () => {
  servidor({ id: ID, clienteId: null, profissionalId: PROF, inicio: '2026-10-28T13:00:00Z', status: 'concluido', formaPagamento: 'cartao' });
  const r = await agenda.atender({ servicoIds: [PROF], profissionalId: PROF, formaPagamento: 'cartao' });
  assert.equal(chamadas[0].corpo.formaPagamento, 'cartao');
  assert.equal(r.agendamento.formaPagamento, 'cartao');
  await agenda.atender({ servicoIds: [PROF], profissionalId: PROF });
  assert.ok(!('formaPagamento' in chamadas[1].corpo), 'sem forma: o servidor usa o padrão da loja');
  const antes = chamadas.length;
  const ruim = await agenda.atender({ servicoIds: [PROF], formaPagamento: 'boleto' });
  assert.deepEqual([ruim.ok, ruim.erro], [false, 'Forma de pagamento inválida.']);
  assert.equal(chamadas.length, antes);
});

test('leitura: forma desconhecida na resposta vira vazio', async () => {
  servidor([{ id: ID, profissionalId: PROF, inicio: '2026-10-28T13:00:00Z', status: 'concluido', formaPagamento: 'cheque' }]);
  assert.equal((await agenda.listar({ de: 1, ate: 2 })).agendamentos[0].formaPagamento, '');
});

test('regras do Atender: rota, corpo certo, leitura defensiva e validação antes da rede', async () => {
  servidor({ formaPagamentoPadrao: 'dinheiro', futuro: ['nome', 'formaPagamento', 'cpf'], local: ['telefone', 'x'.repeat(50)], lixo: 1 });
  const lida = await regras.obter();
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/estabelecimento/regras-atendimento', metodo: 'GET', corpo: undefined });
  assert.deepEqual(lida, { ok: true, regras: { formaPagamentoPadrao: 'dinheiro', futuro: ['nome'], local: ['telefone'], ordemServicos: 'uso', profissionalAutomatico: false } }, 'o futuro nunca exige forma; campo desconhecido some; sem ordem gravada vale "uso"');
  servidor({ formaPagamentoPadrao: 'xx', futuro: [], local: [] });
  assert.equal((await regras.obter()).regras.formaPagamentoPadrao, 'pix', 'forma desconhecida volta ao padrão de fábrica');
  servidor({ formaPagamentoPadrao: '', futuro: ['nome'], local: ['formaPagamento'] });
  const g = await regras.gravar({ formaPagamentoPadrao: '', camposObrigatorios: { futuro: ['nome'], local: ['formaPagamento'], lixo: 1 } });
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/estabelecimento/regras-atendimento', metodo: 'PUT', corpo: { formaPagamentoPadrao: '', camposObrigatorios: { futuro: ['nome'], local: ['formaPagamento'] } } });
  assert.deepEqual(g.regras, { formaPagamentoPadrao: '', futuro: ['nome'], local: ['formaPagamento'], ordemServicos: 'uso', profissionalAutomatico: false });
  // v123: ordem dos serviços — só 'uso' ou 'manual'; inválida nem chega à rede
  servidor({ formaPagamentoPadrao: 'pix', futuro: [], local: [], ordemServicos: 'manual' });
  const o = await regras.gravar({ ordemServicos: 'manual' });
  assert.deepEqual(chamadas[0].corpo, { ordemServicos: 'manual' });
  assert.equal(o.regras.ordemServicos, 'manual');
  const antesOrdem = chamadas.length;
  assert.equal((await regras.gravar({ ordemServicos: 'aleatorio' })).ok, false);
  assert.equal(chamadas.length, antesOrdem, 'ordem inválida não vai à rede');
  // B9c: escolha automática do profissional — só sim/não; inválida nem chega à rede
  servidor({ formaPagamentoPadrao: 'pix', futuro: [], local: [], profissionalAutomatico: true });
  const pa = await regras.gravar({ profissionalAutomatico: true });
  assert.deepEqual(chamadas[0].corpo, { profissionalAutomatico: true });
  assert.equal(pa.regras.profissionalAutomatico, true);
  const antesPa = chamadas.length;
  assert.equal((await regras.gravar({ profissionalAutomatico: 'sim' })).ok, false);
  assert.equal(chamadas.length, antesPa, 'valor inválido não vai à rede');
  const antes = chamadas.length;
  for (const ruim of [{ formaPagamentoPadrao: 'boleto' }, { camposObrigatorios: { futuro: ['formaPagamento'], local: [] } }, { camposObrigatorios: { futuro: ['nome', 'nome'], local: [] } }, { camposObrigatorios: { futuro: ['cpf'], local: [] } }, { camposObrigatorios: { futuro: [] } }]) {
    assert.equal((await regras.gravar(ruim)).ok, false);
  }
  assert.equal(chamadas.length, antes, 'nada inválido sai do cliente');
});

test('regras do Atender: placa, modelo, porte e veículo são campos válidos e saem no corpo', async () => {
  servidor({ formaPagamentoPadrao: 'pix', futuro: ['veiculo', 'placa'], local: ['modelo', 'porte'] });
  const g = await regras.gravar({ camposObrigatorios: { futuro: ['veiculo', 'placa'], local: ['modelo', 'porte'] } });
  assert.equal(g.ok, true);
  assert.deepEqual(chamadas[0].corpo, { camposObrigatorios: { futuro: ['veiculo', 'placa'], local: ['modelo', 'porte'] } });
  assert.deepEqual([g.regras.futuro, g.regras.local], [['veiculo', 'placa'], ['modelo', 'porte']]);
});

test('portes de veículo: rota, leitura defensiva, corpo só com id válido e validação antes da rede', async () => {
  servidor([{ id: 'medio', nome: 'Médio', exemplo: 'Ex.: Onix', ativo: true }, { id: 'pt3', nome: 'Van', ativo: false }, { id: 'LIXO!', nome: 'x' }, { id: 'suv', nome: '' }]);
  const l = await portes.listar();
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', 'https://loja.teste/api/estabelecimento/portes']);
  assert.deepEqual(l.portes, [{ id: 'medio', nome: 'Médio', exemplo: 'Ex.: Onix', ativo: true }, { id: 'pt3', nome: 'Van', exemplo: '', ativo: false }], 'id ruim e nome vazio somem');
  servidor([{ id: 'medio', nome: 'Médio', ativo: true }]);
  const g = await portes.gravar([{ id: 'medio', nome: 'Médio', ativo: true }, { id: 'NOVO ID', nome: 'Van', exemplo: 'Ex.: Sprinter', ativo: false }, { nome: 'Mini', ativo: true }]);
  assert.equal(g.ok, true);
  assert.deepEqual(chamadas[0].corpo, { portes: [{ id: 'medio', nome: 'Médio', exemplo: '', ativo: true }, { nome: 'Van', exemplo: 'Ex.: Sprinter', ativo: false }, { nome: 'Mini', exemplo: '', ativo: true }] });
  const antes = chamadas.length;
  assert.equal((await portes.gravar([])).ok, false);
  assert.equal(chamadas.length, antes, 'lista vazia nem sai');
});

test('regras do Atender: o erro do servidor chega com a mensagem dele (profissional não grava)', async () => {
  servidor({ mensagem: 'Acesso negado.' }, 403);
  const r = await regras.gravar({ formaPagamentoPadrao: 'pix' });
  assert.deepEqual([r.ok, r.status, r.erro], [false, 403, 'Acesso negado.']);
});

// ---------- estética: veículo, box e a tela de Boxes ----------
import { boxes } from '../src/services/api-real.js';
const BX = '00000000-0000-4000-8000-000000000060';
const VEI = '00000000-0000-4000-8000-000000000031';
const SRVID = '00000000-0000-4000-8000-000000000050';

test('atender com veículo: veiculoId ou veículo novo (texto limpo e cortado) e boxId; id ruim não sai do cliente', async () => {
  servidor({ id: ID, profissionalId: PROF, inicio: '2026-10-30T13:00:00Z', status: 'a_confirmar', estetica: { boxId: BX, box: 'Box 1', veiculoId: VEI, porte: 'suv', placa: 'ABC1D23', marca: 'Jeep', modelo: 'Compass', cor: 'Cinza' } }, 201);
  const r = await agenda.atender({ servicoIds: [SRVID], veiculoId: VEI, boxId: BX, inicio: Date.parse('2026-10-30T13:00:00Z') });
  assert.equal(chamadas[0].corpo.veiculoId, VEI); assert.equal(chamadas[0].corpo.boxId, BX);
  assert.deepEqual(r.agendamento.estetica, { boxId: BX, box: 'Box 1', veiculoId: VEI, porte: 'suv', placa: 'ABC1D23', marca: 'Jeep', modelo: 'Compass', cor: 'Cinza' });
  await agenda.atender({ servicoIds: [SRVID], veiculo: { placa: 'ABC1D23', modelo: 'x'.repeat(100), porte: 'suv', extra: 'ignorado' } });
  assert.equal(chamadas[1].corpo.veiculo.modelo.length, 40); assert.ok(!('extra' in chamadas[1].corpo.veiculo)); assert.equal(chamadas[1].corpo.veiculoId, undefined);
  assert.equal((await agenda.atender({ servicoIds: [SRVID], veiculoId: 'lixo' })).ok, false);
  assert.equal((await agenda.atender({ servicoIds: [SRVID], veiculoId: VEI, boxId: '../x' })).ok, false);
  assert.equal(chamadas.length, 2);
});

test('agendamento sem bloco de estética (barbearia, produto) vem com estetica nula; bloco ruim é cortado e id ruim some', async () => {
  servidor([{ id: ID, profissionalId: PROF, inicio: '2026-10-30T13:00:00Z', status: 'confirmado' }, { id: ID, profissionalId: PROF, inicio: '2026-10-30T13:00:00Z', status: 'confirmado', estetica: { boxId: 'x', box: 'B'.repeat(80), placa: 'P'.repeat(30) } }]);
  const [a, b] = (await agenda.listar({ de: 1, ate: 2 })).agendamentos;
  assert.equal(a.estetica, null);
  assert.equal(b.estetica.boxId, null); assert.equal(b.estetica.box.length, 30); assert.equal(b.estetica.placa.length, 8);
});

test('remarcar leva boxId só quando informado e válido', async () => {
  servidor({ id: ID, profissionalId: PROF, inicio: '2026-10-30T13:00:00Z', status: 'confirmado' });
  await agenda.remarcar(ID, { inicio: Date.parse('2026-10-30T13:00:00Z') });
  assert.equal(chamadas[0].corpo.boxId, undefined);
  await agenda.remarcar(ID, { inicio: Date.parse('2026-10-30T13:00:00Z'), boxId: BX });
  assert.equal(chamadas[1].corpo.boxId, BX);
  assert.equal((await agenda.remarcar(ID, { inicio: Date.parse('2026-10-30T13:00:00Z'), boxId: 'lixo' })).ok, false);
  assert.equal(chamadas.length, 2);
});

test('boxes: listar lê defensivamente; gravar envia a lista por id e barra lista vazia antes da rede', async () => {
  servidor([{ id: BX, nome: 'Box 1', ativo: true }, { id: 'ruim', nome: 'X' }, { id: BX, nome: 'N'.repeat(60), ativo: false }]);
  const l = (await boxes.listar()).boxes;
  assert.equal(chamadas[0].url, 'https://loja.teste/api/boxes'); assert.equal(l.length, 2); assert.equal(l[1].nome.length, 30); assert.equal(l[1].ativo, false);
  servidor([{ id: BX, nome: 'Box 1', ativo: true }]);
  const g = await boxes.gravar([{ id: BX, nome: 'Box 1' }, { nome: 'Box 2', ativo: false }, { id: 'lixo', nome: 'Box 3' }]);
  assert.equal(chamadas[0].metodo, 'PUT'); assert.equal(chamadas[0].url, 'https://loja.teste/api/estabelecimento/boxes');
  assert.deepEqual(chamadas[0].corpo.boxes, [{ id: BX, nome: 'Box 1', ativo: true }, { nome: 'Box 2', ativo: false }, { nome: 'Box 3', ativo: true }]);
  assert.equal(g.ok, true);
  assert.equal((await boxes.gravar([])).ok, false);
  assert.equal(chamadas.length, 1);
});

test('serviços: lista do Atender pede a ordem da loja; reordenar manda só ids válidos (v123)', async () => {
  servidor([]);
  await servicos.listar();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/servicos');
  await servicos.listar({ para: 'atender' });
  assert.equal(chamadas.at(-1).url, 'https://loja.teste/api/servicos?para=atender');
  await servicos.listar({ para: 'outra-coisa' });
  assert.equal(chamadas.at(-1).url, 'https://loja.teste/api/servicos', 'só o valor conhecido entra na consulta');
  servidor(null, 204);
  const r = await servicos.reordenar([ID, PROF]);
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/servicos/ordem', metodo: 'PUT', corpo: { ids: [ID, PROF] } });
  assert.equal(r.ok, true);
  const antes = chamadas.length;
  assert.equal((await servicos.reordenar(['lixo'])).ok, false);
  assert.equal((await servicos.reordenar('x')).ok, false);
  assert.equal(chamadas.length, antes, 'id inválido nem sai do cliente');
});
