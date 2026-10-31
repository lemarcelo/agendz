/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B6: pode haver mais de um proprietário; promover, rebaixar ou cadastrar um proprietário pede a senha de quem faz; sempre sobra pelo menos um.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, equipe } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';

const st = () => store.getState();
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const base = { nome: 'Sócia Teste', apelido: 'Socia', cpf: '529.982.247-25', email: 'socia@x.com', senha: '1234', papel: 'atendente', permissoes: {} };
test.beforeEach(() => reiniciar());

test('cadastrar, promover e rebaixar proprietário pedem a senha de quem faz (errada = recusa e nada muda)', () => {
  como('davi');
  assert.equal(equipe.salvar({ ...base, papel: 'dono' }).ok, false, 'sem senha');
  assert.equal(equipe.salvar({ ...base, papel: 'dono', confirmaSenha: 'errada' }).ok, false, 'senha errada');
  assert.ok(!st().usuarios.some((u) => u.apelido === 'Socia'), 'nada gravado');
  const novo = equipe.salvar({ ...base, papel: 'dono', confirmaSenha: '1234' });
  assert.equal(novo.ok, true);
  assert.equal(novo.usuario.papel, 'dono');
  assert.ok(!('confirmaSenha' in st().usuarios.find((u) => u.apelido === 'Socia')), 'a senha de confirmação nunca vai para o estado');
  const outra = equipe.salvar({ ...base, apelido: 'Bia', cpf: '111.444.777-35', email: 'bia@x.com' });
  assert.equal(outra.ok, true, 'perfil sem proprietário não pede senha');
  const promover = { ...st().usuarios.find((u) => u.apelido === 'Bia'), senha: '', papel: 'dono' };
  assert.equal(equipe.salvar(promover).ok, false);
  assert.equal(equipe.salvar({ ...promover, confirmaSenha: '1234' }).ok, true);
  assert.equal(st().usuarios.filter((u) => u.papel === 'dono').length, 3);
});

test('rebaixar o último proprietário é recusado; com outro proprietário pode; remover proprietário exige rebaixar antes', () => {
  como('davi');
  const davi = () => st().usuarios.find((u) => u.apelido === 'Davi' || u.id === 'u-davi');
  const eu = davi();
  assert.equal(eu.papel, 'dono');
  const rebaixar = { ...eu, senha: '', papel: 'profissional', confirmaSenha: '1234' };
  const r = equipe.salvar(rebaixar);
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /pelo menos um proprietário/);
  equipe.salvar({ ...base, papel: 'dono', confirmaSenha: '1234' });
  const socia = st().usuarios.find((u) => u.apelido === 'Socia');
  const rem = equipe.remover(socia.id);
  assert.equal(rem.ok, false);
  assert.match(rem.erros[0], /Mude o perfil deste proprietário/);
  assert.equal(equipe.salvar({ ...socia, senha: '', papel: 'atendente' }).ok, false, 'rebaixar também pede a senha');
  assert.equal(equipe.salvar({ ...socia, senha: '', papel: 'atendente', confirmaSenha: '1234' }).ok, true);
  assert.equal(equipe.remover(socia.id).ok, true);
  assert.equal(st().usuarios.filter((u) => u.papel === 'dono').length, 1);
});
