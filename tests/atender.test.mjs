// Entrega C: botão único "Atender" (local, passado e futuro), cadastro automático de cliente e campos obrigatórios por tipo.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, estabelecimento, clientes } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a); };
const ag = (id) => st().agendamentos.find((a) => a.id === id);
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const DIA = 24 * 3600 * 1000;
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi'); });

test('só serviço ou só produto basta: sem data vira atendimento de agora, concluído, sem exigir nome nem telefone', () => {
  const n = st().clientes.length;
  const a = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' });
  assert.ok(a.ok, JSON.stringify(a)); assert.equal(a.tipo, 'local'); assert.equal(ag(a.agendamento.id).status, 'concluido'); assert.equal(ag(a.agendamento.id).local, true);
  const p = agenda.atender({ produtos: [{ materialId: 'pr-aromatizante', qtd: 1 }], profissionalId: 'u-pablo' });
  assert.ok(p.ok, JSON.stringify(p)); assert.equal(p.tipo, 'local');
  assert.equal(st().clientes.length, n, 'sem nome nem telefone, sem cadastro');
  const v = agenda.atender({ profissionalId: 'u-pablo' });
  assert.equal(v.ok, false); assert.match(v.erros[0], /serviço ou um produto/);
});

test('data passada: atendimento concluído nessa data e hora; no financeiro a receita fica no dia; futuro dentro do tolerado vira local', () => {
  const ontem = store.agora() - DIA - 3 * 3600 * 1000;
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio: ontem });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.tipo, 'local');
  assert.equal(ag(r.agendamento.id).inicio, ontem - (ontem % 60000)); assert.equal(ag(r.agendamento.id).status, 'concluido');
  const l = st().financeiro.lancamentos.find((x) => x.agendamentoId === r.agendamento.id);
  assert.equal(l.data, startOfDay(ontem), 'receita no dia do atendimento');
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio: store.agora() - 500 * DIA }).ok, false, 'antigo demais');
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio: store.agora() + 30000 }).tipo, 'local');
});

test('telefone cria o cadastro (nome opcional); só nome não cria; mesmo telefone reaproveita e completa o nome', () => {
  const n = st().clientes.length;
  const a = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '(51) 97777-1111' });
  assert.ok(a.ok); assert.equal(st().clientes.length, n + 1);
  const c = st().clientes.find((x) => x.id === ag(a.agendamento.id).clienteId); assert.equal(c.semNome, true);
  const b = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '51977771111', nome: 'Heitor' });
  assert.ok(b.ok); assert.equal(st().clientes.length, n + 1, 'mesmo telefone: não duplica');
  assert.equal(st().clientes.find((x) => x.id === c.id).nome, 'Heitor'); assert.equal(st().clientes.find((x) => x.id === c.id).semNome, undefined);
  const d = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', nome: 'Só nome' });
  assert.ok(d.ok); assert.equal(st().clientes.length, n + 1);
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: '123' }).ok, false);
});

test('data futura vira agendamento: exige nome e telefone por padrão, cria o cadastro, aceita produto e valida horário', () => {
  const inicio = tsAt(dia(9), '10:00');
  const sem = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio });
  assert.equal(sem.ok, false); assert.match(sem.erros[0], /nome, telefone/);
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio, nome: 'Léo' }).ok, false, 'falta o telefone');
  const n = st().clientes.length;
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio, nome: 'Léo', telefone: '(51) 96666-2222', produtos: [{ materialId: 'pr-aromatizante', qtd: 1 }], vendedorId: 'u-pablo' });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.tipo, 'futuro');
  const a = ag(r.agendamento.id);
  assert.equal(a.status, 'a_confirmar'); assert.ok(!a.local); assert.equal(a.inicio, inicio); assert.equal(a.produtos.length, 1);
  assert.equal(st().clientes.length, n + 1); assert.equal(st().clientes.find((x) => x.id === a.clienteId).nome, 'Léo');
  const conf = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio: tsAt(dia(10), '10:00'), nome: 'Léo', telefone: '51966662222', status: 'confirmado' });
  assert.equal(ag(conf.agendamento.id).status, 'confirmado'); assert.equal(st().clientes.length, n + 1, 'cliente reaproveitado');
  const dup = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio: tsAt(dia(10), '10:00'), nome: 'Léo', telefone: '51966662222', status: 'confirmado' });
  assert.equal(dup.ok, false, 'horário já ocupado');
  const soProd = agenda.atender({ produtos: [{ materialId: 'pr-aromatizante', qtd: 1 }], profissionalId: 'u-pablo', inicio, nome: 'X', telefone: '51966663333' });
  assert.equal(soProd.ok, false); assert.match(soProd.erros[0], /ao menos um serviço/);
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio, nome: 'Y', telefone: '51966664444', status: 'concluido' }).ok, false);
});

