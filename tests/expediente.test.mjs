/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Horário de funcionamento no site real: regra pura (domain/expediente.js) e rotas (api-real.js `expediente`). Espelho de EscalaService.validar no servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { camposDaSemana, corpoDaSemana, erroDaSemana, minutosDe, resumoDoDia } from '../src/domain/expediente.js';
import { configurar, expediente } from '../src/services/api-real.js';

const semanaAberta = (faixas, dias = [1, 2, 3, 4, 5]) => {
  const o = {};
  for (let d = 0; d < 7; d++) o[d] = dias.includes(d) ? { aberto: true, faixas } : { aberto: false, faixas: [] };
  return { dias: o };
};

test('minutosDe: HH:MM válido, 24:00 como fim do dia, o resto é NaN', () => {
  assert.equal(minutosDe('09:30'), 570); assert.equal(minutosDe('24:00'), 1440);
  for (const ruim of ['9:30', '25:00', '12:60', '', 'abc', null]) assert.ok(Number.isNaN(minutosDe(ruim)), String(ruim));
});

test('camposDaSemana: lê a resposta do servidor (dia fechado sem faixa) e resumoDoDia', () => {
  const c = camposDaSemana({ semana: { 0: { aberto: false, faixas: [] }, 1: { aberto: true, faixas: [['09:00', '12:00'], ['14:00', '18:00']] } } });
  assert.equal(c.dias[1].aberto, true); assert.equal(c.dias[0].aberto, false); assert.equal(c.dias[6].aberto, false);
  assert.equal(resumoDoDia(c.dias[1]), '09:00–12:00 · 14:00–18:00'); assert.equal(resumoDoDia(c.dias[0]), 'Fechado');
  assert.equal(camposDaSemana(null).dias[3].aberto, false);
});

test('erroDaSemana: recusa o que o servidor recusa', () => {
  assert.equal(erroDaSemana(semanaAberta([['09:00', '18:00']])), null);
  assert.equal(erroDaSemana(semanaAberta([['09:00', '12:00'], ['12:00', '18:00']])), null, 'uma faixa pode começar onde a outra termina');
  assert.match(erroDaSemana(semanaAberta([], [])), /pelo menos um dia/);
  assert.match(erroDaSemana(semanaAberta([], [1])), /Segunda: coloque pelo menos um horário/);
  assert.match(erroDaSemana(semanaAberta([['18:00', '09:00']])), /antes do fim/);
  assert.match(erroDaSemana(semanaAberta([['09:00', '09:00']])), /antes do fim/);
  assert.match(erroDaSemana(semanaAberta([['09:00', '13:00'], ['12:00', '18:00']])), /não podem se sobrepor/);
  assert.match(erroDaSemana(semanaAberta([['09:00', '99:00']])), /horário inválido/);
  assert.match(erroDaSemana(semanaAberta(Array.from({ length: 7 }, (_, i) => [`0${i}:00`, `0${i}:30`]))), /no máximo 6/);
});

test('corpoDaSemana: só os dias abertos, faixas em ordem', () => {
  const c = semanaAberta([['14:00', '18:00'], ['09:00', '12:00']], [1]);
  assert.deepEqual(corpoDaSemana(c), { semana: { 1: { aberto: true, faixas: [['09:00', '12:00'], ['14:00', '18:00']] } } });
});

let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined });
    return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => resposta };
  };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('expediente.obter e gravar: rotas, corpo e conferência antes da rede', async () => {
  servidor({ semana: { 1: { aberto: true, faixas: [['09:00', '18:00']] } } });
  const r = await expediente.obter();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/estabelecimento/escala'); assert.equal(chamadas[0].metodo, 'GET');
  assert.equal(r.ok, true); assert.equal(r.escala.semana[1].aberto, true);
  const g = await expediente.gravar(semanaAberta([['09:00', '18:00']], [1, 2]));
  assert.equal(g.ok, true);
  assert.equal(chamadas[1].metodo, 'PUT'); assert.deepEqual(Object.keys(chamadas[1].corpo.semana), ['1', '2']);
  // inválido nem sai do aparelho
  const antes = chamadas.length;
  assert.equal((await expediente.gravar(semanaAberta([['18:00', '09:00']]))).ok, false);
  assert.equal((await expediente.gravar(null)).ok, false);
  assert.equal(chamadas.length, antes);
  // recusa do servidor vira a mensagem dele
  servidor({ mensagem: 'Abra pelo menos um dia da semana' }, 400);
  const e = await expediente.gravar(semanaAberta([['09:00', '18:00']]));
  assert.equal(e.ok, false); assert.equal(e.erro, 'Abra pelo menos um dia da semana');
});
