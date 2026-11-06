/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B6 + E1: pode haver mais de um proprietário; cadastrar, promover e rebaixar proprietário NÃO pede senha (E1), mas ninguém muda o próprio perfil e sempre sobra pelo menos um.
import { test, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, equipe } from '../src/services/api.js';
import { reiniciar } from '../tests/helpers.mjs';

const st = () => store.getState();
const davi = () => st().usuarios.find((u) => u.apelido === 'Davi' || u.id === 'u-davi');
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const base = { nome: 'Sócia Teste', apelido: 'Socia', cpf: '529.982.247-25', email: 'socia@x.com', senha: '1234', papel: 'atendente', permissoes: {} };
beforeEach(() => reiniciar());

test('E1: cadastrar, promover e rebaixar proprietário não pedem senha (um confirmaSenha antigo é ignorado e nunca vai para o estado)', () => {
  como('davi');
  const novo = equipe.salvar({ ...base, papel: 'dono' });
  assert.equal(novo.ok, true, 'sem senha de confirmação');
  assert.equal(novo.usuario.papel, 'dono');
  const outra = equipe.salvar({ ...base, apelido: 'Bia', cpf: '111.444.777-35', email: 'bia@x.com', papel: 'atendente', confirmaSenha: 'qualquer' });
  assert.equal(outra.ok, true, 'campo antigo ignorado, não vira erro');
  assert.ok(!('confirmaSenha' in st().usuarios.find((u) => u.apelido === 'Bia')), 'a senha de confirmação nunca vai para o estado');
  const promover = { ...st().usuarios.find((u) => u.apelido === 'Bia'), senha: '', papel: 'dono' };
  assert.equal(equipe.salvar(promover).ok, true, 'promover sem senha');
  assert.equal(st().usuarios.filter((u) => u.papel === 'dono').length, 3);
  assert.equal(equipe.salvar({ ...promover, papel: 'atendente' }).ok, true, 'rebaixar sem senha');
  assert.equal(st().usuarios.filter((u) => u.papel === 'dono').length, 2);
});

test('E1: ninguém altera o próprio perfil (nem sobrando outro proprietário); o último proprietário nunca é rebaixado', () => {
  como('davi');
  const eu = davi();
  assert.equal(eu.papel, 'dono');
  let r = equipe.salvar({ ...eu, senha: '', papel: 'profissional' });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /não pode alterar o seu próprio perfil/);
  equipe.salvar({ ...base, papel: 'dono' });
  r = equipe.salvar({ ...eu, senha: '', papel: 'admin' });
  assert.equal(r.ok, false, 'com outro proprietário também recusa');
  assert.match(r.erros[0], /não pode alterar o seu próprio perfil/);
  assert.equal(davi().papel, 'dono', 'nada mudou');
  assert.equal(equipe.salvar({ ...eu, senha: '' }).ok, true, 'salvar sem mudar o perfil continua valendo');
});

test('E1: a sócia é rebaixada sem senha; o único proprietário não se rebaixa; remover proprietário exige rebaixar antes', () => {
  como('davi');
  equipe.salvar({ ...base, papel: 'dono' });
  const socia = st().usuarios.find((u) => u.apelido === 'Socia');
  const rem = equipe.remover(socia.id);
  assert.equal(rem.ok, false);
  assert.match(rem.erros[0], /Mude o perfil deste proprietário/);
  assert.equal(equipe.salvar({ ...socia, senha: '', papel: 'atendente' }).ok, true, 'rebaixar sem senha');
  assert.equal(equipe.remover(socia.id).ok, true);
  assert.equal(st().usuarios.filter((u) => u.papel === 'dono').length, 1);
  // o único proprietário que sobrou não consegue se rebaixar (próprio perfil) e ninguém mais pode: só ele é proprietário
  const eu = davi();
  assert.equal(equipe.salvar({ ...eu, senha: '', papel: 'profissional' }).ok, false);
  assert.equal(st().usuarios.filter((u) => u.papel === 'dono').length, 1);
});
