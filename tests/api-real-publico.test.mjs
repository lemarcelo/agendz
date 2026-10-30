/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Link do cliente no site real (src/services/api-real.js, `publico.*` e `linkAgendamento`): rotas e corpos, rota pública nunca leva o token do painel,
// o token de acesso vai no cabeçalho (cancelar) ou no corpo (meus) e nunca na URL, entrada ruim nem sai do cliente e a leitura é defensiva.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avisos, configurar, entrar, linkAgendamento, publico } from '../src/services/api-real.js';

const SRV = '00000000-0000-4000-8000-000000000050';
const PROF = '00000000-0000-4000-8000-000000000001';
const AG = '00000000-0000-4000-8000-000000000101';
const TOKEN = 'a1'.repeat(24);
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined, cab: init.headers });
    return { ok: status < 400, status, json: async () => resposta, text: async () => JSON.stringify(resposta), headers: { get: () => 'application/json' } };
  };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('pagina: GET sem login; lê só o necessário e descarta lixo', async () => {
  servidor({ ativo: true, diasMax: 999, servicos: [{ id: SRV, nome: 'x'.repeat(300), duracao: 30, preco: 40, antecedenciaH: 2, custo: 9 }, { id: 'lixo', nome: 'fora' }],
    profissionais: [{ id: PROF, nome: 'Ana', foto: 'javascript:alert(1)', senha: 'x' }] });
  const r = await publico.pagina();
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', 'https://loja.teste/api/publico/agendar']);
  assert.equal(r.pagina.ativo, true); assert.equal(r.pagina.diasMax, 60);
  assert.equal(r.pagina.servicos.length, 1); assert.equal(r.pagina.servicos[0].nome.length, 120); assert.ok(!('custo' in r.pagina.servicos[0]));
  assert.equal(r.pagina.profissionais[0].foto, null, 'só data:image/ vira foto'); assert.ok(!('senha' in r.pagina.profissionais[0]));
  servidor({});
  assert.equal((await publico.pagina()).pagina.ativo, false, 'resposta vazia nunca liga o link');
});

test('rota pública nunca leva o token do painel, mesmo com o painel aberto', async () => {
  servidor({ token: 'jwt-do-painel', id: PROF, nome: 'Dono', papel: 'dono' });
  assert.equal((await entrar({ identificador: 'dono', senha: 'x' })).ok, true);
  servidor({ ativo: true, servicos: [], profissionais: [] });
  await publico.pagina();
  assert.ok(!('Authorization' in chamadas[0].cab), 'a rota pública não manda Authorization');
  servidor({ ativo: true, diasMax: 30 });
  await linkAgendamento.obter();
  assert.equal(chamadas[0].cab.Authorization, 'Bearer jwt-do-painel', 'a rota do painel manda');
  // 401 numa rota pública não derruba a sessão do painel
  servidor({ mensagem: 'x' }, 401);
  await publico.pagina();
  servidor({ ativo: true, diasMax: 30 });
  await linkAgendamento.obter();
  assert.equal(chamadas[0].cab.Authorization, 'Bearer jwt-do-painel');
});

test('dias e horarios: rotas e consulta montadas; entrada ruim nem sai', async () => {
  servidor(['2026-11-02', 'ruim', '2026-11-03']);
  const d = await publico.dias({ de: '2026-11-01', dias: 50, servicoIds: [SRV, 'lixo'], profissionalId: PROF });
  assert.deepEqual(d.dias, ['2026-11-02', '2026-11-03']);
  assert.equal(chamadas[0].url, `https://loja.teste/api/publico/dias?de=2026-11-01&dias=31&servicos=${SRV}&profissionalId=${PROF}`);
  servidor([{ inicio: '2026-11-02T12:00:00Z', profissionalId: PROF }, { inicio: 'amanhã', profissionalId: PROF }, { inicio: '2026-11-02T12:30:00Z', profissionalId: 'x' }]);
  const h = await publico.horarios({ data: '2026-11-02', servicoIds: [SRV], profissionalId: '' });
  assert.equal(chamadas[0].url, `https://loja.teste/api/publico/horarios?data=2026-11-02&servicos=${SRV}`);
  assert.deepEqual(h.horarios, [{ inicio: Date.parse('2026-11-02T12:00:00Z'), profissionalId: PROF }]);
  servidor([]);
  assert.deepEqual((await publico.dias({ de: 'hoje', dias: 5, servicoIds: [SRV] })).dias, []);
  assert.deepEqual((await publico.horarios({ data: '2026-11-02', servicoIds: [] })).horarios, []);
  assert.deepEqual((await publico.horarios({ data: '2026-11-02; drop', servicoIds: [SRV] })).horarios, []);
  assert.equal(chamadas.length, 0);
});

