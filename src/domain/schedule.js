/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:3fc3eb7c0b */
// Escalas: dias da semana, horários e exceções (feriados, folgas, períodos fora, horários diferentes).
// A mesma estrutura serve para o estabelecimento e para cada profissional.
import { addDays, dow, fromYmd, MIN, startOfDay, tsAt, ymd } from './time.js';

export const TIPOS_EXCECAO = {
  feriado: 'Feriado',
  folga: 'Folga (day off)',
  periodo: 'Período fora',
  horario: 'Horário diferente',
};

export function escalaPadrao(dias = [1, 2, 3, 4, 5, 6], faixas = [['08:00', '12:00'], ['14:00', '19:00']]) {
  const semana = {};
  for (let d = 0; d < 7; d++) {
    semana[d] = { aberto: dias.includes(d), faixas: dias.includes(d) ? faixas.map((f) => [...f]) : [] };
  }
  return { semana, excecoes: [] };
}

// Exceção que vale para o dia. As que fecham o dia vencem a de horário diferente.
export function excecaoDoDia(escala, dayTs) {
  const key = ymd(dayTs);
  const lista = (escala.excecoes || []).filter((e) => e.inicio <= key && key <= (e.fim || e.inicio));
  return lista.find((e) => e.tipo !== 'horario') || lista[0] || null;
}

export function faixasDoDia(escala, dayTs) {
  const day = startOfDay(dayTs);
  const ex = excecaoDoDia(escala, day);
  if (ex && ex.tipo !== 'horario') return [];
  const faixas = ex && ex.tipo === 'horario' ? ex.faixas : escala.semana[dow(day)]?.aberto ? escala.semana[dow(day)].faixas : [];
  return faixas.map(([a, b]) => [tsAt(day, a), tsAt(day, b)]);
}

export function intersect(a, b) {
  const out = [];
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const s = Math.max(a0, b0);
      const e = Math.min(a1, b1);
      if (s < e) out.push([s, e]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

export function faixasDoProfissional(estab, profissional, dayTs) {
  return intersect(faixasDoDia(estab.escala, dayTs), faixasDoDia(profissional.escala, dayTs));
}

// Serviço que atravessa o fim do expediente (vitrificação, polimento técnico…): gasta `minutos` de trabalho só no tempo em que o estabelecimento
// e o profissional estão abertos, a partir de `inicio` (que precisa cair dentro de uma faixa). Devolve os blocos [ini, fim] em que há trabalho,
// ou null se `inicio` não é horário de trabalho ou o serviço não termina em `maxDias` dias. O carro fica no box entre um bloco e outro.
export const MAX_DIAS_SERVICO = 10;
export function blocosDeTrabalho(estab, profissional, inicio, minutos, maxDias = MAX_DIAS_SERVICO) {
  const blocos = [];
  let falta = minutos;
  const dia0 = startOfDay(inicio);
  for (let i = 0; i < maxDias && falta > 0; i++) {
    for (const [a, b] of faixasDoProfissional(estab, profissional, addDays(dia0, i))) {
      const de = Math.max(a, inicio);
      if (de >= b) continue;
      if (!blocos.length && de !== inicio) return null; // a entrada precisa ser em horário de trabalho
      const ate = Math.min(b, de + falta * MIN);
      blocos.push([de, ate]);
      falta -= (ate - de) / MIN;
      if (falta <= 0) break;
    }
  }
  return falta > 0 || !blocos.length ? null : blocos;
}

export function cabeEm(faixas, inicio, fim) {
  return faixas.some(([a, b]) => inicio >= a && fim <= b);
}

export function estaAberto(estab, ts) {
  return faixasDoDia(estab.escala, ts).some(([a, b]) => ts >= a && ts < b);
}

// Primeiro momento a partir de ts em que a loja está aberta.
export function proximaAbertura(estab, ts) {
  for (let i = 0; i < 30; i++) {
    const day = addDays(startOfDay(ts), i);
    for (const [a, b] of faixasDoDia(estab.escala, day)) {
      if (ts < b) return Math.max(ts, a);
    }
  }
  return null;
}

// Dias abertos consecutivos a partir de um dia (usado nos dados de exemplo).
export function diaAberto(estab, fromTs, passo, maxVoltas = 40) {
  let day = startOfDay(fromTs);
  for (let i = 0; i < maxVoltas; i++) {
    day = addDays(day, passo);
    if (faixasDoDia(estab.escala, day).length) return day;
  }
  return startOfDay(fromTs);
}

export function resumoFaixas(faixas) {
  return faixas.map(([a, b]) => `${a} às ${b}`).join(' e ');
}

export function exceptionKey(ex) {
  return `${ex.inicio}${ex.fim && ex.fim !== ex.inicio ? ` a ${ex.fim}` : ''}`;
}

export function diasDaExcecao(ex) {
  const out = [];
  let d = fromYmd(ex.inicio);
  const fim = fromYmd(ex.fim || ex.inicio);
  while (d <= fim) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
