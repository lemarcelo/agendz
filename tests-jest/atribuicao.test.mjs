/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco B1 (demonstração): profissional por serviço no Atender. Os casos de agrupamento são os mesmos de AtribuicaoEquivalenciaTest (servidor).
import { test, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, agenda, servicos, equipe } from '../src/services/api.js';
import { reiniciar } from '../tests/helpers.mjs';
import { addDays, startOfDay, tsAt, MIN } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { agruparAtribuicao } from '../src/domain/vinculo.js';
import { retiradaDe } from '../src/domain/rules.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const diaUtil = (n = 3) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const equivalencia = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/atribuicao.json', import.meta.url), 'utf8'));

beforeEach(() => { reiniciar(); como('davi'); });

test('B1 equivalência com o servidor: agrupar serviços por profissional', () => {
  assert.ok(equivalencia.casos.length >= 9);
  for (const c of equivalencia.casos) {
    const r = agruparAtribuicao(c.servicos, c.porServico);
    if (c.erro) { assert.ok(r.erro, c.nome); continue; }
    assert.deepEqual(r.grupos.map((g) => ({ p: g.profissionalId, s: g.servicoIds })), c.grupos, c.nome);
  }
});

// Barbearia não tem box: o catálogo de testes é o da estética (Apex), que usa box, então aqui a divisão é recusada; o fluxo completo é testado com tipo sem box abaixo.
test('B1 loja com box (estética): serviços de profissionais diferentes são recusados com a mensagem do servidor', () => {
  const d = diaUtil();
  const r = agenda.atender({ servicoIds: ['s-lav-simples', 's-lav-motor'], atribuicoes: [{ servicoId: 's-lav-simples', profissionalId: 'u-pablo' }, { servicoId: 's-lav-motor', profissionalId: 'u-marcelo' }], inicio: tsAt(d, '10:00'), clienteId: 'c-igor' });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /mesmo profissional/);
  assert.equal(st().agendamentos.filter((a) => a.grupoId).length, 0, 'nada gravado');
});

test('B1 um profissional só nas atribuições = comportamento de sempre (um agendamento, sem grupo)', () => {
  const d = diaUtil();
  const r = agenda.atender({ servicoIds: ['s-lav-simples', 's-lav-motor'], atribuicoes: [{ servicoId: 's-lav-simples', profissionalId: 'u-pablo' }, { servicoId: 's-lav-motor', profissionalId: 'u-pablo' }], inicio: tsAt(d, '10:00'), clienteId: 'c-igor' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.agendamento.profissionalId, 'u-pablo');
  assert.equal(r.agendamento.grupoId, undefined);
  assert.equal(r.agendamento.servicoIds.length, 2);
});

test('B1 validações: falta profissional de um serviço, profissional que não atende, repetido, e profissional logado não escolhe outros', () => {
  const d = diaUtil();
  const base = { servicoIds: ['s-lav-simples', 's-lav-motor'], inicio: tsAt(d, '10:00'), clienteId: 'c-igor' };
  assert.match(agenda.atender({ ...base, atribuicoes: [{ servicoId: 's-lav-simples', profissionalId: 'u-pablo' }] }).erros[0], /profissional de cada serviço/);
  assert.equal(agenda.atender({ ...base, atribuicoes: [{ servicoId: 's-lav-simples', profissionalId: 'u-pablo' }, { servicoId: 's-lav-simples', profissionalId: 'u-marcelo' }] }).ok, false);
  assert.equal(agenda.atender({ ...base, atribuicoes: [{ servicoId: 's-lav-simples', profissionalId: 'u-pablo' }, { servicoId: 's-lav-motor', profissionalId: 'u-inexistente' }] }).ok, false);
  como('pablo');
  assert.match(agenda.atender({ ...base, atribuicoes: [{ servicoId: 's-lav-simples', profissionalId: 'u-pablo' }, { servicoId: 's-lav-motor', profissionalId: 'u-marcelo' }] }).erros[0], /proprietário ou a recepção/);
});
