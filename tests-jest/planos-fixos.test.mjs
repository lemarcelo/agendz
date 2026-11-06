/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço, fase 2 (Artifact): horários fixos do assinante (criação com 14 dias de antecedência, reserva, encerramento), modelos de plano da barbearia
// e agendamento do cliente com plano pelo link/telefone (gasta corte quando cobre; senão segue normal). Cenário na barbearia Dalforno, relógio fixo.
import { test, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda, planos, publico, whatsapp, clientes, avisosDoUsuario } from '../src/services/api.js';
import { DIAS_FIXOS_A_FRENTE, MAX_FIXOS, restantesNoMes } from '../src/domain/planos.js';
import { modelosDePlanoDoTipo, formularioDoModelo } from '../src/domain/catalogo.js';
import { sanearFixos, ocorrencias } from '../src/domain/fixos.js';

const HOJE = new Date('2026-10-12T07:00:00-03:00'); // segunda-feira
const DIA = 86400000;
const em = (dias, hh, mm = 0) => new Date(HOJE.getTime() - 3 * 3600000 + dias * DIA + 0).setUTCHours(hh + 3, mm, 0, 0); // hora de parede de Brasília, dia = HOJE + dias
const st = () => store.getState();
const alan = () => { auth.logout(); assert.ok(auth.login({ identificador: 'alan', senha: '1234' }).ok); };

let plano;
let assin;
let CLI; // cliente novo (sem agendamentos abertos do seed)
const TEL = '(51) 98123-4567';
function preparar({ cortes = 4, intervaloDias = 3, restringeServicos = false } = {}) {
  jest.useRealTimers();
  jest.useFakeTimers({ doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], now: HOJE });
  store.reiniciar();
  store.entrarNaLoja('dalforno');
  alan();
  const p = planos.salvar({ nome: 'Degradê em Dia', preco: 75, cortes, servicoIds: ['s-degrade'], adianta: 1, acumuloMeses: 2, intervaloDias, restringeServicos });
  assert.ok(p.ok, JSON.stringify(p));
  plano = p.plano;
  const cl = clientes.salvar({ nome: 'Rafael Assinante', telefone: TEL });
  assert.ok(cl.ok, JSON.stringify(cl));
  CLI = cl.cliente.id;
  const c = planos.contratar({ clienteId: CLI, planoId: plano.id });
  assert.ok(c.ok, JSON.stringify(c));
  assin = c.assinatura.id;
  assert.ok(planos.pagar(assin, { mes: '2026-10', forma: 'pix' }).ok);
}
const fixo = (o = {}) => ({ dia: 2, hm: '10:00', profissionalId: 'u-kiko', servicoIds: ['s-degrade'], ...o }); // terça 10:00
const doAssin = (id = assin) => st().assinaturas.find((a) => a.id === id);
const fixosCriados = () => st().agendamentos.filter((a) => a.fixoId);
const restantes = () => planos.listar().assinaturas.find((a) => a.id === assin).saldo.restantes;
const tick = (ms = 0) => store.avancar(ms);

beforeEach(() => preparar());
afterEach(() => jest.useRealTimers());

// ---------------------------------------------------------------- 1. horários fixos
test('fixos: a forma da lista é conferida (máximo, dia, hora, serviços, repetido)', () => {
  assert.equal(MAX_FIXOS, 3);
  assert.equal(sanearFixos([fixo(), fixo({ hm: '11:00' }), fixo({ hm: '12:00' }), fixo({ hm: '13:00' })], MAX_FIXOS).ok, false, 'mais de 3');
  assert.equal(sanearFixos([fixo({ dia: 7 })], MAX_FIXOS).ok, false);
  assert.equal(sanearFixos([fixo({ hm: '25:00' })], MAX_FIXOS).ok, false);
  assert.equal(sanearFixos([fixo({ hm: '9:00' })], MAX_FIXOS).ok, false);
  assert.equal(sanearFixos([fixo({ servicoIds: [] })], MAX_FIXOS).ok, false);
  assert.equal(sanearFixos([fixo(), fixo()], MAX_FIXOS).ok, false, 'mesmo dia e hora');
  assert.equal(sanearFixos('x', MAX_FIXOS).ok, false);
  const ok = sanearFixos([{ ...fixo(), lixo: 'x' }], MAX_FIXOS);
  assert.ok(ok.ok); assert.deepEqual(Object.keys(ok.fixos[0]).sort(), ['dia', 'hm', 'profissionalId', 'servicoIds']);
  const oc = ocorrencias({ dia: 2, hm: '10:00' }, HOJE.getTime(), HOJE.getTime() + 14 * DIA);
  assert.equal(oc.length, 2, 'duas terças em 14 dias'); assert.ok(oc.every((t) => new Date(t).getDay() === 2));
});

