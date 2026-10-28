/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Período das telas de comissão do site real: mês `AAAA-MM` ou De/Até em dias `AAAA-MM-DD` (inclusive, até 366). O servidor confere de novo;
// aqui só o que a tela precisa para navegar entre meses e montar o rótulo.
import { fmtMonthYear } from './time.js';

const p2 = (n) => String(n).padStart(2, '0');
export const MAX_DIAS = 366;
export const ehMes = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v));
export const ehDia = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && Number.isFinite(new Date(`${v}T12:00:00`).getTime());

export const mesDe = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
export const diaDe = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export function somarMes(mes, n) {
  if (!ehMes(mes)) return mesDe(Date.now());
  const [a, m] = mes.split('-').map(Number);
  return mesDe(new Date(a, m - 1 + n, 1).getTime());
}
export const rotuloMes = (mes) => (ehMes(mes) ? fmtMonthYear(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1, 1).getTime()) : '');

// Quantos dias o De/Até cobre (inclusive); NaN se alguma data for inválida.
export function diasDoPeriodo(de, ate) {
  if (!ehDia(de) || !ehDia(ate)) return NaN;
  return Math.round((new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime()) / 86400000) + 1;
}

// Valida o De/Até como o servidor: devolve a mensagem ou ''.
export function erroDoPeriodo(de, ate) {
  const n = diasDoPeriodo(de, ate);
  if (!Number.isFinite(n)) return 'Informe as duas datas.';
  if (n < 1) return 'A data final não pode ser antes da inicial.';
  if (n > MAX_DIAS) return `O período pode ter no máximo ${MAX_DIAS} dias.`;
  return '';
}
