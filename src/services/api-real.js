/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cliente HTTP da API real (Spring Boot). SÓ entra no build do site publicado (`src/main-real.jsx`); o Artifact e os testes de regra usam
// `api.js` (simulada, sem rede). Este é o ÚNICO arquivo de `src/` com `fetch` (tests/estatico.test.mjs confere isso e que o Artifact não o importa).
//
// Regras: a loja vem do endereço (Host), nunca de um campo; o token fica SÓ em memória (nunca localStorage/sessionStorage/cookie: recarregar a
// página pede o login de novo); nenhuma função lança erro: devolve { ok, ... } com mensagem em português; erro técnico nunca vira texto cru na tela.
// Docs: docs/F2-front-na-api-real.md. Rotas: POST /api/auth/login, PUT /api/usuarios/me/senha, GET /api/publico/loja.

let base = ''; // '' = mesmo endereço do site (o Caddy manda /api/* para a API); os testes apontam para um servidor falso
let token = null;
let sessao = null; // { nome, papel, deveTrocarSenha, onboardingPendente } (sem o token)

const TEMPO_MAX_MS = 15000;

export function configurar({ base: b } = {}) {
  base = typeof b === 'string' ? b.replace(/\/+$/, '') : '';
  token = null; sessao = null;
}

export const sessaoAtual = () => (sessao ? { ...sessao } : null);
export const sair = () => { token = null; sessao = null; };

function mensagemPadrao(status) {
  if (status === 401) return 'Usuário ou senha inválidos';
  if (status === 403) return 'Sem permissão';
  if (status === 404) return 'Não encontrado';
  if (status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (status >= 500) return 'O servidor não respondeu. Tente de novo em instantes.';
  return 'Não foi possível concluir. Confira os dados e tente de novo.';
}

// Uma chamada. Devolve { ok: true, status, dados } ou { ok: false, status, erro } (status 0 = sem conexão).
async function chamar(metodo, caminho, corpo) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), TEMPO_MAX_MS) : null;
  try {
    const cab = { Accept: 'application/json' };
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    if (token) cab.Authorization = `Bearer ${token}`;
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
  sessao = { nome: texto(d.nome, 120), papel: texto(d.papel, 20), deveTrocarSenha: d.deveTrocarSenha === true, onboardingPendente: d.onboardingPendente === true };
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

// PUT /api/usuarios/me/senha: devolve token novo (sem a marca de senha temporária).
export async function trocarSenha({ senhaAtual, nova }) {
  const n = String(nova ?? '');
  if (n.length < 8) return { ok: false, status: 0, erro: 'A nova senha precisa ter pelo menos 8 caracteres' };
  if (n.length > 100) return { ok: false, status: 0, erro: 'A nova senha pode ter no máximo 100 caracteres' };
  if (n === String(senhaAtual ?? '')) return { ok: false, status: 0, erro: 'A nova senha precisa ser diferente da atual' };
  const r = await chamar('PUT', '/api/usuarios/me/senha', { senhaAtual: String(senhaAtual ?? '').slice(0, 100), nova: n });
  if (!r.ok) return r;
  if (!guardarSessao(r.dados)) return { ok: false, status: 502, erro: mensagemPadrao(500) };
  return { ok: true, sessao: sessaoAtual() };
}
