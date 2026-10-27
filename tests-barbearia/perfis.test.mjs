// Perfil atendente e liberação de menus por usuário (decisão de 12/10/2026); foto de barbeiro e barbeiros de exemplo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, equipe, demo } from '../src/services/api.js';
import { pode, SECOES_LIBERAVEIS, limparPermissoes, ehGestor } from '../src/domain/rules.js';
import { fotoValida, corDaPessoa } from '../src/domain/foto.js';

const st = () => store.getState();
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
test.beforeEach(() => store.reiniciar());
const base = { nome: 'Ana Recepção', apelido: 'Ana', cpf: '529.982.247-25', email: 'ana@x.com', senha: '1234', papel: 'atendente', permissoes: {} };

test('relatórios nunca é liberável: só proprietário e master (barbeiro vê só os próprios números)', () => {
  assert.ok(!SECOES_LIBERAVEIS.includes('relatorios'));
  for (const papel of ['admin', 'atendente']) assert.equal(pode({ papel, permissoes: { relatorios: true } }, 'relatorios'), false);
  assert.equal(pode({ papel: 'dono' }, 'relatorios'), true);
  assert.equal(pode({ papel: 'master' }, 'relatorios'), true);
  assert.equal(pode({ papel: 'profissional', permissoes: { relatorios: false } }, 'relatorios'), true);
  assert.deepEqual(limparPermissoes({ relatorios: true, agenda: false, financeiro: true, x: true, estoque: 'sim' }), { agenda: false, financeiro: true });
});

test('atendente começa com agenda, clientes e serviços e sem o resto; o proprietário libera ou bloqueia qualquer menu', () => {
  const a = { papel: 'atendente', permissoes: {} };
  assert.deepEqual(SECOES_LIBERAVEIS.filter((k) => pode(a, k)), ['clientes', 'servicos', 'agenda']);
  assert.equal(pode({ ...a, permissoes: { financeiro: true } }, 'financeiro'), true);
  assert.equal(pode({ ...a, permissoes: { agenda: false } }, 'agenda'), false);
  assert.equal(pode({ papel: 'profissional', permissoes: { estoque: true } }, 'estoque'), true);
  assert.equal(pode({ papel: 'profissional', permissoes: { clientes: false } }, 'clientes'), false);
  assert.equal(pode({ papel: 'admin', permissoes: {} }, 'agenda'), false);
  assert.ok(ehGestor(a) && !ehGestor({ papel: 'profissional' }));
});

test('só o dono cadastra atendente; a escolha de menus é gravada e o relatório continua fechado', () => {
  como('kiko');
  assert.equal(equipe.salvar(base).ok, false);
  como('alan');
  const r = equipe.salvar({ ...base, permissoes: { financeiro: true, estoque: false, relatorios: true } });
  assert.ok(r.ok, JSON.stringify(r));
  const u = st().usuarios.find((x) => x.apelido === 'Ana');
  assert.equal(u.papel, 'atendente'); assert.equal(u.atende, false);
  assert.deepEqual(u.permissoes, { financeiro: true, estoque: false });
  assert.equal(equipe.salvar({ ...base, apelido: 'Bia', cpf: '111.444.777-35', email: 'b@x.com', papel: 'gerente' }).ok, false);
  como('ana');
  assert.equal(pode(st().usuarios.find((x) => x.apelido === 'Ana'), 'relatorios'), false);
});

test('atendente vê a agenda de todos, mas não troca o próprio perfil nem a equipe', () => {
  como('alan'); equipe.salvar(base); como('ana');
  assert.equal(equipe.salvar({ id: st().usuarios.find((x) => x.apelido === 'Ana').id, ...base, papel: 'dono' }).ok, false);
  assert.equal(equipe.remover('u-kiko').ok, false);
});

test('foto: só png/jpeg/webp de verdade, e a cor de quem não tem foto é estável', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  assert.equal(fotoValida(png), true);
  assert.equal(fotoValida('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
  assert.equal(fotoValida('data:image/png;base64,AAAA'), false);
  assert.equal(fotoValida('javascript:alert(1)'), false);
  assert.equal(corDaPessoa('u-kiko'), corDaPessoa('u-kiko'));
  assert.notEqual(corDaPessoa('u-kiko'), corDaPessoa('u-alan'));
  como('kiko');
  assert.equal(equipe.minhaFoto('data:text/html;base64,PGI+').ok, false);
  assert.ok(equipe.minhaFoto(png).ok);
  assert.equal(st().usuarios.find((u) => u.id === 'u-kiko').foto, png);
  assert.ok(equipe.minhaFoto(null).ok);
  assert.equal(st().usuarios.find((u) => u.id === 'u-kiko').foto, null);
});

test('barbeiros de exemplo: só o dono, 12 novos, todos com horário no mesmo dia, sem repetir', () => {
  como('kiko');
  assert.equal(demo.profissionaisExemplo([]).ok, false);
  como('alan');
  const r = demo.profissionaisExemplo(['data:image/png;base64,naoeimagem', null]);
  assert.ok(r.ok && r.criados === 12, JSON.stringify(r));
  assert.equal(st().usuarios.filter((u) => u.atende).length, 15);
  assert.ok(st().usuarios.filter((u) => u.id.startsWith('u-ex')).every((u) => u.foto === null), 'foto inválida é ignorada');
  const doDia = st().agendamentos.filter((a) => a.inicio >= r.dia && a.inicio < r.dia + 86400000);
  const profissionais = new Set(doDia.map((a) => a.profissionalId));
  assert.ok(st().usuarios.filter((u) => u.id.startsWith('u-ex')).every((u) => profissionais.has(u.id)), 'todos os novos têm horário no dia');
  assert.equal(demo.profissionaisExemplo([]).criados, 0, 'não duplica');
});
