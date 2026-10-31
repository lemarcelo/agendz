/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Suporte (chamados) na API simulada: o dono vê os da loja, os demais só os próprios; chamado de outro usuário é igual a não existir; fechado não recebe
// mensagem; limites por hora; entrada ruim recusada; selo de não lidas; sem sessão nada funciona. O servidor repete as mesmas regras (SuporteChamadosTest, ChamadosTest).
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, suporte, equipe, chamadosDoUsuario, naoLidasDoSuporte } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';

const st = () => store.getState();
const como = (u) => assert.ok(auth.login({ identificador: u, senha: '1234' }).ok, u);
const usuario = (id) => st().usuarios.find((u) => u.id === id);
const ok = { assunto: 'Não consigo salvar', categoria: 'problema', texto: 'A tela fica branca.' };
// v119: de fábrica só o proprietário abre chamados; estes testes liberam a seção Suporte para os profissionais e a atendente (a regra padrão tem teste próprio).
test.beforeEach(() => { reiniciar(); for (const u of store.getState().usuarios) if (u.papel !== 'dono') u.permissoes = { ...(u.permissoes || {}), suporte: true }; });

test('sem sessão nada funciona', () => {
  auth.logout?.();
  for (const r of [suporte.listar(), suporte.naoLidas(), suporte.abrir(ok), suporte.obter('ch1'), suporte.responder('ch1', 'oi')]) assert.equal(r.ok, false);
});

test('abrir cria o chamado ligado ao usuário da sessão e a demonstração responde sozinha', () => {
  como('pablo');
  const r = suporte.abrir(ok);
  assert.equal(r.ok, true);
  assert.equal(r.chamado.msgs.length, 2);
  assert.equal(r.chamado.msgs[1].autorTipo, 'suporte');
  assert.equal(st().suporteChamados[0].usuarioId, 'u-pablo');
  assert.equal(r.chamado.status, 'em_atendimento');
  // o cliente nunca vê prioridade, atribuição nem nota interna
  for (const k of ['prioridade', 'atribuidoA', 'usuarioId', 'usuarioPapel']) assert.ok(!(k in r.chamado), k);
});

test('a vinculação não vem da entrada: campos de loja ou usuário no corpo são descartados', () => {
  como('pablo');
  const r = suporte.abrir({ ...ok, usuarioId: 'u-davi', usuarioNome: 'Davi', lojaId: 'outra', todos: true, prioridade: 'urgente' });
  assert.equal(r.ok, true);
  const c = st().suporteChamados[0];
  assert.equal(c.usuarioId, 'u-pablo');
  assert.ok(!('prioridade' in c) && !('lojaId' in c));
});

test('dono vê todos os chamados da loja; profissional vê só os próprios; chamado alheio é igual a não existir', () => {
  como('pablo'); const a = suporte.abrir(ok).chamado.id;
  como('marcelo'); const b = suporte.abrir({ ...ok, assunto: 'Dúvida do Marcelo' }).chamado.id;
  como('marcelo');
  assert.deepEqual(suporte.listar().chamados.map((c) => c.id), [b], 'o profissional vê só o dele');
  assert.equal(suporte.obter(a).ok, false);
  assert.equal(suporte.responder(a, 'oi').ok, false);
  assert.equal(st().suporteChamados.find((c) => c.id === a).msgs.length, 2, 'nada foi gravado no chamado alheio');
  como('davi');
  assert.equal(suporte.listar().chamados.length, 2, 'o dono vê os dois');
  assert.equal(suporte.obter(a).ok, true);
  assert.equal(chamadosDoUsuario(st(), usuario('u-davi')).length, 2);
});

test('selo de não lidas: sobe com a resposta da equipe e zera ao abrir', () => {
  como('pablo'); const id = suporte.abrir(ok).chamado.id;
  assert.equal(suporte.naoLidas().naoLidas, 1);
  assert.equal(naoLidasDoSuporte(st(), usuario('u-pablo')), 1);
  assert.equal(suporte.obter(id).chamado.naoLidas, 0);
  assert.equal(suporte.naoLidas().naoLidas, 0);
});

