/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B9b (v133): ordem configurável da tela Atender. Casos compartilhados com o servidor (equivalencia/ordem-atender.json) + API simulada.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, estabelecimento } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { COMO_A_PAGINA_DO_CLIENTE, PADRAO_ARTIFACT, PADRAO_PAINEL, moverItem, ordemAtenderValida, sanearOrdemAtender } from '../src/domain/ordem-atender.js';

const casos = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/ordem-atender.json', import.meta.url), 'utf8')).casos;
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); });

for (const c of casos) {
  test(`ordem do Atender · ${c.nome}`, () => {
    assert.equal(ordemAtenderValida(c.entrada), c.valida);
    assert.deepEqual(sanearOrdemAtender(c.entrada, PADRAO_PAINEL), c.esperado);
  });
}

test('padrões de fábrica: painel = Cliente primeiro; demonstração = Serviços primeiro; "página do cliente" põe o porte primeiro', () => {
  assert.equal(PADRAO_PAINEL.futuro.etapas[0], 'cliente');
  assert.equal(PADRAO_ARTIFACT.futuro.etapas[0], 'servicos');
  assert.deepEqual(sanearOrdemAtender(undefined, PADRAO_ARTIFACT), PADRAO_ARTIFACT);
  assert.equal(COMO_A_PAGINA_DO_CLIENTE.local.veiculo[0], 'porte');
  assert.deepEqual(sanearOrdemAtender(COMO_A_PAGINA_DO_CLIENTE), COMO_A_PAGINA_DO_CLIENTE);
});

test('moverItem sobe e desce e nas pontas não faz nada', () => {
  assert.deepEqual(moverItem(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepEqual(moverItem(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepEqual(moverItem(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(moverItem(['a', 'b', 'c'], 'x', 1), ['a', 'b', 'c']);
});

test('API simulada: só o dono grava; lixo é recusado; valor salvo é completado; sem escolha vale a fábrica', () => {
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  assert.equal(store.getState().estabelecimento.ordemAtender, undefined, 'sem escolha nada é gravado');
  assert.equal(estabelecimento.salvar({ ordemAtender: { futuro: { etapas: 'x' } } }).ok, false);
  const r = estabelecimento.salvar({ ordemAtender: { futuro: { veiculo: ['porte'] } } });
  assert.ok(r.ok, JSON.stringify(r));
  assert.deepEqual(store.getState().estabelecimento.ordemAtender.futuro.veiculo, ['porte', 'placa', 'modelo', 'marca', 'cor']);
  assert.deepEqual(store.getState().estabelecimento.ordemAtender.local.etapas, PADRAO_ARTIFACT.local.etapas, 'o que não foi enviado fica na fábrica da demonstração');
  auth.logout();
  assert.ok(auth.login({ identificador: 'pablo', senha: '1234' }).ok);
  assert.equal(estabelecimento.salvar({ ordemAtender: COMO_A_PAGINA_DO_CLIENTE }).ok, false, 'profissional não grava');
});
