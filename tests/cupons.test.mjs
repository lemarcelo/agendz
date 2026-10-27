// Cupons e vales (pedido de 12/10/2026): chave segura, vigência, limite de uso, desconto no valor, WhatsApp e cores únicas da equipe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chat } from '../src/services/chat.js';
import { store, auth, agenda, cupons, whatsapp, equipe, demo } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { ALFABETO, descontosDoCupom, ehHistorico, situacaoDoCupom, gerarChave, igualConstante, normalizarChave } from '../src/domain/cupons.js';
import { coresDaEquipe, contrasteComBranco, corDoSlot, TOTAL_CORES } from '../src/domain/foto.js';
import { totalAgendamento } from '../src/domain/reports.js';
import { relatorioMensal } from '../src/domain/reports.js';
import { faltaDoAgendamento } from '../src/domain/financeiro.js';
import { addDays, startOfDay, tsAt, ymd } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
test.beforeEach(() => reiniciar());

const hoje = () => ymd(store.agora());
const base = { nome: 'Vale teste', tipo: 'servico', servicoIds: ['s-lav-simples', 's-lav-detalhada'], inicio: ymd(addDays(startOfDay(store.agora()), -1)), fim: ymd(addDays(startOfDay(store.agora()), 30)), usosMax: 5, usosPorCliente: 1 };
function criarCupom(extra = {}) { como('davi'); const r = cupons.salvar({ ...base, ...extra }); assert.ok(r.ok, JSON.stringify(r)); return r.cupom; }
const HORAS = [9, 10, 14, 15, 16];
let hi = 0;
function marcar({ cliente = 'c-igor', servicos = ['s-lav-simples'], quando = dia(2), profissional = 'u-pablo' } = {}) {
  como('davi');
  const r = agenda.criar({ clienteId: cliente, profissionalId: profissional, servicoIds: servicos, inicio: tsAt(quando, `${String(HORAS[hi++ % HORAS.length]).padStart(2, '0')}:00`), status: 'a_confirmar' });
  assert.ok(r.ok, JSON.stringify(r));
  return r.agendamento;
}

