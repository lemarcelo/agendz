/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço no site real (src/services/api-real.js, `planos` e `planosPublico`): rotas e corpos, mensalidade com chave de repetição,
// validação antes da rede, leitura defensiva e a mensagem do servidor chega inteira. O saldo vem do servidor: nada é calculado aqui.
import { test, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import assert from 'node:assert/strict';
import { configurar, planos, planosPublico } from '../src/services/api-real.js';

const ID = '00000000-0000-4000-8000-000000000101';
const SRV = '00000000-0000-4000-8000-000000000050';
const CLI = '00000000-0000-4000-8000-000000000060';
const PAG = '00000000-0000-4000-8000-000000000070';
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined, cab: init.headers });
    return { ok: status < 400, status, json: async () => resposta, text: async () => JSON.stringify(resposta), headers: { get: () => 'application/json' } };
  };
}
beforeEach(() => configurar({ base: 'https://loja.teste' }));

const plano = { nome: 'Plano Mensal', descricao: 'Dois cortes', preco: '120', cortes: '2', servicoIds: [SRV], adianta: 1, acumuloMeses: 2, intervaloDias: 3 };

test('salvar: cria com POST, edita com PUT; números viram número; serviço ou id ruins nem saem', async () => {
  servidor({ id: ID, nome: 'Plano Mensal', preco: 120, cortes: 2, servicoIds: [SRV], adianta: 1, acumuloMeses: 2, intervaloDias: 3, ativo: true }, 201);
  const r = await planos.salvar(plano);
  assert.equal(r.ok, true); assert.equal(r.plano.preco, 120);
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/planos', metodo: 'POST', corpo: { nome: 'Plano Mensal', descricao: 'Dois cortes', servicoIds: [SRV], ativo: true, restringeServicos: false, preco: 120, cortes: 2, adianta: 1, acumuloMeses: 2, intervaloDias: 3 }, cab: chamadas[0].cab });
  await planos.salvar({ ...plano, id: ID, ativo: false });
  assert.equal(chamadas[1].metodo, 'PUT'); assert.equal(chamadas[1].url, `https://loja.teste/api/planos/${ID}`); assert.equal(chamadas[1].corpo.ativo, false);
  chamadas.length = 0;
  for (const d of [{ ...plano, servicoIds: ['1; drop'] }, { ...plano, preco: 'caro' }, { ...plano, id: 'ruim' }]) assert.equal((await planos.salvar(d)).ok, false);
  assert.equal(chamadas.length, 0);
});

test('listar lê com cuidado: status e mês desconhecidos, ids de lixo, saldo negativo do extrato e nada de campos a mais', async () => {
  servidor({ planos: [{ id: ID, nome: 'x'.repeat(200), preco: 'dez', cortes: 2, servicoIds: [SRV, 'lixo'], ativo: true, extra: 1 }],
    assinaturas: [{ id: ID, clienteId: CLI, cliente: { id: CLI, nome: 'Ana', apelido: '' }, planoId: ID, plano: { nome: 'P', preco: 120, cortes: 2, servicoIds: [SRV] }, status: 'misteriosa', inicioMes: 'agora',
      diaCobranca: 5, pagamentos: [{ id: PAG, mes: '2026-11', valor: 120, forma: 'fiado', em: '2026-11-03T10:00:00Z', autor: { nome: 'Davi' }, estornado: false }, { id: 'lixo', mes: '2026-11' }],
      saldo: { planoNome: 'P', restantes: 1, maisPermitidos: 1, pagoMes: true, pagoAte: 'x' }, extrato: [{ mes: '2026-11', pago: true, concedidos: 2, usados: 3, saldoFim: -1, limite: 1, estourou: false }, { mes: 'ruim' }], senha: 'x' }],
    pedidos: [{ id: ID, nome: 'Maria', telefone: '53999000001', planoId: ID, planoNome: 'P', status: 'novo' }], aReceber: [ID, 'lixo'], mes: '2026-11' });
  const r = await planos.listar();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/planos');
  assert.equal(r.planos[0].nome.length, 60); assert.equal(r.planos[0].preco, 0); assert.deepEqual(r.planos[0].servicoIds, [SRV]); assert.ok(!('extra' in r.planos[0]));
  const a = r.assinaturas[0];
  assert.equal(a.status, 'pendente', 'status desconhecido nunca vira ativo'); assert.equal(a.inicioMes, ''); assert.equal(a.pagamentos.length, 1); assert.equal(a.pagamentos[0].forma, 'pix');
  assert.equal(a.saldo.pagoAte, null); assert.equal(a.extrato.length, 1); assert.equal(a.extrato[0].saldoFim, -1, 'corte adiantado aparece negativo'); assert.ok(!('senha' in a));
  assert.deepEqual(r.aReceber, [ID]); assert.equal(r.mes, '2026-11'); assert.equal(r.pedidos[0].telefone, '53999000001');
});

