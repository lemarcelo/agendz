/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cliente HTTP da API real (Spring Boot). SÓ entra no build do site publicado (`src/main-real.jsx`); o Artifact e os testes de regra usam
// `api.js` (simulada, sem rede). Este é o ÚNICO arquivo de `src/` com `fetch` (tests/estatico.test.mjs confere isso e que o Artifact não o importa).
//
// Regras: a loja vem do endereço (Host), nunca de um campo; o token fica SÓ em memória (nunca localStorage/sessionStorage/cookie: recarregar a
// página pede o login de novo); nenhuma função lança erro: devolve { ok, ... } com mensagem em português; erro técnico nunca vira texto cru na tela.
// Docs: docs/F2-front-na-api-real.md. Rotas: POST /api/auth/login, PUT /api/usuarios/me/senha, GET /api/publico/loja, /api/onboarding/*, /api/clientes, /api/servicos, /api/usuarios.

import { MAX_BYTES, conferirImagens, lerResumoAnexo, tipoPorConteudo } from '../domain/imagem-chamado.js';
import { corpoDaSemana, erroDaSemana } from '../domain/expediente.js';
import { corValida, erroDaMarca, logoValida } from '../domain/tema.js';

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
async function chamar(metodo, caminho, corpo, chave, opcoes) {
  let reenvios = 0;
  for (;;) {
    if (semRede() && !(await esperarRede())) return { ok: false, status: 0, erro: 'Sem conexão com o servidor. Confira a internet e tente de novo.' };
    const r = await tentar(metodo, caminho, corpo, chave, opcoes);
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

// `opcoes.publico`: rota do cliente final (sem login): nunca leva o Authorization, mesmo que o painel esteja aberto no mesmo navegador. `opcoes.cabecalhos`: cabeçalhos extras.
async function tentar(metodo, caminho, corpo, chave, opcoes = {}) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), TEMPO_MAX_MS) : null;
  try {
    const cab = { Accept: 'application/json' };
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    if (token && !opcoes.publico) cab.Authorization = `Bearer ${token}`;
    if (chave) cab['Idempotency-Key'] = chave;
    if (opcoes.cabecalhos) Object.assign(cab, opcoes.cabecalhos);
    const r = await fetch(`${base}${caminho}`, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    let dados = null;
    try { dados = await r.json(); } catch { dados = null; }
    if (r.ok) return { ok: true, status: r.status, dados };
    // 401 com token = sessão vencida: some com o token (a tela volta ao login). No login o 401 é senha errada e não há token ainda.
    if (r.status === 401 && token && !opcoes.publico) sair();
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

// ---------- login por digital / rosto / PIN do aparelho (passkey, WebAuthn; regras no servidor: PasskeyService) ----------
// A passkey NUNCA substitui a senha: é uma segunda porta de entrada, que o aparelho assina. Cadastrar pede a senha de novo (recusa = 403, nunca 401).
const paraB64u = (buf) => {
  const b = new Uint8Array(buf);
  let t = '';
  for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]);
  return globalThis.btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const deB64u = (v) => {
  const t = globalThis.atob(String(v).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(v).length / 4) * 4, '='));
  const b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
  return b;
};
const B64U = /^[A-Za-z0-9_-]{1,2000}$/;
const lerPedidoPasskey = (d) => {
  d = d && typeof d === 'object' ? d : {};
  const ok = typeof d.desafioId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(d.desafioId) && B64U.test(d.desafio || '') && typeof d.rpId === 'string' && d.rpId.length > 0 && d.rpId.length <= 253;
  return ok ? { desafioId: d.desafioId, desafio: d.desafio, rpId: d.rpId, usuarioHandle: B64U.test(d.usuarioHandle || '') ? d.usuarioHandle : '', usuarioNome: texto(d.usuarioNome, 150), excluir: (Array.isArray(d.excluir) ? d.excluir : []).filter((x) => typeof x === 'string' && B64U.test(x)).slice(0, 10) } : null;
};
const recusaDoAparelho = (e) => (e && e.name === 'NotAllowedError' ? 'Cancelado ou sem resposta do aparelho.' : e && e.name === 'InvalidStateError' ? 'Este aparelho já está cadastrado.' : 'Não foi possível usar a digital neste aparelho.');
export const passkey = {
  // O navegador sabe fazer? (precisa de endereço seguro: https ou localhost)
  disponivel() {
    return !!(globalThis.isSecureContext && typeof globalThis.PublicKeyCredential === 'function' && globalThis.navigator && globalThis.navigator.credentials && typeof globalThis.btoa === 'function');
  },
  // POST /api/auth/passkey/desafio  →  navigator.credentials.get  →  POST /api/auth/passkey/entrar  (devolve a mesma sessão do login por senha)
  async entrar() {
    if (!this.disponivel()) return { ok: false, status: 0, erro: 'Este navegador não permite entrar com a digital.' };
    const a = await chamar('POST', '/api/auth/passkey/desafio', {});
    const ped = a.ok ? lerPedidoPasskey(a.dados) : null;
    if (!ped) return a.ok ? { ok: false, status: 502, erro: mensagemPadrao(500) } : a;
    let cred;
    try {
      cred = await globalThis.navigator.credentials.get({ publicKey: { challenge: deB64u(ped.desafio), rpId: ped.rpId, timeout: 60000, userVerification: 'required', allowCredentials: [] } });
    } catch (e) { return { ok: false, status: 0, erro: recusaDoAparelho(e) }; }
    if (!cred || !cred.response) return { ok: false, status: 0, erro: 'Não foi possível usar a digital neste aparelho.' };
    const r = await chamar('POST', '/api/auth/passkey/entrar', {
      desafioId: ped.desafioId, credencialId: paraB64u(cred.rawId), clientDataJSON: paraB64u(cred.response.clientDataJSON),
      authenticatorData: paraB64u(cred.response.authenticatorData), assinatura: paraB64u(cred.response.signature),
      ...(cred.response.userHandle ? { userHandle: paraB64u(cred.response.userHandle) } : {}),
    });
    if (!r.ok) return r;
    if (!guardarSessao(r.dados)) return { ok: false, status: 502, erro: mensagemPadrao(500) };
    return { ok: true, sessao: sessaoAtual() };
  },
  // POST /api/usuarios/me/passkeys/desafio { senha } → navigator.credentials.create → POST /api/usuarios/me/passkeys { desafioId, nome, clientDataJSON, atestado }
  async cadastrar({ senha, nome }) {
    if (!this.disponivel()) return { ok: false, status: 0, erro: 'Este navegador não permite cadastrar a digital.' };
    const sn = String(senha ?? '');
    if (!sn) return { ok: false, status: 0, erro: 'Digite a sua senha para cadastrar este aparelho.' };
    const a = await chamar('POST', '/api/usuarios/me/passkeys/desafio', { senha: sn.slice(0, 100) });
    const ped = a.ok ? lerPedidoPasskey(a.dados) : null;
    if (!ped || !ped.usuarioHandle) return a.ok ? { ok: false, status: 502, erro: mensagemPadrao(500) } : a;
    let cred;
    try {
      cred = await globalThis.navigator.credentials.create({ publicKey: {
        rp: { id: ped.rpId, name: 'Agendz' }, user: { id: deB64u(ped.usuarioHandle), name: ped.usuarioNome || 'usuario', displayName: ped.usuarioNome || 'usuario' },
        challenge: deB64u(ped.desafio), pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 60000, attestation: 'none',
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        excludeCredentials: ped.excluir.map((x) => ({ type: 'public-key', id: deB64u(x) })),
      } });
    } catch (e) { return { ok: false, status: 0, erro: recusaDoAparelho(e) }; }
    if (!cred || !cred.response || !cred.response.attestationObject) return { ok: false, status: 0, erro: 'Não foi possível usar a digital neste aparelho.' };
    const r = await chamar('POST', '/api/usuarios/me/passkeys', {
      desafioId: ped.desafioId, nome: texto(nome, 60).trim() || 'Este aparelho', clientDataJSON: paraB64u(cred.response.clientDataJSON), atestado: paraB64u(cred.response.attestationObject),
    });
    return r.ok ? { ok: true, item: lerItemPasskey(r.dados) } : r;
  },
  // GET /api/usuarios/me/passkeys
  async listar() {
    const r = await chamar('GET', '/api/usuarios/me/passkeys');
    return r.ok ? { ok: true, itens: (Array.isArray(r.dados) ? r.dados : []).slice(0, 10).map(lerItemPasskey) } : r;
  },
  // DELETE /api/usuarios/me/passkeys/{id}
  async remover(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) return { ok: false, status: 0, erro: 'Aparelho inválido.' };
    const r = await chamar('DELETE', `/api/usuarios/me/passkeys/${id}`);
    return r.ok ? { ok: true } : r;
  },
};
const lerItemPasskey = (d) => { d = d && typeof d === 'object' ? d : {}; return { id: texto(d.id, 40), nome: texto(d.nome, 60), criadoEm: texto(d.criadoEm, 40), ultimoUso: d.ultimoUso ? texto(d.ultimoUso, 40) : '' }; };

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
    comissaoPadrao: Number.isFinite(Number(d.comissaoPadrao)) && d.comissaoPadrao !== null ? Number(d.comissaoPadrao) : 50,
    produtosCadastrados: listaDe(d.produtosCadastrados, 200).map((n) => texto(n, 100)),
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
  // POST /api/onboarding/equipe  { pessoas: [{ nome, atende, comissaoPct?, comissaoProdutoPct? }] }  (comissaoPct ausente = usa a comissão geral; comissaoProdutoPct ausente = sem comissão sobre produtos, a menos que o produto tenha a sua)  → logins e senhas temporárias (aparecem UMA vez)
  async equipe(pessoas) {
    const lista = listaDe(pessoas, 10).map((p) => ({ nome: texto(p && p.nome, 80), atende: !(p && p.atende === false), ...(p && p.comissaoPct != null ? { comissaoPct: Number(p.comissaoPct) } : {}), ...(p && p.comissaoProdutoPct != null ? { comissaoProdutoPct: Number(p.comissaoProdutoPct) } : {}) }));
    const r = await chamar('POST', '/api/onboarding/equipe', { pessoas: lista });
    if (!r.ok) return r;
    return { ok: true, pessoas: listaDe(r.dados && r.dados.pessoas, 10).map((p) => ({ nome: texto(p && p.nome, 80), login: texto(p && p.login, 60), senhaTemporaria: texto(p && p.senhaTemporaria, 40), atende: !(p && p.atende === false) })) };
  },
  // POST /api/onboarding/produtos  { itens: [{ nome, preco, comissaoPct?, estoque? }] }  (nome que já existe na loja não é recriado)
  async produtos(itens) {
    const lista = listaDe(itens, 30).map((p) => ({ nome: texto(p && p.nome, 100), preco: Number(p && p.preco) || 0, ...(p && p.comissaoPct != null ? { comissaoPct: Number(p.comissaoPct) } : {}), ...(p && p.estoque != null ? { estoque: Number(p.estoque) } : {}) }));
    const r = await chamar('POST', '/api/onboarding/produtos', { itens: lista });
    return r.ok ? { ok: true, resultado: { criados: Number(r.dados && r.dados.criados) || 0, jaExistiam: Number(r.dados && r.dados.jaExistiam) || 0 } } : r;
  },
  // POST /api/onboarding/comissao  { padrao }  → comissão geral da loja (0 a 100)
  async comissao(padrao) {
    const r = await chamar('POST', '/api/onboarding/comissao', { padrao: Number(padrao) });
    return r.ok ? { ok: true, padrao: Number(r.dados && r.dados.padrao) } : r;
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
  id: texto(i && i.id, 40), criadaEm: texto(i && i.criadaEm, 40), por: texto(i && i.por, 120), servicosCriados: Number(i && i.servicosCriados) || 0, pessoasCriadas: Number(i && i.pessoasCriadas) || 0, produtosCriados: Number(i && i.produtosCriados) || 0,
  expedienteTrocado: !!(i && i.expedienteTrocado === true), comissaoTrocada: !!(i && i.comissaoTrocada === true), desfeitaEm: i && i.desfeitaEm ? texto(i.desfeitaEm, 40) : '', podeDesfazer: !!(i && i.podeDesfazer === true), podeRefazer: !!(i && i.podeRefazer === true),
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
    atende: d.atende === true, podeVender: d.podeVender !== false, comissaoPct: numeroOuNulo(d.comissaoPct), comissaoProdutoPct: numeroOuNulo(d.comissaoProdutoPct), permissoes: perm, corSlot: Number.isInteger(d.corSlot) ? d.corSlot : null,
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
    if (typeof d.senhaTemporaria === 'string' && d.senhaTemporaria !== '' && !(d.id !== undefined && d.id !== null && d.id !== '')) corpo.senhaTemporaria = d.senhaTemporaria.slice(0, 100); // só ao criar; vazia = o servidor gera
    if (typeof d.atende === 'boolean') corpo.atende = d.atende;
    if (typeof d.podeVender === 'boolean') corpo.podeVender = d.podeVender;
    if (typeof d.comissaoPct === 'number' && Number.isFinite(d.comissaoPct)) corpo.comissaoPct = d.comissaoPct;
    if (typeof d.comissaoProdutoPct === 'number' && Number.isFinite(d.comissaoProdutoPct)) corpo.comissaoProdutoPct = d.comissaoProdutoPct; // comissão sobre produtos da pessoa (vale quando o produto não tem a sua)
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

// ---------- produtos (5d-4a: o vendedor só vê o que precisa para vender; comissão e custo são do dono) ----------
export const produtos = {
  // GET /api/produtos  (ativos; sem comissão nem custo para quem não é dono)
  async listar() {
    const r = await chamar('GET', '/api/produtos');
    return r.ok ? { ok: true, produtos: listaDe(r.dados, 500).map((p) => ({ id: texto(p && p.id, 40), codigo: texto(p && p.codigo, 60), nome: texto(p && p.nome, 150), preco: numeroOuNulo(p && p.preco) ?? 0, estoque: numeroOuNulo(p && p.estoque) ?? 0, ativo: !(p && p.ativo === false) })).filter((p) => ID.test(p.id) && p.ativo) } : r;
  },
};

// ---------- estoque (produtos: lista completa, cadastro, entrada/saída/contagem e histórico; regras no servidor: ProdutoService) ----------
const lerProdutoEstoque = (p) => ({
  id: texto(p && p.id, 40), codigo: texto(p && p.codigo, 60), nome: texto(p && p.nome, 150), unidade: texto(p && p.unidade, 20) || 'un',
  preco: numeroOuNulo(p && p.preco) ?? 0, comissaoPct: numeroOuNulo(p && p.comissaoPct), estoque: numeroOuNulo(p && p.estoque) ?? 0,
  minimo: numeroOuNulo(p && p.minimo), custo: numeroOuNulo(p && p.custo), ativo: !(p && p.ativo === false),
});
const lerMovimento = (m) => ({
  id: texto(m && m.id, 40), em: typeof (m && m.em) === 'string' ? Date.parse(m.em) || null : (typeof (m && m.em) === 'number' ? m.em * 1000 : null),
  tipo: ['entrada', 'saida', 'ajuste'].includes(m && m.tipo) ? m.tipo : 'ajuste', delta: numeroOuNulo(m && m.delta) ?? 0, saldo: numeroOuNulo(m && m.saldo) ?? 0,
  obs: m && m.obs ? texto(m.obs, 200) : '', autor: m && m.autor ? texto(m.autor, 120) : '', venda: ID.test(String(m && m.agendamentoId)),
});
let ultimoMovimento = { assinatura: '', chave: '' };
export const estoque = {
  // GET /api/produtos  (dono e quem tem a seção estoque veem todos, inclusive desativados, com comissão, custo e mínimo)
  async listar() {
    const r = await chamar('GET', '/api/produtos');
    return r.ok ? { ok: true, produtos: listaDe(r.dados, 500).map(lerProdutoEstoque).filter((p) => ID.test(p.id)) } : r;
  },
  // POST /api/produtos  |  PUT /api/produtos/{id}  (o estoque inicial só vale na criação; depois, só por movimento)
  async salvar(d) {
    d = d && typeof d === 'object' ? d : {};
    const corpo = {};
    for (const [k, max] of [['nome', 100], ['codigo', 20], ['unidade', 20]]) if (typeof d[k] === 'string') corpo[k] = d[k].slice(0, max);
    for (const k of ['preco', 'comissaoPct', 'minimo', 'custo', 'estoque']) if (typeof d[k] === 'number' && Number.isFinite(d[k])) corpo[k] = d[k];
    if (typeof d.ativo === 'boolean') corpo.ativo = d.ativo;
    const edicao = d.id !== undefined && d.id !== null && d.id !== '';
    if (edicao && !ID.test(String(d.id))) return { ok: false, status: 0, erro: 'Produto não encontrado.' };
    if (edicao) delete corpo.estoque;
    const r = await chamar(edicao ? 'PUT' : 'POST', edicao ? `/api/produtos/${d.id}` : '/api/produtos', corpo);
    return r.ok ? { ok: true, produto: lerProdutoEstoque(r.dados) } : r;
  },
  // DELETE /api/produtos/{id}  (nunca vendido nem movimentado: apaga; senão só desativa → { desativado: true })
  async remover(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Produto não encontrado.' };
    const r = await chamar('DELETE', `/api/produtos/${id}`);
    return r.ok ? { ok: true, desativado: !!(r.dados && r.dados.desativado === true) } : r;
  },
  // GET /api/produtos/{id}/movimentos  (últimos 100)
  async movimentos(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Produto não encontrado.' };
    const r = await chamar('GET', `/api/produtos/${id}/movimentos`);
    return r.ok ? { ok: true, movimentos: listaDe(r.dados, 100).map(lerMovimento) } : r;
  },
  // POST /api/produtos/{id}/movimentos  { tipo: entrada|saida|ajuste, qtd, obs }  (leva Idempotency-Key: o mesmo pedido de novo nunca soma duas vezes)
  async movimentar(id, { tipo, qtd, obs } = {}) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Produto não encontrado.' };
    if (!['entrada', 'saida', 'ajuste'].includes(tipo)) return { ok: false, status: 0, erro: 'Escolha entrada, saída ou contagem.' };
    if (typeof qtd !== 'number' || !Number.isFinite(qtd) || qtd < 0 || (qtd === 0 && tipo !== 'ajuste')) return { ok: false, status: 0, erro: 'Informe uma quantidade válida.' };
    const corpo = { tipo, qtd, ...(typeof obs === 'string' && obs.trim() ? { obs: obs.trim().slice(0, 200) } : {}) };
    const assinatura = `${id}|${JSON.stringify(corpo)}`;
    if (ultimoMovimento.assinatura !== assinatura) ultimoMovimento = { assinatura, chave: novaChave() };
    const r = await chamar('POST', `/api/produtos/${id}/movimentos`, corpo, ultimoMovimento.chave);
    if (r.ok) ultimoMovimento = { assinatura: '', chave: '' };
    return r.ok ? { ok: true, movimento: lerMovimento(r.dados) } : r;
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
    servicos: listaDe(d.servicos, 20).map((i) => ({ servicoId: texto(i && i.servicoId, 40), nome: texto(i && i.nome, 100), preco: numeroOuNulo(i && i.preco) ?? 0, duracaoMin: numeroOuNulo(i && i.duracaoMin) ?? 0, desconto: numeroOuNulo(i && i.desconto) ?? 0 })),
    conflitosPendentes: listaDe(d.conflitosPendentes, 50).map((c) => texto(c, 40)).filter((c) => ID.test(c)),
    origem: texto(d.origem, 20), reagendado: d.reagendado === true, motivoCancelamento: d.motivoCancelamento ? texto(d.motivoCancelamento, 30) : '', statusManual: d.statusManual === true,
    nomeAvulso: d.nomeAvulso ? texto(d.nomeAvulso, 100) : '', motivoRetroativo: d.motivoRetroativo ? texto(d.motivoRetroativo, 300) : '',
    historico: listaDe(d.historico, 100).map((e) => ({ em: instante(e && e.em), autor: texto(e && e.autor, 80), campo: texto(e && e.campo, 40), de: e && e.de ? texto(e.de, 120) : '', para: e && e.para ? texto(e.para, 200) : '' })),
    // produtos vendidos (5d-4a): nunca trazem a comissão; `total` continua sendo só dos serviços e `totalProdutos` é à parte
    produtos: listaDe(d.produtos, 20).map((p) => ({ materialId: texto(p && p.materialId, 40), nome: texto(p && p.nome, 100), qtd: numeroOuNulo(p && p.qtd) ?? 0, preco: numeroOuNulo(p && p.preco) ?? 0, vendedorId: texto(p && p.vendedorId, 40) })),
    totalProdutos: numeroOuNulo(d.totalProdutos) ?? 0,
    formaPagamento: ['pix', 'dinheiro', 'cartao'].includes(d.formaPagamento) ? d.formaPagamento : '',
    // cupom (5d-4c-2): só o nome e o tipo; a chave nunca volta na agenda. `total` é o bruto dos serviços; o que o cliente paga é total − desconto (+ produtos).
    cupom: d.cupom && typeof d.cupom === 'object' ? { nome: texto(d.cupom.nome, 60), tipo: ['servico', 'percentual', 'valor'].includes(d.cupom.tipo) ? d.cupom.tipo : 'percentual' } : null,
    desconto: numeroOuNulo(d.desconto) ?? 0,
    // estética (V25): box, veículo e porte congelados no agendamento; barbearia e atendimento local sem veículo vêm sem o bloco
    estetica: d.estetica && typeof d.estetica === 'object' ? { boxId: ID.test(String(d.estetica.boxId)) ? d.estetica.boxId : null, box: texto(d.estetica.box, 30), veiculoId: ID.test(String(d.estetica.veiculoId)) ? d.estetica.veiculoId : null, porte: texto(d.estetica.porte, 16), placa: texto(d.estetica.placa, 8), marca: texto(d.estetica.marca, 30), modelo: texto(d.estetica.modelo, 40), cor: texto(d.estetica.cor, 20) } : null,
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
  // Telefone acha ou cria o cadastro do cliente; só o nome não cria. Dia anterior exige `motivoRetroativo`. Produtos (`produtos: [{materialId, qtd}]`, `vendedorId`): venda com serviço ou só de produto (só de agora); estoque sai ao concluir. Forma de pagamento (`formaPagamento`: pix, dinheiro ou cartao; sem ela vale o padrão da loja).)
  async atender(d) {
    d = d && typeof d === 'object' ? d : {};
    const servicoIds = Array.isArray(d.servicoIds) ? d.servicoIds : [];
    const pedidos = Array.isArray(d.produtos) ? d.produtos : [];
    if (servicoIds.length === 0 && pedidos.length === 0) return { ok: false, status: 0, erro: 'Escolha ao menos um serviço ou um produto.' };
    const ids = servicoIds.slice(0, 10).map((x) => String(x ?? ''));
    if (!ids.every((x) => ID.test(x))) return { ok: false, status: 0, erro: 'Serviço não encontrado.' };
    if (pedidos.length > 10) return { ok: false, status: 0, erro: 'No máximo 10 produtos.' };
    const produtos = [];
    for (const p of pedidos) {
      const materialId = String((p && p.materialId) ?? '');
      const qtd = Number(p && p.qtd);
      if (!ID.test(materialId)) return { ok: false, status: 0, erro: 'Produto não encontrado.' };
      if (!Number.isInteger(qtd) || qtd < 1 || qtd > 999) return { ok: false, status: 0, erro: 'A quantidade vai de 1 a 999.' };
      produtos.push({ materialId, qtd });
    }
    const corpo = { servicoIds: ids };
    if (produtos.length) corpo.produtos = produtos;
    for (const [k, max] of [['nome', 100], ['telefone', 30], ['motivoRetroativo', 300]]) if (typeof d[k] === 'string' && d[k].trim()) corpo[k] = d[k].slice(0, max);
    for (const k of ['clienteId', 'profissionalId', 'vendedorId']) {
      if (d[k] === undefined || d[k] === null || d[k] === '') continue;
      if (!ID.test(String(d[k]))) return { ok: false, status: 0, erro: k === 'clienteId' ? 'Cliente não encontrado.' : k === 'vendedorId' ? 'Vendedor não encontrado.' : 'Profissional não encontrado.' };
      corpo[k] = d[k];
    }
    if (d.inicio !== undefined && d.inicio !== null) { const i = soDia(d.inicio); if (!i) return { ok: false, status: 0, erro: 'Data e hora inválidas.' }; corpo.inicio = i; }
    if (d.status !== undefined && d.status !== null && d.status !== '') { if (!['a_confirmar', 'confirmado'].includes(d.status)) return { ok: false, status: 0, erro: 'Agendamento futuro nasce a confirmar ou confirmado.' }; corpo.status = d.status; }
    if (typeof d.encaixe === 'boolean') corpo.encaixe = d.encaixe;
    if (d.formaPagamento !== undefined && d.formaPagamento !== null && d.formaPagamento !== '') {
      if (!['pix', 'dinheiro', 'cartao'].includes(d.formaPagamento)) return { ok: false, status: 0, erro: 'Forma de pagamento inválida.' };
      corpo.formaPagamento = d.formaPagamento; // só vale no atendimento local (o servidor guarda; no agendamento futuro é ignorada)
    }
    // estética: veículo já cadastrado do cliente (`veiculoId`) ou um novo (`veiculo`: placa, marca, modelo, cor, porte); `boxId` opcional (sem ele o servidor escolhe um livre)
    if (d.veiculoId !== undefined && d.veiculoId !== null && d.veiculoId !== '') { if (!ID.test(String(d.veiculoId))) return { ok: false, status: 0, erro: 'Veículo não encontrado.' }; corpo.veiculoId = d.veiculoId; }
    if (d.veiculo && typeof d.veiculo === 'object' && !Array.isArray(d.veiculo)) corpo.veiculo = { placa: texto(d.veiculo.placa, 16), marca: texto(d.veiculo.marca, 30), modelo: texto(d.veiculo.modelo, 40), cor: texto(d.veiculo.cor, 20), porte: texto(d.veiculo.porte, 16) };
    if (d.boxId !== undefined && d.boxId !== null && d.boxId !== '') { if (!ID.test(String(d.boxId))) return { ok: false, status: 0, erro: 'Box não encontrado.' }; corpo.boxId = d.boxId; }
    if (typeof d.cupomChave === 'string' && d.cupomChave.trim()) corpo.cupomChave = d.cupomChave.trim().slice(0, 40); // só no agendamento futuro; chave errada = nada é criado
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
  // POST /api/agendamentos/{id}/cupom  { chave }  (só a confirmar ou confirmado; um cupom por horário; chave errada responde sempre a mesma mensagem e 5 seguidas bloqueiam por 15 min)
  async aplicarCupom(id, chave) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    const c = typeof chave === 'string' ? chave.trim().slice(0, 40) : '';
    if (!c) return { ok: false, status: 0, erro: 'Informe a chave do cupom.' };
    const r = await chamar('POST', `/api/agendamentos/${id}/cupom`, { chave: c });
    return r.ok ? { ok: true, agendamento: lerAgendamento(r.dados) } : r;
  },
  // DELETE /api/agendamentos/{id}/cupom  (retira o cupom e devolve o uso)
  async retirarCupom(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    const r = await chamar('DELETE', `/api/agendamentos/${id}/cupom`);
    return r.ok ? { ok: true, agendamento: lerAgendamento(r.dados) } : r;
  },
  // PUT /api/agendamentos/{id}/remarcar  { inicio, profissionalId?, encaixe?, status? }   (concluído nunca; cancelado só junto com um status não cancelado)
  async remarcar(id, { inicio, profissionalId, encaixe, status, boxId } = {}) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    const novo = soDia(inicio);
    if (!novo) return { ok: false, status: 0, erro: 'Informe a nova data e hora.' };
    const corpo = { inicio: novo };
    if (profissionalId !== undefined && profissionalId !== null && profissionalId !== '') { if (!ID.test(String(profissionalId))) return { ok: false, status: 0, erro: 'Profissional não encontrado.' }; corpo.profissionalId = profissionalId; }
    if (boxId !== undefined && boxId !== null && boxId !== '') { if (!ID.test(String(boxId))) return { ok: false, status: 0, erro: 'Box não encontrado.' }; corpo.boxId = boxId; }
    if (typeof encaixe === 'boolean') corpo.encaixe = encaixe;
    if (status !== undefined) { if (!STATUS_AGENDA.includes(status)) return { ok: false, status: 0, erro: 'Status inválido.' }; corpo.status = status; }
    const r = await chamar('PUT', `/api/agendamentos/${id}/remarcar`, corpo);
    return r.ok ? { ok: true, agendamento: lerAgendamento(r.dados) } : r;
  },
};