test('agendar: corpo só com os campos aceitos; o token vem uma vez; mensagem do servidor chega inteira', async () => {
  const resumo = { id: AG, inicio: '2026-11-02T12:00:00Z', fim: '2026-11-02T12:30:00Z', status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Corte'], duracao: 30, total: 40, desconto: 10, cupom: 'Boas-vindas', profissional: 'Ana', ativo: true, podeCancelar: true };
  servidor({ agendamento: resumo, token: TOKEN }, 201);
  const inicio = Date.parse('2026-11-02T12:00:00Z');
  const r = await publico.agendar({ nome: 'Maria', telefone: '(53) 99900-0001', servicoIds: [SRV, 'lixo'], inicio, profissionalId: PROF, cupomChave: ' abcd-efgh-jklm ', site: '', clienteId: 'x', status: 'confirmado', total: 1 });
  assert.equal(r.ok, true); assert.equal(r.token, TOKEN); assert.equal(r.agendamento.desconto, 10); assert.equal(r.agendamento.inicio, inicio);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', 'https://loja.teste/api/publico/agendamentos']);
  assert.deepEqual(chamadas[0].corpo, { nome: 'Maria', telefone: '(53) 99900-0001', servicoIds: [SRV], inicio: '2026-11-02T12:00:00.000Z', profissionalId: PROF, cupomChave: 'abcd-efgh-jklm' });
  assert.ok(!('Authorization' in chamadas[0].cab) && !('Idempotency-Key' in chamadas[0].cab), 'sem chave de repetição: um pedido que falhou nunca é reenviado sozinho');
  // isca preenchida vai (o servidor recusa); sem profissional e sem cupom, os campos não vão
  servidor({ agendamento: resumo, token: 'curto' }, 201);
  const r2 = await publico.agendar({ nome: 'M', telefone: '1', servicoIds: [SRV], inicio, site: 'http://spam' });
  assert.equal(r2.token, '', 'token fora do formato nunca é guardado');
  assert.ok(!('profissionalId' in chamadas[0].corpo) && !('cupomChave' in chamadas[0].corpo)); assert.equal(chamadas[0].corpo.site, 'http://spam');
  servidor({ mensagem: 'Esse horário acabou de ser ocupado. Escolha outro.' }, 409);
  const e = await publico.agendar({ nome: 'Maria', telefone: '53999000001', servicoIds: [SRV], inicio });
  assert.deepEqual([e.ok, e.status, e.erro], [false, 409, 'Esse horário acabou de ser ocupado. Escolha outro.']);
  servidor({});
  assert.equal((await publico.agendar({ nome: 'Maria', telefone: '53999000001', servicoIds: [SRV], inicio: NaN })).ok, false);
  assert.equal(chamadas.length, 0);
});

test('meus: o token vai no corpo e nunca na URL; só tokens bem formados; sem token não chama', async () => {
  servidor([{ id: AG, inicio: '2026-11-02T12:00:00Z', status: 'confirmado', rotulo: 'Confirmado', servicos: ['Corte'], ativo: true, podeCancelar: false, total: 'caro' }, { id: 'lixo', inicio: '2026-11-02T12:00:00Z' }]);
  const r = await publico.meus([TOKEN, 'curto', TOKEN.toUpperCase(), '../etc']);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', 'https://loja.teste/api/publico/meus']);
  assert.deepEqual(chamadas[0].corpo, { tokens: [TOKEN] });
  assert.equal(r.agendamentos.length, 1); assert.equal(r.agendamentos[0].total, 0, 'valor estranho vira 0'); assert.equal(r.agendamentos[0].podeCancelar, false);
  servidor([]);
  assert.deepEqual(await publico.meus([]), { ok: true, agendamentos: [] });
  assert.deepEqual(await publico.meus(['curto']), { ok: true, agendamentos: [] });
  assert.equal(chamadas.length, 0);
});

test('cancelar: o token vai no cabeçalho X-Acesso; id ou token ruim nem sai', async () => {
  servidor({ id: AG, inicio: '2026-11-02T12:00:00Z', status: 'cancelado', rotulo: 'Cancelado', servicos: ['Corte'], ativo: false, podeCancelar: false });
  const r = await publico.cancelar(AG, TOKEN);
  assert.equal(r.agendamento.status, 'cancelado');
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', `https://loja.teste/api/publico/agendamentos/${AG}/cancelar`]);
  assert.equal(chamadas[0].cab['X-Acesso'], TOKEN); assert.ok(!chamadas[0].url.includes(TOKEN)); assert.ok(!('Authorization' in chamadas[0].cab));
  servidor({});
  assert.equal((await publico.cancelar('x', TOKEN)).ok, false);
  assert.equal((await publico.cancelar(AG, 'curto')).ok, false);
  assert.equal(chamadas.length, 0);
  servidor({ mensagem: 'Esse horário não pode mais ser cancelado por aqui (faltam menos de 24 horas). Fale com a loja.' }, 409);
  assert.equal((await publico.cancelar(AG, TOKEN)).erro, 'Esse horário não pode mais ser cancelado por aqui (faltam menos de 24 horas). Fale com a loja.');
});

test('linkAgendamento: GET e PUT do proprietário; dias fora de 1 a 60 nem saem', async () => {
  servidor({ ativo: false, diasMax: 14, disponivel: false });
  const r = await linkAgendamento.obter();
  assert.deepEqual(r.link, { ativo: false, diasMax: 14, disponivel: false, telefoneObrigatorio: true }, 'telefone obrigatório de fábrica');
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', 'https://loja.teste/api/estabelecimento/link-agendamento']);
  servidor({ ativo: true, diasMax: 20, disponivel: true });
  const g = await linkAgendamento.gravar({ ativo: true, diasMax: 20 });
  assert.equal(g.link.diasMax, 20);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].corpo], ['PUT', { ativo: true, diasMax: 20 }]);
  servidor({ ativo: true, diasMax: 20, disponivel: true, telefoneObrigatorio: false });
  const t = await linkAgendamento.gravar({ telefoneObrigatorio: false });
  assert.equal(t.link.telefoneObrigatorio, false); assert.deepEqual(chamadas[0].corpo, { telefoneObrigatorio: false });
  servidor({});
  for (const ruim of [0, 61, 1.5, '30', null]) assert.equal((await linkAgendamento.gravar({ diasMax: ruim })).ok, false);
  assert.equal(chamadas.length, 0);
});

