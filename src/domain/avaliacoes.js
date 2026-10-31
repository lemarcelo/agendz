/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Avaliações do atendimento (puro): validar, token pessoal por agendamento, resumo, filtros, regra de anonimato e fila de mensagens em lote.
// Não conhece tela, relógio nem sessão. Spec: docs/F5-avaliacoes.md.
//
// Regras:
// - Só atendimento concluído com serviço é avaliado; uma avaliação por agendamento; não se edita nem se apaga (o dono oculta, com motivo).
// - O cliente chega por um token pessoal por agendamento (48 hex, só o HASH fica guardado, 90 dias, uso único). Telefone sozinho nunca basta.
// - Anônimo: sem a regra da plataforma (`avaliacaoMostraAnonimo`, só o Admin muda) o painel recebe "Anônimo" e NUNCA a identidade (o DTO não a carrega).
// - Fila em lote: sem API da Meta não há envio automático; é uma lista em que cada contato abre o wa.me (um clique por pessoa).
import { STATUS, servicosPorIds } from './rules.js';
import { DIA, addDays, fromYmd, startOfDay, ymd } from './time.js';
import { limparTexto } from './texto.js';
import { numeroWhatsapp } from './whatsapp.js';

export const NOTA_MIN = 1;
export const NOTA_MAX = 5;
export const TEXTO_MAX = 500;
export const TOKEN_DIAS = 90;
export const MAX_ACESSOS = 5000; // pedidos de avaliação guardados (os mais velhos saem)
export const FILA_MAX = 200;
export const PERIODO_MAX_DIAS = 366;
export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 200;
export const MODELO_MIN = 5;
export const MODELO_MAX = 300;
export const ANONIMO_ROTULO = 'Anônimo';
export const ANONIMO_REVELADO = '(avaliado como anônimo)';
// Uma só mensagem para qualquer erro de token (errado, vencido, já usado, agendamento que não é mais avaliável): não diz qual.
export const ERRO_AVALIACAO = 'Este link de avaliação não é válido ou já foi usado.';
export const MODELO_AVALIACAO_PADRAO = 'Olá, {nome}! Obrigado pela visita à {loja}. Como foi o seu atendimento? Avalie em menos de 1 minuto: {link}';
export const MODELO_AVISO_PADRAO = 'Olá, {nome}! Aqui é da {loja}. ';
export const TIPOS_FILA = ['avaliacao', 'aviso'];
export const MOTIVOS_SEM_PEDIDO = {
  nao_concluido: 'Só se pede avaliação de um atendimento concluído.',
  sem_servico: 'Este atendimento é só de produto: não gera pedido de avaliação.',
  sem_cadastro: 'Este atendimento está sem cadastro de cliente: não há como enviar o pedido. Cadastre o cliente com telefone para os próximos.',
  sem_telefone: 'Cliente sem telefone válido: não dá para enviar o pedido pelo WhatsApp. Cadastre o telefone na ficha do cliente.',
  sem_mensagens: 'Este cliente pediu para não receber mensagens.',
};

