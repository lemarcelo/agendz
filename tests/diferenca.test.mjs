// Atendimento que muda de valor depois de haver cobrança Pix. Regra por status:
// O sistema nunca envia nada ao cliente por conta própria e não registra devolução: só avisa o painel. Concluído: nada. A confirmar/confirmado:
// avisa o painel do que falta (ou do que foi pago a mais: devolver no banco ou manter como crédito); cobrar a diferença é ação manual do esteticista.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, financeiro } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { situacaoPorConta } from '../src/domain/financeiro.js';

const st = () => store.getState();
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const CPF = '284.510.937-79';
const msgs = (agId, modelo) => st().mensagensCliente.filter((m) => m.agendamentoId === agId && m.modeloNome.toLowerCase().includes(modelo));
const cobs = (agId) => st().financeiro.cobrancas.filter((c) => c.agendamentoId === agId);
const creditos = (agId) => st().financeiro.creditos.filter((x) => x.agendamentoId === agId);
const avisos = (txt) => st().avisosPainel.filter((x) => x.texto.includes(txt));
// Máquina (40) + Barba (35) = 75, já pago por Pix.
function pago(status = 'confirmado', { enviar = true } = {}) {
  como('davi');
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada', 's-lav-motor'], inicio: tsAt(dia(9), '10:00'), status });
  assert.ok(r.ok, JSON.stringify(r));
  const a = r.agendamento;
  const c = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  assert.equal(c.valor, 75);
  if (enviar) assert.ok(financeiro.enviarCobranca(c.id).ok);
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  return { a, c };
}
test.beforeEach(() => reiniciar());

test('A confirmar/confirmado + serviço a mais: nada é enviado ao cliente; o painel é avisado e o esteticista gera o Pix da diferença', () => {
  for (const status of ['a_confirmar', 'confirmado']) {
    reiniciar();
    const { a, c } = pago(status);
    const m = st().mensagensCliente.length;
    assert.ok(agenda.editarServicos(a.id, ['s-lav-detalhada', 's-lav-motor', 's-lav-simples']).ok);
    assert.deepEqual(cobs(a.id).map((x) => x.id), [c.id], status + ': nenhuma cobrança criada sozinha');
    assert.equal(st().mensagensCliente.length, m, status + ': nada enviado ao cliente');
    assert.equal(creditos(a.id).length, 0);
    assert.ok(avisos('Diferença a cobrar').some((x) => x.texto.includes('R$ 40,00')), 'o painel deve ser avisado');
    assert.equal(situacaoPorConta(st(), st().agendamentos.find((x) => x.id === a.id))[0].falta, 40);
    // ação manual do esteticista
    const r = financeiro.gerarCobranca(a.id, { cpf: CPF });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.cobranca.valor, 40); assert.equal(r.cobranca.complementar, true);
    assert.deepEqual(r.cobranca.servicoIds, ['s-lav-simples'], 'só o serviço novo');
    assert.equal(r.cobranca.enviadaEm, null, 'gerar não envia');
    assert.equal(st().mensagensCliente.length, m, 'só envia quando o esteticista clicar em enviar');
    assert.ok(financeiro.enviarCobranca(r.cobranca.id).ok);
    assert.equal(st().mensagensCliente.length, m + 1);
    assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga', 'a original continua paga');
  }
});

test('A confirmar + serviço a mais depois de pago: avisa o painel; a diferença cobrada à mão é só o serviço novo', () => {
  const { a } = pago('a_confirmar');
  const m = st().mensagensCliente.length;
  assert.ok(agenda.adicionarServicos(a.id, ['s-lav-simples']).ok);
  assert.equal(cobs(a.id).length, 1); assert.equal(st().mensagensCliente.length, m);
  const r = financeiro.gerarCobranca(a.id, { cpf: CPF });
  assert.equal(r.cobranca.valor, 40);
});

test('Pagando a complementar (gerada à mão), o atendimento fica quitado e nada falta', () => {
  const { a } = pago();
  agenda.editarServicos(a.id, ['s-lav-detalhada', 's-lav-motor', 's-lav-simples']);
  const nova = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  assert.ok(financeiro.confirmarManual(nova.id, 'ok').ok);
  const sit = situacaoPorConta(st(), st().agendamentos.find((x) => x.id === a.id))[0];
  assert.equal(sit.liquido, 115); assert.equal(sit.falta, 0);
  assert.equal(financeiro.gerarCobranca(a.id, { cpf: CPF }).ok, false, 'não gera cobrança extra');
});