test('contratar, encerrar, quitar, estornar e pedidos: rotas certas; id ruim e campos ruins não saem', async () => {
  servidor({ id: ID, status: 'pendente', divida: 1 }, 201);
  await planos.contratar({ clienteId: CLI, planoId: ID, inicioMes: '2026-11', diaCobranca: '5' });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url, chamadas[0].corpo], ['POST', 'https://loja.teste/api/assinaturas', { clienteId: CLI, planoId: ID, inicioMes: '2026-11', diaCobranca: 5 }]);
  const e = await planos.encerrar(ID, '  Mudou de cidade  ');
  assert.equal(chamadas[1].url, `https://loja.teste/api/assinaturas/${ID}/encerrar`); assert.deepEqual(chamadas[1].corpo, { motivo: 'Mudou de cidade' }); assert.equal(e.divida, 1);
  await planos.quitar(ID); assert.equal(chamadas[2].url, `https://loja.teste/api/assinaturas/${ID}/quitar`);
  await planos.estornar(ID, PAG, 'Pagou em duplicidade'); assert.equal(chamadas[3].url, `https://loja.teste/api/assinaturas/${ID}/pagamentos/${PAG}/estorno`);
  await planos.aceitarPedido(ID); await planos.recusarPedido(ID);
  assert.equal(chamadas[4].url, `https://loja.teste/api/planos/pedidos/${ID}/aceitar`); assert.equal(chamadas[5].url, `https://loja.teste/api/planos/pedidos/${ID}/recusar`);
  const n = chamadas.length;
  for (const r of [await planos.contratar({ clienteId: 'x', planoId: ID }), await planos.contratar({ clienteId: CLI, planoId: ID, inicioMes: 'logo' }), await planos.contratar({ clienteId: CLI, planoId: ID, diaCobranca: 'dia' }),
    await planos.encerrar('x', 'motivo longo'), await planos.encerrar(ID, 'x'.repeat(201)), await planos.quitar('x'), await planos.estornar(ID, 'x', 'motivo'), await planos.aceitarPedido('x'), await planos.recusarPedido('x'), await planos.remover('x')]) {
    assert.equal(r.ok, false);
  }
  assert.equal(chamadas.length, n);
});

test('pagar: forma e mês conferidos antes da rede; a mesma mensalidade repetida leva a MESMA chave até dar certo', async () => {
  servidor({}, 201);
  assert.equal((await planos.pagar(ID, { mes: '2026-11', forma: 'fiado' })).ok, false);
  assert.equal((await planos.pagar(ID, { mes: 'novembro', forma: 'pix' })).ok, false);
  assert.equal((await planos.pagar('x', { forma: 'pix' })).ok, false);
  assert.equal(chamadas.length, 0);
  servidor({ erro: 1, mensagem: 'A mensalidade de novembro/2026 já está registrada.' }, 409);
  const falha = await planos.pagar(ID, { mes: '2026-11', forma: 'pix' });
  assert.equal(falha.ok, false); assert.equal(falha.erro, 'A mensalidade de novembro/2026 já está registrada.');
  const k1 = chamadas[0].cab['Idempotency-Key'];
  assert.match(k1, /^[A-Za-z0-9_-]{16,64}$/);
  await planos.pagar(ID, { mes: '2026-11', forma: 'pix' });
  assert.equal(chamadas[1].cab['Idempotency-Key'], k1, 'o mesmo pedido que não deu certo reaproveita a chave');
  await planos.pagar(ID, { mes: '2026-12', forma: 'pix' });
  assert.notEqual(chamadas[2].cab['Idempotency-Key'], k1, 'outro mês é outro pedido');
  servidor({ id: ID, status: 'ativa' }, 201);
  const ok = await planos.pagar(ID, { mes: '2026-12', forma: 'dinheiro' });
  assert.equal(ok.ok, true);
  const k = chamadas[0].cab['Idempotency-Key'];
  await planos.pagar(ID, { mes: '2026-12', forma: 'dinheiro' });
  assert.notEqual(chamadas[1].cab['Idempotency-Key'], k, 'depois de dar certo, uma nova tentativa é um pedido novo');
});