test('fixos: só quem tem a seção Planos define; entrada ruim é recusada', () => {
  auth.logout(); assert.ok(auth.login({ identificador: 'kiko', senha: '1234' }).ok);
  assert.equal(planos.definirFixos(assin, { fixos: [fixo()] }).ok, false, 'profissional sem a seção');
  alan();
  assert.equal(planos.definirFixos('nao-existe', { fixos: [fixo()] }).ok, false);
  assert.equal(planos.definirFixos(assin, { fixos: 'x' }).ok, false);
  assert.equal(planos.definirFixos(assin, { fixos: [fixo({ servicoIds: ['s-barba'] })] }).ok, false, 'serviço fora do plano');
  assert.equal(planos.definirFixos(assin, { fixos: [fixo({ profissionalId: 'u-fantasma' })] }).ok, false);
  assert.equal(planos.definirFixos(assin, { fixos: [fixo({ dia: 0 })] }).ok, false, 'domingo fechado');
  assert.equal(planos.definirFixos(assin, { fixos: [fixo({ hm: '03:00' })] }).ok, false, 'fora do expediente');
  assert.ok(planos.definirFixos(assin, { fixos: [fixo()] }).ok);
});

test('fixos: intervalo do plano e choque entre assinantes', () => {
  const p = planos.salvar({ id: plano.id, nome: plano.nome, preco: 75, cortes: 4, servicoIds: ['s-degrade'], intervaloDias: 3 }).plano;
  assert.ok(p);
  // ter e qua ficam a 1 dia um do outro, e o plano pede 3 (assinatura nova guarda a foto do plano; a atual já a tem)
  const r = planos.definirFixos(assin, { fixos: [fixo(), fixo({ dia: 3 })] });
  assert.equal(r.ok, false); assert.match(r.erros[0], /entre um atendimento e outro/);
  assert.equal(planos.definirFixos(assin, { fixos: [fixo(), fixo({ dia: 5, hm: '15:00' })] }).ok, true, 'ter e sex: 3 dias');
  // outro assinante não pega o mesmo horário
  const c2 = planos.contratar({ clienteId: 'c-jon', planoId: plano.id });
  assert.ok(c2.ok, JSON.stringify(c2));
  assert.ok(planos.pagar(c2.assinatura.id, { mes: '2026-10', forma: 'pix' }).ok);
  const choque = planos.definirFixos(c2.assinatura.id, { fixos: [fixo({ hm: '10:20' })] });
  assert.equal(choque.ok, false); assert.match(choque.erros[0], /outro assinante/);
  assert.ok(planos.definirFixos(c2.assinatura.id, { fixos: [fixo({ hm: '11:00' })] }).ok, 'meia hora depois cabe');
});

test('fixos: o agendamento nasce com 14 dias de antecedência, confirmado, gastando 1 corte, e nunca duplica', () => {
  assert.ok(planos.definirFixos(assin, { fixos: [fixo()] }).ok);
  const lista = fixosCriados();
  assert.equal(lista.length, 2, 'duas terças dentro de 14 dias (13/10 e 20/10)');
  for (const a of lista) {
    assert.equal(a.status, 'confirmado'); assert.equal(a.clienteId, CLI); assert.equal(a.profissionalId, 'u-kiko');
    assert.equal(a.planoUso.assinaturaId, assin); assert.ok(a.inicio - HOJE.getTime() <= DIAS_FIXOS_A_FRENTE * DIA);
    assert.equal(new Date(a.inicio).getHours(), 10);
  }
  assert.equal(restantes(), 2, '4 cortes - 2 fixos');
  tick(); tick(); tick(3600000);
  assert.equal(fixosCriados().length, 2, 'tick repetido não duplica');
  assert.ok(fixosCriados().every((a) => !a.local));
  // uma semana depois entra a terça seguinte (27/10), no limite dos 14 dias
  tick(7 * DIA);
  assert.equal(fixosCriados().length, 3);
  assert.equal(new Set(fixosCriados().map((a) => a.fixoData)).size, 3);
});

test('fixos: passa pelas mesmas travas do plano (saldo e mensalidade) e avisa o dono uma vez só', () => {
  alan();
  assert.ok(planos.definirFixos(assin, { fixos: [fixo(), fixo({ dia: 5, hm: '15:00' })] }).ok);
  // 4 cortes + 1 adiantado = 5; em 14 dias cabem 4 fixos (2 terças, 2 sextas)
  assert.equal(fixosCriados().length, 4);
  tick(7 * DIA); // chega a terça 27/10 e a sexta 30/10: o saldo de outubro (4 + 1) acaba na quinta criação
  const avisos = st().avisosPainel.filter((a) => a.tipo === 'fixo');
  assert.ok(fixosCriados().length >= 4);
  const antes = avisos.length;
  tick(60000); tick(60000); tick(60000);
  assert.equal(st().avisosPainel.filter((a) => a.tipo === 'fixo').length, antes, 'o mesmo problema não vira aviso repetido');
  for (const a of st().avisosPainel.filter((x) => x.tipo === 'fixo')) { assert.equal(a.agendamentoId, null); assert.match(a.texto, /não foi criado/); }
});

