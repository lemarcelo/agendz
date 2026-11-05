/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
import * as z from 'zod/mini';

const horario = z.number();

// Validação de entrada da interface; o servidor continua conferindo as regras.
export function validarQuando(inicio, modo, agora) {
  if (!horario.safeParse(inicio).success) return 'Informe a data e a hora.';
  if (modo === 'atendido' && inicio > agora) return 'Informe uma data e hora que já passaram.';
  return '';
}