test('doCliente: sem plano é nulo, o servidor manda só cortes (nunca valor) e id ruim nem sai', async () => {
  servidor({ plano: null });
  assert.deepEqual(await planos.doCliente(CLI), { ok: true, plano: null });
  assert.equal(chamadas[0].url, `https://loja.teste/api/planos/cliente/${CLI}`);
  servidor({ plano: { assinaturaId: ID, plano: 'Plano Mensal', servicoIds: [SRV], restantes: 2, maisPermitidos: 1, pagoMes: true, atrasado: false, mes: '2026-11', preco: 120 } });
  const r = await planos.doCliente(CLI);
  assert.equal(r.plano.restantes, 2); assert.ok(!('preco' in r.plano));
  servidor({});
  assert.deepEqual(await planos.doCliente('x'), { ok: true, plano: null });
  assert.equal(chamadas.length, 0);
});

test('planosPublico: nunca leva o token do painel, o pedido leva a isca e o saldo manda o telefone codificado', async () => {
  servidor({ planos: [{ id: ID, nome: 'Plano Mensal', descricao: '', preco: 120, cortes: 2, servicos: ['Corte', 'Barba'], adianta: 1 }, { id: 'lixo', nome: 'x' }] });
  const p = await planosPublico.pagina();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/publico/planos'); assert.ok(!chamadas[0].cab.Authorization);
  assert.equal(p.planos.length, 1); assert.ok(!('adianta' in p.planos[0]));
  servidor({ ok: true }, 201);
  assert.equal((await planosPublico.pedir({ nome: 'Maria', telefone: '(53) 99900-0001', planoId: ID, site: '' })).ok, true);
  assert.deepEqual(chamadas[0].corpo, { nome: 'Maria', telefone: '(53) 99900-0001', planoId: ID }); assert.ok(!chamadas[0].cab.Authorization);
  assert.equal((await planosPublico.pedir({ nome: 'Maria', telefone: '1', planoId: 'x' })).ok, false);
  servidor({ planos: [{ plano: 'Plano Mensal', mes: '2026-11', restantes: 1, cortesPorMes: 2, pagoMes: true }], aviso: null });
  const s = await planosPublico.saldo('(53) 99900-0001');
  assert.equal(chamadas[0].url, `https://loja.teste/api/publico/planos/saldo?telefone=${encodeURIComponent('(53) 99900-0001')}`);
  assert.equal(s.planos[0].restantes, 1);
});

test('planosPublico.uso: POST com o telefone no corpo (nunca na URL), só sim ou não, e falha da prévia nunca atrapalha o pedido', async () => {
  servidor({ usaPlano: true });
  const inicio = Date.parse('2026-11-02T12:00:00Z');
  const r = await planosPublico.uso({ telefone: '(53) 99900-0001', servicoIds: [SRV, 'lixo'], inicio });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', 'https://loja.teste/api/publico/planos/uso']);
  assert.deepEqual(chamadas[0].corpo, { telefone: '(53) 99900-0001', servicoIds: [SRV], inicio: '2026-11-02T12:00:00.000Z' });
  assert.ok(!chamadas[0].cab.Authorization, 'rota do cliente nunca leva o token do painel'); assert.ok(!chamadas[0].url.includes('99900'));
  assert.deepEqual(r, { ok: true, usaPlano: true, esgotado: false, restrito: false });
  servidor({ usaPlano: 'sim', plano: 'Mensal', saldo: 3 }); assert.deepEqual(await planosPublico.uso({ telefone: '(53) 99900-0001', servicoIds: [SRV], inicio }), { ok: true, usaPlano: false, esgotado: false, restrito: false }, 'só true de verdade vale; nada a mais sai');
  servidor({ mensagem: 'Muitos pedidos' }, 429); assert.deepEqual(await planosPublico.uso({ telefone: '(53) 99900-0001', servicoIds: [SRV], inicio }), { ok: true, usaPlano: false, esgotado: false, restrito: false });
  servidor({ usaPlano: true });
  assert.deepEqual(await planosPublico.uso({ telefone: '', servicoIds: [SRV], inicio }), { ok: true, usaPlano: false, esgotado: false, restrito: false });
  assert.deepEqual(await planosPublico.uso({ telefone: '53999000001', servicoIds: ['lixo'], inicio }), { ok: true, usaPlano: false, esgotado: false, restrito: false });
  assert.deepEqual(await planosPublico.uso({ telefone: '53999000001', servicoIds: [SRV], inicio: NaN }), { ok: true, usaPlano: false, esgotado: false, restrito: false });
  assert.equal(chamadas.length, 0, 'entrada ruim nem sai');
});

