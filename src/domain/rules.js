/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:672c44b4ea */
// Regras de negócio puras (sem React, sem armazenamento). Candidatas diretas à migração para o Spring Boot.
import { addDays, DIA, dow, HORA, MIN, parseHM, startOfDay, tsAt } from './time.js';
import { ehDoFixo } from './fixos.js';
import { blocosDeTrabalho, cabeEm, faixasDoProfissional, proximaAbertura } from './schedule.js';
import { cpfValido } from './pix.js';
import { limparTexto } from './texto.js';
import { PORTE_PADRAO, porteValido } from './veiculos.js';
import { Rot, rot, capAtiva, cap } from './tipos.js';

export const STATUS = {
  A_CONFIRMAR: 'a_confirmar',
  CONFIRMADO: 'confirmado',
  CONCLUIDO: 'concluido',
  CANCELADO: 'cancelado',
};
export const ATIVOS = [STATUS.A_CONFIRMAR, STATUS.CONFIRMADO, STATUS.CONCLUIDO];
export const ROTULO_STATUS = {
  a_confirmar: 'A confirmar',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

// ---------- serviços de um agendamento ----------
// Lista de serviços vinda de fora (WhatsApp, painel): array de 1 a 10 ids existentes e sem repetição. Com `ativos`, também recusa serviço desativado.
export function errosServicoIds(state, ids, { ativos = false } = {}) {
  if (!Array.isArray(ids) || !ids.length) return 'Escolha ao menos um serviço.';
  if (ids.length > 10) return 'No máximo 10 serviços por agendamento.';
  if (new Set(ids).size !== ids.length) return 'O mesmo serviço aparece duas vezes.';
  for (const id of ids) {
    const sv = typeof id === 'string' ? state.servicos.find((x) => x.id === id) : null;
    if (!sv) return 'Serviço não encontrado.';
    if (ativos && sv.ativo === false) return `${sv.nome} está desativado.`;
  }
  return null;
}
// Serviço no porte do veículo: preço e duração do porte (sem porte válido, o médio). `preco` e `duracao` do cadastro espelham o médio.
export function servicoNoPorte(sv, porte) {
  if (!capAtiva('precoPorPorte')) return sv; // tipo sem preço por porte (barbearia): preço e duração são os do serviço
  const p = porteValido(porte) ? porte : PORTE_PADRAO;
  const preco = sv.precos ? Number(sv.precos[p]) : NaN;
  const duracao = sv.duracoes ? Number(sv.duracoes[p]) : NaN;
  return { ...sv, preco: Number.isFinite(preco) && preco >= 0 ? preco : sv.preco, duracao: Number.isFinite(duracao) && duracao > 0 ? duracao : sv.duracao, porte: p };
}
export const servicosPorIds = (state, ids, porte) => ids.map((id) => state.servicos.find((s) => s.id === id)).filter(Boolean).map((s) => servicoNoPorte(s, porte));
// Os serviços de um agendamento, com o preço e a duração do porte do veículo dele.
export const servicosDoAg = (state, a) => servicosPorIds(state, a.servicoIds, a.porte);
// Materiais que o serviço consome. Combo sem lista própria consome a soma dos materiais dos serviços que o compõem.
export function materiaisDoServico(state, sv) {
  if (!sv.combo || (sv.materiais || []).length) return sv.materiais || [];
  const soma = new Map();
  for (const id of sv.componentes || []) for (const m of state.servicos.find((x) => x.id === id)?.materiais || []) soma.set(m.materialId, (soma.get(m.materialId) || 0) + Number(m.qtd));
  return [...soma].map(([materialId, qtd]) => ({ materialId, qtd }));
}
export const duracaoMin = (servicos) => servicos.reduce((t, s) => t + s.duracao, 0);
export const intervaloMin = (servicos) => (servicos.length ? servicos[servicos.length - 1].intervalo || 0 : 0);
export const ocupadoMin = (servicos) => duracaoMin(servicos) + intervaloMin(servicos);
export const totalPreco = (servicos) => servicos.reduce((t, s) => t + s.preco, 0);

// Com vários serviços, vale o de maior valor (empate: o primeiro).
export function maiorValor(servicos) {
  return servicos.reduce((m, s) => (!m || s.preco > m.preco ? s : m), null);
}

export function notificacoesEfetivas(servicos, estab) {
  const s = maiorValor(servicos);
  if (s && Array.isArray(s.notificacoes)) return { lista: s.notificacoes, origem: 'servico', servico: s };
  return { lista: estab.notificacoes || [], origem: 'estabelecimento', servico: s };
}

// Cancelamento do Pix pendente: configurado junto das notificações (estabelecimento e serviço).
// Padrão: até o último aviso. Se não há avisos, não há cancelamento automático (só a validade da cobrança).
export const PIX_CANCELAMENTO_PADRAO = { modo: 'ultimo_aviso', dias: 1, hora: '17:00', horas: '02:00' };
export function pixCancelamentoEfetivo(servicos, estab) {
  const s = maiorValor(servicos);
  const cfg = s && Array.isArray(s.notificacoes) ? s.pixCancelamento : estab.pixCancelamento;
  return { ...PIX_CANCELAMENTO_PADRAO, ...(cfg || {}) };
}
export function momentoCancelamentoPix(cfg, lista, inicio) {
  if (cfg.modo === 'nunca') return null;
  if (cfg.modo === 'ultimo_aviso') return lista.length ? Math.max(...lista.slice(0, 10).map((n) => momentoNotificacao(n, inicio))) : null;
  return momentoNotificacao(cfg.modo === 'dias' ? { modo: 'dias', dias: cfg.dias, hora: cfg.hora } : { modo: 'horas', horas: cfg.horas }, inicio);
}

export function exigeConfirmacaoServico(servicos, estab) {
  return servicos.some((s) => (s.confirmacaoServico === null || s.confirmacaoServico === undefined ? !!estab.confirmacaoServico : !!s.confirmacaoServico));
}

export function antecedenciaMinH(servicos) {
  const s = maiorValor(servicos);
  return s ? s.antecedenciaH || 0 : 0;
}

// ---------- notificações ----------
export function momentoNotificacao(n, inicio) {
  if (n.modo === 'dias') {
    return tsAt(addDays(startOfDay(inicio), -(n.dias || 0)), n.hora || '18:00');
  }
  return inicio - parseHM(n.horas || '02:00') * MIN;
}

// Plano de envio, congelado quando o agendamento nasce ou é remarcado.
// A primeira notificação é sempre a pergunta de confirmação. Perguntas só saem no horário comercial.
export function montarPlano({ inicio, servicos, estab, agora }) {
  const { lista } = notificacoesEfetivas(servicos, estab);
  return lista.slice(0, 10).map((n, idx) => {
    const tipo = idx === 0 ? 'pergunta' : n.tipo || 'aviso';
    const programado = momentoNotificacao(n, inicio);
    let enviarEm = programado;
    let estado = 'pendente';
    if (programado <= agora) estado = 'pulada';
    else if (tipo === 'pergunta') enviarEm = proximaAbertura(estab, programado);
    if (estado === 'pendente' && (enviarEm === null || enviarEm >= inicio)) estado = 'pulada';
    return { idx, tipo, programado, enviarEm, estado, enviadaEm: null };
  });
}

// Lembretes ao cliente que agendou pelo link: 24 h e 2 h antes. O que já passou na hora de agendar nasce 'pulada'.
export const LEMBRETES_H = [24, 2];
export const montarLembretes = ({ inicio, agora }) => LEMBRETES_H.map((horas) => {
  const enviarEm = inicio - horas * HORA;
  return { horas, enviarEm, estado: enviarEm <= agora ? 'pulada' : 'pendente', enviadaEm: null };
});

// ---------- aparência do status ----------
export function statusVisual(a, agora) {
  if (a.status === STATUS.CANCELADO) return { chave: 'cinza', rotulo: 'Cancelado', check: false };
  if (a.status === STATUS.CONCLUIDO) return { chave: 'verde', rotulo: 'Concluído', check: true };
  if (a.status === STATUS.CONFIRMADO) return { chave: 'azul', rotulo: 'Confirmado', check: false };
  if (a.clienteAgendou) return { chave: 'roxo', rotulo: 'Cliente agendou', check: false }; // pediu pelo link e aguarda o estabelecimento confirmar
  const plano = (a.plano || []).filter((p) => p.estado !== 'pulada');
  const semResposta = plano.length ? plano.every((p) => p.estado === 'enviada') : agora >= a.inicio;
  if (semResposta) return { chave: 'vermelho', rotulo: 'A confirmar, sem resposta', check: false };
  return { chave: 'amarelo', rotulo: 'A confirmar', check: false };
}

// ---------- ocupação, conflitos e boxes ----------
// O que um atendimento ocupa: `profissional` = blocos em que a pessoa está trabalhando (mais o intervalo depois do último) e `box` = a janela em que o carro
// fica no box, da entrada até o fim do último bloco + intervalo (um serviço de vários dias mantém o carro lá entre um dia e outro).
// `retirada` = quando o serviço termina. Devolve null se a entrada não é horário de trabalho do profissional ou se o serviço não cabe.
export function ocupacao(state, { profissionalId, inicio, servicoIds, porte }) {
  const sv = servicosPorIds(state, servicoIds, porte);
  const est = state.usuarios.find((u) => u.id === profissionalId);
  if (!est || !sv.length || !Number.isInteger(inicio)) return null;
  const minutos = duracaoMin(sv);
  const blocos = sv.some((x) => x.multiDia)
    ? blocosDeTrabalho(state.estabelecimento, est, inicio, minutos)
    : (cabeEm(faixasDoProfissional(state.estabelecimento, est, inicio), inicio, inicio + minutos * MIN) ? [[inicio, inicio + minutos * MIN]] : null);
  return blocos ? montarOcupacao(blocos, intervaloMin(sv)) : null;
}
function montarOcupacao(blocos, intervalo) {
  const fimServico = blocos[blocos.length - 1][1];
  const fimOcupado = fimServico + intervalo * MIN;
  const profissional = blocos.map((b, i) => (i === blocos.length - 1 ? [b[0], fimOcupado] : b));
  const dias = Math.round((startOfDay(fimServico - 1) - startOfDay(blocos[0][0])) / DIA) + 1;
  return { blocos, profissional, box: [blocos[0][0], fimOcupado], retirada: fimServico, dias };
}
// Ocupação de um agendamento que já existe. Se a escala mudou e o serviço não cabe mais, vale a janela simples (nunca some da conta).
export function ocupacaoDe(state, a) {
  const o = ocupacao(state, { profissionalId: a.profissionalId, inicio: a.inicio, servicoIds: a.servicoIds, porte: a.porte });
  if (o) return o;
  const sv = servicosDoAg(state, a);
  return montarOcupacao([[a.inicio, a.inicio + duracaoMin(sv) * MIN]], intervaloMin(sv));
}
// Quando o carro pode ser retirado (fim do serviço).
export const retiradaDe = (state, a) => ocupacaoDe(state, a).retirada;

// Janela em que o carro ocupa o box (da entrada ao fim do último bloco + intervalo).
export function janelaOcupada(state, a) {
  return ocupacaoDe(state, a).box;
}

export const sobrepoe = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

// Agendamentos ativos que colidem com `ocup` (ou com a janela simples [inicio, fim]): mesmo profissional em blocos que se sobrepõem, ou mesmo box em janelas que se sobrepõem.
export function acharConflitos(state, { profissionalId, boxId, inicio, fim, ocup, ignoreId }) {
  const o = ocup || { profissional: [[inicio, fim]], box: [inicio, fim] };
  return state.agendamentos.filter((x) => {
    if (x.id === ignoreId || !ATIVOS.includes(x.status)) return false;
    const xo = ocupacaoDe(state, x);
    const doProfissional = !!profissionalId && x.profissionalId === profissionalId && o.profissional.some(([a, b]) => xo.profissional.some(([c, d]) => sobrepoe(a, b, c, d)));
    const doBox = !!boxId && !!x.boxId && x.boxId === boxId && sobrepoe(o.box[0], o.box[1], xo.box[0], xo.box[1]);
    return doProfissional || doBox;
  });
}

export const boxesAtivos = (state) => (state.estabelecimento.boxes || []).filter((b) => b.ativo !== false);
export const nomeBox = (state, id) => (state.estabelecimento.boxes || []).find((b) => b.id === id)?.nome || '';
// Box para o atendimento: o pedido (se estiver livre), senão o preferido (o que já tinha), senão o primeiro livre. Box nunca é "forçado": dois carros não ocupam o mesmo.
export function escolherBox(state, ocup, { boxId, preferido, ignoreId } = {}) {
  if (!cap(state.estabelecimento, 'usaRecursoFisico')) return { id: null }; // tipo sem box/cadeira reservada
  const ativos = boxesAtivos(state);
  if (!ativos.length) return { erro: 'Cadastre ao menos um box em Estabelecimento > Boxes.' };
  const livre = (id) => !acharConflitos(state, { boxId: id, ocup: { profissional: [], box: ocup.box }, ignoreId }).length;
  if (boxId) {
    const b = ativos.find((x) => x.id === boxId);
    if (!b) return { erro: 'Box não encontrado.' };
    return livre(b.id) ? { id: b.id } : { erro: `${b.nome} está ocupado nesse horário.` };
  }
  const ordem = [...(preferido && ativos.some((b) => b.id === preferido) ? [preferido] : []), ...ativos.map((b) => b.id).filter((i) => i !== preferido)];
  const achado = ordem.find(livre);
  if (achado) return { id: achado };
  return { erro: ativos.length === 1 ? 'O box está ocupado nesse horário.' : 'Todos os boxes estão ocupados nesse horário.' };
}

// Valida data e hora de um agendamento. Erros bloqueiam; avisos só informam. O preço e a duração dependem do porte do veículo.
// Devolve também o box escolhido (`boxId`), a `retirada` e os `dias` que o carro fica.
// Horário fixo de assinante (plano): quem não é o assinante nunca toma esse horário, nem antes de o fixo virar agendamento (ele só nasce com DIAS_FIXOS_A_FRENTE de antecedência).
// Fixo que já virou agendamento vale pelo próprio agendamento (conflito normal); dia em que o fixo foi cancelado fica livre. Só a equipe, marcando encaixe, passa por cima.
function fixoReservado(state, { profissionalId, ocup, clienteId, agora }) {
  const ativas = (state.assinaturas || []).filter((as) => as.status === 'ativa' && as.clienteId !== clienteId && (as.fixos || []).length);
  if (!ativas.length) return false;
  const dias = new Set(ocup.profissional.map(([a]) => startOfDay(a)));
  for (const as of ativas) for (const fx of as.fixos) {
    if (fx.profissionalId !== profissionalId) continue;
    for (const dia of dias) {
      if (dow(dia) !== fx.dia) continue;
      const t = tsAt(dia, fx.hm);
      if (agora && t <= agora) continue;
      if (state.agendamentos.some((x) => ehDoFixo(x, fx, t))) continue;
      const porte = ((state.clientes.find((c) => c.id === as.clienteId) || {}).veiculos || []).find((v) => v.id === fx.veiculoId)?.porte; // tipo com veículo: a janela é a do porte dele
      const o = ocupacao(state, { profissionalId, inicio: t, servicoIds: fx.servicoIds, porte });
      if (o && o.profissional.some(([a, b]) => ocup.profissional.some(([c, d]) => sobrepoe(a, b, c, d)))) return true;
    }
  }
  return false;
}

export function validarHorario(state, { profissionalId, inicio, servicoIds, porte, boxId, boxPreferido, ignoreId, encaixe = false, origem = 'painel', agora, clienteId }) {
  const erros = [];
  const cliente = origem === 'whatsapp' || origem === 'link'; // o próprio cliente agenda: prazos de cliente
  const e0 = errosServicoIds(state, servicoIds);
  if (e0) return { erros: [e0], pendentes: [], confirmados: [], servicos: [], duracao: 0, ocupado: 0, boxId: null, retirada: null, dias: 1 };
  const sv = servicosPorIds(state, servicoIds, porte);
  const profissional = state.usuarios.find((u) => u.id === profissionalId);
  const out = { erros, pendentes: [], confirmados: [], servicos: sv, duracao: duracaoMin(sv), ocupado: ocupadoMin(sv), porte: sv[0] ? sv[0].porte : capAtiva('precoPorPorte') ? PORTE_PADRAO : undefined, boxId: null, retirada: null, dias: 1 };
  if (!profissional) erros.push(`Escolha o ${rot('profissional')}.`);
  if (!sv.length) erros.push('Escolha ao menos um serviço.');
  if (!inicio) erros.push('Escolha a data e a hora.');
  else if (!Number.isInteger(inicio) || inicio % MIN !== 0) erros.push('Data e hora inválidas.');
  else if (agora && inicio > agora + (cliente ? 60 : 400) * DIA) erros.push(cliente ? 'Só dá para agendar com até 60 dias de antecedência.' : 'Data distante demais.');
  if (profissional && !profissional.atende) erros.push(`${profissional.apelido || profissional.nome} está desativado e não recebe novos agendamentos.`);
  if (erros.length) return out;
  const ocup = ocupacao(state, { profissionalId, inicio, servicoIds, porte });
  if (!ocup) {
    const trabalha = faixasDoProfissional(state.estabelecimento, profissional, inicio).some(([a, b]) => inicio >= a && inicio < b);
    erros.push(trabalha && sv.some((x) => x.multiDia) ? 'Não há expediente suficiente nos próximos dias para concluir esse serviço.' : `${profissional.apelido || profissional.nome} não atende nesse horário.`);
    return out;
  }
  out.retirada = ocup.retirada; out.dias = ocup.dias; out.ocup = ocup;
  if (cliente) {
    const min = antecedenciaMinH(sv);
    if (inicio < agora + min * HORA) erros.push(`Esse serviço exige ${min} h de antecedência.`);
  }
  const conflitos = acharConflitos(state, { profissionalId, ocup, ignoreId });
  const dono = clienteId ?? (ignoreId ? state.agendamentos.find((x) => x.id === ignoreId)?.clienteId : undefined); // remarcar o próprio horário não esbarra no próprio fixo
  if ((!encaixe || cliente) && fixoReservado(state, { profissionalId, ocup, clienteId: dono, agora })) erros.push('Esse horário é fixo de um cliente com plano. Escolha outro horário.');
  out.pendentes = conflitos.filter((c) => c.status === STATUS.A_CONFIRMAR);
  out.confirmados = conflitos.filter((c) => c.status !== STATUS.A_CONFIRMAR);
  if (!encaixe && out.confirmados.length) erros.push('Esse horário já está confirmado para outro cliente. Para forçar, marque como encaixe.');
  // o próprio cliente (link ou WhatsApp) nunca ocupa um horário já pedido ou confirmado por outro: só a equipe pode sobrepor um pedido a confirmar (e o encaixe, um confirmado)
  else if (cliente && out.pendentes.length) erros.push('Esse horário acabou de ser reservado por outro cliente. Escolha outro horário.');
  const box = escolherBox(state, ocup, { boxId, preferido: boxPreferido, ignoreId });
  if (box.erro) erros.push(box.erro); else out.boxId = box.id;
  return out;
}

// Horários livres de um profissional em um dia, a cada 10 minutos.
export function horariosLivres(state, { profissionalId, dayTs, servicoIds, porte, agora, origem = 'whatsapp', passo = 10 }) {
  const profissional = state.usuarios.find((u) => u.id === profissionalId);
  if (!profissional) return [];
  const faixas = faixasDoProfissional(state.estabelecimento, profissional, dayTs);
  const out = [];
  for (const [a, b] of faixas) {
    for (let t = a; t < b; t += passo * MIN) {
      const v = validarHorario(state, { profissionalId, inicio: t, servicoIds, porte, agora, origem });
      if (!v.erros.length) out.push(t);
    }
  }
  return out;
}

export function profissionaisDisponiveis(state, { inicio, servicoIds, porte, agora }) {
  return state.usuarios.filter((u) => u.atende && !validarHorario(state, { profissionalId: u.id, inicio, servicoIds, porte, agora, origem: 'whatsapp' }).erros.length);
}

// ---------- cliente ----------
export function ultimoAtendimento(state, clienteId, ignoreId) {
  const concl = state.agendamentos
    .filter((a) => a.clienteId === clienteId && a.id !== ignoreId && a.status === STATUS.CONCLUIDO)
    .sort((x, y) => y.inicio - x.inicio)[0];
  const nomes = (a) => servicosPorIds(state, a.servicoIds).map((s) => s.nome).join(' + ');
  if (concl) return { tipo: 'concluido', inicio: concl.inicio, servicos: nomes(concl) };
  const canc = state.agendamentos
    .filter((a) => a.clienteId === clienteId && a.id !== ignoreId && a.status === STATUS.CANCELADO)
    .sort((x, y) => y.inicio - x.inicio)[0];
  if (canc) return { tipo: 'cancelado', inicio: canc.inicio, servicos: nomes(canc) };
  return { tipo: 'primeiro' };
}

export const somenteDigitos = (s) => String(s || '').replace(/\D/g, '');

export function formatarCpf(s) {
  const d = somenteDigitos(s).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatarTelefone(s) {
  const d = somenteDigitos(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Telefone no formato nacional (DDD + número). O WhatsApp entrega o número com o código do país (5511988887777 ou +55 11 98888-7777),
// e o cadastro guarda só (11) 98888-7777; sem tirar o 55 o DDD lido seria sempre 55 e o bloqueio por DDD não funcionaria.
export function telefoneNacional(tel) {
  let d = somenteDigitos(tel).replace(/^0+/, ''); // zero de tronco (011…)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2); // 55 + DDD + 8 ou 9 dígitos
  return d;
}
// Número brasileiro: nacional (10 ou 11 dígitos, como no cadastro) ou com o código 55 na frente (12 ou 13). Qualquer outro tamanho é de outro país:
// sem essa checagem, +54 (Argentina), +51 (Peru) e +53 (Cuba) seriam lidos como os DDDs 54, 51 e 53 do RS e passariam pelo bloqueio.
export function telefoneBrasileiro(tel) {
  const d = somenteDigitos(tel).replace(/^0+/, '');
  return d.length === 10 || d.length === 11 || (d.startsWith('55') && (d.length === 12 || d.length === 13));
}
// Número de quem escreve pelo canal do WhatsApp, em formato nacional (DDD + número), ou '' quando não é um número brasileiro reconhecível.
// O canal sempre entrega o número com o código do país (55 + DDD + 8 ou 9 dígitos). Sem o 55, um número de 10 ou 11 dígitos é de outro país
// (Peru +51 9…, Cuba +53…) e, lido como nacional, cairia nos DDDs 51 e 53 e se passaria pelo cliente cadastrado ali. A única exceção é o
// formato digitado com parênteses "(51) 98000-0001", que só o simulador do painel produz.
export function telefoneDoCanal(tel) {
  const bruto = String(tel ?? '');
  const d = somenteDigitos(bruto);
  let nac = '';
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) nac = d.slice(2);
  else if ((d.length === 10 || d.length === 11) && /^\s*\+?\s*\(\d{2}\)/.test(bruto)) nac = d;
  return /^[1-9]\d/.test(nac) && !nac.startsWith('0') ? nac : '';
}
// DDD do telefone; NaN quando o número não é brasileiro (nunca está na lista de DDDs atendidos, então é bloqueado).
export const dddDe = (tel) => (telefoneBrasileiro(tel) ? Number(telefoneNacional(tel).slice(0, 2)) : NaN);

// Identifica o cliente do WhatsApp: telefone + CPF; sem CPF, telefone + nome ou apelido.
export function identificarCliente(clientes, { telefone, cpf, nome }) {
  // Só se identifica quem escreve do número cadastrado: CPF e nome apenas desempatam entre cadastros desse mesmo número.
  const tel = telefoneDoCanal(telefone);
  if (!tel) return null;
  const doNumero = clientes.filter((x) => telefoneNacional(x.telefone) === tel);
  const c = somenteDigitos(cpf);
  if (c) {
    const porCpf = doNumero.find((x) => somenteDigitos(x.cpf) === c);
    if (porCpf) return porCpf;
  }
  const n = String(nome || '').trim().toLowerCase();
  return doNumero.find((x) => !n || [x.nome, x.apelido].some((v) => String(v || '').toLowerCase() === n)) || null;
}

// ---------- permissões ----------
export const SECOES = { clientes: 'Clientes', servicos: 'Serviços', estabelecimento: 'Estabelecimento', agenda: 'Agenda', relatorios: 'Relatórios', estoque: 'Estoque', financeiro: 'Financeiro', planos: 'Planos', avaliacoes: 'Avaliações', suporte: 'Suporte' };

// Grupos de menu que o proprietário libera ou bloqueia para qualquer usuário. Relatórios fica de fora: é só do proprietário e do master
// (o profissional vê apenas os próprios números, e isso não é uma liberação).
export const SECOES_LIBERAVEIS = Object.keys(SECOES).filter((k) => k !== 'relatorios');
// O que cada perfil começa podendo, antes de o proprietário liberar ou bloquear algo (a escolha dele vale por cima).
export const PERMISSOES_PADRAO = {
  profissional: { agenda: true, clientes: true },
  atendente: { agenda: true, clientes: true, servicos: true },
  admin: {},
};
// `suporte` é o usuário que o Admin da plataforma cria em toda loja: o cliente nunca cadastra esse nome (login, nome ou apelido), sem diferenciar maiúscula, acento nem espaço sobrando.
// Espelho de Reservados.java.
export const NOME_RESERVADO = 'Nome reservado.';
export const nomeReservado = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === 'suporte';
export const ehGestor = (u) => !!u && (u.papel === 'admin' || u.papel === 'atendente'); // vê a agenda de todos, como a recepção

export function pode(user, secao) {
  if (!user) return false;
  if (user.papel === 'dono' || user.papel === 'master') return true;
  if (secao === 'relatorios') return user.papel === 'profissional';
  if (!SECOES_LIBERAVEIS.includes(secao)) return false;
  const escolha = user.permissoes?.[secao];
  if (typeof escolha === 'boolean') return escolha;
  return PERMISSOES_PADRAO[user.papel]?.[secao] === true;
}
// Só guarda a escolha explícita (true ou false) dos grupos liberáveis; qualquer outra coisa é descartada.
export const limparPermissoes = (p) => Object.fromEntries(SECOES_LIBERAVEIS.filter((k) => p && typeof p[k] === 'boolean').map((k) => [k, p[k]]));

// Quem altera o telefone de um cliente que já tem cadastro (o telefone é a identidade no WhatsApp): proprietário e admin com Clientes;
// o profissional só em cadastro seu (cliente que já teve horário com ele) ou ainda sem nenhum horário (cadastro novo).
export function podeAlterarTelefone(user, st, clienteId) {
  if (podeAutorizarVinculo(user)) return true;
  if (!user || user.papel !== 'profissional') return false;
  const dele = (st.agendamentos || []).filter((a) => a.clienteId === clienteId);
  return dele.length === 0 || dele.some((a) => a.profissionalId === user.id);
}

// ---------- comissão do profissional ----------
// Quanto do que o cliente paga fica com o profissional; o resto é do estabelecimento. Ordem: o acordo do profissional, o do serviço, o padrão do estabelecimento.
// Percentual da comissão: serviço > funcionário > estabelecimento (o mais específico vence). Proprietário e master ficam com 100% a menos que se defina outro percentual para eles.
export const COMISSAO_PADRAO = 50;
export const pctComissaoValido = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
export function pctComissao(st, profissional, servico) {
  const proprio = profissional && pctComissaoValido(profissional.comissaoPct);
  // Proprietário e master que atendem não pagam comissão a si mesmos: 100%, a menos que tenham um percentual próprio definido.
  if (profissional && (profissional.papel === 'dono' || profissional.papel === 'master') && !proprio) return 100;
  // Ordem (v91, do mais geral ao mais específico, o específico vence): estabelecimento -> funcionário -> serviço.
  if (servico && pctComissaoValido(servico.comissaoPct)) return servico.comissaoPct; // vazio (null) = herdar; 0 digitado = sem comissão neste serviço
  if (proprio) return profissional.comissaoPct; // vazio = usar a geral do estabelecimento
  const p = st?.estabelecimento?.comissaoPadrao;
  return pctComissaoValido(p) ? p : COMISSAO_PADRAO;
}
// O percentual de cada serviço é gravado no agendamento (como o preço): mudar a regra depois não mexe no que já foi combinado.
export function congelarComissoes(st, a, servicos) {
  const b = st.usuarios.find((u) => u.id === a.profissionalId);
  a.comissoes = { ...(a.comissoes || {}) };
  for (const sv of servicos) if (a.comissoes[sv.id] === undefined) a.comissoes[sv.id] = pctComissao(st, b, sv);
}
// Comissão já paga (do profissional ou de quem vendeu um produto): o atendimento não aceita mais serviço nem produto, senão o valor pago deixaria de bater.
// Formas de pagamento do atendimento local. Cada forma tem a sua conta (pode repetir); taxa e parcelamento de cartão ficam fora.
export const FORMAS_PAGAMENTO = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão' };
export const formaValida = (f) => typeof f === 'string' && Object.hasOwn(FORMAS_PAGAMENTO, f);
// Forma de pagamento que vale para um atendimento novo: a escolhida ou, sem escolha, o padrão do estabelecimento.
// null = forma inválida; '' = sem padrão e nada escolhido (precisa escolher).
export function formaEfetiva(st, informada) {
  if (informada !== undefined && informada !== null && informada !== '') return formaValida(informada) ? informada : null;
  const padrao = st.estabelecimento.formaPagamentoPadrao;
  return formaValida(padrao) ? padrao : '';
}
export const usaIntegracaoPix = (st) => st.estabelecimento.usaIntegracaoPix !== false;
export const ERRO_SEM_PIX = 'Este estabelecimento não usa a integração Pix. Ligue em Estabelecimento > Regras para usar cobrança, QR e extrato.';
export const comissaoJaPaga = (a) => !!a && (!!a.comissaoPaga || (a.produtos || []).some((p) => !!p.comissaoPaga));
export const ERRO_COMISSAO_PAGA = 'A comissão deste atendimento já foi paga: não dá mais para mudar serviços nem produtos. Abra um novo atendimento com o item.';
export const ehDono = (u) => !!u && (u.papel === 'dono' || u.papel === 'master');

// Cliente que trocou de número: o CPF reconhece o cadastro antigo, mas o número novo só passa a valer depois que o proprietário
// (ou um admin com acesso a Clientes) autoriza. Profissional não autoriza.
export const podeAutorizarVinculo = (u) => !!u && (ehDono(u) || (ehGestor(u) && pode(u, 'clientes')));
// Cadastro que já tem esse CPF com OUTRO telefone (null se o CPF é inválido, não existe ou já está neste número).
export function cadastroPorCpf(clientes, { telefone, cpf }) {
  if (!cpfValido(cpf)) return null;
  const c = somenteDigitos(cpf);
  const tel = telefoneDoCanal(telefone);
  if (!tel) return null;
  return clientes.find((x) => somenteDigitos(x.cpf) === c && telefoneNacional(x.telefone) !== tel) || null;
}
export const papelRotulo = (u) => ({ dono: 'Proprietário', admin: 'Admin', master: 'Master', profissional: Rot('profissional'), atendente: 'Atendente' }[u.papel]);

export { DIA };

export { limparTexto };
