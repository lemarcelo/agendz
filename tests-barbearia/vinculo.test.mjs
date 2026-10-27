// Cliente que trocou de número: o CPF reconhece o cadastro antigo, mas o número novo só vale depois da autorização do proprietário/admin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, clientes, equipe, whatsapp, agenda, avisosDoUsuario, pedidosVinculoVisiveis } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const CPF_IGOR = '503.976.128-77';
const TEL_NOVO = '(54) 99111-2222';
const igor = () => st().clientes.find((c) => c.id === 'c-igor');
const agendar = (telefone, extra = {}) => whatsapp.agendar({ telefone, nome: 'Igor', cpf: CPF_IGOR, profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(8), '10:00'), ...extra });
const pedidos = () => st().pedidosVinculo || [];
const criaAdmin = (permissoes) => { como('alan'); const r = equipe.salvar({ nome: 'Ana Admin', apelido: 'ana', cpf: '111.444.777-35', email: 'ana@x.com', telefone: '(55) 99111-2222', papel: 'admin', senha: '1234', permissoes }); assert.ok(r.ok, JSON.stringify(r)); auth.logout?.(); };
test.beforeEach(() => store.reiniciar());

test('o CPF do seed é válido (premissa dos testes)', () => assert.ok(R.cadastroPorCpf(st().clientes, { telefone: TEL_NOVO, cpf: CPF_IGOR })));

test('número novo com CPF de cadastro existente NÃO cria cliente nem agendamento: abre um pedido pendente', () => {
  const nClientes = st().clientes.length, nAg = st().agendamentos.length;
  const r = agendar(TEL_NOVO);
  assert.equal(r.ok, false);
  assert.equal(r.pendente, 'vinculo');
  assert.equal(st().clientes.length, nClientes);
  assert.equal(st().agendamentos.length, nAg);
  assert.equal(pedidos().length, 1);
  assert.equal(pedidos()[0].status, 'pendente');
  assert.equal(pedidos()[0].clienteId, 'c-igor');
  assert.equal(igor().telefone, '(54) 99633-8812', 'o telefone só muda depois da autorização');
});

test('a resposta ao cliente não revela de quem é o cadastro', () => {
  const r = agendar(TEL_NOVO);
  const texto = r.erros.join(' ');
  assert.ok(!/Igor|Filipin|503|99633/.test(texto), texto);
});

test('pedido repetido não duplica; mesmo número só acumula até o limite por número', () => {
  agendar(TEL_NOVO); agendar(TEL_NOVO); agendar(TEL_NOVO);
  assert.equal(pedidos().length, 1);
});

test('um número tentando vários CPFs não enche a fila: limite por número', () => {
  como('alan');
  const cpfs = ['111.444.777-35', '529.982.247-25', '168.995.350-09', '453.178.287-91'];
  const ids = cpfs.map((cpf, i) => clientes.salvar({ nome: `Cli ${i}`, telefone: `(54) 98000-000${i}`, cpf }).cliente.id);
  auth.logout?.();
  for (const cpf of cpfs) whatsapp.agendar({ telefone: TEL_NOVO, nome: 'Atacante', cpf, profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(8), '10:00') });
  assert.equal(pedidos().filter((p) => p.status === 'pendente').length, 3, 'deveria parar exatamente no limite por número');
  assert.equal(ids.length, 4);
});

test('CPF inválido não gera pedido (vira cadastro novo como antes)', () => {
  const r = whatsapp.agendar({ telefone: TEL_NOVO, nome: 'Fulano', cpf: '123.456.789-00', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(8), '10:00') });
  assert.equal(r.ok, true);
  assert.equal(pedidos().length, 0);
});

test('mesmo número do cadastro com CPF: agenda normalmente, sem pedido', () => {
  const r = agendar('(54) 99633-8812');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(pedidos().length, 0);
});

