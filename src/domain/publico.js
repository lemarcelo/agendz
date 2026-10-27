/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:f2513d1752 */
// Autoagendamento pelo link: o cliente (sem login) vê só horários livres, pede um horário e depois gerencia só os próprios agendamentos.
// Tudo aqui é regra pura. A API pública (`publico.*` em api.js) acrescenta os limites de uso; nada daqui devolve dado de outro cliente.
import { STATUS, acharConflitos, errosServicoIds, limparTexto, retiradaDe, servicosDoAg, statusVisual, telefoneBrasileiro, telefoneNacional, validarHorario } from './rules.js';
import { PORTES, ROTULO_PORTE, porteValido, resumoVeiculo } from './veiculos.js';
import { faixasDoProfissional } from './schedule.js';
import { DIA, MIN, fmtDate, fmtHM, startOfDay } from './time.js';
import * as E from './engine.js';
import { limparVeiculo } from './veiculos.js';
import { cap, rot, tipoDe } from './tipos.js';

export const PASSO_PUBLICO_MIN = 30; // os horários do link saem de 30 em 30 minutos
export const MAX_ABERTOS_LINK = 3; // agendamentos futuros em aberto por cliente
export const TOKEN_DIAS = 90;
export const MAX_TOKENS_CLIENTE = 5;
export const CODIGO_VALE_MIN = 30;
export const CODIGO_TENTATIVAS = 5;
export const DIAS_MAX_PADRAO = 30;
export const ERRO_DESLIGADO = `O agendamento pelo link não está disponível agora. Fale com a ${rot('loja')}.`;
export const ERRO_HORARIO = 'Esse horário acabou de ser ocupado. Escolha outro.';
export const ERRO_ACESSO = 'Não foi possível abrir. Peça um novo código.';
export const ERRO_NAO_ACHEI = 'Agendamento não encontrado.';

export function configLink(s) {
  const c = s.estabelecimento.linkAgendamento || {};
  const d = Number.isInteger(c.diasMax) ? Math.min(60, Math.max(1, c.diasMax)) : DIAS_MAX_PADRAO;
  return { ativo: c.ativo !== false, diasMax: d };
}

// Livre = sem erro de escala/antecedência e sem NENHUM agendamento ativo na janela (pendente também ocupa: o cliente nunca disputa horário).
export function horarioLivre(s, { profissionalId, inicio, servicoIds, porte, agora, ignoreId, boxPreferido }) {
  if (!(inicio > agora)) return false;
  const v = validarHorario(s, { profissionalId, inicio, servicoIds, porte, boxPreferido, ignoreId, origem: 'link', agora });
  if (v.erros.length) return false;
  return !acharConflitos(s, { profissionalId, ocup: v.ocup, ignoreId }).length;
}

// Só [{ inicio, profissionalId }] — nunca quem ocupa os outros horários nem qual box. `profissionalId` vazio = qualquer profissional (o primeiro livre).
// O porte do veículo define a duração; sem ele não há horário para mostrar. Um horário só aparece se houver profissional E box livres.
export function horariosPublicos(s, { profissionalId, servicoIds, porte, dayTs, agora, ignoreId, boxPreferido, limite = Infinity }) {
  const cfg = configLink(s);
  if (!cfg.ativo || (cap(s.estabelecimento, 'precoPorPorte') && !porteValido(porte)) || errosServicoIds(s, servicoIds, { ativos: true }) || !Number.isFinite(dayTs)) return [];
  const dia = startOfDay(dayTs);
  if (dia > agora + cfg.diasMax * DIA) return [];
  const barbs = s.usuarios.filter((u) => u.atende && (!profissionalId || u.id === profissionalId));
  const achados = new Map();
  for (const b of barbs) {
    for (const [ini, fim] of faixasDoProfissional(s.estabelecimento, b, dia)) {
      for (let t = ini; t < fim; t += PASSO_PUBLICO_MIN * MIN) {
        if (achados.has(t) || !horarioLivre(s, { profissionalId: b.id, inicio: t, servicoIds, porte, agora, ignoreId, boxPreferido })) continue;
        achados.set(t, b.id);
        if (achados.size >= limite) return [...achados].map(([inicio, id]) => ({ inicio, profissionalId: id }));
      }
    }
  }
  return [...achados].sort((a, b) => a[0] - b[0]).map(([inicio, id]) => ({ inicio, profissionalId: id }));
}