test('campos obrigatórios por tipo são configuráveis (nome, telefone, esteticista, vendedor, forma de pagamento)', () => {
  assert.ok(estabelecimento.salvar({ camposObrigatorios: { futuro: ['nome', 'telefone', 'profissional'], local: ['nome', 'formaPagamento'] } }).ok);
  const l = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' });
  assert.equal(l.ok, false); assert.match(l.erros[0], /nome/);
  assert.ok(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', nome: 'Bia' }).ok, 'forma padrão conta como preenchida');
  assert.ok(estabelecimento.salvar({ formaPagamentoPadrao: '' }).ok);
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', nome: 'Bia' }).ok, false, 'sem padrão, a forma é obrigatória');
  assert.ok(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', nome: 'Bia', formaPagamento: 'dinheiro' }).ok);
  assert.ok(estabelecimento.salvar({ camposObrigatorios: { futuro: [], local: ['telefone'] } }).ok);
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', formaPagamento: 'pix' }).ok, false);
  const f = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', inicio: tsAt(dia(11), '10:00') });
  assert.equal(f.ok, false); assert.match(f.erros[0], /telefone/, 'agendar sempre pede o telefone');
  for (const ruim of [{ futuro: ['forma'], local: [] }, { futuro: ['formaPagamento'], local: [] }, { futuro: [], local: ['nome', 'nome'] }, { futuro: [] }, 'x'])
    assert.equal(estabelecimento.salvar({ camposObrigatorios: ruim }).ok, false, JSON.stringify(ruim));
});

test('permissões: esteticista só na própria agenda e vende como ele mesmo; sem agenda não atende; cupom só no agendamento', () => {
  como('pablo');
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-marcelo', produtos: [{ materialId: 'pr-aromatizante', qtd: 1 }], vendedorId: 'u-davi' });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(ag(r.agendamento.id).profissionalId, 'u-pablo'); assert.equal(ag(r.agendamento.id).produtos[0].vendedorId, 'u-pablo');
  como('davi');
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', cupomChave: 'AAAA-BBBB-CCCC' }).ok, false, 'cupom em atendimento de agora é recusado');
  auth.logout();
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' }).ok, false);
  assert.equal(clientes.salvar({ nome: 'x', telefone: '51999990000' }).ok, false);
});

test('telefone que já existe sobrescreve o cliente escolhido; nome mais completo atualiza o cadastro; nome incompatível não', () => {
  const igor = st().clientes.find((c) => c.id === 'c-igor');
  const outro = st().clientes.find((c) => c.id !== 'c-igor' && !c.semNome);
  // cliente escolhido na lista + telefone de outro cadastro: vale o do telefone
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', clienteId: outro.id, telefone: igor.telefone });
  assert.ok(r.ok);
  assert.equal(st().agendamentos.find((a) => a.id === r.agendamento.id).clienteId, igor.id);
  // telefone igual ao do escolhido: mantém a escolha
  const r2 = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', clienteId: outro.id, telefone: outro.telefone });
  assert.equal(st().agendamentos.find((a) => a.id === r2.agendamento.id).clienteId, outro.id);
  // nome mais completo (contém o antigo) atualiza o cadastro
  const primeiro = igor.nome.split(' ')[0];
  const r3 = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: igor.telefone, nome: `${igor.nome} Teixeira Neto` });
  assert.ok(r3.ok);
  assert.equal(st().clientes.find((c) => c.id === igor.id).nome, `${igor.nome} Teixeira Neto`);
  // nome menor ou diferente não mexe no cadastro
  const antes = st().clientes.find((c) => c.id === igor.id).nome;
  agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: igor.telefone, nome: primeiro });
  agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', telefone: igor.telefone, nome: 'Totalmente Diferente Do Anterior' });
  assert.equal(st().clientes.find((c) => c.id === igor.id).nome, antes);
  // também vale quando o cliente vem da lista e o nome é completado
  const r4 = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo', clienteId: outro.id, nome: `${outro.nome} Sobrenome Novo` });
  assert.ok(r4.ok); assert.equal(st().clientes.find((c) => c.id === outro.id).nome, `${outro.nome} Sobrenome Novo`);
});

test('nomeMaisCompleto: contém o antigo (sem acento nem maiúscula) e é mais longo', async () => {
  const { nomeMaisCompleto } = await import('../src/domain/engine.js');
  assert.equal(nomeMaisCompleto('João', 'Joao Silva'), true);
  assert.equal(nomeMaisCompleto('João Silva', 'João'), false);
  assert.equal(nomeMaisCompleto('João', 'João'), false);
  assert.equal(nomeMaisCompleto('Ze', 'José Silva'), false);
  assert.equal(nomeMaisCompleto('', 'Alguém'), false);
  assert.equal(nomeMaisCompleto('Ana', 'Beatriz Santos'), false);
});
