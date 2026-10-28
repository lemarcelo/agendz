/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Período das telas de comissão do site real (src/domain/periodo-comissao.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { diasDoPeriodo, ehDia, ehMes, erroDoPeriodo, mesDe, somarMes } from '../src/domain/periodo-comissao.js';

test('mês AAAA-MM: valida, soma meses atravessando o ano e acha o mês de um instante', () => {
  assert.equal(ehMes('2026-10'), true);
  for (const x of ['2026-13', '2026-00', '26-10', 'outubro', '', null, '2026-1']) assert.equal(ehMes(x), false, String(x));
  assert.equal(somarMes('2026-10', 1), '2026-11');
  assert.equal(somarMes('2026-12', 1), '2027-01');
  assert.equal(somarMes('2026-01', -1), '2025-12');
  assert.equal(somarMes('2026-10', 14), '2027-12');
  assert.equal(mesDe(new Date(2026, 9, 28, 12).getTime()), '2026-10');
});

test('dias: valida o formato e a data e conta o período inclusive', () => {
  assert.equal(ehDia('2026-10-28'), true);
  for (const x of ['2026-10-32', '28/10/2026', '', undefined]) assert.equal(ehDia(x), false, String(x));
  assert.equal(diasDoPeriodo('2026-10-01', '2026-10-01'), 1);
  assert.equal(diasDoPeriodo('2026-10-01', '2026-10-31'), 31);
  assert.equal(diasDoPeriodo('2026-03-01', '2026-04-01'), 32, 'atravessa o horário de verão sem errar o dia');
  assert.ok(Number.isNaN(diasDoPeriodo('2026-10-01', 'x')));
});

test('mensagens do De/Até são as mesmas do servidor', () => {
  assert.equal(erroDoPeriodo('2026-10-01', '2026-10-31'), '');
  assert.equal(erroDoPeriodo('2026-10-10', '2026-10-01'), 'A data final não pode ser antes da inicial.');
  assert.equal(erroDoPeriodo('2025-01-01', '2026-01-02'), 'O período pode ter no máximo 366 dias.');
  assert.equal(erroDoPeriodo('2025-01-01', '2026-01-01'), '', '366 dias exatos passam; 367 não');
  assert.equal(erroDoPeriodo('', '2026-10-01'), 'Informe as duas datas.');
});
