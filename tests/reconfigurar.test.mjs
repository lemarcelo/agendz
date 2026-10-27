/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Reconfigurar o estabelecimento (assistente reaberto em Estabelecimento): o adaptador da pré-visualização só ADICIONA e nunca grava; serviços que a loja
// já tem aparecem como existentes, os que ela não tem (apagados) voltam a aparecer para marcar; o expediente mostrado é o atual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, servicos } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { criarAdaptadorDemo } from '../src/services/onboarding-demo.js';

const st = () => store.getState();

test('reconfigurar: serviços da loja aparecem como já existentes e um serviço apagado volta para marcar', async () => {
  reiniciar();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const a = criarAdaptadorDemo({ reconfigurar: true });
  let { estado } = await a.carregar();
  assert.equal(estado.concluido, true);
  assert.ok(estado.servicos.length >= 3);
  assert.equal(estado.jaCadastrados.length, estado.servicos.length, 'a loja de exemplo já tem todos');
  // tira o histórico de um serviço (só no teste) para a remoção apagar de verdade em vez de só desativar
  const alvo = st().servicos.find((x) => !x.combo && !st().servicos.some((y) => (y.componentes || []).includes(x.id)));
  assert.ok(alvo);
  const ags = st().agendamentos; for (let i = ags.length - 1; i >= 0; i--) if (ags[i].servicoIds.includes(alvo.id)) ags.splice(i, 1);
  assert.ok(servicos.remover(alvo.id).ok);
  assert.ok(!st().servicos.some((x) => x.id === alvo.id), 'apagou de verdade');
  ({ estado } = await criarAdaptadorDemo({ reconfigurar: true }).carregar());
  assert.ok(!estado.jaCadastrados.includes(alvo.id), 'o serviço apagado volta a poder ser marcado');
  assert.ok(estado.servicos.some((s) => s.chave === alvo.id));
});

test('reconfigurar: o expediente mostrado é o atual da loja e nada é gravado', async () => {
  reiniciar();
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const antes = JSON.stringify({ s: st().servicos, u: st().usuarios, e: st().estabelecimento.escala });
  const a = criarAdaptadorDemo({ reconfigurar: true });
  const { estado } = await a.carregar();
  assert.deepEqual(estado.expediente.semana[1].faixas, st().estabelecimento.escala.semana[1].faixas);
  assert.equal((await a.servicos([])).ok, true);
  const eq = await a.equipe([{ nome: 'Zeca Novo', atende: true }]);
  assert.equal(eq.ok, true); assert.match(eq.pessoas[0].login, /^zeca/);
  assert.equal((await a.expediente({ 1: { aberto: true, faixas: [['10:00', '11:00']] } })).ok, true);
  assert.equal(JSON.stringify({ s: st().servicos, u: st().usuarios, e: st().estabelecimento.escala }), antes, 'a pré-visualização não grava nada');
});

test('reconfigurar: o primeiro acesso (sem a opção) continua começando do zero', async () => {
  reiniciar();
  const { estado } = await criarAdaptadorDemo().carregar();
  assert.equal(estado.concluido, false);
  assert.equal(estado.jaCadastrados.length, 0);
});
