/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Escolha automática do profissional (B9c, v132): quando o dono tira o campo "quem vai fazer o serviço" (Estabelecimento), o app escolhe sozinho quem está com a
// agenda MAIS LIVRE. Ordem: menos agendamentos (não cancelados) no dia do atendimento; empate → menos nos 7 dias a partir do dia; empate → ordem da equipe.
// Puro e sem relógio: quem chama diz os limites do dia (`ini`, `fim`) e da janela (`janelaFim`), em ms. O servidor tem o mesmo cálculo (`Folga.java`), com os
// mesmos casos em backend/src/test/resources/equivalencia/folga.json. Quem cabe no horário (expediente, conflito, box) é decidido por quem chama, depois da ordem.
import { addDays, startOfDay } from './time.js';

export const JANELA_DIAS = 7;

/** Limites do dia de `dayTs` e da janela de 7 dias a partir dele (meia-noite local). */
export function limitesDoDia(dayTs) {
  const ini = startOfDay(dayTs);
  return { ini, fim: addDays(ini, 1), janelaFim: addDays(ini, JANELA_DIAS) };
}

/** `ids` na ordem da equipe → os mesmos ids, do mais livre para o menos livre. */
export function ordemPorFolga(agendamentos, ids, { ini, fim, janelaFim }) {
  const conta = new Map(ids.map((id) => [id, [0, 0]]));
  for (const a of agendamentos || []) {
    if (!a || a.status === 'cancelado') continue;
    const c = conta.get(a.profissionalId);
    if (!c || !(a.inicio >= ini)) continue;
    if (a.inicio < janelaFim) c[1]++;
    if (a.inicio < fim) c[0]++;
  }
  return ids.map((id, i) => ({ id, i, dia: conta.get(id)[0], janela: conta.get(id)[1] }))
    .sort((a, b) => a.dia - b.dia || a.janela - b.janela || a.i - b.i)
    .map((x) => x.id);
}

/** A loja escolheu não perguntar quem faz o serviço? (padrão: continua perguntando) */
export const profissionalAutomatico = (s) => !!(s && s.estabelecimento && s.estabelecimento.profissionalAutomatico === true);