// ---------- boxes (estética; regras no servidor: BoxController) ----------
const lerBox = (b) => ({ id: texto(b && b.id, 40), nome: texto(b && b.nome, 30), ativo: !(b && b.ativo === false) });
export const boxes = {
  // GET /api/boxes  (quem tem a agenda; lista vazia no tipo sem box)
  async listar() {
    const r = await chamar('GET', '/api/boxes');
    return r.ok ? { ok: true, boxes: listaDe(r.dados, 20).map(lerBox).filter((b) => ID.test(b.id)) } : r;
  },
  // PUT /api/estabelecimento/boxes  { boxes: [{ id?, nome, ativo }] }  (só o proprietário; a lista inteira substitui a anterior, por id; 1 a 20; box com histórico só se desativa)
  async gravar(lista) {
    const itens = Array.isArray(lista) ? lista.slice(0, 20) : [];
    if (itens.length === 0) return { ok: false, status: 0, erro: 'Cadastre ao menos um box.' };
    const corpo = { boxes: itens.map((b) => ({ ...(ID.test(String(b && b.id)) ? { id: b.id } : {}), nome: texto(b && b.nome, 30), ativo: !(b && b.ativo === false) })) };
    const r = await chamar('PUT', '/api/estabelecimento/boxes', corpo);
    return r.ok ? { ok: true, boxes: listaDe(r.dados, 20).map(lerBox).filter((b) => ID.test(b.id)) } : r;
  },
};