// Dias (início de cada dia) que têm ao menos um horário livre, a partir de `deTs`.
export function diasLivres(s, { profissionalId, servicoIds, porte, deTs, dias, agora, ignoreId, boxPreferido }) {
  const n = Math.min(Math.max(Number(dias) || 0, 0), 60);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = startOfDay(deTs + i * DIA + 12 * 3600000);
    if (horariosPublicos(s, { profissionalId, servicoIds, porte, dayTs: d, agora, ignoreId, boxPreferido, limite: 1 }).length) out.push(d);
  }
  return out;
}

// Só o que a página pública precisa: nunca CPF, telefone, notas nem dado de outro cliente.
export function configPublica(s) {
  const cfg = configLink(s);
  return {
    ativo: cfg.ativo, diasMax: cfg.diasMax, tipo: tipoDe(s.estabelecimento), nome: s.estabelecimento.nome, telefone: s.estabelecimento.telefone || '', endereco: s.estabelecimento.endereco || '',
    ...(cap(s.estabelecimento, 'precoPorPorte') ? { portes: PORTES.map((id) => ({ id, nome: ROTULO_PORTE[id] })) } : {}),
    // preço e duração de cada serviço (por porte quando o tipo cobra por porte; a página mostra os do porte escolhido); nada de custo, material ou comissão
    servicos: s.servicos.filter((x) => x.ativo !== false).map((x) => (cap(s.estabelecimento, 'precoPorPorte')
      ? { id: x.id, nome: x.nome, precos: { ...x.precos }, duracoes: { ...x.duracoes }, combo: !!x.combo, multiDia: !!x.multiDia, categoria: x.categoria || '' }
      : { id: x.id, nome: x.nome, duracao: x.duracao, preco: x.preco })),
    profissionais: s.usuarios.filter((u) => u.atende).map((u) => ({ id: u.id, nome: u.apelido || u.nome, foto: u.foto || null })),
  };
}

// ---------- acesso do cliente aos próprios agendamentos ----------
const hex = (n) => { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); };
export function emitirToken(s, clienteId, agora) {
  const lista = (s.acessosPublicos ||= []);
  for (let i = lista.length - 1; i >= 0; i--) if (lista[i].expiraEm <= agora) lista.splice(i, 1);
  const token = hex(24); // 48 caracteres; no back-end guarde só o hash
  lista.push({ token, clienteId, criadoEm: agora, expiraEm: agora + TOKEN_DIAS * DIA });
  const meus = lista.filter((t) => t.clienteId === clienteId);
  for (const velho of meus.slice(0, Math.max(0, meus.length - MAX_TOKENS_CLIENTE))) lista.splice(lista.indexOf(velho), 1);
  return token;
}
export function clienteDoToken(s, token, agora) {
  if (typeof token !== 'string' || token.length !== 48) return null;
  const t = (s.acessosPublicos || []).find((x) => x.token === token);
  if (!t || t.expiraEm <= agora) return null;
  return s.clientes.find((c) => c.id === t.clienteId) || null;
}

const numeroDoCliente = (s, telefone) => {
  if (!telefoneBrasileiro(telefone)) return null;
  const nac = telefoneNacional(telefone);
  return s.clientes.find((c) => telefoneNacional(c.telefone) === nac) ? nac : null;
};

// A resposta é sempre a mesma: não revela se o telefone tem cadastro.
export function pedirCodigo(s, telefone, agora) {
  const nac = numeroDoCliente(s, telefone);
  if (!nac) return { ok: true };
  const lista = (s.codigosAcesso ||= []).filter((x) => x.telefone !== nac && x.expiraEm > agora);
  const b = new Uint32Array(1); globalThis.crypto.getRandomValues(b);
  const codigo = String(b[0] % 1000000).padStart(6, '0');
  lista.push({ telefone: nac, codigo, criadoEm: agora, expiraEm: agora + CODIGO_VALE_MIN * MIN, tentativas: 0, usado: false });
  s.codigosAcesso = lista.slice(-200);
  E.enviarAoCliente(s, null, 'codigo_acesso', agora, { telefone: `55${nac}`, valores: [codigo], origem: 'Código de acesso' });
  return { ok: true };
}

export function validarCodigo(s, telefone, codigo, agora) {
  const falha = { ok: false, persistir: true, erros: [ERRO_ACESSO] };
  const nac = telefoneBrasileiro(telefone) ? telefoneNacional(telefone) : null;
  const c = nac && (s.codigosAcesso || []).find((x) => x.telefone === nac && !x.usado && x.expiraEm > agora);
  if (!c || c.tentativas >= CODIGO_TENTATIVAS) return falha;
  if (String(codigo ?? '').replace(/\D/g, '') !== c.codigo) { c.tentativas++; return falha; }
  c.usado = true;
  const cli = s.clientes.find((x) => telefoneNacional(x.telefone) === nac);
  if (!cli) return falha;
  return { ok: true, token: emitirToken(s, cli.id, agora) };
}

