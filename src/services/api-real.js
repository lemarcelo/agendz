/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cliente HTTP da API real (Spring Boot). SÓ entra no build do site publicado (`src/main-real.jsx`); o Artifact e os testes de regra usam
// `api.js` (simulada, sem rede). Este é o ÚNICO arquivo de `src/` com `fetch` (tests/estatico.test.mjs confere isso e que o Artifact não o importa).
//
// Regras: a loja vem do endereço (Host), nunca de um campo; o token fica SÓ em memória (nunca localStorage/sessionStorage/cookie: recarregar a
// página pede o login de novo); nenhuma função lança erro: devolve { ok, ... } com mensagem em português; erro técnico nunca vira texto cru na tela.
// Docs: docs/F2-front-na-api-real.md. Rotas: POST /api/auth/login, PUT /api/usuarios/me/senha, GET /api/publico/loja, /api/onboarding/*, /api/clientes, /api/servicos, /api/usuarios.

let base = ''; // '' = mesmo endereço do site (o Caddy manda /api/* para a API); os testes apontam para um servidor falso
let token = null;
let sessao = null; // { nome, papel, deveTrocarSenha, onboardingPendente } (sem o token)
let aoEsperar = null; // (esperando: boolean) → a tela mostra "sem conexão, aguardando"
let esperas = []; // chamadas paradas esperando a internet voltar

const TEMPO_MAX_MS = 15000;

export function configurar({ base: b } = {}) {
  base = typeof b === 'string' ? b.replace(/\/+$/, '') : '';
  token = null; sessao = null;
}

export const sessaoAtual = () => (sessao ? { ...sessao } : null);
export const sair = () => { token = null; sessao = null; };
export const quandoEsperar = (f) => { aoEsperar = typeof f === 'function' ? f : null; };
export const esperandoRede = () => esperas.length > 0;
// A pessoa desistiu de esperar: as chamadas paradas terminam com a mensagem de sem conexão (nada foi enviado).
export function cancelarEspera() { const e = esperas; esperas = []; e.forEach((x) => x.cancelar()); if (aoEsperar) aoEsperar(false); }

const semRede = () => typeof navigator !== 'undefined' && navigator.onLine === false;
// Segura a chamada enquanto o navegador estiver sem internet; volta true quando a rede voltar e false se a pessoa cancelar.
// Só se espera quando o aparelho SABE que está offline: a requisição não saiu, então reenviar nunca duplica. Queda no meio de uma resposta
// (aparelho online, resposta perdida) só é reenviada sozinha quando o pedido leva chave de repetição (`Idempotency-Key`): o servidor devolve a mesma
// resposta e nunca grava duas vezes. Sem a chave, nada é reenviado sozinho.
function esperarRede() {
  return new Promise((resolve) => {
    const item = {};
    const voltou = () => { globalThis.removeEventListener?.('online', voltou); esperas = esperas.filter((x) => x !== item); if (aoEsperar && esperas.length === 0) aoEsperar(false); resolve(true); };
    item.cancelar = () => { globalThis.removeEventListener?.('online', voltou); resolve(false); };
    esperas.push(item);
    if (aoEsperar) aoEsperar(true);
    globalThis.addEventListener?.('online', voltou);
  });
}

