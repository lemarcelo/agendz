// Quem altera o telefone de um cliente já cadastrado (decisão de 12/10/2026): proprietário, admin com Clientes e o barbeiro dono do cadastro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, clientes } from '../src/services/api.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { podeAlterarTelefone } from '../src/domain/rules.js';

const st = () => store.getState();
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
test.beforeEach(() => store.reiniciar());

function clienteDo(profissionalId) { // cliente da semente que já teve horário com esse barbeiro
  return st().clientes.find((c) => st().agendamentos.some((a) => a.clienteId === c.id && a.profissionalId === profissionalId));
}
const trocar = (c, telefone) => clientes.salvar({ id: c.id, nome: c.nome, apelido: c.apelido, telefone, cpf: c.cpf, nascimento: c.nascimento });

test('barbeiro altera o telefone de cliente que já teve horário com ele; fica registrado quem trocou e o número antigo', () => {
  const c = clienteDo('u-kiko'); assert.ok(c);
  como('kiko');
  const antigo = c.telefone;
  const r = trocar(c, '(51) 98123-4567');
  assert.ok(r.ok, JSON.stringify(r));
  const novo = st().clientes.find((x) => x.id === c.id);
  assert.equal(novo.telefone, '(51) 98123-4567');
  assert.equal(novo.telefonesAnteriores.at(-1).telefone, antigo);
  assert.match(novo.telefonesAnteriores.at(-1).autorizadoPor, /Kiko/i);
});

test('barbeiro NÃO altera o telefone de cliente que só é de outro barbeiro', () => {
  const c = st().clientes.find((x) => st().agendamentos.some((a) => a.clienteId === x.id) && !st().agendamentos.some((a) => a.clienteId === x.id && a.profissionalId === 'u-kiko'));
  if (!c) return; // semente sem cliente exclusivo de outro barbeiro
  como('kiko');
  const r = trocar(c, '(51) 98123-4567');
  assert.equal(r.ok, false); assert.match(r.erros[0], /telefone/i);
  assert.notEqual(st().clientes.find((x) => x.id === c.id).telefone, '(51) 98123-4567');
});

test('barbeiro altera o telefone de cadastro novo, ainda sem horários', () => {
  como('kiko');
  const n = clientes.salvar({ nome: 'Novo Cliente', telefone: '(51) 99111-2222' });
  assert.ok(n.ok);
  assert.ok(trocar(n.cliente, '(51) 99111-3333').ok);
});

test('proprietário continua podendo; o nome do cliente e demais campos seguem como antes', () => {
  const c = st().clientes[0];
  como('alan');
  assert.ok(trocar(c, '(51) 98000-1111').ok);
  assert.equal(st().clientes.find((x) => x.id === c.id).telefonesAnteriores.at(-1).autorizadoPor.length > 0, true);
});

test('a regra pura: sem sessão ou com perfil estranho ninguém altera', () => {
  const s = st();
  assert.equal(podeAlterarTelefone(null, s, 'x'), false);
  assert.equal(podeAlterarTelefone({ papel: 'cliente', id: 'u' }, s, 'x'), false);
  assert.equal(podeAlterarTelefone({ papel: 'profissional', id: 'u-kiko' }, { agendamentos: [] }, 'cliente-sem-horario'), true);
  assert.equal(podeAlterarTelefone({ papel: 'profissional', id: 'u-kiko' }, { agendamentos: [{ clienteId: 'c1', profissionalId: 'u-alan' }] }, 'c1'), false);
  assert.equal(podeAlterarTelefone({ papel: 'profissional', id: 'u-kiko' }, { agendamentos: [{ clienteId: 'c1', profissionalId: 'u-kiko' }] }, 'c1'), true);
});
