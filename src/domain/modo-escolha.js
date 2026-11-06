/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B2: modos da escolha automática do profissional (valem só com a escolha automática ligada). Espelho de `ModoEscolha.java`; mesmos casos em
// backend/src/test/resources/equivalencia/modo-escolha.json. `livre` = o "mais livre" do B9c (profissional-auto.js, o padrão); `aleatorio` = pela chave sorteada de
// cada um; `menos` = quem atendeu MENOS no mês do atendimento (agendamentos não cancelados + serviços já atribuídos a ele no MESMO agendamento); `fila` = circular
// por serviço, começando depois do último escolhido. Em todos o empate segue a ordem da equipe. A ordem é só preferência: quem chama pega o primeiro que cabe no horário.
import { limitesDoDia, ordemPorFolga } from './profissional-auto.js';

export const MODOS_DE_ESCOLHA = ['livre', 'aleatorio', 'menos', 'fila'];
export const ROTULO_MODO = {
  livre: 'Mais livre no dia (padrão)',
  aleatorio: 'Aleatório',
  menos: 'Quem atendeu menos no mês',
  fila: 'Fila (um de cada vez)',
};
export const DICA_MODO_BOX = {
  livre: 'O carro vai para o box com menos carros no dia (e, no empate, nos próximos 7 dias).',
  aleatorio: 'Sorteia entre os boxes livres no horário.',
  menos: 'Vai para o box que recebeu menos carros no mês (cancelados não contam).',
  fila: 'Revezamento: depois de um box, vem o seguinte da lista, e assim em círculo.',
};
export const DICA_MODO = {
  livre: 'O horário vai para quem tem menos agendamentos no dia (e, no empate, nos próximos 7 dias).',
  aleatorio: 'Sorteia entre quem atende o serviço e está livre no horário.',
  menos: 'Vai para quem tem menos atendimentos no mês (cancelados não contam).',
  fila: 'Revezamento por serviço: depois de um, vem o seguinte da equipe, e assim em círculo.',
};
export const modoSaneado = (m) => (MODOS_DE_ESCOLHA.includes(m) ? m : 'livre');
export const modoDaLoja = (s) => modoSaneado(s && s.estabelecimento && s.estabelecimento.modoEscolha);

/** Limites do dia, da janela de 7 dias e do MÊS do dia informado (meia-noite local). */
export function limitesDoModo(dayTs) {
  const d = new Date(dayTs);
  return { ...limitesDoDia(dayTs), mesIni: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), mesFim: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() };
}

/** `ids` na ordem da equipe → os mesmos ids na ordem de preferência do modo. */
export function ordenarPorModo(modo, ids, { agendamentos = [], limites, ja = {}, sorteio = {}, ponteiro = null } = {}) {
  if (ids.length < 2) return [...ids];
  const m = modoSaneado(modo);
  if (m === 'aleatorio') {
    const chave = (id) => (typeof sorteio[id] === 'number' ? sorteio[id] : Infinity);
    return ids.map((id, i) => ({ id, i, c: chave(id) })).sort((a, b) => (a.c === b.c ? a.i - b.i : a.c < b.c ? -1 : 1)).map((x) => x.id);
  }
  if (m === 'menos') {
    const conta = new Map(ids.map((id) => [id, Number(ja[id]) || 0]));
    for (const a of agendamentos || []) {
      if (!a || a.status === 'cancelado' || !conta.has(a.profissionalId)) continue;
      if (a.inicio >= limites.mesIni && a.inicio < limites.mesFim) conta.set(a.profissionalId, conta.get(a.profissionalId) + 1);
    }
    return ids.map((id, i) => ({ id, i, n: conta.get(id) })).sort((a, b) => a.n - b.n || a.i - b.i).map((x) => x.id);
  }
  if (m === 'fila') {
    const p = ponteiro == null ? -1 : ids.indexOf(ponteiro);
    return ids.map((_, k) => ids[(p + 1 + k + ids.length) % ids.length]);
  }
  return ordemPorFolga(agendamentos, ids, limites);
}

/** Ordem do modo da loja para um atendimento no dia `dayTs`. `servicoChave` = primeiro serviço do pedido (a fila é por serviço). Sorteio por chamada (Math.random). */
export function ordemDaLoja(s, ids, dayTs, servicoChave) {
  const modo = modoDaLoja(s);
  const sorteio = {};
  if (modo === 'aleatorio') for (const id of ids) sorteio[id] = Math.random();
  const fila = (s.estabelecimento && s.estabelecimento.filaProfissional) || {};
  return ordenarPorModo(modo, ids, { agendamentos: s.agendamentos, limites: limitesDoModo(dayTs), sorteio, ponteiro: servicoChave ? fila[servicoChave] ?? null : null });
}

/** Na CRIAÇÃO do agendamento (nunca antes): na fila, o escolhido vira o ponteiro do serviço. Fora da fila não faz nada. */
export function registrarEscolha(s, servicoChave, profissionalId) {
  if (!servicoChave || !profissionalId || modoDaLoja(s) !== 'fila') return;
  s.estabelecimento.filaProfissional = { ...(s.estabelecimento.filaProfissional || {}), [servicoChave]: profissionalId };
}
