/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Pessoas de exemplo do site publicado: Apex e Offbox = Proprietário + Colaborador 1, 2, 3; Dalforno = só o Alan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarEstadoInicial } from '../src/tipos/estetica_automotiva/seed.js';
import { criarEstadoBarbearia } from '../src/tipos/barbearia/seed.js';
import { PESSOAS_POR_LOJA, comColaboradores, somenteDono } from '../src/services/pessoas-demo.js';

const agora = new Date('2026-10-12T10:00:00-03:00').getTime();
const consistente = (e) => {
  const ids = new Set(e.usuarios.map((u) => u.id));
  assert.equal(ids.size, e.usuarios.length, 'ids repetidos');
  assert.equal(new Set(e.usuarios.map((u) => u.email)).size, e.usuarios.length, 'e-mails repetidos');
  for (const a of e.agendamentos) assert.ok(ids.has(a.profissionalId), `agendamento ${a.id} aponta para ${a.profissionalId}, que não existe`);
};
const apelidos = (e) => e.usuarios.map((u) => u.apelido);

test('apex: Proprietário e Colaborador 1, 2 e 3 (o terceiro é criado)', () => {
  const origem = criarEstadoInicial(agora);
  const e = comColaboradores(origem);
  assert.deepEqual(apelidos(e), ['Proprietário', 'Colaborador 1', 'Colaborador 2', 'Colaborador 3']);
  assert.deepEqual(e.usuarios.map((u) => u.papel), ['dono', 'profissional', 'profissional', 'profissional']);
  consistente(e);
  assert.ok(!/"nome":"(Davi|Pablo)"/.test(JSON.stringify(e)), 'sobrou o nome antigo (cadastro ou registro de quem fez)');
  assert.equal(apelidos(origem)[0], 'Davi', 'a seed original não é alterada');
  assert.ok(e.clientes.some((c) => c.nome === 'Marcelo Santos'), 'cliente de mesmo nome não é renomeado');
});

test('offbox: mesma regra de equipe', () => {
  const e = PESSOAS_POR_LOJA.offbox(criarEstadoBarbearia(agora));
  assert.deepEqual(apelidos(e), ['Proprietário', 'Colaborador 1', 'Colaborador 2', 'Colaborador 3']);
  consistente(e);
  assert.ok(!/Kiko|Tailuan/.test(JSON.stringify(e.usuarios)));
});

test('dalforno: um único usuário, o Alan (proprietário), e a agenda continua válida', () => {
  const origem = criarEstadoBarbearia(agora);
  const e = PESSOAS_POR_LOJA.dalforno(origem);
  assert.equal(e.usuarios.length, 1);
  assert.equal(e.usuarios[0].apelido, 'Alan');
  assert.equal(e.usuarios[0].nome, 'Alan');
  assert.equal(e.usuarios[0].papel, 'dono');
  consistente(e);
  assert.ok(!/u-kiko|u-tailuan|Kiko|Tailuan/.test(JSON.stringify(e)), 'sobrou referência a quem saiu');
  const vivos = e.agendamentos.filter((a) => a.status !== 'cancelado').sort((a, b) => a.inicio - b.inicio);
  for (let i = 1; i < vivos.length; i++) assert.ok(vivos[i].inicio - vivos[i - 1].inicio >= 40 * 60000, 'dois horários do Alan se sobrepõem');
  assert.ok(e.agendamentos.length >= 5, 'a agenda de exemplo não pode esvaziar');
  assert.equal(origem.usuarios.length, 3, 'a seed original não é alterada');
});
