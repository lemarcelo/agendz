/* © 2026 Marcelo — Agendz. Todos os direitos reservados. */
import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('Trava Geral de Scroll: módulo travaScroll.js existe e exporta funções necessárias', () => {
  assert.ok(existsSync('src/ui/travaScroll.js'), 'src/ui/travaScroll.js deve existir');
  const codigo = readFileSync('src/ui/travaScroll.js', 'utf8');
  assert.ok(codigo.includes('export function useTravaScroll'), 'Deve exportar useTravaScroll');
  assert.ok(codigo.includes('export function travarScroll'), 'Deve exportar travarScroll');
  assert.ok(codigo.includes('export function destravarScroll'), 'Deve exportar destravarScroll');
  assert.ok(codigo.includes('export function iniciarObservadorModais'), 'Deve exportar iniciarObservadorModais');
  assert.ok(codigo.includes('MutationObserver'), 'Deve conter observador defensivo automático');
});

test('Trava Geral de Scroll: styles.css possui regras obrigatórias de overflow e overscroll', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  assert.ok(css.includes('body.trava-scroll-modal'), 'Deve definir body.trava-scroll-modal');
  assert.ok(css.includes('overflow: hidden !important'), 'Deve travar com overflow: hidden !important');
  assert.ok(css.includes('overscroll-behavior: contain !important'), 'Deve conter overscroll-behavior: contain !important');
});

test('Trava Geral de Scroll: componentes de modal e casca real usam a trava', () => {
  const common = readFileSync('src/ui/common.jsx', 'utf8');
  assert.ok(common.includes('useTravaScroll'), 'Modal em common.jsx deve chamar useTravaScroll');

  const agenda = readFileSync('src/ui/real/Agenda.jsx', 'utf8');
  assert.ok(agenda.includes('useTravaScroll'), 'Agenda.jsx deve chamar useTravaScroll');

  const appReal = readFileSync('src/ui/real/AppReal.jsx', 'utf8');
  assert.ok(appReal.includes('travaScroll.js'), 'AppReal.jsx deve carregar travaScroll.js');
});