test('remarcar: horários e dias com o token no cabeçalho (nunca na URL), corpo só com o início, entrada ruim nem sai', async () => {
  servidor([{ inicio: '2026-11-03T12:00:00Z', profissionalId: PROF }, { inicio: 'lixo', profissionalId: PROF }, { inicio: '2026-11-03T12:30:00Z', profissionalId: 'x' }]);
  const h = await publico.horariosRemarcar(AG, TOKEN, { data: '2026-11-03' });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', `https://loja.teste/api/publico/agendamentos/${AG}/horarios?data=2026-11-03`]);
  assert.equal(chamadas[0].cab['X-Acesso'], TOKEN); assert.ok(!chamadas[0].url.includes(TOKEN)); assert.ok(!('Authorization' in chamadas[0].cab));
  assert.equal(h.horarios.length, 1, 'horário ruim e profissional ruim são descartados');
  servidor(['2026-11-03', 'lixo', '2026-11-04']);
  const d = await publico.diasRemarcar(AG, TOKEN, { de: '2026-11-03', dias: 99 });
  assert.match(chamadas[0].url, /\/dias\?de=2026-11-03&dias=31$/); assert.deepEqual(d.dias, ['2026-11-03', '2026-11-04']);
  servidor({ id: AG, inicio: '2026-11-03T12:00:00Z', status: 'a_confirmar', ativo: true, podeCancelar: true, servicos: ['Corte'] });
  const r = await publico.remarcar(AG, TOKEN, Date.parse('2026-11-03T12:00:00Z'));
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', `https://loja.teste/api/publico/agendamentos/${AG}/remarcar`]);
  assert.deepEqual(chamadas[0].corpo, { inicio: '2026-11-03T12:00:00.000Z' }); assert.equal(chamadas[0].cab['X-Acesso'], TOKEN);
  assert.equal(r.ok, true); assert.equal(r.agendamento.status, 'a_confirmar');
  // entrada ruim nem chega ao servidor
  servidor({});
  assert.equal((await publico.remarcar('lixo', TOKEN, 1)).ok, false);
  assert.equal((await publico.remarcar(AG, 'curto', 1)).ok, false);
  assert.equal((await publico.remarcar(AG, TOKEN, NaN)).ok, false);
  assert.equal((await publico.horariosRemarcar(AG, TOKEN, { data: '3/11' })).horarios.length, 0);
  assert.equal(chamadas.length, 0);
  // a mensagem do servidor chega à tela
  servidor({ mensagem: 'Esse horário acabou de ser ocupado. Escolha outro.' }, 409);
  const e = await publico.remarcar(AG, TOKEN, Date.parse('2026-11-03T12:30:00Z'));
  assert.equal(e.ok, false); assert.match(e.erro, /acabou de ser ocupado/);
});