// ---------- pedido de horário ----------
export function agendarPorLink(s, d, agora) {
  const cfg = configLink(s);
  if (!cfg.ativo) return { ok: false, erros: [ERRO_DESLIGADO] };
  if (d.site) return { ok: false, erros: ['Não foi possível agendar. Tente de novo.'] }; // campo isca preenchido: robô
  const nome = limparTexto(String(d.nome ?? ''), 60).trim();
  if (nome.length < 2) return { ok: false, erros: ['Informe o seu nome.'] };
  if (!telefoneBrasileiro(d.telefone)) return { ok: false, erros: ['Informe o telefone com DDD.'] };
  const nac = telefoneNacional(d.telefone);
  if (!s.estabelecimento.ddds.includes(Number(nac.slice(0, 2)))) return { ok: false, erros: ['Esse DDD está fora da área de atendimento.'] };
  const usaVeiculo = cap(s.estabelecimento, 'usaVeiculo');
  const lv = usaVeiculo ? limparVeiculo({ placa: d.placa, marca: d.marca, modelo: d.modelo, cor: d.cor, porte: d.porte }) : { ok: true, veiculo: null };
  if (!lv.ok) return { ok: false, erros: [lv.erro] };
  { const e = errosServicoIds(s, d.servicoIds, { ativos: true }); if (e) return { ok: false, erros: [e] }; }
  if (!Number.isInteger(d.inicio) || d.inicio > agora + cfg.diasMax * DIA) return { ok: false, erros: ['Escolha um dia e um horário.'] };
  const candidatos = s.usuarios.filter((u) => u.atende && (!d.profissionalId || u.id === d.profissionalId));
  const profissional = candidatos.find((u) => horarioLivre(s, { profissionalId: u.id, inicio: d.inicio, servicoIds: d.servicoIds, porte: lv.veiculo?.porte, agora }));
  if (!profissional) return { ok: false, erros: [ERRO_HORARIO] };
  const abertos = (cli) => s.agendamentos.filter((x) => x.clienteId === cli.id && [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(x.status) && x.inicio > agora).length;
  const r0 = E.resolverClienteDoAtendimento(s, { nome, telefone: nac }, agora);
  if (!r0.ok || !r0.cliente) return { ok: false, erros: r0.erros || ['Informe o nome e o telefone.'] };
  const c = r0.cliente;
  if (r0.criado) c.origemCadastro = 'link';
  if (abertos(c) >= MAX_ABERTOS_LINK) return { ok: false, erros: [`Você já tem ${MAX_ABERTOS_LINK} horários marcados. Cancele ou remarque um deles para agendar outro.`] };
  const r = E.criarAgendamento(s, { clienteId: c.id, profissionalId: profissional.id, servicoIds: d.servicoIds, inicio: d.inicio, origem: 'link', ...(usaVeiculo ? { veiculo: lv.veiculo } : {}) }, E.AUTOR_CLIENTE(c), agora);
  if (!r.ok) return { ok: false, erros: r.erros };
  const a = r.agendamento;
  if (typeof d.lembretes === 'boolean') c.lembretes = d.lembretes;
  const sv = servicosDoAg(s, a).map((x) => x.nome).join(', ');
  E.avisarPainel(s, a, `Cliente agendou: ${c.apelido || c.nome} pediu ${sv}${a.veiculo ? ` para o ${resumoVeiculo(a.veiculo)}` : ''} com ${profissional.apelido || profissional.nome} para ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}. Confirme ou recuse.`, agora);
  E.enviarAoCliente(s, a, 'cliente_agendou', agora);
  return { ok: true, agendamentoId: a.id, token: emitirToken(s, c.id, agora), clienteNovo: !!r0.criado };
}

// ---------- gerenciar os próprios agendamentos ----------
export function resumoPublico(s, a, agora) {
  const sv = servicosDoAg(s, a);
  const ativo = [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && a.inicio > agora;
  const v = statusVisual(a, agora);
  const rotulo = a.status === STATUS.A_CONFIRMAR ? 'Aguardando confirmação' : v.rotulo;
  const b = s.usuarios.find((u) => u.id === a.profissionalId);
  return {
    id: a.id, inicio: a.inicio, status: a.status, rotulo, servicos: sv.map((x) => x.nome), duracao: sv.reduce((t, x) => t + x.duracao, 0),
    ...(cap(s.estabelecimento, 'usaVeiculo') ? { veiculo: a.veiculo ? { placa: a.veiculo.placa, modelo: a.veiculo.modelo, porte: a.porte } : null } : {}),
    ...(cap(s.estabelecimento, 'multiDia') ? { retirada: retiradaDe(s, a) } : {}),
    ...(cap(s.estabelecimento, 'prontoParaRetirada') ? { pronto: !!a.pronto && a.status === STATUS.CONFIRMADO } : {}),
    ...(cap(s.estabelecimento, 'precoPorPorte') ? { total: Math.round(sv.reduce((t, x) => t + (a.precos && Object.hasOwn(a.precos, x.id) ? a.precos[x.id] : x.preco), 0) * 100) / 100 } : {}),
    profissional: b ? b.apelido || b.nome : '', ativo, podeCancelar: E.clientePodeCancelar(a, agora), podeRemarcar: ativo,
  };
}

export function meusAgendamentos(s, token, agora) {
  const c = clienteDoToken(s, token, agora);
  if (!c) return { ok: false, erros: [ERRO_ACESSO] };
  const todos = s.agendamentos.filter((a) => a.clienteId === c.id && !a.local);
  const futuros = todos.filter((a) => [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && a.inicio > agora).sort((a, b) => a.inicio - b.inicio);
  const passados = todos.filter((a) => !futuros.includes(a)).sort((a, b) => b.inicio - a.inicio).slice(0, 5);
  return { ok: true, nome: c.apelido || c.nome, lembretes: c.lembretes ?? null, futuros: futuros.map((a) => resumoPublico(s, a, agora)), passados: passados.map((a) => resumoPublico(s, a, agora)) };
}

const meuAtivo = (s, token, id, agora) => {
  const c = clienteDoToken(s, token, agora);
  const a = c && typeof id === 'string' ? s.agendamentos.find((x) => x.id === id && x.clienteId === c.id && !x.local) : null;
  return a && [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO].includes(a.status) && a.inicio > agora ? { c, a } : null;
};

export function horariosParaRemarcar(s, token, id, dayTs, agora) {
  const m = meuAtivo(s, token, id, agora);
  if (!m) return [];
  return horariosPublicos(s, { profissionalId: m.a.profissionalId, servicoIds: m.a.servicoIds, porte: m.a.porte, boxPreferido: m.a.boxId, dayTs, agora, ignoreId: m.a.id });
}
export function diasParaRemarcar(s, token, id, deTs, dias, agora) {
  const m = meuAtivo(s, token, id, agora);
  return m ? diasLivres(s, { profissionalId: m.a.profissionalId, servicoIds: m.a.servicoIds, porte: m.a.porte, boxPreferido: m.a.boxId, deTs, dias, agora, ignoreId: m.a.id }) : [];
}

export function remarcarPorLink(s, token, id, inicio, agora) {
  const m = meuAtivo(s, token, id, agora);
  if (!m) return { ok: false, erros: [ERRO_NAO_ACHEI] };
  if (!configLink(s).ativo) return { ok: false, erros: [ERRO_DESLIGADO] };
  const { c, a } = m;
  if (!Number.isInteger(inicio) || !horarioLivre(s, { profissionalId: a.profissionalId, inicio, servicoIds: a.servicoIds, porte: a.porte, boxPreferido: a.boxId, agora, ignoreId: a.id })) return { ok: false, erros: [ERRO_HORARIO] };
  const antes = a.status;
  const r = E.clienteRemarca(s, id, inicio, agora);
  if (!r.ok) return r;
  if (a.origem === 'link') { // o pedido do link volta a aguardar o estabelecimento
    if (a.status !== STATUS.A_CONFIRMAR) E.registrar(s, a, E.AUTOR_CLIENTE(c), 'status', 'Confirmado', 'A confirmar (cliente remarcou pelo link)', agora);
    a.status = STATUS.A_CONFIRMAR; a.clienteAgendou = true; a.plano = []; a.faltaConfirmacao = null;
  }
  E.avisarPainel(s, a, `${c.apelido || c.nome} remarcou pelo link: agora ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}${antes === STATUS.CONFIRMADO ? ' (estava confirmado)' : ''}.`, agora);
  return { ok: true, agendamento: resumoPublico(s, a, agora) };
}

export function cancelarPorLink(s, token, id, agora) {
  const m = meuAtivo(s, token, id, agora);
  if (!m) return { ok: false, erros: [ERRO_NAO_ACHEI] };
  const r = E.clienteCancela(s, id, agora, 'link de agendamento');
  return r.ok ? { ok: true } : r;
}

export function definirLembretes(s, token, quer, agora) {
  const c = clienteDoToken(s, token, agora);
  if (!c) return { ok: false, erros: [ERRO_ACESSO] };
  c.lembretes = quer === true;
  return { ok: true, lembretes: c.lembretes };
}