test('chave: 12 símbolos sem 0, O, 1, I; aleatória e sem repetição; normaliza o que a pessoa digita', () => {
  const vistas = new Set();
  for (let i = 0; i < 3000; i++) { const k = gerarChave(); assert.match(k, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.ok(![...k.replace(/-/g, '')].some((c) => !ALFABETO.includes(c))); vistas.add(k); }
  assert.equal(vistas.size, 3000);
  assert.equal(normalizarChave(' lava vale 4m7x '), 'LAVA-VALE-4M7X');
  assert.equal(normalizarChave('LAVA-VALE-4M7'), null, 'curta');
  assert.equal(normalizarChave('LAVA-VALE-4M70'), null, 'tem zero');
  assert.equal(normalizarChave('LAVA-VALE-4MOX'), null, 'tem O');
  assert.equal(normalizarChave({ toString() { return 'x'; } }), null);
  assert.ok(igualConstante('ABC', 'ABC') && !igualConstante('ABC', 'ABD') && !igualConstante('ABC', 'AB'));
});

test('descontos: vale cobre um serviço (o mais caro que ele cobre); % por serviço; R$ do mais caro ao mais barato; nunca passa do valor', () => {
  const itens = [{ id: 'a', valor: 40 }, { id: 'b', valor: 35 }, { id: 'c', valor: 10 }];
  assert.deepEqual(descontosDoCupom({ tipo: 'servico', servicoIds: ['a', 'b'] }, itens), { a: 40 });
  assert.deepEqual(descontosDoCupom({ tipo: 'servico', servicoIds: ['zz'] }, itens), {});
  assert.deepEqual(descontosDoCupom({ tipo: 'percentual', servicoIds: [], percentual: 10 }, itens), { a: 4, b: 3.5, c: 1 });
  assert.deepEqual(descontosDoCupom({ tipo: 'percentual', servicoIds: ['b'], percentual: 100 }, itens), { b: 35 });
  assert.deepEqual(descontosDoCupom({ tipo: 'valor', servicoIds: [], valor: 50 }, itens), { a: 40, b: 10 });
  assert.deepEqual(descontosDoCupom({ tipo: 'valor', servicoIds: [], valor: 500 }, itens), { a: 40, b: 35, c: 10 });
  assert.deepEqual(descontosDoCupom(null, itens), {});
  assert.deepEqual(descontosDoCupom({ tipo: 'percentual', percentual: 'abc' }, itens), {});
});

test('só quem tem o menu Estabelecimento cria, vê a chave e gerencia cupons; a chave nasce no servidor', () => {
  como('pablo');
  assert.equal(cupons.listar().ok, false);
  assert.equal(cupons.salvar(base).ok, false);
  como('davi');
  const r = cupons.salvar({ ...base, chave: 'AAAA-BBBB-CCCC', id: undefined });
  assert.ok(r.ok);
  assert.notEqual(r.cupom.chave, 'AAAA-BBBB-CCCC', 'a chave não vem do cliente');
  assert.match(r.cupom.chave, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(cupons.listar().cupons.some((c) => c.id === r.cupom.id));
  como('pablo');
  assert.equal(cupons.novaChave(r.cupom.id).ok, false);
  assert.equal(cupons.remover(r.cupom.id).ok, false);
});

test('validação do cadastro do cupom', () => {
  como('davi');
  for (const ruim of [
    { nome: '' }, { nome: 'x'.repeat(61) }, { tipo: 'outro' }, { tipo: 'servico', servicoIds: [] }, { servicoIds: ['nao-existe'] },
    { tipo: 'percentual', percentual: 0 }, { tipo: 'percentual', percentual: 101 }, { tipo: 'valor', valor: 0 }, { tipo: 'valor', valor: 20000 },
    { inicio: 'ontem' }, { fim: ymd(addDays(startOfDay(store.agora()), -10)) }, { usosMax: 0 }, { usosMax: 100000 }, { usosPorCliente: 0 }, { usosPorCliente: 101 },
    { servicoIds: Array.from({ length: 11 }, (_, i) => `s${i}`) },
  ]) assert.equal(cupons.salvar({ ...base, ...ruim }).ok, false, JSON.stringify(ruim));
  assert.ok(cupons.salvar({ ...base, tipo: 'percentual', percentual: 15, servicoIds: [] }).ok);
  assert.ok(cupons.salvar({ ...base, tipo: 'valor', valor: 12.5, servicoIds: [] }).ok);
});

test('cupom aplicado reduz o total; vale de graça zera o serviço; sai a linha no valor do WhatsApp', () => {
  const c = criarCupom();
  const a = marcar({ servicos: ['s-lav-simples', 's-lav-motor'] });
  assert.equal(totalAgendamento(st(), a), 75);
  const r = agenda.aplicarCupom(a.id, c.chave.toLowerCase());
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.desconto, 40);
  assert.equal(totalAgendamento(st(), st().agendamentos.find((x) => x.id === a.id)), 35);
  assert.ok(st().agendamentos.find((x) => x.id === a.id).log.some((l) => l.campo === 'cupom'));
  const v = whatsapp.valoresDoHorario(a.id, st().clientes.find((x) => x.id === a.clienteId).telefone);
  assert.equal(v.total, 35); assert.equal(v.descontos, 40); assert.equal(v.cupom, 'Vale teste');
  assert.equal(agenda.aplicarCupom(a.id, c.chave).ok, false, 'um cupom por horário');
  assert.ok(agenda.retirarCupom(a.id).ok);
  assert.equal(totalAgendamento(st(), st().agendamentos.find((x) => x.id === a.id)), 75);
});

test('vale que cobre tudo deixa o horário em R$ 0 e sem nada a cobrar no Pix', () => {
  const c = criarCupom();
  const a = marcar({ servicos: ['s-lav-simples'] });
  assert.ok(agenda.aplicarCupom(a.id, c.chave).ok);
  const x = st().agendamentos.find((i) => i.id === a.id);
  assert.equal(totalAgendamento(st(), x), 0);
  assert.equal(faltaDoAgendamento(st(), x), 0);
});

test('editar os serviços recalcula o desconto; o cupom não vale se o serviço sai do horário', () => {
  const c = criarCupom({ servicoIds: ['s-lav-motor'] });
  const a = marcar({ servicos: ['s-lav-simples', 's-lav-motor'] });
  assert.equal(agenda.aplicarCupom(a.id, c.chave).desconto, 35);
  assert.ok(agenda.editarServicos(a.id, ['s-lav-simples']).ok);
  assert.equal(totalAgendamento(st(), st().agendamentos.find((x) => x.id === a.id)), 40, 'sem o serviço, sem desconto');
});

test('vigência: antes e depois das datas não valem (o vencido vai para o histórico); o último dia vale até 23h59', () => {
  const futuro = criarCupom({ nome: 'Futuro', inicio: ymd(addDays(startOfDay(store.agora()), 5)), fim: ymd(addDays(startOfDay(store.agora()), 9)) });
  const vencido = criarCupom({ nome: 'Vencido', inicio: ymd(addDays(startOfDay(store.agora()), -9)), fim: ymd(addDays(startOfDay(store.agora()), -2)) });
  const hojeUltimo = criarCupom({ nome: 'Hoje', inicio: hoje(), fim: hoje() });
  const a = marcar();
  for (const c of [futuro, vencido]) assert.equal(agenda.aplicarCupom(a.id, c.chave).ok, false, c.nome);
  assert.match(agenda.aplicarCupom(a.id, futuro.chave).erros[0], /ainda não começou/);
  assert.match(agenda.aplicarCupom(a.id, vencido.chave).erros[0], /venceu/);
  assert.ok(agenda.aplicarCupom(a.id, hojeUltimo.chave).ok);
});

test('limite de usos: total e por cliente; cancelar o horário devolve o uso', () => {
  const c = criarCupom({ usosMax: 2, usosPorCliente: 1 });
  const a1 = marcar({ cliente: 'c-igor' }); const a2 = marcar({ cliente: 'c-igor' }); const a3 = marcar({ cliente: 'c-jon' }); const a4 = marcar({ cliente: 'c-marcelo' });
  assert.ok(agenda.aplicarCupom(a1.id, c.chave).ok);
  assert.match(agenda.aplicarCupom(a2.id, c.chave).erros[0], /máximo de vezes/, 'mesmo cliente de novo');
  assert.ok(agenda.aplicarCupom(a3.id, c.chave).ok);
  assert.match(agenda.aplicarCupom(a4.id, c.chave).erros[0], /usado até o limite/);
  assert.ok(agenda.cancelar(a1.id).ok);
  assert.ok(agenda.aplicarCupom(a4.id, c.chave).ok, 'o uso do horário cancelado voltou');
});

test('criar já com o cupom; cupom inválido não deixa o agendamento criado', () => {
  const c = criarCupom();
  const antes = st().agendamentos.length;
  const ruim = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(dia(3), '10:00'), status: 'a_confirmar', cupomChave: 'AAAA-BBBB-CCCC' });
  assert.equal(ruim.ok, false); assert.equal(st().agendamentos.length, antes);
  const bom = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(dia(3), '10:00'), status: 'a_confirmar', cupomChave: c.chave });
  assert.ok(bom.ok); assert.equal(bom.desconto, 40);
  assert.equal(agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(dia(3), '11:00'), cupomChave: { x: 1 } }).ok, false);
});

