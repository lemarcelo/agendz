/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F (V60) no site real (src/services/api-real.js): serviço de duração indefinida (leitura e cadastro), `combinar` da página do cliente, Atender com blocos e valores,
// e o WhatsApp do estabelecimento. Rotas e corpos certos; entrada ruim nem sai do cliente; leitura defensiva.
import { test, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { agenda, configurar, publico, servicos, whatsappLoja } from '../src/services/api-real.js';

const SRV = '00000000-0000-4000-8000-000000000050';
const SRV2 = '00000000-0000-4000-8000-000000000051';
const PROF = '00000000-0000-4000-8000-000000000001';
const ID = '00000000-0000-4000-8000-000000000101';
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined });
    return { ok: status < 400, status, json: async () => resposta, text: async () => JSON.stringify(resposta), headers: { get: () => 'application/json' } };
  };
}
beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('página do cliente: serviço indefinido traz `combinar` limpo; o fixo vem com combinar nulo', async () => {
  servidor({ ativo: true, diasMax: 10, profissionais: [], servicos: [
    { id: SRV, nome: 'Pintura', duracao: 0, preco: 80, antecedenciaH: 0, combinar: { duracaoTexto: 'De 1 a 3 dias', mensagem: 'Oi!', whatsapp: '5553999999999', precoModo: 'lista', opcoes: [{ descricao: 'Simples', valor: 80 }, { descricao: 'Completa', valor: 140 }], precoMax: null, combinaIds: ['segredo'] } },
    { id: SRV2, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 },
    { id: '00000000-0000-4000-8000-000000000052', nome: 'Zap ruim', duracao: 0, preco: 1, combinar: { whatsapp: 'javascript:alert(1)', precoModo: 'qualquer' } },
  ] });
  const r = await publico.pagina();
  const [a, b, c] = r.pagina.servicos;
  assert.equal(a.combinar.whatsapp, '5553999999999'); assert.equal(a.combinar.precoModo, 'lista'); assert.equal(a.combinar.opcoes.length, 2); assert.equal(a.combinar.duracaoTexto, 'De 1 a 3 dias');
  assert.ok(!('combinaIds' in a.combinar), 'a página nunca recebe a lista de pessoas');
  assert.equal(b.combinar, null);
  assert.equal(c.combinar.whatsapp, '', 'número fora do formato é descartado (o botão abre sem contato)'); assert.equal(c.combinar.precoModo, 'fixo');
});

test('serviço indefinido: duracaoMin nulo na leitura; o cadastro envia os campos novos e não envia duração', async () => {
  servidor([{ id: SRV, codigo: '1', nome: 'Pintura', preco: 90, duracaoMin: null, precoModo: 'lista', precoOpcoes: [{ descricao: 'A', valor: 90 }, { descricao: 'B', valor: 120 }], duracaoTexto: 'Dias', combinaIds: [PROF], ativo: true }]);
  const l = await servicos.listar();
  assert.equal(l.servicos[0].duracaoMin, null); assert.equal(l.servicos[0].precoModo, 'lista'); assert.equal(l.servicos[0].precoOpcoes.length, 2); assert.deepEqual(l.servicos[0].combinaIds, [PROF]);
  servidor({ id: SRV, nome: 'Pintura', preco: 90, duracaoMin: null, ativo: true });
  const r = await servicos.salvar({ nome: 'Pintura', duracaoIndefinida: true, preco: 90, duracaoTexto: 'Dias', combinarMsg: 'Oi', precoModo: 'faixa', precoMax: 150, combinaIds: [PROF] });
  assert.equal(r.ok, true);
  const c = chamadas[0].corpo;
  assert.equal(c.duracaoIndefinida, true); assert.equal(c.precoModo, 'faixa'); assert.equal(c.precoMax, 150); assert.deepEqual(c.combinaIds, [PROF]); assert.equal(c.duracaoTexto, 'Dias');
  assert.ok(!('duracaoMin' in c), 'indefinido não manda duração');
});

test('atender com blocos e valores: vão em ISO; blocos sem fim ou demais nem saem do cliente', async () => {
  servidor({ id: ID, profissionalId: PROF, inicio: '2026-11-10T12:00:00Z', status: 'confirmado', origem: 'painel' });
  const i1 = Date.parse('2026-11-10T09:00:00-03:00'), f1 = Date.parse('2026-11-10T10:30:00-03:00'), i2 = Date.parse('2026-11-11T09:00:00-03:00'), f2 = Date.parse('2026-11-11T10:00:00-03:00');
  const r = await agenda.atender({ servicoIds: [SRV], profissionalId: PROF, status: 'confirmado', blocos: [{ inicio: i1, fim: f1 }, { inicio: i2, fim: f2 }], valores: [{ servicoId: SRV, valor: 345.5 }] });
  assert.equal(r.ok, true);
  assert.deepEqual(chamadas[0].corpo.blocos, [{ inicio: new Date(i1).toISOString(), fim: new Date(f1).toISOString() }, { inicio: new Date(i2).toISOString(), fim: new Date(f2).toISOString() }]);
  assert.deepEqual(chamadas[0].corpo.valores, [{ servicoId: SRV, valor: 345.5 }]);
  const antes = chamadas.length;
  const sem = await agenda.atender({ servicoIds: [SRV], blocos: [{ inicio: i1 }] });
  assert.equal(sem.ok, false);
  const demais = await agenda.atender({ servicoIds: [SRV], blocos: Array.from({ length: 201 }, (_, k) => ({ inicio: i1 + k * 7200000, fim: i1 + k * 7200000 + 1800000 })) });
  assert.equal(demais.ok, false);
  const valorRuim = await agenda.atender({ servicoIds: [SRV], blocos: [{ inicio: i1, fim: f1 }], valores: [{ servicoId: SRV, valor: -3 }] });
  assert.equal(valorRuim.ok, false);
  assert.equal(chamadas.length, antes, 'nada disso chegou à rede');
});

test('WhatsApp do estabelecimento: GET e PUT; lê só número válido', async () => {
  servidor({ whatsapp: '5553999999999' });
  assert.deepEqual(await whatsappLoja.obter(), { ok: true, whatsapp: '5553999999999' });
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', 'https://loja.teste/api/estabelecimento/whatsapp']);
  servidor({ whatsapp: 'x' });
  assert.equal((await whatsappLoja.obter()).whatsapp, '');
  servidor({ whatsapp: '5553999999999' });
  const r = await whatsappLoja.salvar('(53) 99999-9999');
  assert.equal(r.ok, true);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url, chamadas[0].corpo], ['PUT', 'https://loja.teste/api/estabelecimento/whatsapp', { whatsapp: '(53) 99999-9999' }]);
});