// ---------- cupons (5d-4c-2; regras no servidor: CupomService; só quem tem a seção Estabelecimento) ----------
const SITUACOES_CUPOM = ['inativo', 'futuro', 'expirado', 'esgotado', 'vigente'];
const diaIso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
function lerCupom(d) {
  d = d || {};
  return {
    id: texto(d.id, 40), nome: texto(d.nome, 60), tipo: ['servico', 'percentual', 'valor'].includes(d.tipo) ? d.tipo : 'percentual',
    servicoIds: listaDe(d.servicoIds, 10).map((x) => texto(x, 40)).filter((x) => ID.test(x)), percentual: numeroOuNulo(d.percentual), valor: numeroOuNulo(d.valor),
    inicio: diaIso(d.inicio), fim: diaIso(d.fim), usosMax: numeroOuNulo(d.usosMax) ?? 1, usosPorCliente: numeroOuNulo(d.usosPorCliente) ?? 1,
    chave: texto(d.chave, 20), ativo: d.ativo !== false, situacao: SITUACOES_CUPOM.includes(d.situacao) ? d.situacao : 'inativo', usos: numeroOuNulo(d.usos) ?? 0,
  };
}
const numeroDoCampo = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
export const cupons = {
  // GET /api/cupons  (com a chave: é do estabelecimento; ela nunca vai para a agenda nem para o cliente)
  async listar() {
    const r = await chamar('GET', '/api/cupons');
    return r.ok ? { ok: true, cupons: listaDe(r.dados, 200).map(lerCupom) } : r;
  },
  // POST /api/cupons  |  PUT /api/cupons/{id}   (a chave nasce no servidor: nunca é enviada; cupom do histórico não se altera)
  async salvar(d) {
    d = d && typeof d === 'object' ? d : {};
    if (!['servico', 'percentual', 'valor'].includes(d.tipo)) return { ok: false, status: 0, erro: 'Escolha o tipo: vale serviço, desconto em % ou em R$.' };
    const ids = listaDe(d.servicoIds, 10).map((x) => String(x ?? ''));
    if (!ids.every((x) => ID.test(x))) return { ok: false, status: 0, erro: 'Serviço não encontrado.' };
    const inicio = diaIso(d.inicio), fim = diaIso(d.fim);
    if (!inicio || !fim) return { ok: false, status: 0, erro: 'Informe o começo e o fim da vigência.' };
    const corpo = { nome: texto(d.nome, 60), tipo: d.tipo, servicoIds: ids, inicio, fim };
    for (const [k, campo] of [['percentual', d.percentual], ['valor', d.valor], ['usosMax', d.usosMax], ['usosPorCliente', d.usosPorCliente]]) {
      const n = numeroDoCampo(campo);
      if (n !== null && !Number.isFinite(n)) return { ok: false, status: 0, erro: 'Informe só números nos valores e nos limites.' };
      if (n !== null && (k === 'usosMax' || k === 'usosPorCliente' || (k === 'percentual' && d.tipo === 'percentual') || (k === 'valor' && d.tipo === 'valor'))) corpo[k] = n;
    }
    const edicao = d.id !== undefined && d.id !== null && d.id !== '';
    if (edicao && !ID.test(String(d.id))) return { ok: false, status: 0, erro: 'Cupom não encontrado.' };
    const r = await chamar(edicao ? 'PUT' : 'POST', edicao ? `/api/cupons/${d.id}` : '/api/cupons', corpo);
    return r.ok ? { ok: true, cupom: lerCupom(r.dados) } : r;
  },
  // POST /api/cupons/{id}/chave  (a chave antiga deixa de valer na hora; quem já usou mantém o desconto)
  async novaChave(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Cupom não encontrado.' };
    const r = await chamar('POST', `/api/cupons/${id}/chave`);
    return r.ok ? { ok: true, cupom: lerCupom(r.dados) } : r;
  },
  // DELETE /api/cupons/{id}  (nunca usado: apaga; já usado: só encerra e vai para o histórico → { desativado: true })
  async remover(id) {
    if (!ID.test(String(id ?? ''))) return { ok: false, status: 0, erro: 'Cupom não encontrado.' };
    const r = await chamar('DELETE', `/api/cupons/${id}`);
    return r.ok ? { ok: true, desativado: !!(r.dados && r.dados.desativado === true) } : r;
  },
};