test('horários fixos (v128): POST /api/assinaturas/{id}/fixos com a lista inteira; lê fixos e apagados; id ou lista ruins nem saem', async () => {
  const VEI = '00000000-0000-4000-8000-000000000090';
  const fixo = { id: ID, dia: 1, hm: '18:00', profissionalId: CLI, servicoIds: [SRV, 'lixo'], veiculoId: VEI };
  servidor({ assinatura: { id: ID, status: 'ativa', fixos: [fixo, { dia: 9, hm: '99:99', profissionalId: CLI, servicoIds: [SRV] }] }, apagados: 2 });
  const r = await planos.definirFixos(ID, { fixos: [{ dia: 1, hm: '18:00', profissionalId: CLI, servicoIds: [SRV, 'lixo'], veiculoId: VEI, extra: 'x' }] });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', `https://loja.teste/api/assinaturas/${ID}/fixos`]);
  assert.deepEqual(chamadas[0].corpo, { fixos: [{ dia: 1, hm: '18:00', profissionalId: CLI, servicoIds: [SRV], veiculoId: VEI }] });
  assert.equal(r.ok, true); assert.equal(r.apagados, 2);
  assert.deepEqual(r.assinatura.fixos[0], { id: ID, dia: 1, hm: '18:00', profissionalId: CLI, servicoIds: [SRV], veiculoId: VEI });
  assert.equal(r.assinatura.fixos[1].dia, 0, 'dia fora de 0 a 6 nunca passa'); assert.equal(r.assinatura.fixos[1].hm, '00:00');
  chamadas.length = 0;
  assert.equal((await planos.definirFixos('ruim', { fixos: [] })).ok, false);
  assert.equal((await planos.definirFixos(ID, { fixos: [1, 2, 3, 4].map(() => ({ dia: 1, hm: '18:00' })) })).ok, false, 'no máximo 3');
  assert.equal((await planos.definirFixos(ID, {})).ok, false);
  assert.equal(chamadas.length, 0);
  servidor({ mensagem: 'Esse horário é fixo de um cliente com plano. Escolha outro horário.' }, 409);
  const e = await planos.definirFixos(ID, { fixos: [] });
  assert.equal(e.ok, false); assert.equal(chamadas[0].corpo.fixos.length, 0, 'lista vazia é válida: tira os fixos');
});

// ---------------------------------------------------------------- E3. troca de plano pagando só a diferença
const PLANO_NOVO = '00000000-0000-4000-8000-000000000102';
const OPCAO = { planoId: PLANO_NOVO, nome: 'Degradê e Barba', preco: 120, cortes: 4, servicos: ['Barba', 'Corte Degradê'], diferenca: 33.75 };

test('E3 planosPublico.uso: as opções de troca só entram quando existem, com desconto e WhatsApp lidos com cuidado', async () => {
  const inicio = Date.parse('2026-11-02T12:00:00Z');
  const tel = '(53) 99900-0001';
  servidor({ usaPlano: false, esgotado: true, restrito: false, trocas: [OPCAO, { planoId: 'lixo', nome: 'x' }], descontoTrocaPct: 25, whatsapp: '5551999991234' });
  const r = await planosPublico.uso({ telefone: tel, servicoIds: [SRV], inicio });
  assert.equal(r.esgotado, true);
  assert.deepEqual(r.trocas, [OPCAO], 'opção sem id válido é descartada');
  assert.equal(r.descontoTrocaPct, 25); assert.equal(r.whatsapp, '5551999991234');
  servidor({ usaPlano: false, esgotado: true, restrito: false, trocas: [OPCAO], descontoTrocaPct: 25, whatsapp: 'javascript:alert(1)' });
  const sem = await planosPublico.uso({ telefone: tel, servicoIds: [SRV], inicio });
  assert.equal(sem.whatsapp, undefined, 'só 12 ou 13 dígitos viram número de WhatsApp');
  servidor({ usaPlano: true });
  assert.equal((await planosPublico.uso({ telefone: tel, servicoIds: [SRV], inicio })).trocas, undefined, 'sem opção a chave nem existe');
});