function mensagemPadrao(status) {
  if (status === 401) return 'Usuário ou senha inválidos';
  if (status === 403) return 'Sem permissão';
  if (status === 404) return 'Não encontrado';
  if (status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (status >= 500) return 'O servidor não respondeu. Tente de novo em instantes.';
  return 'Não foi possível concluir. Confira os dados e tente de novo.';
}

// Uma chamada. Devolve { ok: true, status, dados } ou { ok: false, status, erro } (status 0 = sem conexão).
// `chave` (opcional) vai no cabeçalho Idempotency-Key; com ela, resposta perdida com o aparelho online é reenviada sozinha (até 3 tentativas).
const ESPERAS_REENVIO_MS = [1500, 4000];
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function chamar(metodo, caminho, corpo, chave) {
  let reenvios = 0;
  for (;;) {
    if (semRede() && !(await esperarRede())) return { ok: false, status: 0, erro: 'Sem conexão com o servidor. Confira a internet e tente de novo.' };
    const r = await tentar(metodo, caminho, corpo, chave);
    if (r.status === 0 && semRede()) continue; // caiu a rede durante o envio: espera voltar e manda de novo (a requisição não chegou ao servidor)
    if (r.status === 0 && chave && reenvios < ESPERAS_REENVIO_MS.length) { await pausa(ESPERAS_REENVIO_MS[reenvios++]); continue; } // resposta perdida: a chave torna o reenvio seguro
    return r;
  }
}

// Chave de repetição: 32 caracteres aleatórios (o servidor aceita 16 a 64 de A-Z a-z 0-9 _ -).
function novaChave() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '');
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function tentar(metodo, caminho, corpo, chave) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), TEMPO_MAX_MS) : null;
  try {
    const cab = { Accept: 'application/json' };
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    if (token) cab.Authorization = `Bearer ${token}`;
    if (chave) cab['Idempotency-Key'] = chave;
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    let dados = null;
    try { dados = await r.json(); } catch { dados = null; }
    if (r.ok) return { ok: true, status: r.status, dados };
    // 401 com token = sessão vencida: some com o token (a tela volta ao login). No login o 401 é senha errada e não há token ainda.
    if (r.status === 401 && token) sair();
    const msg = dados && typeof dados.mensagem === 'string' && dados.mensagem.length <= 200 ? dados.mensagem : mensagemPadrao(r.status);
    return { ok: false, status: r.status, erro: msg };
  } catch {
    return { ok: false, status: 0, erro: 'Sem conexão com o servidor. Confira a internet e tente de novo.' };
  } finally { if (t) clearTimeout(t); }
}

const texto = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

// GET /api/publico/loja: tipo, nome, logo e tema da loja deste endereço (sem login).
export async function carregarLoja() {
  const r = await chamar('GET', '/api/publico/loja');
  if (!r.ok) return { ok: false, status: r.status, erro: r.status === 404 ? 'Loja não encontrada' : r.erro };
  const d = r.dados || {};
  return { ok: true, loja: { slug: texto(d.slug, 40), nome: texto(d.nome, 120), tipo: texto(d.tipo, 40), logo: typeof d.logo === 'string' ? d.logo : null, temaCor: texto(d.temaCor, 9) || null, temaCor2: texto(d.temaCor2, 9) || null } };
}

function guardarSessao(d) {
  if (!d || typeof d.token !== 'string' || !d.token) return false;
  token = d.token;
  sessao = { id: ID.test(String(d.id)) ? d.id : '', nome: texto(d.nome, 120), papel: texto(d.papel, 20), deveTrocarSenha: d.deveTrocarSenha === true, onboardingPendente: d.onboardingPendente === true, secoes: listaDe(d.secoes, 20).filter((x) => typeof x === 'string' && /^[a-z]{1,20}$/.test(x)) };
  return true;
}

// POST /api/auth/login
export async function entrar({ identificador, senha }) {
  const id = String(identificador ?? '').trim();
  const sn = String(senha ?? '');
  if (!id || !sn) return { ok: false, status: 0, erro: 'Informe o usuário e a senha' };
  const r = await chamar('POST', '/api/auth/login', { identificador: id.slice(0, 60), senha: sn.slice(0, 100) });
  if (!r.ok) return r;
  if (!guardarSessao(r.dados)) return { ok: false, status: 502, erro: mensagemPadrao(500) };
  return { ok: true, sessao: sessaoAtual() };
}

// Usuário (login) que a pessoa escolhe no primeiro acesso: minúsculas, 2 a 60 (mesma regra do servidor).
export const loginValido = (v) => /^[a-z0-9._-]{2,60}$/.test(String(v ?? ''));

// PUT /api/usuarios/me/senha  { senhaAtual, nova, usuario? }: devolve token novo (sem a marca de senha temporária).
// `usuario` (opcional) é o login escolhido pela própria pessoa; vem em minúsculas e sem espaços nas pontas.
export async function trocarSenha({ senhaAtual, nova, usuario }) {
  const n = String(nova ?? '');
  const novoLogin = usuario === undefined || usuario === null ? null : String(usuario).trim().toLowerCase();
  if (novoLogin !== null && !loginValido(novoLogin)) return { ok: false, status: 0, erro: 'Usuário: de 2 a 60 caracteres, só letras, números, ponto, hífen e sublinhado' };
  if (n.length < 8) return { ok: false, status: 0, erro: 'A nova senha precisa ter pelo menos 8 caracteres' };
  if (n.length > 100) return { ok: false, status: 0, erro: 'A nova senha pode ter no máximo 100 caracteres' };
  if (n === String(senhaAtual ?? '')) return { ok: false, status: 0, erro: 'A nova senha precisa ser diferente da atual' };
  const corpo = { senhaAtual: String(senhaAtual ?? '').slice(0, 100), nova: n };
  if (novoLogin !== null) corpo.usuario = novoLogin;
  const r = await chamar('PUT', '/api/usuarios/me/senha', corpo);
  if (!r.ok) return r;
  if (!guardarSessao(r.dados)) return { ok: false, status: 502, erro: mensagemPadrao(500) };
  return { ok: true, sessao: sessaoAtual() };
}