// ---------- comissões (5d-4b; regras no servidor: ComissaoController/ComissaoService) ----------
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MES_ISO = /^\d{4}-(0[1-9]|1[0-2])$/;
// Período: { mes: 'AAAA-MM' } ou { de: 'AAAA-MM-DD', ate: 'AAAA-MM-DD' } (dias inclusive, até 366). Devolve a consulta ou { erro }.
export function consultaDoPeriodo(p) {
  if (p && typeof p === 'object' && DIA_ISO.test(String(p.de)) && DIA_ISO.test(String(p.ate))) {
    if (p.ate < p.de) return { erro: 'A data final não pode ser antes da inicial.' };
    return { q: `de=${p.de}&ate=${p.ate}` };
  }
  if (p && typeof p === 'object' && MES_ISO.test(String(p.mes))) return { q: `mes=${p.mes}` };
  return { erro: 'Informe o período.' };
}
const dinheiroOuZero = (v) => numeroOuNulo(v) ?? 0;
const lerParteDono = (l) => ({ agendamentoId: texto(l && l.agendamentoId, 40), inicio: instante(l && l.inicio), clienteId: ID.test(String(l && l.clienteId)) ? l.clienteId : null, nomeAvulso: l && l.nomeAvulso ? texto(l.nomeAvulso, 100) : '',
  servicos: listaDe(l && l.servicos, 30).map((x) => texto(x, 120)), base: dinheiroOuZero(l && l.base), comissao: dinheiroOuZero(l && l.comissao), casa: dinheiroOuZero(l && l.casa), paga: !!(l && l.paga === true), pagaEm: instante(l && l.pagaEm),
  cancelada: !!(l && l.cancelada === true), motivoCancelada: l && l.motivoCancelada ? texto(l.motivoCancelada, 300) : '', comissaoOriginal: numeroOuNulo(l && l.comissaoOriginal) });
let ultimoPagamento = { assinatura: '', chave: '' };
// ---------------------------------------------------------------- relatórios (só o proprietário)
const itemRel = (x) => ({ nome: texto(x && x.nome, 200), qtd: numeroOuNulo(x && x.qtd) ?? 0, valor: dinheiroOuZero(x && x.valor) });
export const relatorios = {
  // GET /api/relatorios?mes= | ?de=&ate=  (faturamento do que foi concluído: serviços com o desconto do cupom abatido + produtos)
  async obter(periodo) {
    const c = consultaDoPeriodo(periodo);
    if (c.erro) return { ok: false, status: 0, erro: c.erro };
    const r = await chamar('GET', `/api/relatorios?${c.q}`);
    if (!r.ok) return r;
    const d = r.dados || {}; const t = d.totais || {}; const pv = d.previsto || {};
    return {
      ok: true, de: texto(d.de, 10), ate: texto(d.ate, 10),
      totais: { atendimentos: numeroOuNulo(t.atendimentos) ?? 0, servicos: dinheiroOuZero(t.servicos), descontos: dinheiroOuZero(t.descontos), produtos: dinheiroOuZero(t.produtos), total: dinheiroOuZero(t.total), ticketMedio: dinheiroOuZero(t.ticketMedio) },
      previsto: { atendimentos: numeroOuNulo(pv.atendimentos) ?? 0, total: dinheiroOuZero(pv.total) },
      porProfissional: listaDe(d.porProfissional, 200).map((p) => ({ id: texto(p && p.id, 40), nome: texto(p && p.nome, 150), atendimentos: numeroOuNulo(p && p.atendimentos) ?? 0, servicos: dinheiroOuZero(p && p.servicos), produtos: dinheiroOuZero(p && p.produtos), total: dinheiroOuZero(p && p.total) })),
      porServico: listaDe(d.porServico, 200).map(itemRel),
      porProduto: listaDe(d.porProduto, 200).map(itemRel),
      porForma: listaDe(d.porForma, 10).map((f) => ({ forma: texto(f && f.forma, 20), atendimentos: numeroOuNulo(f && f.atendimentos) ?? 0, total: dinheiroOuZero(f && f.total) })),
      porDia: listaDe(d.porDia, 400).map((x) => ({ dia: texto(x && x.dia, 10), atendimentos: numeroOuNulo(x && x.atendimentos) ?? 0, total: dinheiroOuZero(x && x.total) })),
    };
  },
};

