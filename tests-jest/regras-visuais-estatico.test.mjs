/* © 2026 Marcelo — Agendz. Todos os direitos reservados. */
import { test, describe } from '@jest/globals';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

describe('Diretrizes Visuais Automatizadas (Abas, Hints e Faturamento)', () => {
  test('Transição Suave de Abas: styles.css deve conter animação e transições para abas', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    assert.ok(
      css.includes('.abas') && (css.includes('transition') || css.includes('@keyframes')),
      'Deve haver transição suave configurada para as abas'
    );
  });

  test('Menu e Ícones: P em icones.js deve estar preparado para apoiar Faturamento (cifrão)', () => {
    assert.ok(existsSync('src/ui/icones.js'), 'src/ui/icones.js deve existir');
    const icones = readFileSync('src/ui/icones.js', 'utf8');
    // Deve conter ícone de moeda/cifrão ou carteira para faturamento
    assert.ok(
      icones.includes('dollar:') || icones.includes('wallet:'),
      'icones.js deve conter ícone representativo de moeda/faturamento'
    );
  });

  test('Diretrizes Mandatórias: SKILL.md e AGENTS.md devem registrar as regras de abas suaves e hints', () => {
    const skill = readFileSync('.agents/skills/agendz-visual/SKILL.md', 'utf8');
    assert.ok(skill.includes('Transição Suave Obrigatória em Abas'), 'SKILL.md deve conter regra de abas suaves');
    assert.ok(skill.includes('Hints Explicativos em Blocos de Resultados'), 'SKILL.md deve conter regra de hints');

    const agents = readFileSync('AGENTS.md', 'utf8');
    assert.ok(agents.includes('transição suave com animação CSS'), 'AGENTS.md deve exigir transição de abas');
    assert.ok(agents.includes('hint explicativo'), 'AGENTS.md deve exigir hint explicativo');
  });
});
