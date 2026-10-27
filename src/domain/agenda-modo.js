/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda em duas formas (v73): Horários (cartões do dia) e Calendário (mês). Valores lidos do navegador são sempre saneados.

// Rolagem lembrada da Agenda: fora do intervalo, volta ao topo.
export function sanearRolagem(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 200000 ? Math.round(n) : 0;
}
export function sanearModoAgenda(v) {
  return v === 'calendario' ? 'calendario' : 'horarios';
}
