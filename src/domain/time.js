/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:36e0f1957a */
// Utilitários de data e hora. Todo horário é um timestamp em milissegundos (horário local).
export const MIN = 60 * 1000;
export const HORA = 60 * MIN;
export const DIA = 24 * HORA;

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const pad = (n) => String(n).padStart(2, '0');

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function ymd(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

export function dow(ts) {
  return new Date(ts).getDay();
}

export function sameDay(a, b) {
  return ymd(a) === ymd(b);
}

export function parseHM(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function tsAt(dayTs, hm) {
  const d = new Date(startOfDay(dayTs));
  const mins = typeof hm === 'number' ? hm : parseHM(hm);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d.getTime();
}

export function minutesOfDay(ts) {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

// "sáb 31/10": dia da semana abreviado + dia/mês (cartões da agenda).
export function fmtDiaMesSemana(ts) {
  const d = new Date(ts);
  return `${DIAS_CURTOS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtHM(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtMinutes(mins) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fmtDateShort(ts) {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function fmtDateTime(ts) {
  return `${fmtDate(ts)} às ${fmtHM(ts)}`;
}

export function fmtDayLong(ts) {
  const d = new Date(ts);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function fmtMonthYear(ts) {
  const d = new Date(ts);
  return `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function fmtMoney(v) {
  const [int, dec] = Math.abs(Number(v)).toFixed(2).split('.');
  return `${Number(v) < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

export function weekStart(ts) {
  const s = startOfDay(ts);
  return addDays(s, -dow(s));
}

export function monthStart(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function addMonths(ts, n) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

export function roundTo(ts, minutes) {
  const step = minutes * MIN;
  return Math.round(ts / step) * step;
}

export function fmtRelative(ts, now) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const m = Math.round(abs / MIN);
  let txt;
  if (m < 60) txt = `${m} min`;
  else if (m < 60 * 36) txt = `${Math.round(m / 60)} h`;
  else txt = `${Math.round(m / 60 / 24)} dias`;
  return diff >= 0 ? `em ${txt}` : `há ${txt}`;
}