test('Concluído: não cobra, não credita e não avisa o cliente nem o painel', () => {
  const { a, c } = pago('confirmado');
  assert.ok(agenda.alterarStatus(a.id, 'concluido').ok);
  const m = st().mensagensCliente.length, p = st().avisosPainel.length, n = cobs(a.id).length;
  assert.ok(agenda.adicionarServicos(a.id, ['s-lav-simples']).ok);
  assert.ok(agenda.editarServicos(a.id, ['s-lav-detalhada']).ok);
  assert.equal(cobs(a.id).length, n);
  assert.equal(creditos(a.id).length, 0);
  assert.equal(st().mensagensCliente.length, m, 'nenhuma mensagem ao cliente');
  assert.equal(st().avisosPainel.length, p, 'nenhum aviso');
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga');
  assert.equal(financeiro.gerarCobranca(a.id, { cpf: CPF }).ok, false, 'concluído não ganha cobrança complementar');
});

test('A confirmar + serviço a menos: só avisa o painel (devolver ou manter como crédito); nada é registrado nem enviado ao cliente', () => {
  const { a, c } = pago('a_confirmar');
  const m = st().mensagensCliente.length;
  assert.ok(agenda.editarServicos(a.id, ['s-lav-detalhada']).ok); // 75 -> 40
  assert.equal(creditos(a.id).length, 0, 'nenhum crédito sem o esteticista confirmar');
  const av = avisos('Pago a mais');
  assert.equal(av.length, 1); assert.equal(av[0].tipo, 'devolver'); assert.match(av[0].texto, /R\$ 35,00/);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga');
  assert.equal(st().mensagensCliente.length, m, 'o cliente não recebe nada');
  // editar de novo sem mudar a diferença não repete o aviso
  agenda.editarServicos(a.id, ['s-lav-detalhada']);
  assert.equal(avisos('Pago a mais').length, 1);
  const sit0 = situacaoPorConta(st(), st().agendamentos.find((x) => x.id === a.id))[0];
  assert.equal(sit0.falta, -35);
  // o esteticista decide ficar com a diferença: vira crédito do cliente
  assert.ok(financeiro.manterComoCredito(a.id).ok);
  assert.equal(creditos(a.id).length, 1); assert.equal(creditos(a.id)[0].valor, 35);
  const sit = situacaoPorConta(st(), st().agendamentos.find((x) => x.id === a.id))[0];
  assert.equal(sit.liquido, 40); assert.equal(sit.falta, 0);
  assert.equal(financeiro.manterComoCredito(a.id).ok, false, 'não credita duas vezes');
});

test('Cancelar depois de manter parte como crédito: o aviso e o novo crédito são só do que sobrou (nunca mais do que foi pago)', () => {
  const { a } = pago('confirmado');
  agenda.editarServicos(a.id, ['s-lav-detalhada']);                 // pagou 35 a mais
  assert.ok(financeiro.manterComoCredito(a.id).ok);           // 35 viram crédito
  assert.ok(agenda.cancelar(a.id).ok);
  store.avancar(60 * 60000);
  assert.ok(financeiro.manterComoCredito(a.id).ok);           // cancelado: o restante (40)
  assert.equal(creditos(a.id).reduce((t, x) => t + x.valor, 0), 75, 'nunca mais do que foi pago');
  assert.equal(financeiro.manterComoCredito(a.id).ok, false);
});

test('Pix pendente já enviado fica desatualizado: é cancelado, NADA novo é enviado ao cliente e o painel é avisado', () => {
  como('davi');
  const a = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada'], inicio: tsAt(dia(9), '10:00'), status: 'confirmado' }).agendamento;
  const c = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  financeiro.enviarCobranca(c.id);
  const m = st().mensagensCliente.length;
  assert.ok(agenda.editarServicos(a.id, ['s-lav-detalhada', 's-lav-motor']).ok);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'cancelada');
  assert.equal(cobs(a.id).filter((x) => x.status === 'pendente').length, 0, 'nenhum Pix novo criado sozinho');
  assert.equal(st().mensagensCliente.length, m, 'nada enviado ao cliente');
  assert.ok(avisos('Gere e envie outro').length >= 1);
  const r = financeiro.gerarCobranca(a.id, { cpf: CPF });
  assert.equal(r.cobranca.valor, 75);
});