test('mudar o cupom não mexe em horário que já o usou; nova chave invalida a antiga; remover com uso só desativa', () => {
  const c = criarCupom({ tipo: 'percentual', percentual: 10, servicoIds: [] });
  const a = marcar({ servicos: ['s-lav-simples'] });
  assert.equal(agenda.aplicarCupom(a.id, c.chave).desconto, 4);
  assert.ok(cupons.salvar({ ...base, id: c.id, tipo: 'percentual', percentual: 50, servicoIds: [] }).ok);
  assert.equal(totalAgendamento(st(), st().agendamentos.find((x) => x.id === a.id)), 36, 'continua com 10%');
  const antiga = st().cupons.find((x) => x.id === c.id).chave;
  const n = cupons.novaChave(c.id); assert.ok(n.ok); assert.notEqual(n.cupom.chave, antiga);
  const b = marcar({ cliente: 'c-jon' });
  assert.equal(agenda.aplicarCupom(b.id, antiga).ok, false);
  assert.ok(agenda.aplicarCupom(b.id, n.cupom.chave).ok);
  const rm = cupons.remover(c.id); assert.ok(rm.ok && rm.desativado);
  assert.equal(st().cupons.find((x) => x.id === c.id).ativo, false);
  assert.equal(cupons.salvar({ ...base, id: c.id }).ok, false, 'cupom encerrado não se altera');
  assert.equal(cupons.novaChave(c.id).ok, false);
  const sem = criarCupom({ nome: 'Sem uso' });
  assert.ok(cupons.remover(sem.id).ok); assert.ok(!st().cupons.some((x) => x.id === sem.id));
});

