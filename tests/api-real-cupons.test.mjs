/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cupons no site real (src/services/api-real.js, `cupons` e `agenda.aplicarCupom/retirarCupom/atender`): rotas e corpos, a chave nunca sai do cliente,
// validação antes da rede, leitura defensiva (a agenda nunca mostra chave) e a mensagem do servidor chega inteira.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agenda, configurar, cupons } from '../src/services/api-real.js';

const ID = '00000000-0000-4000-8000-000000000101';
const SRV = '00000000-0000-4000-8000-000000000050';
const PROF = '00000000-0000-4000-8000-000000000001';
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined });
    return { ok: status < 400, status, json: async () => resposta, text: async () => JSON.stringify(resposta), headers: { get: () => 'application/json' } };
  };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

const base = { nome: 'Vale lavagem', tipo: 'servico', servicoIds: [SRV], inicio: '2026-10-28', fim: '2026-11-27', usosMax: '50', usosPorCliente: '1' };

test('salvar: cria com POST, edita com PUT; a chave nunca vai no corpo; percentual e valor só do tipo certo', async () => {
  servidor({ id: ID, ...base, usosMax: 50, usosPorCliente: 1, chave: 'ABCD-EFGH-JKLM', ativo: true, situacao: 'vigente', usos: 0 }, 201);
  const r = await cupons.salvar({ ...base, chave: 'AAAA-BBBB-CCCC', percentual: '10', valor: '5' });
  assert.equal(r.ok, true); assert.equal(r.cupom.chave, 'ABCD-EFGH-JKLM');
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/cupons', metodo: 'POST', corpo: { nome: 'Vale lavagem', tipo: 'servico', servicoIds: [SRV], inicio: '2026-10-28', fim: '2026-11-27', usosMax: 50, usosPorCliente: 1 } });
  await cupons.salvar({ ...base, id: ID, tipo: 'percentual', servicoIds: [], percentual: '15,5'.replace(',', '.'), valor: '5' });
  assert.equal(chamadas[1].metodo, 'PUT'); assert.equal(chamadas[1].url, `https://loja.teste/api/cupons/${ID}`);
  assert.equal(chamadas[1].corpo.percentual, 15.5); assert.ok(!('valor' in chamadas[1].corpo)); assert.ok(!('chave' in chamadas[1].corpo));
  await cupons.salvar({ ...base, tipo: 'valor', servicoIds: [], percentual: '10', valor: '12.5' });
  assert.equal(chamadas[2].corpo.valor, 12.5); assert.ok(!('percentual' in chamadas[2].corpo));
});

test('salvar: tipo, serviço, datas e números ruins nem saem do cliente', async () => {
  servidor({});
  const ruins = [{ ...base, tipo: 'mistério' }, { ...base, servicoIds: ['1; drop'] }, { ...base, inicio: 'amanhã' }, { ...base, fim: '' }, { ...base, usosMax: 'muitos' }, { ...base, id: 'ruim' }];
  for (const d of ruins) assert.equal((await cupons.salvar(d)).ok, false);
  assert.equal((await cupons.salvar(null)).ok, false);
  assert.equal(chamadas.length, 0);
});

test('listar, nova chave e remover: rotas certas; id ruim não sai; remover diz se só encerrou', async () => {
  servidor([{ id: ID, nome: 'x'.repeat(200), tipo: 'hack', servicoIds: [SRV, 'lixo'], percentual: 'dez', inicio: '28/10', fim: '2026-11-27', usosMax: 3, chave: 'ABCD-EFGH-JKLM', situacao: 'estranha', usos: 1, extra: 1 }]);
  const l = await cupons.listar();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/cupons');
  const c = l.cupons[0];
  assert.equal(c.nome.length, 60); assert.equal(c.tipo, 'percentual'); assert.deepEqual(c.servicoIds, [SRV]); assert.equal(c.percentual, null); assert.equal(c.inicio, '');
  assert.equal(c.situacao, 'inativo', 'situação desconhecida nunca vira "valendo"'); assert.ok(!('extra' in c));
  servidor({ id: ID, nome: 'A', tipo: 'servico', chave: 'ZZZZ-YYYY-XXXX', situacao: 'vigente' });
  assert.equal((await cupons.novaChave(ID)).cupom.chave, 'ZZZZ-YYYY-XXXX');
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['POST', `https://loja.teste/api/cupons/${ID}/chave`]);
  servidor({ desativado: true });
  assert.deepEqual(await cupons.remover(ID), { ok: true, desativado: true });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['DELETE', `https://loja.teste/api/cupons/${ID}`]);
  servidor({});
  assert.equal((await cupons.novaChave('x')).ok, false); assert.equal((await cupons.remover('x')).ok, false);
  assert.equal(chamadas.length, 0);
});

test('aplicar e retirar na agenda: corpo só com a chave aparada; chave vazia ou id ruim não saem; a resposta traz cupom sem chave e o desconto', async () => {
  servidor({ id: ID, profissionalId: PROF, inicio: '2026-11-03T13:00:00Z', status: 'confirmado', total: 80, desconto: 20, servicos: [{ servicoId: SRV, nome: 'Lavagem', preco: 80, duracaoMin: 60, desconto: 20 }],
    cupom: { cupomId: ID, nome: 'Vale', tipo: 'percentual', chave: 'NUNCA-APARECE-AQUI' } });
  const r = await agenda.aplicarCupom(ID, '  abcd-efgh-jklm  ');
  assert.deepEqual(chamadas[0], { url: `https://loja.teste/api/agendamentos/${ID}/cupom`, metodo: 'POST', corpo: { chave: 'abcd-efgh-jklm' } });
  const a = r.agendamento;
  assert.equal(a.desconto, 20); assert.equal(a.servicos[0].desconto, 20); assert.deepEqual(a.cupom, { nome: 'Vale', tipo: 'percentual' });
  assert.ok(!JSON.stringify(a).includes('NUNCA'), 'a chave nunca chega à tela da agenda');
  servidor({ id: ID, status: 'confirmado', total: 80 });
  const t = await agenda.retirarCupom(ID);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['DELETE', `https://loja.teste/api/agendamentos/${ID}/cupom`]);
  assert.equal(t.agendamento.cupom, null); assert.equal(t.agendamento.desconto, 0);
  const antes = chamadas.length;
  for (const x of [await agenda.aplicarCupom(ID, '   '), await agenda.aplicarCupom(ID, null), await agenda.aplicarCupom('1; drop', 'ABCD'), await agenda.retirarCupom('x')]) assert.equal(x.ok, false);
  assert.equal(chamadas.length, antes);
});

test('atender: cupomChave vai só quando preenchida; a mensagem genérica do servidor chega sem mudar', async () => {
  servidor({ id: ID, status: 'a_confirmar' }, 201);
  const futuro = { servicoIds: [SRV], nome: 'Ana', telefone: '11977776666', inicio: Date.parse('2026-11-03T10:00:00-03:00'), profissionalId: PROF };
  await agenda.atender({ ...futuro, cupomChave: '  abcd-efgh-jklm ' });
  assert.equal(chamadas[0].corpo.cupomChave, 'abcd-efgh-jklm');
  await agenda.atender({ ...futuro, nome: 'Bia', cupomChave: '   ' });
  assert.ok(!('cupomChave' in chamadas[1].corpo));
  servidor({ mensagem: 'Cupom inválido ou indisponível.' }, 400);
  const r = await agenda.atender({ ...futuro, nome: 'Caio', cupomChave: 'ERRADA' });
  assert.deepEqual([r.ok, r.status, r.erro], [false, 400, 'Cupom inválido ou indisponível.']);
});