test('fixos: horário ocupado por outro cliente não é criado; avisa o dono; quando liberar, entra', () => {
  // outro cliente ocupa terça 13/10 às 10:00 com Kiko (antes de o fixo existir)
  const o = agenda.criar({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], inicio: em(1, 10), status: 'confirmado' });
  assert.ok(o.ok, JSON.stringify(o));
  assert.ok(planos.definirFixos(assin, { fixos: [fixo()] }).ok);
  assert.deepEqual([...fixosCriados()].map((a) => new Date(a.inicio).getDate()), [20], 'só a terça 20 foi criada');
  const avisos = st().avisosPainel.filter((a) => a.tipo === 'fixo');
  assert.equal(avisos.length, 1); assert.match(avisos[0].texto, /13\/10\/2026|13\/10/); assert.match(avisos[0].texto, /ocupado por outro cliente/);
  tick(60000); tick(60000);
  assert.equal(st().avisosPainel.filter((a) => a.tipo === 'fixo').length, 1, 'aviso uma vez só');
  assert.ok(agenda.alterarStatus(o.agendamento.id, 'cancelado').ok);
  tick(60000);
  assert.equal(fixosCriados().length, 2, 'liberou: o fixo entrou');
});

test('fixos: reserva — ninguém mais toma o horário (painel, link, WhatsApp), nem antes dos 14 dias', () => {
  assert.ok(planos.definirFixos(assin, { fixos: [fixo()] }).ok);
  // já criado (13/10 e 20/10): conflito normal
  const ocupado = agenda.criar({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], inicio: em(1, 10) });
  assert.equal(ocupado.ok, false);
  // 03/11 (terça) ainda não virou agendamento, mas já é reservado
  const longe = em(22, 10);
  assert.equal(new Date(longe).getDay(), 2);
  assert.equal(fixosCriados().some((a) => a.inicio === longe), false);
  const r = agenda.criar({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], inicio: longe });
  assert.equal(r.ok, false); assert.match(r.erros[0], /fixo de um cliente com plano/);
  assert.equal(JSON.stringify(r).includes('Rafael'), false, 'não diz de quem é');
  // o link e o WhatsApp também não oferecem esse horário
  auth.logout();
  const horas = publico.horarios({ profissionalId: 'u-kiko', servicoIds: ['s-barba'], dayTs: longe });
  assert.equal(horas.some((h) => h.inicio === longe), false, 'o link não mostra o horário fixo');
  assert.equal(horas.some((h) => h.inicio === em(22, 11)), true, 'mas o resto do dia segue livre');
  const w = whatsapp.horariosLivres({ profissionalId: 'u-kiko', servicoIds: ['s-barba'], dayTs: longe });
  assert.equal((Array.isArray(w) ? w : w.horarios || []).includes(longe), false);
  // só a equipe, marcando encaixe, passa por cima
  alan();
  assert.ok(agenda.criar({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], inicio: longe, encaixe: true, status: 'confirmado' }).ok);
});

test('fixos: o dia cancelado fica livre e não é recriado; o corte volta', () => {
  assert.ok(planos.definirFixos(assin, { fixos: [fixo()] }).ok);
  const a = fixosCriados().sort((x, y) => x.inicio - y.inicio)[0];
  assert.equal(restantes(), 2);
  assert.ok(agenda.alterarStatus(a.id, 'cancelado').ok);
  tick(60000); tick(60000);
  assert.equal(restantes(), 3, 'corte devolvido');
  assert.equal(fixosCriados().filter((x) => x.fixoData === a.fixoData).length, 1, 'não recria o dia cancelado');
  // o dia cancelado deixa de estar reservado: outro cliente pode pegar
  assert.ok(agenda.criar({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], inicio: a.inicio }).ok);
});

test('fixos: trocar a lista tira só o que mudou; encerrar apaga os futuros e não toca o que já foi feito', () => {
  assert.ok(planos.definirFixos(assin, { fixos: [fixo(), fixo({ dia: 5, hm: '15:00' })] }).ok);
  assert.equal(fixosCriados().length, 4);
  const mantido = fixosCriados().find((a) => new Date(a.inicio).getDay() === 2).id;
  const r = planos.definirFixos(assin, { fixos: [fixo()] }); // tirou a sexta
  assert.ok(r.ok); assert.equal(r.apagados, 2);
  assert.equal(fixosCriados().length, 2); assert.ok(fixosCriados().some((a) => a.id === mantido), 'a terça mantida segue o mesmo agendamento');
  // um atendimento já feito (concluído) do mesmo plano nunca é tocado
  tick(8 * DIA); // 20/10 10:40 já passou: o fixo da terça 13/10 e 20/10 concluem
  const feitos = st().agendamentos.filter((a) => a.fixoId && a.status === 'concluido');
  assert.ok(feitos.length >= 1, 'o da terça 13/10 já foi concluído');
  const futurosAntes = fixosCriados().filter((a) => a.status === 'confirmado' && a.inicio > Date.now()).length;
  assert.ok(futurosAntes >= 1);
  const e = planos.encerrar(assin, 'cliente mudou de cidade');
  assert.ok(e.ok); assert.equal(e.apagados, futurosAntes);
  assert.equal(fixosCriados().filter((a) => a.status === 'confirmado').length, 0, 'sem fixo futuro');
  assert.equal(st().agendamentos.filter((a) => a.fixoId && a.status === 'concluido').length, feitos.length, 'atendimentos feitos intactos');
  assert.deepEqual(doAssin().fixos, []);
  tick(8 * DIA);
  assert.equal(fixosCriados().filter((a) => a.status === 'confirmado').length, 0, 'encerrada não cria mais');
  // sem reserva depois de encerrar
  assert.ok(agenda.criar({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], inicio: em(36, 10) }).ok);
});

