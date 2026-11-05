/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
import { describe, expect, test } from '@jest/globals';
import { validarQuando } from '../src/domain/validar-quando.js';
import { tipoDoAtendimento } from '../src/domain/atender-form.js';

describe('horário do atendimento', () => {
  const agora = 1000000;
  test('recusa horário ausente ou inválido', () => {
    expect(validarQuando(null, 'data', agora)).toBe('Informe a data e a hora.');
    expect(validarQuando(NaN, 'data', agora)).toBe('Informe a data e a hora.');
  });
  test('atendido aceita passado e recusa horário futuro', () => {
    expect(validarQuando(agora - 1000, 'atendido', agora)).toBe('');
    expect(validarQuando(agora + 1000, 'atendido', agora)).toMatch(/já passaram/);
    expect(validarQuando(agora + 1000, 'data', agora)).toBe('');
  });
  test('respeita a tolerância entre atendimento local e futuro', () => {
    expect(tipoDoAtendimento(agora + 60000, agora)).toBe('local');
    expect(tipoDoAtendimento(agora + 60001, agora)).toBe('futuro');
  });
});