test('E3 planosPublico.pedirTroca: POST com telefone e plano no corpo, sem token do painel; entrada ruim nem sai', async () => {
  servidor({ ok: true }, 201);
  const r = await planosPublico.pedirTroca({ telefone: '(53) 99900-0001', planoId: PLANO_NOVO, site: '' });
  assert.equal(r.ok, true);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', 'https://loja.teste/api/publico/planos/trocas']);
  assert.deepEqual(chamadas[0].corpo, { telefone: '(53) 99900-0001', planoId: PLANO_NOVO });
  assert.ok(!chamadas[0].cab.Authorization); assert.ok(!chamadas[0].url.includes('99900'));
  chamadas.length = 0;
  assert.equal((await planosPublico.pedirTroca({ telefone: '', planoId: PLANO_NOVO })).ok, false);
  assert.equal((await planosPublico.pedirTroca({ telefone: '53999000001', planoId: 'lixo' })).ok, false);
  assert.equal(chamadas.length, 0);
  servidor({ mensagem: 'Muitos pedidos em pouco tempo.' }, 429);
  const f = await planosPublico.pedirTroca({ telefone: '(53) 99900-0001', planoId: PLANO_NOVO });
  assert.equal(f.ok, false); assert.match(f.erro, /Muitos pedidos/);
});

test('E3 planos.salvarConfigTroca: PUT com desconto e WhatsApp; fora de 0 a 100 nem sai', async () => {
  servidor({ descontoPct: 25, whatsapp: '5551999991234' });
  const r = await planos.salvarConfigTroca({ descontoPct: '25', whatsapp: '(51) 99999-1234' });
  assert.deepEqual(r, { ok: true, descontoPct: 25, whatsapp: '5551999991234' });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url, chamadas[0].corpo], ['PUT', 'https://loja.teste/api/planos/troca', { descontoPct: 25, whatsapp: '(51) 99999-1234' }]);
  chamadas.length = 0;
  assert.equal((await planos.salvarConfigTroca({ descontoPct: 101 })).ok, false);
  assert.equal((await planos.salvarConfigTroca({ descontoPct: -1 })).ok, false);
  assert.equal((await planos.salvarConfigTroca({ descontoPct: 'muito' })).ok, false);
  assert.equal(chamadas.length, 0);
});

test('E3 planos.listar lê o desconto, o WhatsApp e o pedido de troca; aceitarPedido leva a forma só quando é válida', async () => {
  servidor({ planos: [], assinaturas: [], aReceber: [], mes: '2026-11', descontoTrocaPct: 25, whatsapp: '5551999991234',
    pedidos: [{ id: ID, nome: 'Ana', telefone: '5553999000001', planoId: PLANO_NOVO, planoNome: 'Degradê e Barba', status: 'novo', criadoEm: '2026-11-03T10:00:00Z', tipo: 'troca', planoAtualNome: 'Degradê em Dia', valorDiferenca: 33.75, descontoPct: 25 },
      { id: PAG, nome: 'Bia', telefone: '5553999000002', planoId: PLANO_NOVO, planoNome: 'Outro', status: 'novo', criadoEm: '2026-11-03T10:00:00Z' }] });
  const l = await planos.listar();
  assert.equal(l.descontoTrocaPct, 25); assert.equal(l.whatsapp, '5551999991234');
  assert.equal(l.pedidos[0].tipo, 'troca'); assert.equal(l.pedidos[0].planoAtualNome, 'Degradê em Dia'); assert.equal(l.pedidos[0].valorDiferenca, 33.75); assert.equal(l.pedidos[0].descontoPct, 25);
  assert.equal(l.pedidos[1].tipo, 'novo'); assert.equal(l.pedidos[1].valorDiferenca, null);
  servidor({ id: ID, status: 'ativa' });
  await planos.aceitarPedido(ID, { forma: 'pix' });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url, chamadas[0].corpo], ['POST', `https://loja.teste/api/planos/pedidos/${ID}/aceitar`, { forma: 'pix' }]);
  await planos.aceitarPedido(ID, { forma: 'ouro' });
  assert.equal(chamadas[1].corpo, undefined, 'forma desconhecida nem vai; o servidor recusa a troca sem ela');
  await planos.aceitarPedido(ID);
  assert.equal(chamadas[2].corpo, undefined, 'pedido de plano novo segue sem corpo');
});