test('só horário a confirmar ou confirmado aceita cupom; esteticista só mexe no horário dele', () => {
  const c = criarCupom();
  const a = marcar({ profissional: 'u-pablo' });
  como('marcelo');
  assert.equal(agenda.aplicarCupom(a.id, c.chave).ok, false, 'esteticista de outro horário');
  como('pablo');
  assert.ok(agenda.aplicarCupom(a.id, c.chave).ok, 'o esteticista do horário aplica a chave que o cliente deu');
  como('davi');
  agenda.cancelar(a.id);
  assert.equal(agenda.retirarCupom(a.id).ok, false);
});

test('WhatsApp: chave errada, vencida ou esgotada dão a mesma resposta; 5 erros bloqueiam o número; só o dono do número usa', () => {
  const c = criarCupom();
  const vencido = criarCupom({ nome: 'Vencido', inicio: ymd(addDays(startOfDay(store.agora()), -9)), fim: ymd(addDays(startOfDay(store.agora()), -2)) });
  const a = marcar({ cliente: 'c-igor' });
  const tel = st().clientes.find((x) => x.id === 'c-igor').telefone;
  const errada = whatsapp.usarCupom(a.id, tel, 'AAAA-BBBB-CCCC');
  const velha = whatsapp.usarCupom(a.id, tel, vencido.chave);
  assert.equal(errada.erros[0], velha.erros[0], 'não revela se a chave existe');
  assert.equal(whatsapp.usarCupom(a.id, st().clientes.find((x) => x.id === 'c-jon').telefone, c.chave).ok, false, 'telefone de outro cliente');
  for (let i = 0; i < 5; i++) whatsapp.usarCupom(a.id, tel, `AAAA-BBBB-CC${i + 2}${i + 2}`);
  const bloqueado = whatsapp.usarCupom(a.id, tel, c.chave);
  assert.equal(bloqueado.ok, false); assert.match(bloqueado.erros[0], /Muitas tentativas/, 'nem a chave certa passa durante o bloqueio');
  store.avancar(16 * 60000);
  const livre = whatsapp.usarCupom(a.id, tel, c.chave);
  assert.ok(livre.ok, JSON.stringify(livre));
  assert.equal(whatsapp.usarCupom(a.id, tel, { x: 1 }).ok, false);
});

test('relatório mensal soma os descontos dos atendimentos concluídos', () => {
  const c = criarCupom();
  const a = marcar({ servicos: ['s-lav-simples'] });
  agenda.aplicarCupom(a.id, c.chave);
  const x = st().agendamentos.find((i) => i.id === a.id);
  x.status = 'concluido'; x.servicosFeitos = ['s-lav-simples'];
  const rel = relatorioMensal(st(), { mesTs: x.inicio });
  const linha = rel.linhas.find((l) => l.a.id === a.id);
  assert.equal(linha.descontos, 40); assert.equal(linha.total, 0);
  assert.equal(rel.totais.descontos >= 40, true);
});

// ---------- cores sem repetição ----------
test('cores de quem não tem foto: 36 cores diferentes, todas legíveis com a inicial branca', () => {
  const todas = Array.from({ length: TOTAL_CORES }, (_, i) => corDoSlot(i));
  assert.equal(new Set(todas).size, TOTAL_CORES);
  for (const c of todas) { const [hh, s, l] = c.match(/\d+/g).map(Number); assert.ok(contrasteComBranco(hh, s, l) >= 4.5, c); }
});

