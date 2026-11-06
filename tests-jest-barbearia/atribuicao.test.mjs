// Bloco B1 (barbearia, sem box): profissional por serviço no Atender → um agendamento por profissional, em sequência, ligados pelo mesmo grupo.
import { test, jest, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda } from '../src/services/api.js';
import { addDays, startOfDay, tsAt, MIN } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { retiradaDe } from '../src/domain/rules.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a); };
const dia = (n = 3) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
beforeEach(() => { jest.useRealTimers(); store.reiniciar(); como('alan'); });

const dois = (d, extra = {}) => ({ servicoIds: ['s-tesoura', 's-barba'], inicio: tsAt(d, '10:00'), clienteId: 'c-igor', atribuicoes: [{ servicoId: 's-tesoura', profissionalId: 'u-kiko' }, { servicoId: 's-barba', profissionalId: 'u-tailuan' }], ...extra });

test('B1 futuro: dois profissionais viram dois agendamentos em sequência, ligados pelo mesmo grupo, cada um na agenda do seu profissional', () => {
  const d = dia();
  const r = agenda.atender(dois(d));
  assert.ok(r.ok, JSON.stringify(r));
  const lista = st().agendamentos.filter((a) => a.grupoId && a.grupoId === r.agendamento.grupoId).sort((x, y) => x.inicio - y.inicio);
  assert.equal(lista.length, 2);
  assert.equal(JSON.stringify(lista.map((a) => a.profissionalId)), JSON.stringify(['u-kiko', 'u-tailuan']));
  assert.equal(JSON.stringify(lista.map((a) => a.servicoIds)), JSON.stringify([['s-tesoura'], ['s-barba']]));
  assert.equal(lista[0].inicio, tsAt(d, '10:00'));
  assert.equal(lista[1].inicio, retiradaDe(st(), lista[0]), 'o segundo começa quando o primeiro termina (a duração soma)');
  assert.equal(lista[0].clienteId, 'c-igor'); assert.equal(lista[1].clienteId, 'c-igor');
});

test('B1 futuro: ocupa a agenda de cada um; segundo profissional ocupado no horário dele recusa o pedido INTEIRO (nada fica gravado)', () => {
  const d = dia(4);
  // o Tailuan já está ocupado às 10:40 (quando a barba começaria)
  assert.ok(agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-tailuan', servicoIds: ['s-tesoura'], inicio: tsAt(d, '10:40'), status: 'confirmado' }).ok);
  const antes = st().agendamentos.length;
  const r = agenda.atender(dois(d, { status: 'confirmado' }));
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /confirmado para outro cliente|não atende/);
  assert.equal(st().agendamentos.length, antes, 'recusado não grava nenhuma das partes');
});

test('B1 só quem realiza o serviço pode receber a parte dele (A1 vale para cada parte)', () => {
  const d = dia(5);
  const kiko = st().usuarios.find((u) => u.id === 'u-kiko');
  assert.ok(agenda && true);
  kiko.servicoIds = ['s-maquina']; // simula o vínculo: o Kiko não faz tesoura (estado interno do teste)
  const r = agenda.atender(dois(d));
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Kiko não realiza o serviço/);
});

test('B1 local (já aconteceu): dois atendimentos concluídos, em sequência, ligados pelo mesmo grupo; produto e vendedor ficam no primeiro', () => {
  const r = agenda.atender({ servicoIds: ['s-tesoura', 's-barba'], atribuicoes: [{ servicoId: 's-tesoura', profissionalId: 'u-kiko' }, { servicoId: 's-barba', profissionalId: 'u-tailuan' }], formaPagamento: 'pix', produtos: [{ materialId: 'pr-pomada', qtd: 1 }], vendedorId: 'u-kiko' });
  assert.ok(r.ok, JSON.stringify(r));
  const lista = st().agendamentos.filter((a) => a.grupoId && a.grupoId === r.agendamento.grupoId);
  assert.equal(lista.length, 2);
  assert.ok(lista.every((a) => a.status === 'concluido' && a.local === true));
  assert.equal(lista.filter((a) => (a.produtos || []).length).length, 1, 'o produto só entra uma vez');
  assert.ok(lista.every((a) => a.inicio <= store.agora()), 'nada vai para o futuro');
});

test('B1 comissão de cada serviço vai ao profissional dele', () => {
  const r = agenda.atender({ servicoIds: ['s-tesoura', 's-barba'], atribuicoes: [{ servicoId: 's-tesoura', profissionalId: 'u-kiko' }, { servicoId: 's-barba', profissionalId: 'u-tailuan' }], formaPagamento: 'pix' });
  assert.ok(r.ok, JSON.stringify(r));
  const lista = st().agendamentos.filter((a) => a.grupoId === r.agendamento.grupoId);
  assert.equal(lista.length, 2);
  const doKiko = lista.find((a) => a.profissionalId === 'u-kiko'); const doTailuan = lista.find((a) => a.profissionalId === 'u-tailuan');
  assert.deepEqual(Object.keys(doKiko.comissoes), ['s-tesoura'], 'a comissão da tesoura fica com quem fez a tesoura');
  assert.deepEqual(Object.keys(doTailuan.comissoes), ['s-barba'], 'a comissão da barba fica com quem fez a barba');
});
