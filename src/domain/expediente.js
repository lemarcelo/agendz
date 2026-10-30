/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Expediente da loja (puro): semana de 7 dias (0 = domingo), cada dia aberto com 1 a 6 faixas ["HH:MM","HH:MM"] sem sobreposição.
// Espelho de EscalaService.validar (servidor): a tela confere antes de enviar, mas quem decide é o servidor.
export const MAX_FAIXAS = 6;
export const DIAS_SEMANA = [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo']];
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const minutosDe = (t) => (t === '24:00' ? 1440 : HHMM.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : NaN);

// Da resposta do servidor ({ semana: { 0..6: { aberto, faixas } } }) para os campos da tela: { dias: { 0..6: { aberto, faixas: [[ini, fim]] } } }.
export function camposDaSemana(e) {
  const dias = {};
  for (let d = 0; d < 7; d++) {
    const dia = e && e.semana && e.semana[d];
    const faixas = dia && dia.aberto && Array.isArray(dia.faixas) ? dia.faixas.map((f) => [String(f[0]), String(f[1])]) : [];
    dias[d] = { aberto: faixas.length > 0, faixas };
  }
  return { dias };
}

// Texto do primeiro problema (ou null). Pelo menos um dia aberto; dia aberto com faixas válidas, em ordem e sem encostar uma na outra.
export function erroDaSemana(campos) {
  const nome = Object.fromEntries(DIAS_SEMANA);
  let algum = false;
  for (let d = 0; d < 7; d++) {
    const dia = campos.dias[d];
    if (!dia || !dia.aberto) continue;
    algum = true;
    if (!dia.faixas.length) return `${nome[d]}: coloque pelo menos um horário ou feche o dia.`;
    if (dia.faixas.length > MAX_FAIXAS) return `${nome[d]}: no máximo ${MAX_FAIXAS} horários por dia.`;
    const lista = [];
    for (const [a, b] of dia.faixas) {
      const i = minutosDe(a), f = minutosDe(b);
      if (Number.isNaN(i) || Number.isNaN(f)) return `${nome[d]}: horário inválido.`;
      if (i >= f) return `${nome[d]}: o início de cada horário precisa ser antes do fim.`;
      lista.push([i, f]);
    }
    lista.sort((x, y) => x[0] - y[0]);
    for (let k = 1; k < lista.length; k++) if (lista[k][0] < lista[k - 1][1]) return `${nome[d]}: os horários do mesmo dia não podem se sobrepor.`;
  }
  return algum ? null : 'Abra pelo menos um dia da semana.';
}

// Corpo do PUT: só os dias abertos, faixas ordenadas.
export function corpoDaSemana(campos) {
  const semana = {};
  for (let d = 0; d < 7; d++) {
    const dia = campos.dias[d];
    if (dia && dia.aberto) semana[d] = { aberto: true, faixas: [...dia.faixas].sort((x, y) => minutosDe(x[0]) - minutosDe(y[0])) };
  }
  return { semana };
}

// Resumo de um dia ("09:00–12:00 · 14:00–18:00" ou "Fechado").
export const resumoDoDia = (dia) => (dia && dia.aberto && dia.faixas.length ? dia.faixas.map((f) => `${f[0]}–${f[1]}`).join(' · ') : 'Fechado');
