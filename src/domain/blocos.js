/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F (V60): serviço de duração indefinida e agendamento por BLOCOS. Funções puras, iguais ao servidor (AgendaController.blocosDoPedido / exigirBlocos / aplicarValores,
// ServicoService.validarIndefinida); os casos compartilhados estão em backend/src/test/resources/equivalencia/servicos.json (`indefinida`, `blocos`).
// Um bloco é [inicioMs, fimMs]. O serviço de duração indefinida tem `duracao === null` (demonstração) / `duracaoMin === null` (servidor).

const MIN = 60000;
export const TETO_VALOR = 100000;
export const MAX_BLOCOS = 200;

/** Serviço de duração indefinida (o horário se combina por WhatsApp ou o profissional marca os blocos). */
export const duracaoIndefinida = (s) => !!s && (s.duracao === null || s.duracaoMin === null);

/** Blocos do pedido: ordenados, de minuto exato, sem sobreposição e com os vizinhos fundidos. `{ok:true, blocos}` (blocos null se não vieram) ou `{ok:false, erro}`. */
export function normalizarBlocos(brutos) {
  if (!Array.isArray(brutos) || !brutos.length) return { ok: true, blocos: null };
  if (brutos.length > MAX_BLOCOS) return { ok: false, erro: 'Horários demais. Marque menos blocos.' };
  const l = [];
  for (const b of brutos) {
    const i = Array.isArray(b) ? b[0] : b && b.inicio, f = Array.isArray(b) ? b[1] : b && b.fim;
    if (!Number.isFinite(i) || !Number.isFinite(f)) return { ok: false, erro: 'Horário inválido.' };
    if (!Number.isInteger(i) || !Number.isInteger(f) || i % MIN !== 0 || f % MIN !== 0) return { ok: false, erro: 'Data e hora inválidas.' };
    if (f <= i || (f - i) / MIN > 1440) return { ok: false, erro: 'Cada horário marcado precisa ter de 1 minuto a 24 horas.' };
    l.push([i, f]);
  }
  l.sort((x, y) => x[0] - y[0]);
  const fundidos = [];
  for (const b of l) {
    const u = fundidos[fundidos.length - 1];
    if (u && b[0] < u[1]) return { ok: false, erro: 'Os horários marcados se sobrepõem.' };
    if (u && b[0] === u[1]) u[1] = b[1]; else fundidos.push([b[0], b[1]]);
  }
  if (fundidos.reduce((t, b) => t + (b[1] - b[0]) / MIN, 0) > 14400) return { ok: false, erro: 'Os horários marcados passam de 10 dias de trabalho.' };
  return { ok: true, blocos: fundidos };
}

export const minutosDosBlocos = (blocos) => (blocos || []).reduce((t, b) => t + (b[1] - b[0]) / MIN, 0);

/**
 * Serviço de duração indefinida só se agenda com blocos, e blocos só valem com ele. Na mistura com serviço de duração fixa, a soma dos blocos precisa atender no mínimo
 * a duração dos serviços fixos. `servicos` = [{nome, duracao|duracaoMin}]. Devolve o texto do erro ou null.
 */
export function erroDeBlocos(servicos, blocos) {
  const indef = servicos.filter(duracaoIndefinida);
  if (!blocos) return indef.length ? `Marque os horários de ${indef.map((s) => s.nome).join(', ')}: o serviço não tem duração fixa.` : null;
  if (!indef.length) return 'Marcar vários horários só vale para serviço de duração indefinida.';
  const fixos = servicos.filter((s) => !duracaoIndefinida(s)).reduce((t, s) => t + (Number(s.duracao ?? s.duracaoMin) || 0), 0);
  const total = minutosDosBlocos(blocos);
  return total < fixos ? `Os horários marcados somam ${total} min, e os serviços de duração fixa precisam de ao menos ${fixos} min.` : null;
}

/**
 * Valor final lançado: só em serviço de duração indefinida (sobre ele incidem total e comissão). `valores` = [{servicoId, valor}]. Devolve `{ok, precos}` (mapa id → valor
 * com 2 casas) ou `{ok:false, erro}`.
 */
export function valoresLancados(servicos, valores) {
  const precos = {};
  if (!Array.isArray(valores) || !valores.length) return { ok: true, precos };
  for (const v of valores) {
    const n = v ? Number(v.valor) : NaN;
    if (!v || typeof v.servicoId !== 'string' || !Number.isFinite(n) || n < 0 || n > TETO_VALOR) return { ok: false, erro: 'Informe um valor válido para o serviço.' };
    if (Object.hasOwn(precos, v.servicoId)) return { ok: false, erro: 'O mesmo serviço aparece duas vezes nos valores.' };
    precos[v.servicoId] = Math.round(n * 100) / 100;
  }
  for (const id of Object.keys(precos)) {
    const s = servicos.find((x) => x.id === id);
    if (!s) return { ok: false, erro: 'Valor para um serviço que não está no atendimento.' };
    if (!duracaoIndefinida(s)) return { ok: false, erro: `O valor de ${s.nome} é fixo; só dá para lançar valor em serviço de duração indefinida.` };
  }
  return { ok: true, precos };
}

/** Mesmos blocos andando junto com o agendamento (remarcar): `inicioAntigo` → `inicioNovo`. */
export const deslocarBlocos = (blocos, inicioAntigo, inicioNovo) => (blocos && blocos.length ? blocos.map(([i, f]) => [i + (inicioNovo - inicioAntigo), f + (inicioNovo - inicioAntigo)]) : undefined);

/** Preço do serviço de duração indefinida a mostrar ao cliente: "R$ 80", "R$ 80 a R$ 150" ou "A partir de R$ 80" (lista). */
export function textoDoPreco(s, dinheiro) {
  const modo = s.precoModo || 'fixo';
  if (modo === 'faixa' && s.precoMax != null) return `${dinheiro(s.preco)} a ${dinheiro(s.precoMax)}`;
  if (modo === 'lista' && (s.precoOpcoes || []).length) return `A partir de ${dinheiro(s.preco)}`;
  return dinheiro(s.preco);
}

/** Mensagem do botão "Combinar agendamento" (o dono pode ter escrito a dele). */
export function mensagemDeCombinar(nomeServico, mensagem, nomeCliente) {
  const base = String(mensagem || '').trim() || `Olá! Quero combinar o agendamento de ${nomeServico}.`;
  return nomeCliente ? `${base}\n— ${nomeCliente}` : base;
}

const limpo = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const dinheiroOk = (n) => Number.isFinite(n) && n >= 0 && n <= TETO_VALOR;
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Cadastro do serviço de duração indefinida (espelho de ServicoService.validarIndefinida, mesmas mensagens): textos, preço (valor, lista ou intervalo) e quem combina.
 * Campo ausente vale como vazio. Devolve `{ok, preco, duracaoTexto, combinarMsg, precoModo, precoOpcoes, precoMax, combinaIds}` ou `{ok:false, erro}`.
 * O preço de base é o único, o menor da lista ou o mínimo do intervalo.
 */
export function validarIndefinida(d) {
  const duracaoTexto = limpo(d.duracaoTexto);
  if (duracaoTexto.length > 120) return { ok: false, erro: 'A descrição da duração pode ter até 120 letras.' };
  const combinarMsg = limpo(d.combinarMsg);
  if (combinarMsg.length > 300) return { ok: false, erro: 'A mensagem do botão pode ter até 300 letras.' };
  const combinaIds = [...new Set((Array.isArray(d.combinaIds) ? d.combinaIds : []).filter((x) => typeof x === 'string' && x))];
  if (combinaIds.length > 20) return { ok: false, erro: 'Escolha até 20 pessoas para combinar o horário.' };
  const base = { duracaoTexto: duracaoTexto || null, combinarMsg: combinarMsg || null, combinaIds, precoOpcoes: null, precoMax: null };
  const modo = d.precoModo === undefined || d.precoModo === null || d.precoModo === '' ? 'fixo' : d.precoModo;
  if (modo === 'fixo') {
    const p = d.preco === undefined || d.preco === null || d.preco === '' ? NaN : Number(d.preco);
    if (!dinheiroOk(p)) return { ok: false, erro: 'Informe o preço.' };
    return { ok: true, ...base, precoModo: 'fixo', preco: r2(p) };
  }
  if (modo === 'lista') {
    const l = Array.isArray(d.precoOpcoes) ? d.precoOpcoes : [];
    if (l.length < 2 || l.length > 10) return { ok: false, erro: 'A lista de valores precisa de 2 a 10 opções, cada uma com descrição e valor.' };
    const opcoes = [];
    for (const o of l) {
      const desc = limpo(o && o.descricao);
      if (!desc || desc.length > 60) return { ok: false, erro: 'Cada valor da lista precisa de uma descrição de até 60 letras.' };
      const v = o && o.valor !== '' && o.valor !== null && o.valor !== undefined ? Number(o.valor) : NaN;
      if (!dinheiroOk(v)) return { ok: false, erro: 'Informe o valor de cada opção da lista.' };
      opcoes.push({ descricao: desc, valor: r2(v) });
    }
    return { ok: true, ...base, precoModo: 'lista', precoOpcoes: opcoes, preco: Math.min(...opcoes.map((o) => o.valor)) };
  }
  if (modo === 'faixa') {
    const min = d.preco === undefined || d.preco === null || d.preco === '' ? NaN : Number(d.preco);
    const max = d.precoMax === undefined || d.precoMax === null || d.precoMax === '' ? NaN : Number(d.precoMax);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { ok: false, erro: 'Informe o valor mínimo e o máximo.' };
    if (!dinheiroOk(max)) return { ok: false, erro: 'Informe o valor máximo.' };
    if (!dinheiroOk(min)) return { ok: false, erro: 'Informe o preço.' };
    if (max <= min) return { ok: false, erro: 'O valor máximo precisa ser maior que o mínimo.' };
    return { ok: true, ...base, precoModo: 'faixa', preco: r2(min), precoMax: r2(max) };
  }
  return { ok: false, erro: 'Tipo de preço inválido.' };
}

/** WhatsApp do estabelecimento (espelho de WhatsappDaLoja.normalizar): só dígitos, com ou sem o 55; vazio apaga. `{ok, valor}` (valor 55+DDD+número ou null) ou `{ok:false, erro}`. */
export function whatsappDaLoja(bruto) {
  const d = String(bruto ?? '').replace(/\D/g, '');
  if (!d) return { ok: true, valor: null };
  const completo = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return /^55\d{10,11}$/.test(completo) ? { ok: true, valor: completo } : { ok: false, erro: 'Informe o WhatsApp com DDD (ex.: 53 99999-9999).' };
}

// ---------- tela Atender: horários de 30 min marcados um a um (`horarios` = início de cada um, em ms) ----------
export const PASSO_BLOCO_MIN = 30;

/** Instante local (do aparelho) do dia "AAAA-MM-DD" a `minutos` depois da meia-noite. */
export function horarioDoDia(dia, minutos) {
  const [a, m, d] = String(dia).split('-').map(Number);
  return new Date(a, m - 1, d, Math.floor(minutos / 60), minutos % 60).getTime();
}

/** Horários de 30 min marcados → blocos [[inicio, fim]] ordenados, vizinhos fundidos. */
export function blocosDeHorarios(horarios, passoMin = PASSO_BLOCO_MIN) {
  const passo = passoMin * MIN;
  const unicos = [...new Set((horarios || []).filter(Number.isFinite))].sort((x, y) => x - y);
  const blocos = [];
  for (const t of unicos) {
    const u = blocos[blocos.length - 1];
    if (u && t === u[1]) u[1] = t + passo; else blocos.push([t, t + passo]);
  }
  return blocos;
}