test('Pix pendente NÃO enviado: só é cancelado; quem gera e envia de novo é o fluxo padrão', () => {
  como('davi');
  const a = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada'], inicio: tsAt(dia(9), '10:00'), status: 'confirmado' }).agendamento;
  const c = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  const m = st().mensagensCliente.length;
  assert.ok(agenda.editarServicos(a.id, ['s-lav-detalhada', 's-lav-motor']).ok);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'cancelada');
  assert.equal(cobs(a.id).filter((x) => x.status === 'pendente').length, 0);
  assert.equal(st().mensagensCliente.length, m);
  const r = financeiro.gerarCobranca(a.id, { cpf: CPF });
  assert.ok(r.ok); assert.equal(r.cobranca.valor, 75);
});

test('Sem cobrança nenhuma: editar não cria cobrança nem mensagem', () => {
  como('davi');
  const a = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada'], inicio: tsAt(dia(9), '10:00'), status: 'confirmado' }).agendamento;
  const m = st().mensagensCliente.length;
  assert.ok(agenda.editarServicos(a.id, ['s-lav-detalhada', 's-lav-motor']).ok);
  assert.equal(cobs(a.id).length, 0);
  assert.equal(st().mensagensCliente.length, m);
});

test('Editar sem mudar o valor (troca por serviço de mesmo preço) não gera nada', () => {
  const { a } = pago('confirmado');
  const n = cobs(a.id).length, m = st().mensagensCliente.length;
  assert.ok(agenda.editarServicos(a.id, ['s-higien-interna', 's-lav-motor']).ok); // 40 + 35 = 75
  assert.equal(cobs(a.id).length, n);
  assert.equal(creditos(a.id).length, 0);
  assert.equal(avisos('Pago a mais').length, 0);
  assert.equal(st().mensagensCliente.length, m);
});

test('Agendamento cancelado não gera cobrança nem aviso de pago a mais ao editar valores', () => {
  const { a } = pago('confirmado');
  agenda.cancelar(a.id);
  const n = cobs(a.id).length, av = avisos('Pago a mais').length;
  agenda.editarServicos(a.id, ['s-lav-detalhada', 's-lav-simples']);
  assert.equal(cobs(a.id).length, n);
  assert.equal(avisos('Pago a mais').length, av);
});

test('Esteticista só ajusta o valor do próprio agendamento (permissão continua valendo)', () => {
  const { a } = pago('confirmado');
  como('marcelo'); // outro esteticista: a agenda é do Pablo
  assert.equal(agenda.editarServicos(a.id, ['s-lav-detalhada']).ok, false);
  assert.equal(financeiro.manterComoCredito(a.id).ok, false, 'e não mexe no crédito de agendamento alheio');
  assert.equal(creditos(a.id).length, 0);
});

const cfgApi = (o = {}) => ({ banco: 'Sicredi', ambiente: 'homologacao', urlBase: 'https://api-pix-h.sicredi.com.br/api/v2', clientId: 'abc12345', clientSecret: 'segredo123', certificadoNome: 'cert.cer', chavePrivadaNome: 'app.key', cadeiaNome: 'cadeia.pem', escopos: ['cob.write', 'cob.read', 'pix.read', 'webhook.write'], webhookUrl: 'https://api.apex.example/webhooks/pix', ...o });

test('Com API Pix ativa: a diferença paga a mais não gera devolução pela API; mantida como crédito, o Pix da diferença, gerado à mão, sai pelo banco', () => {
  como('davi');
  assert.ok(financeiro.salvarApiPix('ct1', cfgApi()).ok);
  assert.ok(financeiro.testarApiPix('ct1').ok);
  assert.equal(st().financeiro.contas[0].apiPix.ativa, true);
  const { a, c } = pago('confirmado');
  assert.equal(c.emitidaPor, 'api');
  const debitos = st().financeiro.extrato.filter((e) => e.tipo === 'debito').length;
  agenda.editarServicos(a.id, ['s-lav-detalhada']);
  assert.equal(st().financeiro.extrato.filter((e) => e.tipo === 'debito').length, debitos, 'o sistema não devolve dinheiro sozinho, nem pela API');
  assert.equal(avisos('Pago a mais').length, 1);
  assert.ok(financeiro.manterComoCredito(a.id).ok);
  agenda.editarServicos(a.id, ['s-lav-detalhada', 's-lav-motor', 's-lav-simples']);
  const nova = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  assert.equal(nova.emitidaPor, 'api'); assert.equal(nova.valor, 75); assert.equal(nova.complementar, true);
});