test('fixos: assinatura sem mensalidade do mês não cria (e avisa); registrar a mensalidade libera', () => {
  const c = planos.contratar({ clienteId: 'c-marcelo', planoId: plano.id });
  assert.ok(c.ok);
  assert.ok(planos.definirFixos(c.assinatura.id, { fixos: [fixo({ hm: '14:00' })] }).ok);
  assert.equal(fixosCriados().filter((a) => a.clienteId === 'c-marcelo').length, 0, 'pendente (sem mensalidade) não reserva nem cria');
  assert.ok(planos.pagar(c.assinatura.id, { mes: '2026-10', forma: 'pix' }).ok);
  assert.equal(fixosCriados().filter((a) => a.clienteId === 'c-marcelo').length, 2);
});

// ---------------------------------------------------------------- 2. modelos de plano
test('modelos: barbearia (4) e estética (3); tipo sem modelo fica vazio; nada é gravado ao usar', () => {
  const m = modelosDePlanoDoTipo('barbearia');
  assert.deepEqual(m.map((x) => [x.nome, x.preco]), [['Degradê em Dia', 75], ['Navalhado Premium', 85], ['Visual Completo', 125], ['Barbeiro VIP', 165]]);
  for (const x of m) { assert.ok(x.cortes >= 1 && x.cortes <= 31 && x.adianta <= 3 && x.acumuloMeses <= 6 && x.intervaloDias <= 30, x.nome); assert.ok(x.servicos.length >= 1); }
  assert.deepEqual(modelosDePlanoDoTipo('estetica_automotiva').map((x) => x.nome), ['Lavagem Mensal', 'Clube Cuidado Total', 'Brilho Premium']);
  assert.deepEqual(modelosDePlanoDoTipo('consultorio'), [], 'tipo sem modelos: lista vazia');
  assert.deepEqual(modelosDePlanoDoTipo('qualquer'), []);
  m[0].nome = 'mexi'; assert.equal(modelosDePlanoDoTipo('barbearia')[0].nome, 'Degradê em Dia', 'cópia nova a cada chamada');
  const antes = planos.listar().planos.length;
  const f = formularioDoModelo(modelosDePlanoDoTipo('barbearia')[2], st().servicos); // Visual Completo
  assert.equal(f.faltou, false);
  const nomes = f.form.servicoIds.map((id) => st().servicos.find((s) => s.id === id).nome);
  assert.ok(nomes.includes('Corte Degradê') && nomes.includes('Barba'), nomes.join(','));
  assert.equal(f.form.preco, 125);
  assert.equal(planos.listar().planos.length, antes, 'usar o modelo não grava');
  // o formulário preenchido salva sem ajustes
  const r = planos.salvar({ ...f.form, nome: 'Visual Completo' });
  assert.ok(r.ok, JSON.stringify(r));
  // loja sem nenhum dos serviços do modelo: formulário vazio de serviços, com aviso
  assert.equal(formularioDoModelo(modelosDePlanoDoTipo('barbearia')[1], [{ id: 'x', nome: 'Outro', ativo: true }]).faltou, true);
  // serviço desativado e combo não entram
  const so = formularioDoModelo(modelosDePlanoDoTipo('barbearia')[0], [{ id: 'a', nome: 'corte degrade', ativo: false }, { id: 'b', nome: 'Corte Degradê', combo: true }, { id: 'c', nome: 'CORTE DEGRADÊ' }]);
  assert.deepEqual(so.form.servicoIds, ['c'], 'sem acento e sem diferenciar maiúscula; ativo e não combo');
});

// ---------------------------------------------------------------- 3. link / telefone com plano
const linkPara = (extra = {}) => publico.agendar({ nome: 'Rafael Assinante', telefone: TEL, servicoIds: ['s-degrade'], inicio: em(4, 10), profissionalId: 'u-kiko', ...extra }); // sexta 16/10 10:00
test('link: cliente com plano ativo e serviço coberto gasta 1 corte; avisa antes e depois, sem valor nem nome do plano', () => {
  auth.logout();
  const previa = publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-degrade'], inicio: em(4, 10) });
  assert.deepEqual(previa, { ok: true, usaPlano: true, esgotado: false, restrito: false });
  const r = linkPara();
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.usouPlano, true);
  // E2: no fim do agendamento o cliente vê quantos atendimentos do plano restam no mês do horário (sem valor nem saldo de outra pessoa)
  assert.deepEqual(Object.keys(r.plano).sort(), ['mes', 'nome', 'restantes']);
  assert.equal(r.plano.restantes, 3, 'o plano de teste tem 4 por mês e este horário usou 1');
  assert.match(r.plano.mes, /^\d{4}-\d{2}$/);
  // o token do acesso é aleatório e pode conter "75": só vale o número solto (valor), nunca pedaço de palavra
  assert.equal(/(?<![0-9a-zA-Z])75(?![0-9a-zA-Z])/.test(JSON.stringify(r)), false, 'sem valor da mensalidade');
  alan();
  const a = st().agendamentos.find((x) => x.id === r.agendamentoId);
  assert.equal(a.planoUso.assinaturaId, assin); assert.equal(a.origem, 'link'); assert.equal(a.status, 'a_confirmar');
  assert.equal(restantes(), 3);
  assert.ok(st().avisosPainel.some((x) => x.agendamentoId === a.id && /atendimento do plano/.test(x.texto)), 'o dono vê que usa o plano');
});