export const comissoes = {
  // GET /api/comissoes?mes= | ?de=&ate=  (só o proprietário: por pessoa, com a parte do estabelecimento)
  async relatorio(periodo) {
    const c = consultaDoPeriodo(periodo);
    if (c.erro) return { ok: false, status: 0, erro: c.erro };
    const r = await chamar('GET', `/api/comissoes?${c.q}`);
    if (!r.ok) return r;
    const d = r.dados || {}; const t = d.totais || {};
    return { ok: true, de: texto(d.de, 10), ate: texto(d.ate, 10), totais: { comissao: dinheiroOuZero(t.comissao), aPagar: dinheiroOuZero(t.aPagar), pago: dinheiroOuZero(t.pago), casa: dinheiroOuZero(t.casa) },
      profissionais: listaDe(d.profissionais, 200).map((p) => ({ id: texto(p && p.id, 40), nome: texto(p && p.nome, 150), semComissao: !!(p && p.semComissao === true), atendimentos: numeroOuNulo(p && p.atendimentos) ?? 0,
        base: dinheiroOuZero(p && p.base), comissao: dinheiroOuZero(p && p.comissao), casa: dinheiroOuZero(p && p.casa), pago: dinheiroOuZero(p && p.pago), aPagar: dinheiroOuZero(p && p.aPagar), linhas: listaDe(p && p.linhas, 1000).map(lerParteDono) })).filter((p) => ID.test(p.id)) };
  },
  // GET /api/comissoes/meu?mes= | ?de=&ate=  (profissional, atendente e admin: SÓ o que eles recebem; nunca o valor cheio, a parte da casa nem o percentual)
  async meu(periodo) {
    const c = consultaDoPeriodo(periodo);
    if (c.erro) return { ok: false, status: 0, erro: c.erro };
    const r = await chamar('GET', `/api/comissoes/meu?${c.q}`);
    if (!r.ok) return r;
    const d = r.dados || {}; const t = d.totais || {}; const pv = d.previsto || {};
    return { ok: true, totais: { atendimentos: numeroOuNulo(t.atendimentos) ?? 0, receber: dinheiroOuZero(t.receber), jaPago: dinheiroOuZero(t.jaPago), aReceber: dinheiroOuZero(t.aReceber) }, previsto: { atendimentos: numeroOuNulo(pv.atendimentos) ?? 0, receber: dinheiroOuZero(pv.receber) },
      linhas: listaDe(d.linhas, 1000).map((l) => ({ agendamentoId: texto(l && l.agendamentoId, 40), inicio: instante(l && l.inicio), local: !!(l && l.local === true), clienteId: ID.test(String(l && l.clienteId)) ? l.clienteId : null, nomeAvulso: l && l.nomeAvulso ? texto(l.nomeAvulso, 100) : '',
        servicos: listaDe(l && l.servicos, 30).map((x) => texto(x, 120)), receber: dinheiroOuZero(l && l.receber), paga: !!(l && l.paga === true), pagaEm: instante(l && l.pagaEm), cancelada: !!(l && l.cancelada === true), motivoCancelada: l && l.motivoCancelada ? texto(l.motivoCancelada, 300) : '' })) };
  },
  // POST /api/comissoes/pagamentos  { profissionalId, mes | de, ate }  (só o proprietário; leva Idempotency-Key: o mesmo pedido de novo nunca paga duas vezes)
  async pagar(profissionalId, periodo) {
    if (!ID.test(String(profissionalId ?? ''))) return { ok: false, status: 0, erro: 'Profissional não encontrado.' };
    const c = consultaDoPeriodo(periodo);
    if (c.erro) return { ok: false, status: 0, erro: c.erro };
    const corpo = { profissionalId, ...(c.q.startsWith('mes=') ? { mes: periodo.mes } : { de: periodo.de, ate: periodo.ate }) };
    const assinatura = JSON.stringify(corpo);
    if (ultimoPagamento.assinatura !== assinatura) ultimoPagamento = { assinatura, chave: novaChave() };
    const r = await chamar('POST', '/api/comissoes/pagamentos', corpo, ultimoPagamento.chave);
    if (r.ok) ultimoPagamento = { assinatura: '', chave: '' };
    if (!r.ok) return r;
    const d = r.dados || {};
    return { ok: true, valor: dinheiroOuZero(d.valor), atendimentos: numeroOuNulo(d.atendimentos) ?? 0 };
  },
  // POST /api/agendamentos/{id}/comissao/cancelar  { quem?, motivo }  (só o proprietário; motivo de 5 a 300 letras; comissão paga não se cancela)
  async cancelar(agendamentoId, { quem, motivo } = {}) {
    if (!ID.test(String(agendamentoId ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    if (quem !== undefined && quem !== null && quem !== '' && !ID.test(String(quem))) return { ok: false, status: 0, erro: 'Pessoa inválida.' };
    const m = typeof motivo === 'string' ? motivo.trim() : '';
    if (m.length > 300) return { ok: false, status: 0, erro: 'O motivo pode ter até 300 letras.' };
    const r = await chamar('POST', `/api/agendamentos/${agendamentoId}/comissao/cancelar`, { ...(quem ? { quem } : {}), motivo: m });
    return r.ok ? { ok: true } : r;
  },
  // POST /api/agendamentos/{id}/comissao/restaurar  { quem? }
  async restaurar(agendamentoId, { quem } = {}) {
    if (!ID.test(String(agendamentoId ?? ''))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    if (quem !== undefined && quem !== null && quem !== '' && !ID.test(String(quem))) return { ok: false, status: 0, erro: 'Pessoa inválida.' };
    const r = await chamar('POST', `/api/agendamentos/${agendamentoId}/comissao/restaurar`, quem ? { quem } : {});
    return r.ok ? { ok: true } : r;
  },
};

// GET /api/profissionais  (quem pode aparecer na agenda: usuários ativos; `atende` diz se têm agenda própria)
export const profissionais = {
  async listar() {
    const r = await chamar('GET', '/api/profissionais');
    return r.ok ? { ok: true, profissionais: listaDe(r.dados, 200).map((p) => ({ id: texto(p && p.id, 40), nome: texto(p && p.nome, 150), papel: PAPEIS.includes(p && p.papel) ? p.papel : 'profissional', atende: !!(p && p.atende === true), podeVender: !(p && p.podeVender === false) })).filter((p) => ID.test(p.id)) } : r;
  },
};

// ---------- regras do Atender (5d-4c) ----------
const CAMPOS_ATENDER = ['nome', 'telefone', 'profissional', 'vendedor', 'formaPagamento'];
const lerRegras = (d) => {
  d = d && typeof d === 'object' ? d : {};
  const campos = (l, futuro) => listaDe(l, 5).map((x) => texto(x, 20)).filter((x) => CAMPOS_ATENDER.includes(x) && !(futuro && x === 'formaPagamento'));
  return { formaPagamentoPadrao: ['', 'pix', 'dinheiro', 'cartao'].includes(d.formaPagamentoPadrao) ? d.formaPagamentoPadrao : 'pix', futuro: campos(d.futuro, true), local: campos(d.local, false) };
};
export const regras = {
  // GET /api/estabelecimento/regras-atendimento  (quem usa a agenda; o formulário Atender precisa da forma padrão e dos campos obrigatórios)
  async obter() {
    const r = await chamar('GET', '/api/estabelecimento/regras-atendimento');
    return r.ok ? { ok: true, regras: lerRegras(r.dados) } : r;
  },
  // PUT /api/estabelecimento/regras-atendimento  { formaPagamentoPadrao?, camposObrigatorios?: { futuro, local } }  (só o proprietário)
  async gravar({ formaPagamentoPadrao, camposObrigatorios } = {}) {
    const corpo = {};
    if (formaPagamentoPadrao !== undefined) {
      if (!['', 'pix', 'dinheiro', 'cartao'].includes(formaPagamentoPadrao)) return { ok: false, status: 0, erro: 'Forma de pagamento padrão inválida.' };
      corpo.formaPagamentoPadrao = formaPagamentoPadrao;
    }
    if (camposObrigatorios !== undefined) {
      const c = camposObrigatorios;
      const ok = c && typeof c === 'object' && ['futuro', 'local'].every((k) => Array.isArray(c[k]) && c[k].length <= 5 && new Set(c[k]).size === c[k].length && c[k].every((x) => CAMPOS_ATENDER.includes(x) && !(k === 'futuro' && x === 'formaPagamento')));
      if (!ok) return { ok: false, status: 0, erro: 'Campos obrigatórios inválidos.' };
      corpo.camposObrigatorios = { futuro: [...c.futuro], local: [...c.local] };
    }
    const r = await chamar('PUT', '/api/estabelecimento/regras-atendimento', corpo);
    return r.ok ? { ok: true, regras: lerRegras(r.dados) } : r;
  },
};

// ---------- link de agendamento do cliente (5e-1) ----------
// Config do link (só o proprietário): liga/desliga e quantos dias à frente oferece horário.
const lerLink = (d) => {
  d = d && typeof d === 'object' ? d : {};
  const dm = Number.isInteger(d.diasMax) ? Math.min(60, Math.max(1, d.diasMax)) : 30;
  return { ativo: d.ativo !== false, diasMax: dm, disponivel: d.disponivel !== false, telefoneObrigatorio: d.telefoneObrigatorio !== false };
};
export const linkAgendamento = {
  // GET /api/estabelecimento/link-agendamento
  async obter() {
    const r = await chamar('GET', '/api/estabelecimento/link-agendamento');
    return r.ok ? { ok: true, link: lerLink(r.dados) } : r;
  },
  // PUT /api/estabelecimento/link-agendamento  { ativo?, diasMax?, telefoneObrigatorio? }
  async gravar({ ativo, diasMax, telefoneObrigatorio } = {}) {
    const corpo = {};
    if (telefoneObrigatorio !== undefined) corpo.telefoneObrigatorio = telefoneObrigatorio === true;
    if (ativo !== undefined) corpo.ativo = ativo === true;
    if (diasMax !== undefined) {
      if (!Number.isInteger(diasMax) || diasMax < 1 || diasMax > 60) return { ok: false, status: 0, erro: 'Informe de 1 a 60 dias.' };
      corpo.diasMax = diasMax;
    }
    const r = await chamar('PUT', '/api/estabelecimento/link-agendamento', corpo);
    return r.ok ? { ok: true, link: lerLink(r.dados) } : r;
  },
};

// ---------- local da loja (endereço e localização; regras no servidor: LocalDaLoja) e comissão geral ----------
const httpsOuVazio = (v) => (typeof v === 'string' && /^https:\/\/[^\s]{1,300}$/.test(v) ? v : '');
const opcional = (v, max) => (typeof v === 'string' && v.trim() ? texto(v, max) : '');
function lerLocal(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    logradouro: opcional(d.logradouro, 120), numero: opcional(d.numero, 20), complemento: opcional(d.complemento, 60), bairro: opcional(d.bairro, 60),
    cidade: opcional(d.cidade, 60), uf: opcional(d.uf, 2), cep: typeof d.cep === 'string' ? d.cep.replace(/\D/g, '').slice(0, 8) : '',
    latitude: numeroOuNulo(d.latitude), longitude: numeroOuNulo(d.longitude), enderecoNoLink: d.enderecoNoLink === true, localizacaoNoWhatsapp: d.localizacaoNoWhatsapp === true,
    enderecoTexto: opcional(d.enderecoTexto, 300), localizacaoUrl: httpsOuVazio(d.localizacaoUrl), localizacaoWhatsappUrl: httpsOuVazio(d.localizacaoWhatsappUrl),
  };
}
export const local = {
  // GET /api/estabelecimento/local  (quem edita vê tudo; todos da agenda recebem `localizacaoWhatsappUrl`, o link que vai na mensagem do WhatsApp, e só com o envio ligado)
  async obter() {
    const r = await chamar('GET', '/api/estabelecimento/local');
    return r.ok ? { ok: true, local: lerLocal(r.dados) } : r;
  },
  // PUT /api/estabelecimento/local  (proprietário ou seção Estabelecimento; o corpo inteiro substitui o gravado; campo vazio = apaga)
  async gravar(d) {
    d = d && typeof d === 'object' ? d : {};
    const corpo = { enderecoNoLink: d.enderecoNoLink === true, localizacaoNoWhatsapp: d.localizacaoNoWhatsapp === true };
    for (const [k, max] of [['logradouro', 120], ['numero', 20], ['complemento', 60], ['bairro', 60], ['cidade', 60], ['uf', 2], ['cep', 12]]) if (typeof d[k] === 'string' && d[k].trim()) corpo[k] = d[k].trim().slice(0, max);
    const lat = typeof d.latitude === 'number' ? d.latitude : null, lng = typeof d.longitude === 'number' ? d.longitude : null;
    if ((lat === null) !== (lng === null)) return { ok: false, status: 0, erro: 'Informe latitude e longitude juntas (ou deixe as duas vazias).' };
    if (lat !== null) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, status: 0, erro: 'Localização inválida: latitude de -90 a 90 e longitude de -180 a 180.' };
      corpo.latitude = lat; corpo.longitude = lng;
    }
    const r = await chamar('PUT', '/api/estabelecimento/local', corpo);
    return r.ok ? { ok: true, local: lerLocal(r.dados) } : r;
  },
};
export const comissaoGeral = {
  // GET /api/estabelecimento/comissao  (só o proprietário; sem valor gravado vale 50)
  async obter() {
    const r = await chamar('GET', '/api/estabelecimento/comissao');
    return r.ok ? { ok: true, comissaoPadrao: numeroOuNulo(r.dados && r.dados.comissaoPadrao) ?? 50 } : r;
  },
  // PUT /api/estabelecimento/comissao  { comissaoPadrao }  (0 a 100)
  async gravar(valor) {
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 100) return { ok: false, status: 0, erro: 'A comissão padrão vai de 0 a 100%.' };
    const r = await chamar('PUT', '/api/estabelecimento/comissao', { comissaoPadrao: valor });
    return r.ok ? { ok: true, comissaoPadrao: numeroOuNulo(r.dados && r.dados.comissaoPadrao) ?? valor } : r;
  },
};

