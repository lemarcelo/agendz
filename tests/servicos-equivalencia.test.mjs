/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Equivalência simulada × real (F2 parte 3): os MESMOS casos de validação de serviço rodam aqui, na API simulada, e no servidor
// (ServicosEquivalenciaTest, no CI). Os nomes de campo do arquivo são os da API real; aqui viram os da simulada (duracaoMin → duracao).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, servicos } from '../src/services/api.js';

const fixture = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/servicos.json', import.meta.url), 'utf8'));
const paraSimulada = (c) => {
  const o = { ...c };
  if ('duracaoMin' in o) { o.duracao = o.duracaoMin; delete o.duracaoMin; }
  if ('intervaloMin' in o) { o.intervalo = o.intervaloMin; delete o.intervaloMin; }
  return o;
};

test.beforeEach(() => {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
});

test('há casos suficientes para valer como contrato', () => {
  assert.ok(fixture.casos.length >= 35);
  assert.ok(fixture.casos.some((c) => c.esperado.ok) && fixture.casos.some((c) => !c.esperado.ok));
});

for (const caso of fixture.casos) {
  test(`serviço (simulada) · ${caso.nome}`, () => {
    const ids = [];
    let r;
    caso.passos.forEach((passo, i) => {
      const trocar = (v) => (typeof v === 'string' && /^@\d+$/.test(v) ? ids[Number(v.slice(1)) - 1] : v);
      const corpo = paraSimulada(structuredClone(passo.corpo));
      if (corpo.componentes) corpo.componentes = corpo.componentes.map(trocar);
      if (passo.editar) corpo.id = trocar(passo.editar);
      r = servicos.salvar(corpo);
      ids.push(r.ok ? r.servico.id : null);
      if (i < caso.passos.length - 1) assert.ok(r.ok, `passo ${i + 1} deveria dar certo: ${JSON.stringify(r)}`);
    });
    assert.equal(r.ok, caso.esperado.ok, JSON.stringify(r));
    if (!caso.esperado.ok) assert.equal(r.erros[0], caso.esperado.erro);
    if (caso.esperado.codigosSeguidos) {
      const [a, b] = ids.slice(0, 2).map((id) => Number(store.getState().servicos.find((x) => x.id === id).codigo));
      assert.equal(b, a + 1, 'o código automático avança de um em um');
    }
  });
}