test('proprietário vê o pedido (CPF mascarado) e o aviso; barbeiro não vê nada', () => {
  agendar(TEL_NOVO);
  como('alan');
  const lista = pedidosVinculoVisiveis(st(), auth.usuario?.() || st().usuarios.find((u) => u.id === 'u-alan'));
  assert.equal(lista.length, 1);
  assert.ok(!JSON.stringify(lista).includes('503.976.128-77') && !JSON.stringify(lista).includes('50397612877'), 'CPF completo vazou');
  const dono = st().usuarios.find((u) => u.id === 'u-alan');
  assert.ok(avisosDoUsuario(st(), dono).some((a) => a.tipo === 'vinculo'));
  const kiko = st().usuarios.find((u) => u.id === 'u-kiko');
  assert.deepEqual(pedidosVinculoVisiveis(st(), kiko), []);
  assert.ok(!avisosDoUsuario(st(), kiko).some((a) => a.tipo === 'vinculo'));
});

test('barbeiro e visitante NÃO aprovam nem recusam', () => {
  agendar(TEL_NOVO);
  const id = pedidos()[0].id;
  assert.equal(clientes.aprovarVinculo(id).ok, false, 'sem login');
  como('kiko');
  assert.equal(clientes.aprovarVinculo(id).ok, false, 'profissional');
  assert.equal(clientes.recusarVinculo(id).ok, false, 'profissional');
  assert.equal(pedidos()[0].status, 'pendente');
  assert.equal(igor().telefone, '(54) 99633-8812');
});

test('admin SEM acesso a Clientes não aprova; admin COM acesso aprova', () => {
  criaAdmin({ financeiro: true });
  agendar(TEL_NOVO);
  const id = pedidos()[0].id;
  como('ana');
  assert.equal(clientes.aprovarVinculo(id).ok, false);
  store.reiniciar();
  criaAdmin({ clientes: true });
  agendar(TEL_NOVO);
  como('ana');
  const r = clientes.aprovarVinculo(pedidos()[0].id);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(igor().telefone, TEL_NOVO);
});

test('proprietário aprova: o número novo passa a valer, o antigo fica no histórico e o cliente consegue agendar', () => {
  agendar(TEL_NOVO);
  como('alan');
  const r = clientes.aprovarVinculo(pedidos()[0].id);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(igor().telefone, TEL_NOVO);
  assert.equal(igor().telefonesAnteriores.at(-1).telefone, '(54) 99633-8812');
  assert.equal(igor().telefonesAnteriores.at(-1).autorizadoPor, 'Alan');
  assert.equal(pedidos()[0].status, 'aprovado');
  assert.ok(st().avisosPainel.filter((a) => a.pedidoId).every((a) => a.lido), 'o aviso deveria ficar lido');
  auth.logout?.();
  const ag = agendar(TEL_NOVO);
  assert.ok(ag.ok, JSON.stringify(ag));
  assert.equal(ag.cliente.id, 'c-igor', 'deveria usar o cadastro antigo, com o histórico');
});

test('depois de aprovado, o número ANTIGO deixa de ter acesso ao cadastro', () => {
  agendar(TEL_NOVO);
  como('alan'); clientes.aprovarVinculo(pedidos()[0].id); auth.logout?.();
  assert.equal(whatsapp.editarMeusDados('c-igor', { nome: 'X' }, '(54) 99633-8812').ok, false);
  assert.deepEqual(whatsapp.meusAgendamentos('c-igor', '(54) 99633-8812'), []);
});

test('recusado: nada muda e o mesmo número continua sem acesso', () => {
  agendar(TEL_NOVO);
  como('alan');
  assert.ok(clientes.recusarVinculo(pedidos()[0].id).ok);
  assert.equal(igor().telefone, '(54) 99633-8812');
  assert.equal(pedidos()[0].status, 'recusado');
  auth.logout?.();
  const r = agendar(TEL_NOVO);
  assert.equal(r.ok, false);
  assert.equal(pedidos().length, 1, 'recusa não gera novo pedido');
  assert.equal(whatsapp.editarMeusDados('c-igor', { nome: 'X' }, TEL_NOVO).ok, false);
});