test('cada pessoa da equipe tem uma cor só dela, mesmo com 15 esteticistas e mesmo se a cor gravada estiver duplicada', () => {
  como('davi');
  assert.ok(demo.profissionaisExemplo([]).ok);
  const equipeTodos = st().usuarios;
  assert.equal(equipeTodos.length, 15);
  const cores = coresDaEquipe(equipeTodos);
  assert.equal(new Set([...cores.values()]).size, 15, 'nenhuma repetida');
  assert.equal(new Set(equipeTodos.map((u) => u.cor).filter((x) => x !== undefined)).size, equipeTodos.filter((u) => u.cor !== undefined).length, 'cores gravadas distintas');
  const duplicado = equipeTodos.map((u) => ({ ...u, cor: 3 }));
  assert.equal(new Set([...coresDaEquipe(duplicado).values()]).size, 15, 'duplicata é consertada na leitura');
  assert.ok(equipe.salvar({ nome: 'Novo Esteticista', apelido: 'Novo', cpf: '529.982.247-25', email: 'novo@x.com', senha: '1234', papel: 'profissional' }).ok);
  const novo = st().usuarios.find((u) => u.apelido === 'Novo');
  assert.ok(!equipeTodos.some((u) => u.cor === novo.cor), 'o novo recebe uma cor livre');
  assert.equal(equipe.salvar({ id: novo.id, nome: 'Novo Esteticista', apelido: 'Novo', cpf: '529.982.247-25', email: 'novo@x.com', papel: 'profissional', cor: 0 }).ok, true);
  assert.equal(st().usuarios.find((u) => u.id === novo.id).cor, novo.cor, 'a cor não vem do cliente');
});

test('histórico: cupom vencido ou encerrado sai da lista de valendo e não se altera; "ativo" não vem do cliente', () => {
  const vigente = criarCupom({ nome: 'Valendo' });
  const vencido = criarCupom({ nome: 'Vencido', inicio: ymd(addDays(startOfDay(store.agora()), -9)), fim: ymd(addDays(startOfDay(store.agora()), -2)) });
  assert.equal(situacaoDoCupom(st(), st().cupons.find((x) => x.id === vigente.id), store.agora()), 'vigente');
  assert.equal(ehHistorico(situacaoDoCupom(st(), st().cupons.find((x) => x.id === vencido.id), store.agora())), true);
  assert.equal(cupons.salvar({ ...base, id: vencido.id, fim: ymd(addDays(startOfDay(store.agora()), 40)) }).ok, false, 'não dá para reviver estendendo a data');
  assert.equal(cupons.novaChave(vencido.id).ok, false);
  const forcado = cupons.salvar({ ...base, nome: 'Forçado', ativo: false });
  assert.ok(forcado.ok); assert.equal(forcado.cupom.ativo, true);
  // passa o tempo: o cupom que valia hoje vira histórico sozinho
  store.avancar(40 * 86400000);
  assert.equal(ehHistorico(situacaoDoCupom(st(), st().cupons.find((x) => x.id === vigente.id), store.agora())), true);
});

test('conversa do WhatsApp: "Tenho um cupom" pede a chave, aplica e mostra o novo total; chave errada recebe a resposta genérica', () => {
  como('davi');
  const c = cupons.salvar({ ...base, nome: 'Vale do chat', servicoIds: ['s-higien-interna'] }).cupom;
  chat.reiniciar();
  const ag = st().agendamentos.find((a) => a.clienteId === 'c-marcelo' && a.status === 'a_confirmar' && a.servicoIds.includes('s-higien-interna'));
  assert.ok(ag, 'o exemplo tem horário do Marcelo com degradê');
  const ult = () => chat.threadAtual().mensagens.filter((m) => m.de === 'bot').at(-1);
  chat.enviar('oi');
  chat.enviar('', `ag:${ag.id}`);
  assert.ok(ult().botoes.some((b) => b.valor === `cup:${ag.id}`), 'botão Tenho um cupom');
  chat.enviar('', `cup:${ag.id}`);
  assert.match(ult().texto, /chave do seu cupom/i);
  chat.enviar('AAAA-BBBB-CCCC');
  assert.match(ult().texto, /Cupom inválido ou indisponível/);
  chat.enviar('', `cup:${ag.id}`);
  chat.enviar(c.chave.toLowerCase());
  assert.match(ult().texto, /Cupom aplicado/);
  assert.match(ult().texto, /Vale do chat: − R\$\s?40,00/);
  assert.equal(st().agendamentos.find((a) => a.id === ag.id).cupom.nome, 'Vale do chat');
  chat.enviar('', `ag:${ag.id}`);
  assert.ok(!ult().botoes.some((b) => b.valor === `cup:${ag.id}`), 'já tem cupom: não oferece de novo');
});