// ---------- primeiro acesso (só o dono; docs/F3-primeiro-acesso.md) ----------
const listaDe = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const lerSemana = (e) => {
  if (!e || typeof e !== 'object' || !e.semana || typeof e.semana !== 'object') return null;
  const semana = {};
  for (let d = 0; d < 7; d++) {
    const dia = e.semana[d] || e.semana[String(d)] || {};
    const faixas = listaDe(dia.faixas, 6).filter((f) => Array.isArray(f) && f.length === 2).map((f) => [texto(f[0], 5), texto(f[1], 5)]);
    semana[d] = { aberto: dia.aberto === true && faixas.length > 0, faixas };
  }
  return { semana };
};
function lerEstado(d) {
  d = d || {};
  return {
    expedienteSugerido: lerSemana(d.expedienteSugerido), expediente: lerSemana(d.expediente),
    tipo: texto(d.tipo, 40), passo: texto(d.passo, 20), concluido: d.concluido === true,
    servicos: listaDe(d.servicos, 60).map((s) => ({
      chave: texto(s && s.chave, 40), nome: texto(s && s.nome, 100), categoria: s && s.categoria ? texto(s.categoria, 60) : null,
      preco: Number(s && s.preco) || 0, duracaoMin: Number(s && s.duracaoMin) || 0,
      precos: s && s.precos && typeof s.precos === 'object' ? s.precos : null, duracoes: s && s.duracoes && typeof s.duracoes === 'object' ? s.duracoes : null,
    })),
    jaCadastrados: listaDe(d.jaCadastrados, 60).map((c) => texto(c, 40)),
  };
}
export const onboarding = {
  // GET /api/onboarding
  async carregar() { const r = await chamar('GET', '/api/onboarding'); return r.ok ? { ok: true, estado: lerEstado(r.dados) } : r; },
  // POST /api/onboarding/servicos  { itens: [{ chave, preco?, duracaoMin? }], proprios: [{ nome, categoria?, preco, duracaoMin }] }  (tudo vazio = pular)
  async servicos(itens, proprios = []) {
    const r = await chamar('POST', '/api/onboarding/servicos', { itens: listaDe(itens, 40), proprios: listaDe(proprios, 20) });
    return r.ok ? { ok: true, resultado: { criados: Number(r.dados && r.dados.criados) || 0, jaExistiam: Number(r.dados && r.dados.jaExistiam) || 0 } } : r;
  },
  // POST /api/onboarding/equipe  { pessoas: [{ nome, atende }] }  → logins e senhas temporárias (aparecem UMA vez)
  async equipe(pessoas) {
    const r = await chamar('POST', '/api/onboarding/equipe', { pessoas: listaDe(pessoas, 10) });
    if (!r.ok) return r;
    return { ok: true, pessoas: listaDe(r.dados && r.dados.pessoas, 10).map((p) => ({ nome: texto(p && p.nome, 80), login: texto(p && p.login, 60), senhaTemporaria: texto(p && p.senhaTemporaria, 40), atende: !(p && p.atende === false) })) };
  },
  // POST /api/onboarding/expediente  { semana: { 0..6: { aberto, faixas: [['09:00','12:00']] } } }  (semana vazia = pular)
  async expediente(semana) {
    const r = await chamar('POST', '/api/onboarding/expediente', { semana: semana && typeof semana === 'object' ? semana : {} });
    return r.ok ? { ok: true } : r;
  },
  // POST /api/onboarding/concluir
  async concluir() { const r = await chamar('POST', '/api/onboarding/concluir', {}); return r.ok ? { ok: true } : r; },
  // Reconfigurar com senha e desfazer (só o dono; o servidor confere tudo). Senha errada é 403 "Senha incorreta"; 5 erros bloqueiam (429).
  // POST /api/onboarding/reconfiguracoes  { senha }  → abre 30 minutos de reconfiguração
  async confirmarSenha(senha) { const r = await chamar('POST', '/api/onboarding/reconfiguracoes', { senha: texto(senha, 100) }); return r.ok ? { ok: true } : r; },
  // GET /api/onboarding/reconfiguracoes  → só contagens (nunca senha nem dado de cliente)
  async historico() { const r = await chamar('GET', '/api/onboarding/reconfiguracoes'); return r.ok ? { ok: true, itens: lerHistorico(r.dados) } : r; },
  // POST /api/onboarding/reconfiguracoes/{id}/desfazer  { senha }
  async desfazer(id, senha) { return trocarReconfiguracao(id, 'desfazer', senha); },
  // POST /api/onboarding/reconfiguracoes/{id}/refazer  { senha }
  async refazer(id, senha) { return trocarReconfiguracao(id, 'refazer', senha); },
};
const lerHistorico = (d) => listaDe(d && d.itens, 20).map((i) => ({
  id: texto(i && i.id, 40), criadaEm: texto(i && i.criadaEm, 40), por: texto(i && i.por, 120), servicosCriados: Number(i && i.servicosCriados) || 0, pessoasCriadas: Number(i && i.pessoasCriadas) || 0,
  expedienteTrocado: !!(i && i.expedienteTrocado === true), desfeitaEm: i && i.desfeitaEm ? texto(i.desfeitaEm, 40) : '', podeDesfazer: !!(i && i.podeDesfazer === true), podeRefazer: !!(i && i.podeRefazer === true),
}));
async function trocarReconfiguracao(id, acao, senha) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) return { ok: false, erro: 'Reconfiguração inválida' };
  const r = await chamar('POST', `/api/onboarding/reconfiguracoes/${id}/${acao}`, { senha: texto(senha, 100) });
  return r.ok ? { ok: true, itens: lerHistorico(r.dados) } : r;
}