// ---------- SHA-256 síncrono (só o hash do token fica guardado; no servidor é MessageDigest) ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256hex(texto) {
  const dados = new TextEncoder().encode(String(texto));
  const n = dados.length;
  const total = (((n + 9 + 63) >> 6) << 6);
  const m = new Uint8Array(total); m.set(dados); m[n] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor((n * 8) / 0x100000000)); dv.setUint32(total - 4, (n * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rr = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3); const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------- validação ----------
export function validarAvaliacao(entrada) {
  const d = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? entrada : {};
  const bruta = typeof d.nota === 'string' && /^\s*\d{1,2}\s*$/.test(d.nota) ? Number(d.nota) : d.nota;
  if (typeof bruta !== 'number' || !Number.isInteger(bruta) || bruta < NOTA_MIN || bruta > NOTA_MAX) return { ok: false, erro: `Escolha uma nota de ${NOTA_MIN} a ${NOTA_MAX} estrelas.` };
  let texto = '';
  if (d.texto !== undefined && d.texto !== null) {
    if (typeof d.texto !== 'string') return { ok: false, erro: 'Comentário inválido.' };
    if (d.texto.length > TEXTO_MAX) return { ok: false, erro: `O comentário pode ter até ${TEXTO_MAX} caracteres.` };
    texto = limparTexto(d.texto, TEXTO_MAX).trim();
  }
  if (d.anonimo !== undefined && d.anonimo !== null && typeof d.anonimo !== 'boolean') return { ok: false, erro: 'Opção de anonimato inválida.' };
  return { ok: true, dados: { nota: bruta, texto, anonimo: d.anonimo === true } };
}
export function validarMotivo(m) {
  const t = typeof m === 'string' ? limparTexto(m, MOTIVO_MAX + 1).trim() : '';
  return t.length >= MOTIVO_MIN && t.length <= MOTIVO_MAX && m.length <= MOTIVO_MAX ? { ok: true, motivo: t } : { ok: false, erro: `Explique o motivo (${MOTIVO_MIN} a ${MOTIVO_MAX} letras).` };
}

// ---------- token pessoal por agendamento ----------
const TOKEN = /^[0-9a-f]{48}$/;
export function novoToken() {
  const b = new Uint8Array(24); globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
export const tokenValido = (t) => typeof t === 'string' && TOKEN.test(t);
export const avaliacaoDe = (s, agendamentoId) => (s.avaliacoes || []).find((x) => x.agendamentoId === agendamentoId) || null;

// Pedido novo de um agendamento: o token anterior ainda não usado deixa de valer (um link vivo por agendamento). Devolve o token (só aparece aqui, uma vez).
export function emitirAcesso(s, agendamentoId, agora) {
  const lista = (s.avaliacaoAcessos ||= []);
  for (let i = lista.length - 1; i >= 0; i--) if (lista[i].expiraEm <= agora || (lista[i].agendamentoId === agendamentoId && !lista[i].usadoEm)) lista.splice(i, 1);
  const token = novoToken();
  lista.push({ hash: sha256hex(token), agendamentoId, criadoEm: agora, expiraEm: agora + TOKEN_DIAS * DIA, usadoEm: null });
  if (lista.length > MAX_ACESSOS) lista.splice(0, lista.length - MAX_ACESSOS);
  return token;
}
// Acha o acesso do token: formato, hash, validade, uso único e agendamento ainda avaliável. Qualquer falha = null (a resposta é sempre a mesma).
export function acharAcesso(s, token, agora) {
  if (!tokenValido(token)) return null;
  const hash = sha256hex(token);
  const ac = (s.avaliacaoAcessos || []).find((x) => x.hash === hash);
  if (!ac || ac.usadoEm || ac.expiraEm <= agora) return null;
  const a = (s.agendamentos || []).find((x) => x.id === ac.agendamentoId);
  if (!a || a.status !== STATUS.CONCLUIDO || !(a.servicoIds || []).length || avaliacaoDe(s, a.id)) return null;
  return { acesso: ac, agendamento: a };
}

// Por que um atendimento não pode receber o pedido (ou 'ok'). Mesma regra para a estrela e para a fila em lote.
export function situacaoDoPedido(s, a) {
  if (!a || a.status !== STATUS.CONCLUIDO) return 'nao_concluido';
  if (!(a.servicoIds || []).length) return 'sem_servico';
  const cli = a.clienteId ? (s.clientes || []).find((c) => c.id === a.clienteId) : null;
  if (!cli) return 'sem_cadastro';
  if (!numeroWhatsapp(cli.telefone)) return 'sem_telefone';
  if (cli.semMensagens === true) return 'sem_mensagens';
  return 'ok';
}

// ---------- gravar ----------
export function registrarAvaliacao(s, token, entrada, agora) {
  const v = validarAvaliacao(entrada);
  const achou = acharAcesso(s, token, agora);
  if (!achou) return { ok: false, erros: [ERRO_AVALIACAO] }; // token primeiro: quem não tem link válido não aprende nada sobre os campos
  if (!v.ok) return { ok: false, erros: [v.erro] };
  const { acesso, agendamento: a } = achou;
  acesso.usadoEm = agora;
  const av = { id: `av${++s.seq}`, agendamentoId: a.id, clienteId: a.clienteId || null, profissionalId: a.profissionalId || null, servicoIds: [...(a.servicoIds || [])], ...v.dados, em: agora, oculta: false };
  (s.avaliacoes ||= []).push(av);
  return { ok: true };
}

// ---------- anonimato e DTO do painel ----------
export const mostraAnonimo = (s) => s.regrasPlataforma?.avaliacaoMostraAnonimo === true;
// DTO que vai ao painel. Anônimo sem a regra da loja: NENHUM campo de identidade (nem nome, nem cliente, nem agendamento).
export function paraPainel(s, av, { verOculta = false } = {}) {
  const profissional = (s.usuarios || []).find((u) => u.id === av.profissionalId);
  const servicos = servicosPorIds(s, av.servicoIds || []).map((x) => x.nome);
  const base = { id: av.id, em: av.em, nota: av.nota, texto: av.texto, servicoIds: [...(av.servicoIds || [])], servicos, profissionalId: av.profissionalId, profissional: profissional ? profissional.apelido || profissional.nome : '—', anonimo: av.anonimo === true, oculta: av.oculta === true };
  if (verOculta && av.oculta) { base.motivoOculta = av.motivoOculta || ''; base.ocultaEm = av.ocultaEm || null; }
  if (av.anonimo === true && !mostraAnonimo(s)) return { ...base, cliente: ANONIMO_ROTULO, revelado: false };
  const c = (s.clientes || []).find((x) => x.id === av.clienteId);
  return { ...base, clienteId: av.clienteId || null, agendamentoId: av.agendamentoId, cliente: c ? c.apelido || c.nome : 'Cliente', revelado: av.anonimo === true };
}

// ---------- a estrela do cartão (v131): nota e comentário à vista ----------
// O cartão mostra o número de estrelas (1 a 5; 0 = ainda sem avaliação) e, ao tocar, o comentário. Anônimo sem a regra do Admin e avaliação oculta (para quem não é o dono)
// NUNCA mostram nota nem texto no cartão: o cartão tem o nome do cliente, então a nota o identificaria. Aí só se sabe que "foi avaliado" (nota 0, `escondida`).
export function avaliacaoDoCartao(s, agendamentoId, { verOculta = false } = {}) {
  const av = avaliacaoDe(s, agendamentoId);
  if (!av) return null;
  const nota = Number.isInteger(av.nota) && av.nota >= NOTA_MIN && av.nota <= NOTA_MAX ? av.nota : 0;
  if (!nota || (av.anonimo === true && !mostraAnonimo(s)) || (av.oculta === true && !verOculta)) return { nota: 0, texto: '', em: null, escondida: true, anonima: av.anonimo === true && !mostraAnonimo(s) };
  return { nota, texto: typeof av.texto === 'string' ? av.texto : '', em: av.em || null, escondida: false, anonima: false };
}
/** Mesmo formato, a partir de um item do painel já filtrado pelo servidor (site real). */
export function avaliacaoDoPainel(p) {
  const nota = p && Number.isInteger(p.nota) && p.nota >= NOTA_MIN && p.nota <= NOTA_MAX ? p.nota : 0;
  if (!nota) return null;
  return { nota, texto: typeof p.texto === 'string' ? p.texto : '', em: p.em || null, escondida: false, anonima: false };
}
export const rotuloDaNota = (n) => (n >= NOTA_MIN && n <= NOTA_MAX ? `${n} ${n === 1 ? 'estrela' : 'estrelas'}` : 'sem nota');

// ---------- filtros e resumo ----------
// `de`/`ate`: 'AAAA-MM-DD' (dias inclusive). Sem datas = tudo. Devolve { ini, fim } em ms (fim exclusivo) ou { erro }.
export function lerPeriodo({ de, ate } = {}) {
  const tem = (v) => v !== undefined && v !== null && v !== '';
  if (!tem(de) && !tem(ate)) return { ini: -Infinity, fim: Infinity };
  const dia = (v) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return NaN; const t = fromYmd(v); return ymd(t) === v ? t : NaN; };
  const i = dia(de); const f = dia(ate);
  if (Number.isNaN(i) || Number.isNaN(f)) return { erro: 'Informe o período com data inicial e final válidas.' };
  const fim = addDays(startOfDay(f), 1);
  if (!(fim > i)) return { erro: 'A data final não pode ser antes da inicial.' };
  if (fim - i > PERIODO_MAX_DIAS * DIA + 3600 * 1000) return { erro: `O período pode ter no máximo ${PERIODO_MAX_DIAS} dias.` };
  return { ini: i, fim };
}
const idOpc = (v) => v === undefined || v === null || v === '' || (typeof v === 'string' && v.length <= 60);
// Lista (já em forma de registro) filtrada por período da avaliação, profissional e serviço.
export function filtrarAvaliacoes(lista, filtros = {}) {
  const p = lerPeriodo(filtros);
  if (p.erro) return { erro: p.erro };
  if (!idOpc(filtros.profissionalId) || !idOpc(filtros.servicoId)) return { erro: 'Filtro inválido.' };
  const prof = filtros.profissionalId || ''; const srv = filtros.servicoId || '';
  return { lista: lista.filter((x) => x.em >= p.ini && x.em < p.fim && (!prof || x.profissionalId === prof) && (!srv || (x.servicoIds || []).includes(srv))) };
}
export function resumir(lista) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let soma = 0;
  for (const x of lista) { dist[x.nota]++; soma += x.nota; }
  return { total: lista.length, media: lista.length ? Math.round((soma / lista.length) * 10) / 10 : null, distribuicao: dist };
}