test('pedido já respondido não pode ser decidido de novo; id inexistente ou estranho é recusado', () => {
  agendar(TEL_NOVO);
  como('alan');
  const id = pedidos()[0].id;
  assert.ok(clientes.recusarVinculo(id).ok);
  assert.equal(clientes.aprovarVinculo(id).ok, false);
  assert.equal(igor().telefone, '(54) 99633-8812');
  for (const x of ['v999', '', null, {}, 'x'.repeat(100), '__proto__']) assert.equal(clientes.aprovarVinculo(x).ok, false);
});

test('se o CPF do cadastro mudou depois do pedido, aprovar não vincula e encerra o pedido', () => {
  agendar(TEL_NOVO);
  como('alan');
  clientes.salvar({ id: 'c-igor', nome: 'Igor Filipin', telefone: '(54) 99633-8812', cpf: '529.982.247-25' });
  const r = clientes.aprovarVinculo(pedidos()[0].id);
  assert.equal(r.ok, false);
  assert.equal(igor().telefone, '(54) 99633-8812');
  assert.equal(pedidos()[0].status, 'recusado');
});

test('barbeiro não troca o telefone de cliente já cadastrado (seria um vínculo sem autorização); dono troca', () => {
  como('kiko');
  const r = clientes.salvar({ id: 'c-igor', nome: 'Igor Filipin', telefone: TEL_NOVO, cpf: CPF_IGOR });
  assert.equal(r.ok, false);
  assert.equal(igor().telefone, '(54) 99633-8812');
  assert.ok(clientes.salvar({ id: 'c-igor', nome: 'Igor F.', telefone: '(54) 99633-8812', cpf: CPF_IGOR }).ok, 'barbeiro ainda edita o resto');
  como('alan');
  assert.ok(clientes.salvar({ id: 'c-igor', nome: 'Igor Filipin', telefone: TEL_NOVO, cpf: CPF_IGOR }).ok);
});

test('pelo WhatsApp não dá para trocar o telefone nem copiar o CPF de outro cliente', () => {
  assert.ok(whatsapp.editarMeusDados('c-igor', { telefone: TEL_NOVO }, '(54) 99633-8812').ok);
  assert.equal(igor().telefone, '(54) 99633-8812', 'telefone não é campo editável pelo cliente');
  como('alan');
  const outro = clientes.salvar({ nome: 'Outro', telefone: '(54) 98777-6655' }).cliente;
  auth.logout?.();
  const r = whatsapp.editarMeusDados(outro.id, { cpf: CPF_IGOR }, '(54) 98777-6655');
  assert.equal(r.ok, false);
  assert.ok(!/Igor/.test(r.erros.join(' ')));
});

const cpfDe = (n) => { const b = String(100000000 + n * 7919).slice(0, 9).split('').map(Number); const dv = (a) => { const t = a.reduce((x, d, k) => x + d * (a.length + 1 - k), 0); const r = (t * 10) % 11; return r === 10 ? 0 : r; }; const d1 = dv(b); const d2 = dv([...b, d1]); return [...b, d1, d2].join(''); };
test('fila de pedidos pendentes tem teto global', () => {
  como('alan');
  const cpfs = Array.from({ length: 60 }, (_, i) => cpfDe(i)).filter((c) => R.cadastroPorCpf([{ cpf: c, telefone: '(54) 90000-0000' }], { telefone: '(54) 98888-8888', cpf: c }));
  assert.ok(cpfs.length >= 55, 'gerador de CPF válido falhou: ' + cpfs.length);
  cpfs.forEach((cpf, i) => assert.ok(clientes.salvar({ nome: `C${i}`, telefone: `(54) 97000-${String(i).padStart(4, '0')}`, cpf }).ok));
  auth.logout?.();
  cpfs.forEach((cpf, i) => whatsapp.agendar({ telefone: `(54) 96${String(i).padStart(3, '0')}-0000`, nome: 'N', cpf, profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(8), '10:00') }));
  assert.equal(pedidos().filter((p) => p.status === 'pendente').length, 50);
});