// ---------- clientes (F2 parte 2; regras no servidor: ClienteService) ----------
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lerVeiculo = (v) => ({ id: texto(v && v.id, 40), placa: texto(v && v.placa, 8), marca: texto(v && v.marca, 30), modelo: texto(v && v.modelo, 40), cor: texto(v && v.cor, 20), porte: texto(v && v.porte, 16) });
function lerCliente(d) {
  d = d || {};
  return {
    id: texto(d.id, 40), nome: texto(d.nome, 100), apelido: texto(d.apelido, 100), telefone: texto(d.telefone, 20), telefoneAnterior: d.telefoneAnterior ? texto(d.telefoneAnterior, 20) : '',
    cpf: d.cpf ? texto(d.cpf, 14) : '', cpfMascarado: d.cpfMascarado ? texto(d.cpfMascarado, 14) : '', nascimento: d.nascimento ? texto(d.nascimento, 10) : '',
    dadosCompletos: d.dadosCompletos === true, veiculos: listaDe(d.veiculos, 10).map(lerVeiculo),
  };
}
export const clientes = {
  // GET /api/clientes?q=  (nome, apelido, telefone com DDD, CPF, placa ou modelo; até 500; CPF só mascarado)
  async listar(busca = '') {
    const q = String(busca ?? '').trim().slice(0, 60);
    const r = await chamar('GET', `/api/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    return r.ok ? { ok: true, clientes: listaDe(r.dados, 500).map(lerCliente) } : r;
  },
  // GET /api/clientes/{id}  (ficha: CPF completo e nascimento só para o dono, quem atende o cliente ou cadastro sem horários)
  async obter(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Cliente não encontrado' };
    const r = await chamar('GET', `/api/clientes/${id}`);
    return r.ok ? { ok: true, cliente: lerCliente(r.dados) } : r;
  },
  // POST /api/clientes  |  PUT /api/clientes/{id}   (campo ausente não muda; cpf/nascimento "" apagam; `veiculos` ausente não mexe na lista)
  async salvar(d) {
    d = d && typeof d === 'object' ? d : {};
    const corpo = {};
    for (const [k, max] of [['nome', 100], ['apelido', 100], ['telefone', 30], ['cpf', 20], ['nascimento', 10]]) if (typeof d[k] === 'string') corpo[k] = d[k].slice(0, max);
    if (Array.isArray(d.veiculos)) corpo.veiculos = d.veiculos.slice(0, 50).map((v) => ({ ...(ID.test(String(v && v.id)) ? { id: v.id } : {}), placa: texto(v && v.placa, 16), marca: texto(v && v.marca, 30), modelo: texto(v && v.modelo, 40), cor: texto(v && v.cor, 20), porte: texto(v && v.porte, 16) }));
    const edicao = d.id !== undefined && d.id !== null && d.id !== '';
    if (edicao && !ID.test(String(d.id))) return { ok: false, status: 0, erro: 'Cliente não encontrado' };
    const r = await chamar(edicao ? 'PUT' : 'POST', edicao ? `/api/clientes/${d.id}` : '/api/clientes', corpo);
    return r.ok ? { ok: true, cliente: lerCliente(r.dados) } : r;
  },
};

// ---------- serviços (F2 parte 3; regras no servidor: ServicoService) ----------
const numeroOuNulo = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const lerMapaNum = (m, max) => {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = {};
  for (const k of Object.keys(m).slice(0, 20)) { const n = numeroOuNulo(m[k]); if (n !== null && /^[a-z]{1,10}$/.test(k)) o[k] = Math.min(n, max); }
  return o;
};
function lerServico(d) {
  d = d || {};
  return {
    id: texto(d.id, 40), codigo: texto(d.codigo, 20), nome: texto(d.nome, 100), categoria: d.categoria ? texto(d.categoria, 30) : '',
    preco: numeroOuNulo(d.preco) ?? 0, duracaoMin: numeroOuNulo(d.duracaoMin) ?? 0, intervaloMin: numeroOuNulo(d.intervaloMin) ?? 0, antecedenciaH: numeroOuNulo(d.antecedenciaH) ?? 0,
    multiDia: d.multiDia === true, combo: d.combo === true, componentes: listaDe(d.componentes, 10).map((c) => texto(c, 40)).filter((c) => ID.test(c)),
    comissaoPct: numeroOuNulo(d.comissaoPct), ativo: d.ativo !== false, precos: lerMapaNum(d.precos, 100000), duracoes: lerMapaNum(d.duracoes, 14400),
  };
}
export const servicos = {
  // GET /api/servicos  (dono vê todos; profissional só os ativos)
  async listar() {
    const r = await chamar('GET', '/api/servicos');
    return r.ok ? { ok: true, servicos: listaDe(r.dados, 500).map(lerServico) } : r;
  },
  // GET /api/servicos/{id}
  async obter(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Serviço não encontrado.' };
    const r = await chamar('GET', `/api/servicos/${id}`);
    return r.ok ? { ok: true, servico: lerServico(r.dados) } : r;
  },
  // POST /api/servicos  |  PUT /api/servicos/{id}   (só o dono; preço e duração vão sempre; os demais campos ausentes não mudam)
  async salvar(d) {
    d = d && typeof d === 'object' ? d : {};
    const corpo = {};
    for (const [k, max] of [['nome', 100], ['codigo', 20], ['categoria', 30]]) if (typeof d[k] === 'string') corpo[k] = d[k].slice(0, max);
    for (const k of ['preco', 'duracaoMin', 'intervaloMin', 'antecedenciaH', 'comissaoPct']) if (typeof d[k] === 'number' && Number.isFinite(d[k])) corpo[k] = d[k];
    for (const k of ['multiDia', 'combo', 'ativo']) if (typeof d[k] === 'boolean') corpo[k] = d[k];
    const m = lerMapaNum(d.precos, 100000); if (m && d.precos) corpo.precos = m;
    const u = lerMapaNum(d.duracoes, 14400); if (u && d.duracoes) corpo.duracoes = u;
    if (Array.isArray(d.componentes)) corpo.componentes = d.componentes.slice(0, 10).map((c) => texto(c, 60));
    const edicao = d.id !== undefined && d.id !== null && d.id !== '';
    if (edicao && !ID.test(String(d.id))) return { ok: false, status: 0, erro: 'Serviço não encontrado.' };
    const r = await chamar(edicao ? 'PUT' : 'POST', edicao ? `/api/servicos/${d.id}` : '/api/servicos', corpo);
    return r.ok ? { ok: true, servico: lerServico(r.dados) } : r;
  },
  // DELETE /api/servicos/{id}  (nunca usado: apaga; com histórico ou dentro de combo: só desativa → { desativado: true })
  async remover(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Serviço não encontrado.' };
    const r = await chamar('DELETE', `/api/servicos/${id}`);
    return r.ok ? { ok: true, desativado: !!(r.dados && r.dados.desativado === true) } : r;
  },
};

// ---------- equipe (F2 parte 4; regras no servidor: UsuarioService; só o proprietário) ----------
const PAPEIS = ['dono', 'admin', 'atendente', 'profissional'];
const SECOES_API = ['clientes', 'servicos', 'estabelecimento', 'agenda', 'estoque', 'financeiro'];
function lerUsuario(d) {
  d = d || {};
  const perm = {};
  if (d.permissoes && typeof d.permissoes === 'object') for (const k of SECOES_API) if (typeof d.permissoes[k] === 'boolean') perm[k] = d.permissoes[k];
  return {
    id: texto(d.id, 40), nome: texto(d.nome, 150), apelido: d.apelido ? texto(d.apelido, 60) : '', usuario: texto(d.usuario, 60), papel: PAPEIS.includes(d.papel) ? d.papel : 'profissional',
    atende: d.atende === true, podeVender: d.podeVender !== false, comissaoPct: numeroOuNulo(d.comissaoPct), permissoes: perm, corSlot: Number.isInteger(d.corSlot) ? d.corSlot : null,
    foto: typeof d.foto === 'string' && d.foto.length <= 30000 ? d.foto : null, email: d.email ? texto(d.email, 150) : '', telefone: d.telefone ? texto(d.telefone, 20) : '',
    cpfMascarado: d.cpfMascarado ? texto(d.cpfMascarado, 14) : '', cpf: d.cpf ? texto(d.cpf, 11) : '', nascimento: d.nascimento ? texto(d.nascimento, 10) : '', deveTrocarSenha: d.deveTrocarSenha === true,
  };
}
// A senha temporária só existe na resposta de criar e de refazer: a tela a mostra uma vez e a joga fora.
const comSenha = (r) => ({ ok: true, usuario: lerUsuario(r.dados && r.dados.usuario), senhaTemporaria: texto(r.dados && r.dados.senhaTemporaria, 40) });
export const equipe = {
  // GET /api/usuarios  (só o proprietário; CPF só mascarado)
  async listar() {
    const r = await chamar('GET', '/api/usuarios');
    return r.ok ? { ok: true, usuarios: listaDe(r.dados, 200).map(lerUsuario) } : r;
  },
  // GET /api/usuarios/{id}  (ficha com CPF completo e nascimento)
  async obter(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Usuário não encontrado.' };
    const r = await chamar('GET', `/api/usuarios/${id}`);
    return r.ok ? { ok: true, usuario: lerUsuario(r.dados) } : r;
  },
  // POST /api/usuarios (devolve `senhaTemporaria` uma vez)  |  PUT /api/usuarios/{id}   (campo ausente não muda; texto vazio apaga CPF, e-mail, telefone, nascimento)
  async salvar(d) {
    d = d && typeof d === 'object' ? d : {};
    const corpo = {};
    for (const [k, max] of [['nome', 150], ['apelido', 60], ['usuario', 60], ['cpf', 20], ['nascimento', 10], ['email', 150], ['telefone', 30], ['papel', 20]]) if (typeof d[k] === 'string') corpo[k] = d[k].slice(0, max);
    if (typeof d.atende === 'boolean') corpo.atende = d.atende;
    if (typeof d.podeVender === 'boolean') corpo.podeVender = d.podeVender;
    if (typeof d.comissaoPct === 'number' && Number.isFinite(d.comissaoPct)) corpo.comissaoPct = d.comissaoPct;
    if (d.permissoes && typeof d.permissoes === 'object') corpo.permissoes = Object.fromEntries(SECOES_API.filter((k) => typeof d.permissoes[k] === 'boolean').map((k) => [k, d.permissoes[k]]));
    const edicao = d.id !== undefined && d.id !== null && d.id !== '';
    if (edicao && !ID.test(String(d.id))) return { ok: false, status: 0, erro: 'Usuário não encontrado.' };
    const r = await chamar(edicao ? 'PUT' : 'POST', edicao ? `/api/usuarios/${d.id}` : '/api/usuarios', corpo);
    if (!r.ok) return r;
    return edicao ? { ok: true, usuario: lerUsuario(r.dados) } : comSenha(r);
  },
  // PUT /api/usuarios/{id}/atendimento
  async definirAtendimento(id, atende) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Usuário não encontrado.' };
    const r = await chamar('PUT', `/api/usuarios/${id}/atendimento`, { atende: atende === true });
    return r.ok ? { ok: true, usuario: lerUsuario(r.dados) } : r;
  },
  // POST /api/usuarios/{id}/senha-temporaria  (nova senha temporária, uma vez; a pessoa troca no próximo acesso)
  async refazerSenha(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Usuário não encontrado.' };
    const r = await chamar('POST', `/api/usuarios/${id}/senha-temporaria`, {});
    return r.ok ? comSenha(r) : r;
  },
  // DELETE /api/usuarios/{id}  (só quem nunca teve agendamento; a tela oferece "parar de atender" no lugar)
  async remover(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Usuário não encontrado.' };
    const r = await chamar('DELETE', `/api/usuarios/${id}`);
    return r.ok ? { ok: true } : r;
  },
};

// ---------- agenda (F2 parte 5b; regras no servidor: AgendaController) ----------
const STATUS_AGENDA = ['a_confirmar', 'confirmado', 'concluido', 'cancelado'];
const instante = (v) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
function lerAgendamento(d) {
  d = d || {};
  const inicio = instante(d.inicio);
  return {
    id: texto(d.id, 40), clienteId: ID.test(String(d.clienteId)) ? d.clienteId : null, profissionalId: texto(d.profissionalId, 40),
    inicio, fim: instante(d.fim), fimOcupado: instante(d.fimOcupado), status: STATUS_AGENDA.includes(d.status) ? d.status : 'a_confirmar',
    encaixe: d.encaixe === true, total: numeroOuNulo(d.total) ?? 0,
    servicos: listaDe(d.servicos, 20).map((i) => ({ servicoId: texto(i && i.servicoId, 40), nome: texto(i && i.nome, 100), preco: numeroOuNulo(i && i.preco) ?? 0, duracaoMin: numeroOuNulo(i && i.duracaoMin) ?? 0 })),
    conflitosPendentes: listaDe(d.conflitosPendentes, 50).map((c) => texto(c, 40)).filter((c) => ID.test(c)),
    origem: texto(d.origem, 20), reagendado: d.reagendado === true, motivoCancelamento: d.motivoCancelamento ? texto(d.motivoCancelamento, 30) : '', statusManual: d.statusManual === true,
    nomeAvulso: d.nomeAvulso ? texto(d.nomeAvulso, 100) : '', motivoRetroativo: d.motivoRetroativo ? texto(d.motivoRetroativo, 300) : '',
    historico: listaDe(d.historico, 100).map((e) => ({ em: instante(e && e.em), autor: texto(e && e.autor, 80), campo: texto(e && e.campo, 40), de: e && e.de ? texto(e.de, 120) : '', para: e && e.para ? texto(e.para, 200) : '' })),
  };
}
const soDia = (ts) => (Number.isFinite(ts) ? new Date(ts).toISOString() : null);
let ultimaTentativa = { assinatura: '', chave: '' };
export const agenda = {
  // GET /api/agendamentos?de=&ate=  (até 366 dias, 1000 itens; o profissional só recebe os dele)
  async listar({ de, ate }) {
    const a = soDia(de), b = soDia(ate);
    if (!a || !b || !(ate > de)) return { ok: false, status: 0, erro: 'Período inválido.' };
    const r = await chamar('GET', `/api/agendamentos?de=${encodeURIComponent(a)}&ate=${encodeURIComponent(b)}`);
    return r.ok ? { ok: true, agendamentos: listaDe(r.dados, 1000).map(lerAgendamento) } : r;
  },
  // GET /api/agendamentos/{id}  (com o histórico: quem, quando, o quê)
  async obter(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    const r = await chamar('GET', `/api/agendamentos/${id}`);
    return r.ok ? { ok: true, agendamento: lerAgendamento(r.dados) } : r;
  },
  // POST /api/atendimentos  (botão Atender: data futura = agendamento a confirmar/confirmado; sem data, agora ou passado = atendimento local já concluído.
  // Telefone acha ou cria o cadastro do cliente; só o nome não cria. Dia anterior exige `motivoRetroativo`. Produto, pagamento e comissão: parte 5d.)
  async atender(d) {
    d = d && typeof d === 'object' ? d : {};
    if (!Array.isArray(d.servicoIds) || d.servicoIds.length === 0) return { ok: false, status: 0, erro: 'Escolha ao menos um serviço.' };
    const ids = d.servicoIds.slice(0, 10).map((x) => String(x ?? ''));
    if (!ids.every((x) => ID.test(x))) return { ok: false, status: 0, erro: 'Serviço não encontrado.' };
    const corpo = { servicoIds: ids };
    for (const [k, max] of [['nome', 100], ['telefone', 30], ['motivoRetroativo', 300]]) if (typeof d[k] === 'string' && d[k].trim()) corpo[k] = d[k].slice(0, max);
    for (const k of ['clienteId', 'profissionalId']) {
      if (d[k] === undefined || d[k] === null || d[k] === '') continue;
      if (!ID.test(String(d[k]))) return { ok: false, status: 0, erro: k === 'clienteId' ? 'Cliente não encontrado.' : 'Profissional não encontrado.' };
      corpo[k] = d[k];
    }
    if (d.inicio !== undefined && d.inicio !== null) { const i = soDia(d.inicio); if (!i) return { ok: false, status: 0, erro: 'Data e hora inválidas.' }; corpo.inicio = i; }
    if (d.status !== undefined && d.status !== null && d.status !== '') { if (!['a_confirmar', 'confirmado'].includes(d.status)) return { ok: false, status: 0, erro: 'Agendamento futuro nasce a confirmar ou confirmado.' }; corpo.status = d.status; }
    if (typeof d.encaixe === 'boolean') corpo.encaixe = d.encaixe;
    // Mesmo pedido de novo (clique repetido depois de um erro de rede) usa a mesma chave: o servidor devolve o que já fez e não grava duas vezes.
    // Pedido diferente, ou depois de um sucesso, ganha chave nova (dois atendimentos iguais de propósito continuam possíveis).
    const assinatura = JSON.stringify(corpo);
    if (ultimaTentativa.assinatura !== assinatura) ultimaTentativa = { assinatura, chave: novaChave() };
    const r = await chamar('POST', '/api/atendimentos', corpo, ultimaTentativa.chave);
    if (r.ok) ultimaTentativa = { assinatura: '', chave: '' };
    return r.ok ? { ok: true, agendamento: lerAgendamento(r.dados) } : r;
  },
  // PUT /api/agendamentos/{id}/status  { status }   (reativar confere o horário; confirmar cancela os "a confirmar" que o cobrem)
  async mudarStatus(id, status) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    if (!STATUS_AGENDA.includes(status)) return { ok: false, status: 0, erro: 'Status inválido.' };
    const r = await chamar('PUT', `/api/agendamentos/${id}/status`, { status });
    return r.ok ? { ok: true, agendamento: lerAgendamento(r.dados) } : r;
  },
  // PUT /api/agendamentos/{id}/remarcar  { inicio, profissionalId?, encaixe?, status? }   (concluído nunca; cancelado só junto com um status não cancelado)
  async remarcar(id, { inicio, profissionalId, encaixe, status } = {}) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    const novo = soDia(inicio);
    if (!novo) return { ok: false, status: 0, erro: 'Informe a nova data e hora.' };
    const corpo = { inicio: novo };
    if (profissionalId !== undefined && profissionalId !== null && profissionalId !== '') { if (!ID.test(String(profissionalId))) return { ok: false, status: 0, erro: 'Profissional não encontrado.' }; corpo.profissionalId = profissionalId; }
    if (typeof encaixe === 'boolean') corpo.encaixe = encaixe;
    if (status !== undefined) { if (!STATUS_AGENDA.includes(status)) return { ok: false, status: 0, erro: 'Status inválido.' }; corpo.status = status; }
    const r = await chamar('PUT', `/api/agendamentos/${id}/remarcar`, corpo);
    return r.ok ? { ok: true, agendamento: lerAgendamento(r.dados) } : r;
  },
};

// GET /api/profissionais  (quem pode aparecer na agenda: usuários ativos; `atende` diz se têm agenda própria)
export const profissionais = {
  async listar() {
    const r = await chamar('GET', '/api/profissionais');
    return r.ok ? { ok: true, profissionais: listaDe(r.dados, 200).map((p) => ({ id: texto(p && p.id, 40), nome: texto(p && p.nome, 150), papel: PAPEIS.includes(p && p.papel) ? p.papel : 'profissional', atende: !!(p && p.atende === true) })).filter((p) => ID.test(p.id)) } : r;
  },
};