test('entrada ruim é recusada e não grava nada', () => {
  como('pablo');
  const antes = JSON.stringify(st().suporteChamados || []);
  for (const e of [{ ...ok, assunto: '   ' }, { ...ok, texto: '' }, { ...ok, categoria: 'fofoca' }, { ...ok, assunto: 'x'.repeat(121) }, { ...ok, texto: 'y'.repeat(4001) }, null, {}]) assert.equal(suporte.abrir(e).ok, false);
  assert.equal(JSON.stringify(st().suporteChamados || []), antes);
});

test('texto de pessoa fica como texto: controle some e o conteúdo não é interpretado', () => {
  como('pablo');
  const r = suporte.abrir({ assunto: '<img src=x onerror=alert(1)>', categoria: 'duvida', texto: 'ola\u0000\u0007 <script>x</script>\r\nlinha' });
  assert.equal(r.ok, true);
  assert.equal(r.chamado.assunto, '<img src=x onerror=alert(1)>');
  assert.equal(r.chamado.msgs[0].texto, 'ola <script>x</script>\nlinha');
});

test('limite de 5 chamados novos por hora por usuário; outro usuário não é afetado', () => {
  como('pablo');
  for (let i = 0; i < 5; i++) assert.equal(suporte.abrir({ ...ok, assunto: `Assunto ${i}` }).ok, true);
  const r = suporte.abrir(ok);
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /muitos chamados/);
  como('marcelo');
  assert.equal(suporte.abrir(ok).ok, true);
  como('pablo');
  store.avancar(61 * 60000);
  assert.equal(suporte.abrir(ok).ok, true, 'uma hora depois volta a poder');
});

test('limite de 20 mensagens por hora no mesmo chamado', () => {
  como('pablo'); const id = suporte.abrir(ok).chamado.id;
  for (let i = 0; i < 19; i++) assert.equal(suporte.responder(id, `msg ${i}`).ok, true, `msg ${i}`);
  const r = suporte.responder(id, 'a vigésima primeira');
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Muitas mensagens/);
});

test('chamado fechado não recebe mensagem; responder reabre o aguardando/resolvido', () => {
  como('pablo'); const id = suporte.abrir(ok).chamado.id;
  assert.equal(suporte.responder(id, 'obrigado').chamado.status, 'em_atendimento');
  assert.equal(suporte.responder(id, '').ok, false);
  assert.equal(suporte.responder(id, 'x'.repeat(4001)).ok, false);
  // simula o painel fechando (no sistema real é o administrador da plataforma)
  st().suporteChamados.find((x) => x.id === id).status = 'fechado';
  const r = suporte.responder(id, 'ainda aí?');
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Abra um novo chamado/);
});

test('entrada de id estranho não quebra', () => {
  como('pablo');
  for (const id of [undefined, null, 5, {}, 'x'.repeat(60), '../../etc']) { assert.equal(suporte.obter(id).ok, false); assert.equal(suporte.responder(id, 'oi').ok, false); }
});

test('v119: de fábrica só o proprietário abre chamados; o dono libera por usuário e retira; a lista e o selo seguem a mesma regra', () => {
  reiniciar(); // sem a liberação do beforeEach
  como('pablo');
  for (const r of [suporte.listar(), suporte.abrir(ok), suporte.naoLidas()]) assert.equal(r.ok, false, 'profissional sem a seção');
  assert.equal((st().suporteChamados || []).length, 0, 'nada foi gravado');
  como('davi'); assert.ok(suporte.abrir(ok).ok, 'o proprietário abre');
  const pablo = () => store.getState().usuarios.find((u) => u.id === 'u-pablo'); // o estado é clonado a cada escrita: buscar de novo
  pablo().permissoes = { suporte: true };
  como('pablo'); assert.ok(suporte.abrir({ ...ok, assunto: 'Do Pablo' }).ok, 'liberado, abre');
  assert.equal(suporte.listar().chamados.length, 1, 'e vê só o dele');
  pablo().permissoes = { suporte: false };
  como('pablo'); assert.equal(suporte.listar().ok, false, 'retirado, perde o acesso na hora');
  // a seção é liberável pela Equipe (o dono marca no cadastro) e vale como as outras
  como('davi');
  const r = equipe.salvar({ ...pablo(), permissoes: { suporte: true } });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(store.getState().usuarios.find((u) => u.id === 'u-pablo').permissoes.suporte, true);
});