// ---------- textos ----------
const primeiroNome = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().split(' ')[0].slice(0, 40);
const VARIAVEIS = ['nome', 'link', 'loja'];
export function validarModelo(modelo, tipo) {
  if (typeof modelo !== 'string') return { ok: false, erro: 'Escreva o texto da mensagem.' };
  const t = limparTexto(modelo, MODELO_MAX + 1).trim();
  if (t.length < MODELO_MIN || modelo.length > MODELO_MAX) return { ok: false, erro: `A mensagem deve ter de ${MODELO_MIN} a ${MODELO_MAX} caracteres.` };
  const usadas = [...t.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  const estranha = usadas.find((v) => !VARIAVEIS.includes(v));
  if (estranha !== undefined) return { ok: false, erro: `Variável {${estranha.slice(0, 20)}} não existe. Use {nome}, {loja} e {link}.` };
  if (tipo === 'avaliacao' && !usadas.includes('link')) return { ok: false, erro: 'O pedido de avaliação precisa de {link} no texto.' };
  if (tipo !== 'avaliacao' && usadas.includes('link')) return { ok: false, erro: 'O {link} só vale no pedido de avaliação.' };
  return { ok: true, modelo: t };
}
export const aplicarModelo = (modelo, { nome, loja, link }) => String(modelo).replace(/\{nome\}/g, primeiroNome(nome) || 'tudo bem').replace(/\{loja\}/g, String(loja ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)).replace(/\{link\}/g, String(link ?? ''));
export const textoPedidoAvaliacao = ({ nomeEstab, nomeCliente, link }) => aplicarModelo(MODELO_AVALIACAO_PADRAO, { nome: nomeCliente, loja: nomeEstab, link });

// ---------- fila de mensagens em lote ----------
export const telefoneMascarado = (tel) => {
  const d = String(tel ?? '').replace(/\D/g, '');
  const nac = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  return nac.length >= 10 ? `(${nac.slice(0, 2)}) •••••-${nac.slice(-4)}` : '';
};
// Quem entra na fila: atendimentos concluídos (com serviço) no período, por profissional e serviço. Uma linha por pessoa (o atendimento mais recente),
// só com telefone de WhatsApp válido, sem quem pediu para não receber. No pedido de avaliação, quem já avaliou fica de fora. Até FILA_MAX.
// `soDe`: restringe a um profissional (quem só enxerga os próprios).
export function montarFila(s, filtros = {}, { soDe = '' } = {}) {
  const tipo = filtros.tipo === undefined ? 'avaliacao' : filtros.tipo;
  if (!TIPOS_FILA.includes(tipo)) return { erro: 'Tipo de mensagem inválido.' };
  const p = lerPeriodo(filtros);
  if (p.erro) return { erro: p.erro };
  if (!Number.isFinite(p.ini)) return { erro: 'Informe o período dos atendimentos (data inicial e final).' };
  if (!idOpc(filtros.profissionalId) || !idOpc(filtros.servicoId)) return { erro: 'Filtro inválido.' };
  const prof = soDe || filtros.profissionalId || ''; const srv = filtros.servicoId || '';
  const contagem = { atendimentos: 0, semCadastro: 0, semTelefone: 0, semMensagens: 0, duplicados: 0, jaAvaliou: 0, excedente: 0 };
  const candidatos = (s.agendamentos || [])
    .filter((a) => a.status === STATUS.CONCLUIDO && (a.servicoIds || []).length && a.inicio >= p.ini && a.inicio < p.fim && (!prof || a.profissionalId === prof) && (!srv || a.servicoIds.includes(srv)))
    .sort((x, y) => y.inicio - x.inicio);
  contagem.atendimentos = candidatos.length;
  const vistos = new Set(); const semFone = new Set(); const optOut = new Set();
  const itens = [];
  for (const a of candidatos) {
    const cli = a.clienteId ? (s.clientes || []).find((c) => c.id === a.clienteId) : null;
    if (!cli) { contagem.semCadastro++; continue; }
    const numero = numeroWhatsapp(cli.telefone);
    if (!numero) { if (!semFone.has(cli.id)) { semFone.add(cli.id); contagem.semTelefone++; } continue; }
    if (cli.semMensagens === true) { if (!optOut.has(cli.id)) { optOut.add(cli.id); contagem.semMensagens++; } continue; }
    if (vistos.has(numero)) { contagem.duplicados++; continue; }
    vistos.add(numero);
    if (tipo === 'avaliacao' && avaliacaoDe(s, a.id)) { contagem.jaAvaliou++; continue; }
    itens.push({ agendamentoId: a.id, clienteId: cli.id, nome: cli.apelido || cli.nome, telefoneMascarado: telefoneMascarado(cli.telefone), servicos: servicosPorIds(s, a.servicoIds, a.porte).map((x) => x.nome), inicio: a.inicio });
  }
  if (itens.length > FILA_MAX) { contagem.excedente = itens.length - FILA_MAX; itens.length = FILA_MAX; }
  return { tipo, itens, contagem };
}
