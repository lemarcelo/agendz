// Código de serviço e produto (auto incremento, editável, único por tipo), busca por nome ou código e ordem dos últimos usados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, servicos, estoque, agenda } from '../src/services/api.js';
import { proximoCodigo, codigoValido, casaBusca, porUltimoUso, atribuirCodigos } from '../src/domain/codigo.js';

const st = () => store.getState();
test.beforeEach(() => { store.reiniciar(); assert.ok(auth.login({ identificador: 'alan', senha: '1234' }).ok); });
const novoServico = (extra = {}) => servicos.salvar({ nome: 'Sobrancelha ' + Math.random(), preco: 10, duracao: 15, ...extra });

test('o seed dá código a serviços e produtos, em sequência, sem repetir', () => {
  const cs = st().servicos.map((s) => s.codigo);
  assert.deepEqual(cs, cs.map((_, i) => String(i + 1)));
  const ps = st().materiais.filter((m) => m.tipo === 'produto');
  assert.ok(ps.length >= 2 && ps.every((p) => p.codigo));
  assert.equal(new Set(ps.map((p) => p.codigo)).size, ps.length);
  assert.ok(st().materiais.filter((m) => m.tipo !== 'produto').every((m) => !m.codigo), 'material de consumo não tem código');
});

test('serviço novo recebe o próximo número; código informado vale; editar sem código mantém o que já tinha', () => {
  const n = st().servicos.length;
  const a = novoServico(); assert.ok(a.ok); assert.equal(a.servico.codigo, String(n + 1));
  const b = novoServico({ codigo: 'BAR-9' }); assert.ok(b.ok); assert.equal(b.servico.codigo, 'BAR-9');
  const c = novoServico(); assert.equal(c.servico.codigo, String(n + 2), 'letras no código não entram na conta do próximo');
  const e = servicos.salvar({ ...a.servico, codigo: '', nome: 'Renomeado' }); assert.ok(e.ok);
  assert.equal(st().servicos.find((x) => x.id === a.servico.id).codigo, String(n + 1));
  assert.ok(servicos.salvar({ ...a.servico, codigo: '50' }).ok);
  assert.equal(novoServico().servico.codigo, '51', 'o próximo parte do maior número');
});

test('código repetido (sem diferenciar maiúscula) ou inválido é recusado, por tipo', () => {
  assert.equal(novoServico({ codigo: '1' }).ok, false, 'já é de outro serviço');
  assert.equal(novoServico({ codigo: ' 1 ' }).ok, false);
  assert.ok(novoServico({ codigo: 'x1' }).ok);
  assert.equal(novoServico({ codigo: 'X1' }).ok, false);
  for (const c of ['a b', 'a'.repeat(21), 'á1', '<b>', '1;2']) assert.equal(novoServico({ codigo: c }).ok, false, c);
  const p = st().materiais.find((m) => m.tipo === 'produto');
  assert.equal(estoque.salvarMaterial({ ...p, codigo: st().materiais.filter((m) => m.tipo === 'produto').find((m) => m.id !== p.id).codigo }).ok, false, 'dois produtos não repetem');
  const unico = novoServico({ codigo: 'ZZ9' }); assert.ok(unico.ok);
  assert.equal(estoque.salvarMaterial({ nome: 'Pomada x', tipo: 'produto', preco: 20, codigo: 'ZZ9' }).ok, true, 'serviço e produto têm listas separadas');
});

test('produto novo recebe o próximo código; material de consumo não tem código; virar material limpa', () => {
  const r = estoque.salvarMaterial({ nome: 'Shampoo', tipo: 'produto', preco: 25 });
  assert.ok(r.ok);
  const max = Math.max(...st().materiais.filter((m) => m.tipo === 'produto' && m.id !== r.material.id).map((m) => Number(m.codigo)));
  assert.equal(r.material.codigo, String(max + 1));
  const mat = estoque.salvarMaterial({ nome: 'Papel', tipo: 'material' }); assert.ok(mat.ok); assert.equal(mat.material.codigo, null);
  const aMaterial = estoque.salvarMaterial({ ...r.material, tipo: 'material' }); assert.ok(aMaterial.ok);
  assert.equal(st().materiais.find((m) => m.id === r.material.id).codigo, null);
});

test('busca por nome (sem acento) ou código', () => {
  const l = [{ nome: 'Corte Degradê', codigo: '12' }, { nome: 'Barba', codigo: '120' }, { nome: 'Pomada', codigo: 'PM-1' }];
  assert.deepEqual(l.filter((x) => casaBusca(x, 'degrade')).map((x) => x.nome), ['Corte Degradê']);
  assert.deepEqual(l.filter((x) => casaBusca(x, '12')).map((x) => x.nome), ['Corte Degradê', 'Barba']);
  assert.deepEqual(l.filter((x) => casaBusca(x, 'pm')).map((x) => x.nome), ['Pomada']);
  assert.equal(l.filter((x) => casaBusca(x, '  ')).length, 3);
  assert.equal(codigoValido('PM-1.a_'), true);
});

test('últimos usados primeiro: mais recente no topo, cancelado não conta, quem nunca foi usado fica no fim na ordem do cadastro', () => {
  const sv = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const h = [
    { status: 'concluido', servicoIds: ['a'], servicosFeitos: ['a', 'd'], criadoEm: 100 },
    { status: 'confirmado', servicoIds: ['c'], criadoEm: 300 },
    { status: 'cancelado', servicoIds: ['b'], criadoEm: 900 },
    { status: 'concluido', servicoIds: ['a'], servicosFeitos: ['a'], criadoEm: 200 },
  ];
  assert.deepEqual(porUltimoUso(sv, h, 'servico').map((x) => x.id), ['c', 'a', 'd', 'b']);
  assert.deepEqual(porUltimoUso(sv, [], 'servico').map((x) => x.id), ['a', 'b', 'c', 'd']);
  const pr = [{ id: 'p1' }, { id: 'p2' }];
  assert.deepEqual(porUltimoUso(pr, [{ status: 'concluido', produtos: [{ materialId: 'p2' }], criadoEm: 5 }], 'produto').map((x) => x.id), ['p2', 'p1']);
});

test('na prática: o serviço que acabou de ser feito sobe ao topo', () => {
  agenda.registrarLocal({ servicoIds: ['s-barba'], profissionalId: 'u-kiko' });
  assert.equal(porUltimoUso(st().servicos, st().agendamentos, 'servico')[0].id, 's-barba');
  const l = [{ id: 'x', codigo: '' }, { id: 'y', codigo: '4' }, { id: 'z' }]; atribuirCodigos(l);
  assert.deepEqual(l.map((i) => i.codigo), ['5', '4', '6']);
  assert.equal(proximoCodigo([]), '1');
});
