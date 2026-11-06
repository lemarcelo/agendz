/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Serviços por funcionário e ausência (bloco A), domínio puro da demonstração. Espelho do servidor: VinculoServicos.java (quem realiza o quê),
// Ausencias.java e AusenciaController.java (ausência). Os casos de `realizaTodos` são os mesmos em backend/src/test/resources/equivalencia/vinculo.json.
// Demonstração: usuário SEM `servicoIds` (estado antigo) realiza todos os serviços; com a lista, só os dela. Serviço e pessoa novos entram marcados para todos.
import { DIA, MIN, addDays, fmtHM, pad, startOfDay } from './time.js';

const ATIVO = (s) => s === 'a_confirmar' || s === 'confirmado' || s === 'concluido'; // = ATIVOS de rules.js (cancelado fica de fora)

/** A pessoa realiza este serviço? Sem lista própria, realiza todos (preserva o comportamento de antes). */
export const realizaServico = (u, servicoId) => !u || !Array.isArray(u.servicoIds) || u.servicoIds.includes(servicoId);

/** Espelho de VinculoServicos.realizaTodos: `porServico` = { servicoId: [usuarioId] }. */
export function realizaTodos(porServico, usuarioId, servicoIds) {
  return servicoIds.every((s) => ((porServico || {})[s] || []).includes(usuarioId));
}

/** Mapa serviço → [usuários] a partir do estado da demonstração (só usuários ativos, como no servidor). */
export function porServicoDoEstado(state) {
  const m = {};
  for (const sv of state.servicos) m[sv.id] = state.usuarios.filter((u) => u.ativo !== false && realizaServico(u, sv.id)).map((u) => u.id);
  return m;
}

const nomeDe = (u) => (u && (u.apelido || u.nome)) || 'A pessoa';

/** Mensagem de erro (ou null) quando o profissional não realiza algum dos serviços. Mesmo texto do servidor. */
export function erroDeVinculo(state, profissionalId, servicoIds) {
  const u = state.usuarios.find((x) => x.id === profissionalId);
  if (!u) return null;
  const faltam = (servicoIds || []).filter((id) => !realizaServico(u, id)).map((id) => (state.servicos.find((s) => s.id === id) || {}).nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!faltam.length) return null;
  return `${nomeDe(u)} não realiza ${faltam.length === 1 ? 'o serviço ' : 'os serviços '}${faltam.join(', ')}.`;
}

/** Equipe > Editar: troca os serviços da pessoa. Serviço desativado mantém o vínculo que tinha. */
export function definirServicosDoUsuario(state, usuarioId, servicoIds) {
  const u = state.usuarios.find((x) => x.id === usuarioId);
  if (!u) return { erro: 'Profissional não encontrado.' };
  if (!Array.isArray(servicoIds) || servicoIds.length > 500) return { erro: 'Lista inválida.' };
  const ids = [...new Set(servicoIds)];
  if (ids.some((id) => !state.servicos.some((s) => s.id === id))) return { erro: 'Serviço não encontrado.' };
  const manter = state.servicos.filter((sv) => sv.ativo === false && realizaServico(u, sv.id)).map((sv) => sv.id);
  u.servicoIds = [...new Set([...ids, ...manter])];
  return { ok: true, ids: u.servicoIds };
}

/** Serviços > Editar: troca quem realiza o serviço. Só usuários ativos entram; os desativados mantêm o que tinham. */
export function definirProfissionaisDoServico(state, servicoId, usuarioIds) {
  if (!state.servicos.some((s) => s.id === servicoId)) return { erro: 'Serviço não encontrado.' };
  if (!Array.isArray(usuarioIds) || usuarioIds.length > 500) return { erro: 'Lista inválida.' };
  const ids = new Set(usuarioIds);
  if ([...ids].some((id) => !state.usuarios.some((u) => u.id === id && u.ativo !== false))) return { erro: 'Profissional não encontrado.' };
  const todos = state.servicos.map((s) => s.id);
  for (const u of state.usuarios) {
    if (u.ativo === false) continue;
    const lista = Array.isArray(u.servicoIds) ? u.servicoIds : [...todos];
    u.servicoIds = ids.has(u.id) ? [...new Set([...lista, servicoId])] : lista.filter((id) => id !== servicoId);
  }
  return { ok: true, ids: [...ids] };
}

