/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso de agendamento novo (src/domain/notificacao.js): escolhas guardadas no aparelho saneadas, o que é "aviso novo", texto e alvo da faixa e destaque do cartão.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BIPE, DESTAQUE_MS, PREFS_PADRAO, VIBRACAO, alvoDaFaixa, avisosNovos, chavePrefs, idsParaDestacar, podarDestaques, sanearPrefs, textoDaFaixa } from '../src/domain/notificacao.js';

const av = (id, extra = {}) => ({ id, texto: `Aviso ${id}`, agendamentoId: `ag-${id}`, lido: false, tipo: 'pedido', ...extra });

test('sanearPrefs: só boolean vale; o resto volta ao padrão (tudo ligado)', () => {
  assert.deepEqual(sanearPrefs(null), PREFS_PADRAO);
  assert.deepEqual(sanearPrefs('x'), PREFS_PADRAO);
  assert.deepEqual(sanearPrefs([true]), PREFS_PADRAO);
  assert.deepEqual(sanearPrefs({ som: false, aviso: 'sim', vibracao: 0, extra: true }), { som: false, aviso: true, vibracao: true });
  assert.deepEqual(sanearPrefs({ som: false, aviso: false, vibracao: false }), { som: false, aviso: false, vibracao: false });
  assert.ok(Object.isFrozen(PREFS_PADRAO), 'o padrão não pode ser alterado por engano');
});

test('chavePrefs: uma por loja e por pessoa, sem caractere estranho', () => {
  assert.equal(chavePrefs('dalforno', 'u-1'), 'agendz-aviso:dalforno:u-1');
  assert.notEqual(chavePrefs('dalforno', 'u-1'), chavePrefs('dalforno', 'u-2'));
  assert.notEqual(chavePrefs('apex', 'u-1'), chavePrefs('dalforno', 'u-1'));
  assert.equal(chavePrefs('a/../b', '<x>'), 'agendz-aviso:ab:x');
  assert.equal(chavePrefs('', null), 'agendz-aviso:loja:eu');
});

test('avisosNovos: só o que não foi visto e não está lido', () => {
  const lista = [av('1'), av('2', { lido: true }), av('3'), null, { texto: 'sem id' }];
  assert.deepEqual(avisosNovos(lista, new Set(['1'])).map((a) => a.id), ['3']);
  assert.deepEqual(avisosNovos(lista, new Set()).map((a) => a.id), ['1', '3']);
  assert.deepEqual(avisosNovos('x', new Set()), []);
  assert.deepEqual(avisosNovos(lista, undefined).map((a) => a.id), ['1', '3']);
});

test('textoDaFaixa e alvoDaFaixa', () => {
  assert.equal(textoDaFaixa([]), '');
  assert.equal(textoDaFaixa([av('1', { texto: 'Bruno pediu horário para sexta, 14:00.' })]), 'Bruno pediu horário para sexta, 14:00.');
  assert.equal(textoDaFaixa([av('1'), av('2'), av('3')]), '3 avisos novos na agenda.');
  assert.equal(textoDaFaixa([av('1', { texto: 'x'.repeat(500) })]).length, 200);
  assert.equal(alvoDaFaixa([av('1', { agendamentoId: '' }), av('2')]), 'ag-2');
  assert.equal(alvoDaFaixa([]), '');
});

test('idsParaDestacar e podarDestaques', () => {
  assert.deepEqual(idsParaDestacar([av('1'), av('2'), av('1')]), ['ag-1', 'ag-2']);
  assert.deepEqual(idsParaDestacar([av('1', { agendamentoId: '' })]), []);
  assert.equal(idsParaDestacar(Array.from({ length: 40 }, (_, i) => av(String(i)))).length, 20);
  assert.deepEqual(podarDestaques({ a: 1000, b: 5000, c: 'x' }, 2000), { b: 5000 });
  assert.deepEqual(podarDestaques(null, 0), {});
});

test('bipe sutil: 3 toques baixos e curtos; vibração no mesmo ritmo', () => {
  assert.equal(BIPE.vezes, 3);
  assert.ok(BIPE.volume > 0 && BIPE.volume <= 0.1, 'volume baixo');
  assert.ok(BIPE.duracaoMs <= 200);
  assert.equal(VIBRACAO.length, 5);
  assert.ok(DESTAQUE_MS >= 5000 && DESTAQUE_MS <= 15000);
});