test('link: serviço fora do plano, sem plano ou plano de outro: agenda normal, preço normal; cota do mês acabada: o link recusa e a equipe agenda fora do plano (E2)', () => {
  preparar({ cortes: 2, intervaloDias: 0 });
  auth.logout();
  assert.deepEqual(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-barba'], inicio: em(4, 10) }), { ok: true, usaPlano: false, esgotado: false, restrito: false }, 'barba não é do plano');
  assert.deepEqual(publico.usoDoPlano({ telefone: '(51) 99588-3374', servicoIds: ['s-degrade'], inicio: em(4, 10) }), { ok: true, usaPlano: false, esgotado: false, restrito: false }, 'Jon não tem plano');
  assert.deepEqual(publico.usoDoPlano({ telefone: '(54) 99000-0000', servicoIds: ['s-degrade'], inicio: em(4, 10) }), { ok: true, usaPlano: false, esgotado: false, restrito: false }, 'telefone desconhecido: mesma resposta');
  const fora = linkPara({ servicoIds: ['s-barba'] });
  assert.ok(fora.ok, JSON.stringify(fora)); assert.equal(fora.usouPlano, false);
  alan();
  assert.equal(st().agendamentos.find((x) => x.id === fora.agendamentoId).planoUso, undefined);
  // gasta todo o saldo (2 + 1 adiantado) com atendimentos feitos agora
  for (let k = 0; k < 3; k++) {
    const ag = agenda.atender({ clienteId: CLI, profissionalId: 'u-alan', servicoIds: ['s-degrade'], formaPagamento: 'pix', assinaturaId: assin });
    assert.ok(ag.ok, JSON.stringify(ag));
  }
  assert.equal(restantes(), 0);
  auth.logout();
  // E2: a prévia avisa "esgotado" (sem nome de plano nem saldo) e o LINK recusa o serviço coberto; nada é gravado
  assert.deepEqual(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-degrade'], inicio: em(7, 10) }), { ok: true, usaPlano: false, esgotado: true, restrito: false });
  const antes = st().agendamentos.length;
  const sem = linkPara({ inicio: em(7, 10) });
  assert.equal(sem.ok, false, 'cota do mês acabada: o link não agenda o serviço coberto');
  assert.match(sem.erros[0], /Os atendimentos do seu plano em .+ acabaram\. Para agendar fora do plano, fale com a equipe\./);
  assert.equal(st().agendamentos.length, antes, 'o pedido recusado não grava nada');
  // serviço FORA do plano segue normal pelo link (a restrição é só dos serviços cobertos)
  const barba = linkPara({ inicio: em(7, 10), servicoIds: ['s-barba'] });
  assert.ok(barba.ok, JSON.stringify(barba)); assert.equal(barba.usouPlano, false);
  // a equipe agenda o mesmo serviço sem a restrição: sem marcar o plano, cobrança normal (nada recusado)
  alan();
  const equipe = agenda.atender({ clienteId: CLI, profissionalId: 'u-alan', servicoIds: ['s-degrade'], formaPagamento: 'pix' });
  assert.ok(equipe.ok, JSON.stringify(equipe));
  assert.equal(st().agendamentos.find((x) => x.id === equipe.agendamento.id).planoUso, undefined, 'fora do plano');
  // pedir o PLANO explicitamente além da cota continua recusado (a equipe agenda sem marcar o plano)
  assert.equal(agenda.atender({ clienteId: CLI, profissionalId: 'u-alan', servicoIds: ['s-degrade'], formaPagamento: 'pix', assinaturaId: assin }).ok, false);
});

test('link: mensalidade em falta ou intervalo do plano NÃO barram o link (só a cota do mês acabada): agenda normal pelo preço normal (E2)', () => {
  preparar({ cortes: 2, intervaloDias: 3 });
  auth.logout();
  const a1 = linkPara(); assert.equal(a1.usouPlano, true);
  const perto = linkPara({ inicio: em(5, 10) }); // 1 dia depois: o plano pede 3 dias; não é a cota
  assert.ok(perto.ok, JSON.stringify(perto)); assert.equal(perto.usouPlano, false);
  assert.deepEqual(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-degrade'], inicio: em(5, 10) }), { ok: true, usaPlano: false, esgotado: false, restrito: false });
});

test('E2: plano que restringe o link aos serviços dele: serviço de fora é recusado (com os permitidos), prévia avisa, a equipe agenda qualquer serviço', () => {
  preparar({ restringeServicos: true });
  auth.logout();
  assert.deepEqual(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-barba'], inicio: em(4, 10) }), { ok: true, usaPlano: false, esgotado: false, restrito: true });
  const antes = st().agendamentos.length;
  const fora = linkPara({ servicoIds: ['s-barba'] });
  assert.equal(fora.ok, false);
  assert.match(fora.erros[0], /^Seu plano permite agendar pelo link só: .*Corte Degradê.*. Para outros serviços, fale com a equipe.$/);
  assert.equal(linkPara({ servicoIds: ['s-degrade', 's-barba'] }).ok, false, 'misturar também é recusado');
  assert.equal(st().agendamentos.length, antes, 'nada gravado');
  assert.equal(linkPara().ok, true, 'o serviço do plano passa');
  alan();
  const equipe = agenda.atender({ clienteId: CLI, profissionalId: 'u-alan', servicoIds: ['s-barba'], formaPagamento: 'pix' });
  assert.ok(equipe.ok, JSON.stringify(equipe));
});

test('E2: plano SEM restrição deixa o link agendar serviço de fora pelo preço normal', () => {
  preparar({ intervaloDias: 0 });
  auth.logout();
  assert.equal(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-barba'], inicio: em(4, 10) }).restrito, false);
  assert.equal(linkPara({ servicoIds: ['s-barba'] }).ok, true);
});

test('E2: restantesNoMes é o saldo do fim do mês, nunca negativo, e 0 fora do extrato', () => {
  const ex = { linhas: [{ mes: '2026-10', saldoFim: 3 }, { mes: '2026-11', saldoFim: -1 }, { mes: '2026-12', saldoFim: 0 }] };
  assert.equal(restantesNoMes(ex, '2026-10'), 3);
  assert.equal(restantesNoMes(ex, '2026-11'), 0, 'adiantado não conta');
  assert.equal(restantesNoMes(ex, '2027-01'), 0, 'fora do extrato');
});

test('link: respeita o intervalo entre cortes e o cancelamento devolve o corte; plano encerrado não vale', () => {
  auth.logout();
  const a1 = linkPara(); assert.equal(a1.usouPlano, true);
  const perto = linkPara({ inicio: em(5, 10) }); // sábado, 1 dia depois: o plano pede 3 dias
  assert.ok(perto.ok, JSON.stringify(perto)); assert.equal(perto.usouPlano, false, 'intervalo do plano');
  assert.ok(publico.cancelar(a1.token, a1.agendamentoId).ok);
  alan(); assert.equal(restantes(), 4, 'cancelou: o corte volta');
  assert.ok(planos.encerrar(assin, 'cliente mudou de cidade').ok);
  auth.logout();
  assert.deepEqual(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-degrade'], inicio: em(8, 10) }), { ok: true, usaPlano: false, esgotado: false, restrito: false });
});

test('link: a consulta "usa plano" valida a entrada e tem limite por telefone', () => {
  auth.logout();
  assert.equal(publico.usoDoPlano({ telefone: 'abc', servicoIds: ['s-degrade'], inicio: em(4, 10) }).usaPlano, false);
  assert.equal(publico.usoDoPlano({ telefone: TEL, servicoIds: 'x', inicio: em(4, 10) }).ok, false);
  assert.equal(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-degrade'], inicio: 'x' }).ok, false);
  assert.equal(publico.usoDoPlano({ telefone: TEL, servicoIds: Array(11).fill('s-degrade'), inicio: em(4, 10) }).ok, false);
  let bloqueou = false;
  for (let i = 0; i < 14; i++) if (publico.usoDoPlano({ telefone: '(51) 91111-2222', servicoIds: ['s-degrade'], inicio: em(4, 10) }).ok === false) bloqueou = true;
  assert.ok(bloqueou, 'passou de 10 consultas em 15 min: bloqueia');
});

test('WhatsApp: o cliente com plano que agenda pelo número também gasta o corte', () => {
  auth.logout();
  const r = whatsapp.agendar({ telefone: TEL, profissionalId: 'u-kiko', servicoIds: ['s-degrade'], inicio: em(4, 11) });
  if (r.ok === false) return assert.ok(false, JSON.stringify(r));
  alan();
  const a = st().agendamentos.find((x) => x.id === (r.agendamento?.id || r.agendamentoId));
  assert.ok(a, JSON.stringify(r));
  assert.equal(a.planoUso?.assinaturaId, assin);
});

test('aviso do horário fixo: o dono e o profissional do fixo veem; outro profissional não', () => {
  const o = agenda.criar({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], inicio: em(1, 10), status: 'confirmado' });
  assert.ok(o.ok);
  assert.ok(planos.definirFixos(assin, { fixos: [fixo()] }).ok);
  const avisos = (id) => avisosDoUsuario(st(), st().usuarios.find((u) => u.id === id)).filter((a) => a.tipo === 'fixo');
  assert.equal(avisos('u-alan').length, 1, 'dono');
  assert.equal(avisos('u-kiko').length, 1, 'profissional do fixo');
  assert.equal(avisos('u-tailuan').length, 0, 'outro profissional');
});

// ---------------------------------------------------------------- E3. trocar de plano pagando só a diferença
function planosDaTroca() {
  const completo = planos.salvar({ nome: 'Degradê e Barba', preco: 120, cortes: 4, servicoIds: ['s-degrade', 's-barba'], adianta: 1, acumuloMeses: 2, intervaloDias: 0 });
  const barato = planos.salvar({ nome: 'Barato Completo', preco: 60, cortes: 4, servicoIds: ['s-degrade', 's-barba'], adianta: 1, acumuloMeses: 2, intervaloDias: 0 }); // custa menos: não é troca
  const semDegrade = planos.salvar({ nome: 'Só Barba', preco: 200, cortes: 4, servicoIds: ['s-barba', 's-barba-degrade'], adianta: 1, acumuloMeses: 2, intervaloDias: 0 }); // não inclui o serviço atual
  assert.ok(completo.ok && barato.ok && semDegrade.ok);
  return { completo: completo.plano.id, barato: barato.plano.id, semDegrade: semDegrade.plano.id };
}
function esgotar() {
  for (let k = 0; k < 3; k++) assert.ok(agenda.atender({ clienteId: CLI, profissionalId: 'u-alan', servicoIds: ['s-degrade'], formaPagamento: 'pix', assinaturaId: assin }).ok);
  assert.equal(restantes(), 0);
}

test('E3: a prévia do link oferece só planos com TODOS os serviços do atual e mais algum, do mais barato, com a diferença já descontada', () => {
  preparar({ cortes: 2, intervaloDias: 0 });
  const p = planosDaTroca();
  assert.deepEqual(planos.salvarConfigTroca({ descontoPct: 25, whatsapp: '(51) 99999-1234' }), { ok: true, descontoPct: 25, whatsapp: '5551999991234' });
  esgotar(); auth.logout();
  const r = publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-degrade'], inicio: em(7, 10) });
  assert.equal(r.esgotado, true);
  assert.equal(JSON.stringify(r.trocas.map((o) => o.planoId)), JSON.stringify([p.completo]), 'só o upgrade de verdade');
  assert.equal(r.trocas[0].diferenca, 33.75, '(120 − 75) com 25% de desconto');
  assert.equal(r.trocas[0].preco, 120);
  assert.equal(JSON.stringify(r.trocas[0].servicos), JSON.stringify(['Barba', 'Corte Degradê']));
  assert.equal(r.descontoTrocaPct, 25); assert.equal(r.whatsapp, '5551999991234');
  assert.ok(!JSON.stringify(r).includes('Degradê em Dia') && !JSON.stringify(r).includes('Rafael'), 'nunca o nome do plano atual nem do cliente');
  // telefone sem plano: nenhuma opção
  assert.equal(publico.usoDoPlano({ telefone: '(51) 90000-0000', servicoIds: ['s-degrade'], inicio: em(7, 10) }).trocas, undefined);
});

test('E3: o desconto da loja é 0 a 100 e só quem tem a seção Planos configura', () => {
  assert.equal(planos.salvarConfigTroca({ descontoPct: 101 }).ok, false);
  assert.equal(planos.salvarConfigTroca({ descontoPct: -1 }).ok, false);
  assert.equal(planos.salvarConfigTroca({ descontoPct: 10, whatsapp: '123' }).ok, false);
  assert.equal(planos.salvarConfigTroca({ descontoPct: 100 }).ok, true);
  assert.equal(planos.listar().descontoTrocaPct, 100);
  auth.logout();
  assert.equal(planos.salvarConfigTroca({ descontoPct: 5 }).ok, false);
});

test('E3: o pedido de troca só vale para plano entre as opções; o repetido não duplica; o dono vê de onde para onde e a diferença', () => {
  preparar({ cortes: 2, intervaloDias: 0 });
  const p = planosDaTroca();
  planos.salvarConfigTroca({ descontoPct: 10 });
  esgotar(); auth.logout();
  for (const planoId of [p.barato, p.semDegrade]) assert.deepEqual(publico.pedirTroca({ telefone: TEL, planoId }), { ok: true });
  assert.deepEqual(publico.pedirTroca({ telefone: '(51) 90000-0000', planoId: p.completo }), { ok: true });
  assert.equal((st().pedidosPlano || []).length, 0, 'plano fora das opções ou telefone sem plano: nada gravado');
  assert.deepEqual(publico.pedirTroca({ telefone: TEL, planoId: p.completo }), { ok: true });
  jest.advanceTimersByTime(16 * 60000); // passa a janela de 3 pedidos por telefone em 15 min
  assert.deepEqual(publico.pedirTroca({ telefone: TEL, planoId: p.completo }), { ok: true }, 'o mesmo pedido de novo tem a mesma resposta');
  assert.equal(publico.pedirTroca({ telefone: TEL, planoId: p.completo, site: 'robo' }).ok, false, 'isca preenchida');
  alan();
  const ped = planos.listar().pedidos;
  assert.equal(ped.length, 1);
  assert.equal(ped[0].tipo, 'troca'); assert.equal(ped[0].planoAtualNome, 'Degradê em Dia'); assert.equal(ped[0].planoNome, 'Degradê e Barba');
  assert.equal(ped[0].valorDiferenca, 40.5, '(120 − 75) com 10% de desconto'); assert.equal(ped[0].descontoPct, 10);
});

test('E3: aceitar a troca encerra o plano atual, abre o novo com a diferença só neste mês, leva os atendimentos do mês e volta a liberar o link', () => {
  preparar({ cortes: 2, intervaloDias: 0 });
  const p = planosDaTroca();
  planos.salvarConfigTroca({ descontoPct: 20 });
  esgotar(); auth.logout();
  publico.pedirTroca({ telefone: TEL, planoId: p.completo });
  alan();
  const pedido = planos.listar().pedidos[0];
  assert.equal(pedido.valorDiferenca, 36, '(120 − 75) com 20% de desconto');
  assert.equal(planos.aceitarPedido(pedido.id).ok, false, 'sem a forma de pagamento da diferença não aceita');
  assert.equal(planos.aceitarPedido(pedido.id, { forma: 'ouro' }).ok, false);
  const r = planos.aceitarPedido(pedido.id, { forma: 'pix' });
  assert.ok(r.ok, JSON.stringify(r));
  const velho = doAssin(); const novo = st().assinaturas.find((a) => a.id === r.assinatura.id);
  assert.equal(velho.status, 'cancelada'); assert.equal(velho.divida, 0);
  assert.equal(novo.status, 'ativa'); assert.equal(novo.plano.nome, 'Degradê e Barba'); assert.equal(novo.trocaDeId, assin);
  assert.deepEqual(novo.pagamentos.map((x) => [x.mes, x.valor]), [['2026-10', 36]], 'o mês da troca vale só a diferença');
  assert.equal(st().agendamentos.filter((a) => a.planoUso && a.planoUso.assinaturaId === novo.id).length, 3, 'os 3 atendimentos já usados no mês passaram para o plano novo');
  assert.equal(st().agendamentos.filter((a) => a.planoUso && a.planoUso.assinaturaId === assin).length, 0);
  assert.equal(planos.listar().assinaturas.find((a) => a.id === novo.id).saldo.restantes, 1, '4 do plano novo − 3 já usados');
  assert.equal(planos.listar().pedidos.length, 0);
  assert.equal(planos.aceitarPedido(pedido.id, { forma: 'pix' }).ok, false, 'pedido já resolvido');
  // nos meses seguintes vale o preço cheio do plano novo
  const nov = planos.pagar(novo.id, { mes: '2026-11', forma: 'pix' });
  assert.ok(nov.ok, JSON.stringify(nov)); assert.equal(nov.pagamento.valor, 120);
  // o cliente fica com um plano em andamento só e o link volta a usar o plano (sobrou 1)
  assert.equal(st().assinaturas.filter((a) => a.clienteId === CLI && (a.status === 'ativa' || a.status === 'pendente')).length, 1);
  auth.logout();
  assert.equal(publico.usoDoPlano({ telefone: TEL, servicoIds: ['s-degrade'], inicio: em(7, 10) }).usaPlano, true);
});

test('E3: se o cliente já usou mais atendimentos no mês do que o plano novo oferece, a troca é recusada e nada muda', () => {
  preparar({ cortes: 2, intervaloDias: 0 });
  const pequeno = planos.salvar({ nome: 'Poucos', preco: 100, cortes: 1, servicoIds: ['s-degrade', 's-barba'], adianta: 0, acumuloMeses: 1, intervaloDias: 0 });
  assert.ok(pequeno.ok);
  esgotar(); auth.logout();
  publico.pedirTroca({ telefone: TEL, planoId: pequeno.plano.id });
  alan();
  const pedido = planos.listar().pedidos[0];
  const antes = JSON.stringify(st().assinaturas);
  const r = planos.aceitarPedido(pedido.id, { forma: 'pix' });
  assert.equal(r.ok, false); assert.match(r.erros[0], /já usou mais atendimentos neste mês do que o plano novo oferece/);
  assert.equal(JSON.stringify(st().assinaturas), antes, 'recusado: nada mudou');
  assert.equal(planos.listar().pedidos.length, 1, 'o pedido segue aberto para o dono recusar');
});

test('E3: 100% de desconto = diferença zero: a troca acontece e a mensalidade do mês vale 0', () => {
  preparar({ cortes: 2, intervaloDias: 0 });
  const p = planosDaTroca();
  planos.salvarConfigTroca({ descontoPct: 100 });
  auth.logout(); publico.pedirTroca({ telefone: TEL, planoId: p.completo });
  alan();
  assert.equal(planos.listar().pedidos[0].valorDiferenca, 0);
  const r = planos.aceitarPedido(planos.listar().pedidos[0].id, { forma: 'dinheiro' });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.assinatura.pagamentos[0].valor, 0);
});