/** Serviço novo vem marcado para todos: quem já tem lista própria recebe o novo id (quem não tem já realiza tudo). */
export function servicoNovoParaTodos(state, servicoId) {
  for (const u of state.usuarios) if (Array.isArray(u.servicoIds) && !u.servicoIds.includes(servicoId)) u.servicoIds.push(servicoId);
}

// ---------- ausência ----------
/** Ausência do profissional que toca algum dos blocos [ini, fim) de trabalho (sem o intervalo). */
export function ausenciaNoHorario(state, profissionalId, blocos) {
  return (state.ausencias || []).some((x) => x.profissionalId === profissionalId && blocos.some(([a, b]) => x.ini < b && x.fim > a));
}

/** Intervalos [ini, fim] em ms de uma ausência pedida: `{ dia: 'AAAA-MM-DD' }` = dia inteiro; `{ ini, fim }` = horários. Texto de erro (ou null) + lista. */
export function intervalosDaAusencia(pedidos, agora) {
  if (!Array.isArray(pedidos) || !pedidos.length || pedidos.length > 300) return { erro: 'Marque ao menos um horário ou um dia.' };
  const saida = [];
  for (const v of pedidos) {
    if (!v || typeof v !== 'object') return { erro: 'Intervalo inválido.' };
    let ini, fim, diaInteiro = false;
    if (typeof v.dia === 'string') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.dia);
      if (!m) return { erro: 'Intervalo inválido.' };
      ini = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
      fim = addDays(ini, 1);
      diaInteiro = true;
    } else { ini = v.ini; fim = v.fim; }
    if (!Number.isFinite(ini) || !Number.isFinite(fim) || !(ini < fim)) return { erro: 'Informe o início antes do fim da ausência.' };
    if (fim <= agora) return { erro: 'A ausência precisa ser de agora em diante.' };
    if (ini > agora + 400 * DIA || fim - ini > 31 * DIA) return { erro: 'Ausência distante demais ou longa demais (máximo de 31 dias por intervalo).' };
    saida.push({ ini, fim, diaInteiro });
  }
  return { intervalos: saida };
}

const curto = (n) => (n && n.length > 20 ? `${n.slice(0, 19)}…` : n);
const dataHoraCurta = (ts) => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${fmtHM(ts)}`; };

/** Mensagem de conflito (ou null): agendamentos ativos do profissional dentro dos intervalos. `ocupacaoDe` devolve os blocos de cada agendamento. */
export function conflitoDaAusencia(state, profissionalId, intervalos, blocosDe) {
  const achados = [];
  for (const a of state.agendamentos) {
    if (a.profissionalId !== profissionalId || !ATIVO(a.status) || a.status === 'cancelado') continue;
    const blocos = blocosDe(a);
    if (intervalos.some((j) => blocos.some(([x, y]) => j.ini < y && j.fim > x))) {
      const cli = a.clienteId ? state.clientes.find((c) => c.id === a.clienteId) : null;
      achados.push({ inicio: a.inicio, texto: `${dataHoraCurta(a.inicio)} (${curto((cli && (cli.apelido || cli.nome)) || a.nomeAvulso || 'sem nome')})` });
    }
  }
  if (!achados.length) return null;
  achados.sort((x, y) => x.inicio - y.inicio);
  const mostra = achados.slice(0, 4).map((x) => x.texto);
  return `Há ${achados.length === 1 ? '1 agendamento' : `${achados.length} agendamentos`} nesse período: ${mostra.join(', ')}${achados.length > 4 ? ` e mais ${achados.length - 4}` : ''}. Remarque ou cancele antes de lançar a ausência.`;
}

export { startOfDay, MIN };
