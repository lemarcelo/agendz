/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agrupa agendamentos (já ordenados por início) por dia: [{ dia, lista }]. Usado nos "próximos agendamentos" do site real.
import { addDays, fmtDayLong, maiuscula1, sameDay, startOfDay } from './time.js';

export function agruparPorDia(lista) {
  const grupos = [];
  for (const a of lista) {
    const dia = startOfDay(a.inicio);
    const g = grupos[grupos.length - 1];
    if (g && g.dia === dia) g.lista.push(a); else grupos.push({ dia, lista: [a] });
  }
  return grupos;
}

// Título do grupo de um dia: a DATA por extenso. Sem a palavra "Hoje" (a data já diz; pedido do Marcelo, 29/10); só "Amanhã" ganha prefixo.
export const rotuloDoGrupo = (dia, agora) => (sameDay(dia, addDays(startOfDay(agora), 1)) ? `Amanhã · ${maiuscula1(fmtDayLong(dia))}` : maiuscula1(fmtDayLong(dia)));
