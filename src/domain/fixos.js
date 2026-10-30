/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Horários fixos do assinante de um plano (puro): dia da semana + hora + profissional, repetidos toda semana.
// Só a forma dos dados e as contas de calendário moram aqui; criar o agendamento fixo é com `assinaturas.js` (usa o motor da agenda).
// Não importa planos.js nem rules.js (rules.js usa este arquivo para a reserva do horário fixo): quem precisa do teto passa `max`.
import { DIA, dow, startOfDay, tsAt, ymd } from './time.js';

export const HM_FIXO = /^([01]\d|2[0-3]):[0-5]\d$/;

// Chave de uma ocorrência: o mesmo fixo no mesmo dia nunca vira dois agendamentos (mesmo que o primeiro tenha sido cancelado).
export const chaveFixo = (fixoId, inicio) => `${fixoId}:${ymd(inicio)}`;
export const ehDoFixo = (a, fixo, inicio) => a.fixoId === fixo.id && a.fixoData === ymd(inicio);

// Início de cada ocorrência de `fixo` entre `deTs` (exclusivo) e `ateTs` (inclusive), em ordem.
export function ocorrencias(fixo, deTs, ateTs) {
  const out = [];
  for (let dia = startOfDay(deTs), n = 0; dia <= ateTs && n < 400; dia = startOfDay(dia + DIA + 12 * 3600000), n++) {
    if (dow(dia) !== fixo.dia) continue;
    const t = tsAt(dia, fixo.hm);
    if (t > deTs && t <= ateTs) out.push(t);
  }
  return out;
}

// Próxima data (início do dia) em que o fixo cai, de hoje em diante.
export function proximoDia(fixo, deTs) {
  let dia = startOfDay(deTs);
  for (let n = 0; n < 8; n++, dia = startOfDay(dia + DIA + 12 * 3600000)) if (dow(dia) === fixo.dia) return dia;
  return startOfDay(deTs);
}

// Menor distância, em dias, entre duas ocorrências de fixos diferentes na semana que se repete (mesmo dia da semana = 0).
export function menorDistanciaDias(fixos) {
  let min = Infinity;
  for (let i = 0; i < fixos.length; i++) for (let j = i + 1; j < fixos.length; j++) {
    const d = Math.abs(fixos[i].dia - fixos[j].dia);
    min = Math.min(min, d, 7 - d);
  }
  return min;
}

// Forma da lista vinda de fora: até `max` itens { dia 0..6, hm 'HH:MM', profissionalId, servicoIds[1..10], veiculoId? (tipo com veículo) }, sem repetir dia+hora. Devolve só os campos aceitos.
export function sanearFixos(lista, max) {
  if (lista === undefined || lista === null) return { ok: true, fixos: [] };
  if (!Array.isArray(lista)) return { ok: false, erro: 'Horários fixos inválidos.' };
  if (lista.length > max) return { ok: false, erro: `No máximo ${max} horários fixos por semana.` };
  const fixos = [];
  for (const f of lista) {
    if (!f || typeof f !== 'object') return { ok: false, erro: 'Horário fixo inválido.' };
    const dia = Number(f.dia);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) return { ok: false, erro: 'Escolha o dia da semana do horário fixo.' };
    if (typeof f.hm !== 'string' || !HM_FIXO.test(f.hm)) return { ok: false, erro: 'Informe a hora do horário fixo (HH:MM).' };
    if (typeof f.profissionalId !== 'string' || !f.profissionalId || f.profissionalId.length > 60) return { ok: false, erro: 'Escolha quem atende o horário fixo.' };
    const ids = f.servicoIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 10 || new Set(ids).size !== ids.length || ids.some((x) => typeof x !== 'string' || !x || x.length > 60)) return { ok: false, erro: 'Escolha de 1 a 10 serviços do plano para o horário fixo.' };
    if (fixos.some((x) => x.dia === dia && x.hm === f.hm)) return { ok: false, erro: 'Há dois horários fixos no mesmo dia e hora.' };
    if (f.veiculoId !== undefined && f.veiculoId !== null && f.veiculoId !== '' && (typeof f.veiculoId !== 'string' || f.veiculoId.length > 60)) return { ok: false, erro: 'Veículo do horário fixo inválido.' };
    fixos.push({ dia, hm: f.hm, profissionalId: f.profissionalId, servicoIds: [...ids], ...(f.veiculoId ? { veiculoId: f.veiculoId } : {}) });
  }
  return { ok: true, fixos };
}

// Mesmo fixo (para manter o id e os agendamentos já criados quando o dono salva de novo sem mudar nada).
export const mesmoFixo = (a, b) => a.dia === b.dia && a.hm === b.hm && a.profissionalId === b.profissionalId && a.servicoIds.length === b.servicoIds.length && a.servicoIds.every((x) => b.servicoIds.includes(x)) && (a.veiculoId || '') === (b.veiculoId || '');