export const expediente = {
  // GET /api/estabelecimento/escala  (expediente da loja: { semana: { 0..6: { aberto, faixas: [["09:00","12:00"]] } } }; dia 0 = domingo; sem faixa nenhuma = loja sem expediente)
  async obter() {
    const r = await chamar('GET', '/api/estabelecimento/escala');
    return r.ok ? { ok: true, escala: lerSemana(r.dados) || { semana: {} } } : r;
  },
  // PUT /api/estabelecimento/escala  (só quem tem a seção Estabelecimento; troca a semana inteira; pelo menos um dia aberto)
  async gravar(campos) {
    if (!campos || typeof campos !== 'object' || !campos.dias) return { ok: false, status: 0, erro: 'Informe o horário de funcionamento.' };
    const erro = erroDaSemana(campos);
    if (erro) return { ok: false, status: 0, erro };
    const r = await chamar('PUT', '/api/estabelecimento/escala', corpoDaSemana(campos));
    return r.ok ? { ok: true, escala: lerSemana(r.dados) || { semana: {} } } : r;
  },
};
const lerMarca = (d) => {
  d = d && typeof d === 'object' ? d : {};
  return { logo: logoValida(d.logo) ? d.logo : null, temaCor: corValida(d.temaCor) ? d.temaCor : null, temaCor2: corValida(d.temaCor2) ? d.temaCor2 : null };
};
export const marca = {
  // GET /api/estabelecimento/marca  (logo em data URL e as duas cores do tema; só quem tem a seção Estabelecimento)
  async obter() {
    const r = await chamar('GET', '/api/estabelecimento/marca');
    return r.ok ? { ok: true, marca: lerMarca(r.dados) } : r;
  },
  // PUT /api/estabelecimento/marca  { logo, temaCor, temaCor2 }  (o corpo inteiro substitui; logo nula remove; as duas cores nulas = tema padrão)
  async gravar(m) {
    m = m && typeof m === 'object' ? m : {};
    const corpo = { logo: m.logo ?? null, temaCor: m.temaCor ?? null, temaCor2: m.temaCor2 ?? null };
    const erro = erroDaMarca(corpo);
    if (erro) return { ok: false, status: 0, erro };
    if (corpo.temaCor === null) corpo.temaCor2 = null;
    const r = await chamar('PUT', '/api/estabelecimento/marca', corpo);
    return r.ok ? { ok: true, marca: lerMarca(r.dados) } : r;
  },
};