test('avisos do painel: lista com limite e leitura defensiva; marcar como lido por id válido', async () => {
  servidor([{ id: AG, em: '2026-10-28T13:00:00Z', agendamentoId: AG, tipo: 'remarcou', texto: 'x'.repeat(400), lido: false, telefone: '5399' }, { id: 'lixo', texto: 'fora' }, { id: PROF, tipo: 'estranho', texto: 'ok', lido: true }]);
  const r = await avisos.listar();
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', 'https://loja.teste/api/avisos']);
  assert.equal(r.avisos.length, 2); assert.equal(r.avisos[0].texto.length, 300); assert.ok(!('telefone' in r.avisos[0]));
  assert.equal(r.avisos[1].tipo, 'pedido', 'tipo desconhecido vira o padrão'); assert.equal(r.avisos[1].lido, true);
  servidor({ id: AG, tipo: 'pedido', texto: 'a', lido: true });
  const l = await avisos.marcarLido(AG);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['PUT', `https://loja.teste/api/avisos/${AG}/lido`]); assert.equal(l.aviso.lido, true);
  servidor({});
  assert.equal((await avisos.marcarLido('../x')).ok, false); assert.equal(chamadas.length, 0);
});

test('estética (v104): portes e tabelas por porte lidos com defesa; porte na consulta; veículo no corpo do pedido', async () => {
  servidor({ ativo: true, tipo: 'estetica_automotiva', portes: [{ id: 'pequeno', nome: 'Pequeno' }, { id: 'lixo', nome: 'x' }, { id: 'suv', nome: 'SUV' }],
    servicos: [{ id: SRV, nome: 'Lavagem', duracao: 60, preco: 80, precos: { pequeno: 80, suv: 120, gigante: 1, medio: -5 }, duracoes: { pequeno: 60, suv: 90, grande: 'x' } }], profissionais: [] });
  const p = (await publico.pagina()).pagina;
  assert.equal(p.tipo, 'estetica_automotiva'); assert.deepEqual(p.portes.map((x) => x.id), ['pequeno', 'suv']);
  assert.deepEqual(p.servicos[0].precos, { pequeno: 80, suv: 120 }); assert.deepEqual(p.servicos[0].duracoes, { pequeno: 60, suv: 90 });
  servidor(['2026-11-02']);
  await publico.dias({ de: '2026-11-01', dias: 5, servicoIds: [SRV], porte: 'suv' });
  assert.ok(chamadas[0].url.endsWith('&porte=suv'));
  await publico.dias({ de: '2026-11-01', dias: 5, servicoIds: [SRV], porte: 'x&y=1' });
  assert.ok(!chamadas[1].url.includes('porte'), 'porte desconhecido nem sai');
  servidor([]);
  await publico.horarios({ data: '2026-11-02', servicoIds: [SRV], porte: 'pequeno' });
  assert.ok(chamadas[0].url.endsWith('&porte=pequeno'));
  const resumo = { id: AG, inicio: '2026-11-02T12:00:00Z', fim: '2026-11-02T13:00:00Z', status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Lavagem'], duracao: 60, total: 120, desconto: 0, profissional: 'Ana', veiculo: { placa: 'ABC1D23', modelo: 'Onix', porte: 'suv', cpf: '1' } };
  servidor({ agendamento: resumo, token: TOKEN }, 201);
  const r = await publico.agendar({ nome: 'Maria', telefone: '(53) 99900-0001', servicoIds: [SRV], inicio: Date.parse('2026-11-02T12:00:00Z'), profissionalId: PROF, site: '',
    veiculo: { placa: 'ABC1D23', modelo: 'Onix', marca: '', cor: 'Prata', porte: 'suv', id: 'x', clienteId: 'y' } });
  assert.deepEqual(chamadas[0].corpo.veiculo, { placa: 'ABC1D23', modelo: 'Onix', porte: 'suv', cor: 'Prata' });
  assert.deepEqual(r.agendamento.veiculo, { placa: 'ABC1D23', modelo: 'Onix', porte: 'suv' });
});