// Rotas do cliente final (SEM login; a loja vem do endereço). O token de acesso a um horário vem na resposta do pedido, UMA vez; quem guarda é a página
// (localStorage do aparelho do cliente, dentro de try/catch). Nada aqui usa o token do painel.
const PUB = { publico: true };
const IDV = (v) => (ID.test(String(v)) ? String(v) : '');
const inteiroOuZero = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const PORTES_PUB = ['pequeno', 'medio', 'grande', 'suv', 'pickup'];
const tabelaPorPorte = (t, conv) => {
  const o = {};
  if (t && typeof t === 'object') for (const p of PORTES_PUB) if (conv(t[p]) !== null) o[p] = conv(t[p]);
  return o;
};
const dinheiroOuNulo = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e7 ? v : null);
const minutosOuNulo = (v) => (Number.isInteger(v) && v > 0 && v <= 1440 ? v : null);
function lerPaginaPublica(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    endereco: opcional(d.endereco, 300), mapaUrl: httpsOuVazio(d.mapaUrl),
    ativo: d.ativo === true, aviso: texto(d.aviso, 200), diasMax: Number.isInteger(d.diasMax) ? Math.min(60, Math.max(1, d.diasMax)) : 30,
    tipo: texto(d.tipo, 40), exigeTelefone: d.exigeTelefone !== false, // telefone obrigatório de fábrica
    portes: listaDe(d.portes, 10).filter((x) => x && PORTES_PUB.includes(x.id)).map((x) => ({ id: x.id, nome: texto(x.nome, 20) })),
    servicos: listaDe(d.servicos, 200).filter((x) => x && IDV(x.id)).map((x) => ({
      id: x.id, nome: texto(x.nome, 120), duracao: inteiroOuZero(x.duracao), preco: dinheiroOuZero(x.preco), antecedenciaH: inteiroOuZero(x.antecedenciaH),
      precos: tabelaPorPorte(x.precos, dinheiroOuNulo), duracoes: tabelaPorPorte(x.duracoes, minutosOuNulo),
    })),
    profissionais: listaDe(d.profissionais, 100).filter((x) => x && IDV(x.id)).map((x) => ({ id: x.id, nome: texto(x.nome, 80), foto: typeof x.foto === 'string' && x.foto.startsWith('data:image/') ? x.foto : null })),
  };
}
function lerResumoPublico(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    id: IDV(d.id), inicio: instante(d.inicio), fim: instante(d.fim), status: STATUS_AGENDA.includes(d.status) ? d.status : 'a_confirmar', rotulo: texto(d.rotulo, 40),
    servicos: listaDe(d.servicos, 20).map((x) => texto(x, 120)), duracao: inteiroOuZero(d.duracao), total: dinheiroOuZero(d.total), desconto: dinheiroOuZero(d.desconto),
    cupom: d.cupom ? texto(d.cupom, 60) : '', profissional: texto(d.profissional, 80), ativo: d.ativo === true, podeCancelar: d.podeCancelar === true,
    veiculo: d.veiculo && typeof d.veiculo === 'object' ? { placa: texto(d.veiculo.placa, 10), modelo: texto(d.veiculo.modelo, 60), porte: PORTES_PUB.includes(d.veiculo.porte) ? d.veiculo.porte : '' } : null,
  };
}
const consultaServicos = (ids) => (Array.isArray(ids) ? ids.filter((x) => ID.test(String(x))).slice(0, 5).join(',') : '');
export const publico = {
  // GET /api/publico/agendar
  async pagina() {
    const r = await chamar('GET', '/api/publico/agendar', undefined, undefined, PUB);
    return r.ok ? { ok: true, pagina: lerPaginaPublica(r.dados) } : r;
  },
  // GET /api/publico/dias?de=AAAA-MM-DD&dias=14&servicos=id,id&profissionalId=&porte=   → ['AAAA-MM-DD', ...]  (porte só na estética)
  async dias({ de, dias, servicoIds, profissionalId, porte }) {
    if (!DIA_ISO.test(String(de)) || !consultaServicos(servicoIds)) return { ok: true, dias: [] };
    const q = `de=${de}&dias=${Math.min(31, Math.max(1, Number(dias) || 1))}&servicos=${consultaServicos(servicoIds)}${ID.test(String(profissionalId)) ? `&profissionalId=${profissionalId}` : ''}${PORTES_PUB.includes(porte) ? `&porte=${porte}` : ''}`;
    const r = await chamar('GET', `/api/publico/dias?${q}`, undefined, undefined, PUB);
    return r.ok ? { ok: true, dias: listaDe(r.dados, 62).filter((x) => DIA_ISO.test(String(x))) } : r;
  },
  // GET /api/publico/horarios?data=AAAA-MM-DD&servicos=id,id&profissionalId=&porte=   → [{ inicio, profissionalId }]  (porte só na estética)
  async horarios({ data, servicoIds, profissionalId, porte }) {
    if (!DIA_ISO.test(String(data)) || !consultaServicos(servicoIds)) return { ok: true, horarios: [] };
    const q = `data=${data}&servicos=${consultaServicos(servicoIds)}${ID.test(String(profissionalId)) ? `&profissionalId=${profissionalId}` : ''}${PORTES_PUB.includes(porte) ? `&porte=${porte}` : ''}`;
    const r = await chamar('GET', `/api/publico/horarios?${q}`, undefined, undefined, PUB);
    return r.ok ? { ok: true, horarios: listaDe(r.dados, 100).filter((x) => x && instante(x.inicio) !== null && IDV(x.profissionalId)).map((x) => ({ inicio: instante(x.inicio), profissionalId: x.profissionalId })) } : r;
  },
  // POST /api/publico/agendamentos  { nome, telefone, servicoIds, inicio, profissionalId?, cupomChave?, veiculo?, site }  → { agendamento, token }
  async agendar({ nome, telefone, servicoIds, inicio, profissionalId, cupomChave, veiculo, site }) {
    if (!Number.isFinite(inicio)) return { ok: false, status: 0, erro: 'Escolha um dia e um horário.' };
    const corpo = { nome: texto(nome, 100), telefone: texto(telefone, 30), servicoIds: Array.isArray(servicoIds) ? servicoIds.filter((x) => ID.test(String(x))).slice(0, 10) : [], inicio: new Date(inicio).toISOString() };
    if (ID.test(String(profissionalId))) corpo.profissionalId = profissionalId;
    if (typeof cupomChave === 'string' && cupomChave.trim()) corpo.cupomChave = texto(cupomChave.trim(), 40);
    if (typeof site === 'string' && site) corpo.site = texto(site, 100);
    if (veiculo && typeof veiculo === 'object') {
      corpo.veiculo = { placa: texto(veiculo.placa, 20), modelo: texto(veiculo.modelo, 60), porte: PORTES_PUB.includes(veiculo.porte) ? veiculo.porte : '' };
      if (typeof veiculo.marca === 'string' && veiculo.marca.trim()) corpo.veiculo.marca = texto(veiculo.marca, 60);
      if (typeof veiculo.cor === 'string' && veiculo.cor.trim()) corpo.veiculo.cor = texto(veiculo.cor, 40);
    }
    const r = await chamar('POST', '/api/publico/agendamentos', corpo, undefined, PUB);
    if (!r.ok) return r;
    const token = r.dados && typeof r.dados.token === 'string' && /^[0-9a-f]{48}$/.test(r.dados.token) ? r.dados.token : '';
    return { ok: true, agendamento: lerResumoPublico(r.dados && r.dados.agendamento), token };
  },
  // POST /api/publico/meus  { tokens }  → [resumo]   (o token vai no corpo, nunca na URL)
  async meus(tokens) {
    const lista = (Array.isArray(tokens) ? tokens : []).filter((t) => /^[0-9a-f]{48}$/.test(String(t))).slice(0, 10);
    if (!lista.length) return { ok: true, agendamentos: [] };
    const r = await chamar('POST', '/api/publico/meus', { tokens: lista }, undefined, PUB);
    return r.ok ? { ok: true, agendamentos: listaDe(r.dados, 20).map(lerResumoPublico).filter((a) => a.id && a.inicio !== null) } : r;
  },
  // POST /api/publico/agendamentos/{id}/cancelar  (cabeçalho X-Acesso: o token DESTE horário)
  async cancelar(id, token) {
    if (!ID.test(String(id)) || !/^[0-9a-f]{48}$/.test(String(token))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    const r = await chamar('POST', `/api/publico/agendamentos/${id}/cancelar`, undefined, undefined, { publico: true, cabecalhos: { 'X-Acesso': token } });
    return r.ok ? { ok: true, agendamento: lerResumoPublico(r.dados) } : r;
  },
  // GET /api/publico/agendamentos/{id}/dias?de=AAAA-MM-DD&dias=14  (cabeçalho X-Acesso)  → ['AAAA-MM-DD', ...]: dias com horário livre para REMARCAR este horário
  async diasRemarcar(id, token, { de, dias }) {
    if (!ID.test(String(id)) || !/^[0-9a-f]{48}$/.test(String(token)) || !DIA_ISO.test(String(de))) return { ok: true, dias: [] };
    const r = await chamar('GET', `/api/publico/agendamentos/${id}/dias?de=${de}&dias=${Math.min(31, Math.max(1, Number(dias) || 1))}`, undefined, undefined, { publico: true, cabecalhos: { 'X-Acesso': token } });
    return r.ok ? { ok: true, dias: listaDe(r.dados, 62).filter((x) => DIA_ISO.test(String(x))) } : r;
  },
  // GET /api/publico/agendamentos/{id}/horarios?data=AAAA-MM-DD  (cabeçalho X-Acesso)  → [{ inicio, profissionalId }]
  async horariosRemarcar(id, token, { data }) {
    if (!ID.test(String(id)) || !/^[0-9a-f]{48}$/.test(String(token)) || !DIA_ISO.test(String(data))) return { ok: true, horarios: [] };
    const r = await chamar('GET', `/api/publico/agendamentos/${id}/horarios?data=${data}`, undefined, undefined, { publico: true, cabecalhos: { 'X-Acesso': token } });
    return r.ok ? { ok: true, horarios: listaDe(r.dados, 100).filter((x) => x && instante(x.inicio) !== null && IDV(x.profissionalId)).map((x) => ({ inicio: instante(x.inicio), profissionalId: x.profissionalId })) } : r;
  },
  // POST /api/publico/agendamentos/{id}/remarcar  { inicio }  (cabeçalho X-Acesso): só com 24 h ou mais; o horário volta a "a confirmar"
  async remarcar(id, token, inicio) {
    if (!ID.test(String(id)) || !/^[0-9a-f]{48}$/.test(String(token))) return { ok: false, status: 0, erro: 'Agendamento não encontrado.' };
    if (!Number.isFinite(inicio)) return { ok: false, status: 0, erro: 'Escolha um dia e um horário.' };
    const r = await chamar('POST', `/api/publico/agendamentos/${id}/remarcar`, { inicio: new Date(inicio).toISOString() }, undefined, { publico: true, cabecalhos: { 'X-Acesso': token } });
    return r.ok ? { ok: true, agendamento: lerResumoPublico(r.dados) } : r;
  },
};


// ---- Avisos do painel (5e-2): o que o cliente fez pelo link (pediu horário, remarcou, cancelou) ----
// "Meu perfil": a própria pessoa lê e muda só os próprios dados de contato e a foto (qualquer perfil logado). Sem CPF, perfil, permissões nem comissão.
const lerMeusDados = (d) => {
  d = d && typeof d === 'object' ? d : {};
  return { id: texto(d.id, 40), nome: texto(d.nome, 150), apelido: d.apelido ? texto(d.apelido, 60) : '', usuario: texto(d.usuario, 60), papel: texto(d.papel, 20),
    email: d.email ? texto(d.email, 150) : '', telefone: d.telefone ? texto(d.telefone, 20) : '', nascimento: d.nascimento ? texto(d.nascimento, 10) : '',
    foto: typeof d.foto === 'string' && d.foto.startsWith('data:image/') && d.foto.length <= 30000 ? d.foto : null };
};
export const perfil = {
  // GET /api/usuarios/me
  async obter() {
    const r = await chamar('GET', '/api/usuarios/me');
    return r.ok ? { ok: true, dados: lerMeusDados(r.dados) } : r;
  },
  // PUT /api/usuarios/me  { nome, apelido, email, telefone, nascimento }  (campo ausente não muda; e-mail, telefone e nascimento vazios apagam)
  async salvar(d) {
    d = d && typeof d === 'object' ? d : {};
    const corpo = {};
    for (const [k, max] of [['nome', 150], ['apelido', 60], ['email', 150], ['telefone', 30], ['nascimento', 10]]) if (typeof d[k] === 'string') corpo[k] = d[k].trim().slice(0, max);
    const r = await chamar('PUT', '/api/usuarios/me', corpo);
    return r.ok ? { ok: true, dados: lerMeusDados(r.dados) } : r;
  },
  // PUT /api/usuarios/me/foto  { foto }  (data URL PNG/JPEG/WebP; vazio remove)
  async foto(url) {
    const v = typeof url === 'string' ? url : '';
    if (v !== '' && (!v.startsWith('data:image/') || v.length > 30000)) return { ok: false, status: 0, erro: 'Escolha uma imagem PNG, JPEG ou WebP pequena.' };
    return chamar('PUT', '/api/usuarios/me/foto', { foto: v });
  },
};

const TIPOS_AVISO = ['pedido', 'remarcou', 'cancelou'];
const lerAviso = (d) => {
  d = d && typeof d === 'object' ? d : {};
  return { id: IDV(d.id), em: instante(d.em), agendamentoId: IDV(d.agendamentoId), tipo: TIPOS_AVISO.includes(d.tipo) ? d.tipo : 'pedido', texto: texto(d.texto, 300), lido: d.lido === true };
};
export const avisos = {
  // GET /api/avisos  (quem usa a agenda; o profissional vê só os seus)  → até 50, não lidos primeiro
  async listar() {
    const r = await chamar('GET', '/api/avisos');
    return r.ok ? { ok: true, avisos: listaDe(r.dados, 50).map(lerAviso).filter((a) => a.id) } : r;
  },
  // PUT /api/avisos/{id}/lido
  async marcarLido(id) {
    if (!ID.test(String(id))) return { ok: false, status: 0, erro: 'Aviso não encontrado.' };
    const r = await chamar('PUT', `/api/avisos/${id}/lido`);
    return r.ok ? { ok: true, aviso: lerAviso(r.dados) } : r;
  },
};

// ---------- Suporte (chamados com a equipe da plataforma; A4) ----------
// O servidor da loja repassa à Admin API com a loja (Host) e o usuário (token): nada disso vai no corpo. Nota interna, prioridade e atribuição não chegam aqui.
const ST_SUP = ['aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'fechado'];
const CAT_SUP = ['duvida', 'problema', 'sugestao', 'cobranca', 'outro'];
const TIPO_MSG = ['cliente', 'suporte', 'sistema'];
const lerMsgSuporte = (m) => {
  m = m && typeof m === 'object' ? m : {};
  return {
    id: texto(String(m.id ?? ''), 30), autorTipo: TIPO_MSG.includes(m.autorTipo) ? m.autorTipo : 'sistema', autorNome: texto(m.autorNome, 100), texto: texto(m.texto, 4000), criadoEm: texto(m.criadoEm, 40),
    anexos: listaDe(m.anexos, 3).map(lerResumoAnexo).filter(Boolean),
  };
};
const lerChamado = (c) => {
  c = c && typeof c === 'object' ? c : {};
  const o = {
    id: texto(c.id, 40), usuarioNome: texto(c.usuarioNome, 100), assunto: texto(c.assunto, 120), categoria: CAT_SUP.includes(c.categoria) ? c.categoria : 'outro',
    status: ST_SUP.includes(c.status) ? c.status : 'aberto', criadoEm: texto(c.criadoEm, 40), atualizadoEm: texto(c.atualizadoEm, 40), naoLidas: Number.isInteger(c.naoLidas) && c.naoLidas > 0 ? Math.min(c.naoLidas, 9999) : 0,
  };
  if (Array.isArray(c.msgs)) o.msgs = listaDe(c.msgs, 500).map(lerMsgSuporte);
  return o;
};
// Baixa uma imagem protegida: fetch com o token do painel, confere o tipo pelo conteúdo e entrega um endereço blob (válido só nesta aba).
async function baixarImagem(caminho) {
  if (!token) return { ok: false, status: 401, erro: 'Sessão vencida.' };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), TEMPO_MAX_MS) : null;
  try {
    const r = await fetch(`${base}${caminho}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (!r.ok) return { ok: false, status: r.status, erro: 'Imagem não encontrada.' };
    const bytes = new Uint8Array(await r.arrayBuffer());
    const tipo = tipoPorConteudo(bytes);
    if (!tipo || bytes.length > MAX_BYTES) return { ok: false, status: 0, erro: 'Imagem não encontrada.' };
    return { ok: true, url: globalThis.URL.createObjectURL(new Blob([bytes], { type: tipo })) };
  } catch { return { ok: false, status: 0, erro: 'Não foi possível carregar a imagem.' }; } finally { if (t) clearTimeout(t); }
}
export const suporte = {
  // GET /api/suporte/chamados  (o dono vê os da loja; os demais, só os próprios)
  async listar() {
    const r = await chamar('GET', '/api/suporte/chamados');
    return r.ok ? { ok: true, chamados: listaDe(r.dados, 200).map(lerChamado).filter((c) => c.id) } : r;
  },
  // GET /api/suporte/chamados/nao-lidas
  async naoLidas() {
    const r = await chamar('GET', '/api/suporte/chamados/nao-lidas');
    return r.ok ? { ok: true, naoLidas: Number.isInteger(r.dados && r.dados.naoLidas) && r.dados.naoLidas > 0 ? Math.min(r.dados.naoLidas, 9999) : 0 } : r;
  },
  // POST /api/suporte/chamados  { assunto, categoria, texto, anexos? }  (anexos: até 3 imagens JPEG em base64, já reduzidas na tela; o servidor confere o tipo pelo conteúdo)
  async abrir(d) {
    d = d || {};
    const im = conferirImagens(d.anexos);
    if (!im.ok) return { ok: false, status: 0, erro: im.erro };
    const r = await chamar('POST', '/api/suporte/chamados', { assunto: texto(d.assunto, 120).trim(), categoria: d.categoria, texto: texto(d.texto, 4000).trim(), ...(im.anexos.length ? { anexos: im.anexos.map((a) => a.dados) } : {}) });
    return r.ok ? { ok: true, chamado: lerChamado(r.dados) } : r;
  },
  // GET /api/suporte/chamados/{id}  (abrir marca como lido)
  async obter(id) {
    if (!ID.test(String(id))) return { ok: false, status: 0, erro: 'Chamado não encontrado.' };
    const r = await chamar('GET', `/api/suporte/chamados/${id}`);
    return r.ok ? { ok: true, chamado: lerChamado(r.dados) } : r;
  },
  // POST /api/suporte/chamados/{id}/mensagens  { texto, anexos? }
  async responder(id, t, anexos) {
    if (!ID.test(String(id))) return { ok: false, status: 0, erro: 'Chamado não encontrado.' };
    const im = conferirImagens(anexos);
    if (!im.ok) return { ok: false, status: 0, erro: im.erro };
    const r = await chamar('POST', `/api/suporte/chamados/${id}/mensagens`, { texto: texto(t, 4000).trim(), ...(im.anexos.length ? { anexos: im.anexos.map((a) => a.dados) } : {}) });
    return r.ok ? { ok: true, chamado: lerChamado(r.dados) } : r;
  },
  // GET /api/suporte/chamados/{id}/anexos/{anexoId}: os bytes só vêm com o login (cabeçalho Authorization); viram um endereço local (blob), nunca uma URL pública.
  async imagem(id, anexoId) {
    if (!ID.test(String(id)) || !ID.test(String(anexoId))) return { ok: false, status: 0, erro: 'Imagem não encontrada.' };
    return baixarImagem(`/api/suporte/chamados/${id}/anexos/${anexoId}`);
  },
};
