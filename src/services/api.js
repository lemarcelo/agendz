/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:2eec2c22af */
// API simulada. Cada função equivale a um endpoint REST que o Spring Boot vai expor (a rota vem no comentário).
// O armazenamento é um estado em memória, clonado a cada alteração. A UI só conversa com este módulo.
import * as E from '../domain/engine.js';
import * as R from '../domain/rules.js';
import * as CD from '../domain/codigo.js';
import * as F from '../domain/financeiro.js';
import { trocarFormaDoAgendamento } from '../domain/pagamento.js'; // registra no tick o lançamento das receitas e estornos do atendimento local
import * as CU from '../domain/resgate.js';
import * as AS from '../domain/assinaturas.js';
import { aReceber, extrato, rotuloMes, saldoAtual, planosPublicos } from '../domain/planos.js';
import { TIPOS_CUPOM } from '../domain/cupons.js';
import { cancelarComissao, intervaloComissao, pagarComissao, relatorioComissoes, relatorioDoProfissional, restaurarComissao } from '../domain/comissao.js';
import * as T from '../domain/tema.js';
import { capAtiva, definirTipoAtivo, exemploAtivo, rot, Rot, TIPO_PADRAO, tipoDe, tipoValido, Voc } from '../domain/tipos.js';
import { fotoValida, proximoSlot } from '../domain/foto.js';
import { diasDaExcecao } from '../domain/schedule.js';
import { aplicarOrdemManual, modoOrdemValido } from '../domain/ordem-servicos.js';
import { CAMPOS_VEICULO_EXIGIVEIS, LIMITE_VEICULOS, PORTES, PORTES_DE_FABRICA, PORTE_PADRAO, ROTULO_PORTE, chavePlaca, definirPortes, limparVeiculo, porteValido, portesAtivos, sanearPortes } from '../domain/veiculos.js';
import { validarModelo } from '../domain/templates.js';
import { addDays, fromYmd, startOfDay, ymd } from '../domain/time.js';
import { itensDoAgendamento } from '../domain/reports.js';
import { cpfMascarado, cpfValido } from '../domain/pix.js';
import * as PU from '../domain/publico.js';
import { FERIADOS_NACIONAIS } from '../domain/feriados.js';
import { LOJAS_DEMO, LOJA_PADRAO, lojaDemo, lojaDoEndereco } from './lojas-demo.js';
import { lerHashAgendar } from '../domain/link-publico.js';
import * as SU from '../domain/suporte.js';
import * as AV from '../domain/avaliacoes.js';

let offset = 0;
// Qual loja este navegador atende. Ordem: tipo fixado no build (testes: `AGENDZ_TIPO`) > endereço da página (DNS/URL, `domain/tenant.js`) >
// última loja escolhida no seletor da demonstração > padrão. No sistema real só vale o endereço (F1): cada loja tem tipo próprio, definido na
// criação e imutável. Cada loja guarda o próprio estado (nada vaza de uma para outra); trocar de loja não apaga a outra.
const CHAVE_LOJA_DEMO = 'agendz-demo-loja';
const lerLojaSalva = () => { try { const s = globalThis.localStorage && globalThis.localStorage.getItem(CHAVE_LOJA_DEMO); return lojaDemo(s) ? s : ''; } catch { return ''; } };
const gravarLojaSalva = (s) => { try { if (globalThis.localStorage) globalThis.localStorage.setItem(CHAVE_LOJA_DEMO, s); } catch { /* sem armazenamento: vale só nesta sessão */ } };
const TIPO_DO_BUILD = (() => {
  const t = typeof __AGENDZ_TIPO__ !== 'undefined' ? __AGENDZ_TIPO__ : (typeof process !== 'undefined' && process.env ? process.env.AGENDZ_TIPO : '');
  return tipoValido(t) ? t : '';
})();
const ENDERECO = TIPO_DO_BUILD ? { slug: null, via: null, existe: false } : lojaDoEndereco();
export const LOJA_NAO_ENCONTRADA = !!ENDERECO.slug && !ENDERECO.existe ? ENDERECO.slug : ''; // o endereço pede uma loja que não existe
export const LOJA_FIXA = !!TIPO_DO_BUILD || (!!ENDERECO.slug && ENDERECO.existe); // loja decidida pelo build ou pelo endereço: sem seletor
export const LOJA_TROCAVEL = !LOJA_FIXA && !LOJA_NAO_ENCONTRADA;
// Demonstração: o link do cliente (#agendar@dalforno) já abre na loja de quem enviou, desde a primeira tela (sem passar antes pela loja salva ou pela padrão).
const lojaDoLink = () => { try { const l = lerHashAgendar(globalThis.location?.hash)?.loja; return l && lojaDemo(l) ? l : ''; } catch { return ''; } };
let lojaSlug = (TIPO_DO_BUILD && LOJAS_DEMO.find((l) => l.tipo === TIPO_DO_BUILD)?.slug) || (ENDERECO.existe && ENDERECO.slug) || (LOJA_TROCAVEL && lojaDoLink()) || lerLojaSalva() || LOJA_PADRAO;
const novoEstado = (slug = lojaSlug) => { const e = lojaDemo(slug).criar(Date.now()); E.tick(e, Date.now()); return e; };
const estados = new Map();
let state = novoEstado(); estados.set(lojaSlug, state);
let sessao = null; // id do usuário logado
let apiLog = [];
let snap = null;
const listeners = new Set();

const now = () => Date.now() + offset;
const emit = () => {
  definirTipoAtivo(state.estabelecimento); // textos e telas seguem o tipo da loja
  definirPortes(state.estabelecimento.portes); // portes cadastrados pelo dono (v122); sem cadastro, os cinco de fábrica
  snap = { state, agora: now(), sessao, apiLog, offset, loja: lojaSlug };
  listeners.forEach((l) => l());
};
emit();

const zerarLimites = () => { limitesPublicos.clear(); falhasLogin.clear(); falhasRecuperacao.clear(); pedidosRecuperacao.clear(); };
export const store = {
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  getSnapshot: () => snap,
  agora: now,
  getState: () => state,
  // Avança o relógio simulado para demonstrar as automações (notificações, falta de confirmação, conclusão).
  avancar(ms) {
    offset += ms;
    return mutate(() => ({ ok: true }), { metodo: 'POST', rota: '/automacao/tick', origem: 'sistema', silencioso: true });
  },
  voltarAoRelogioReal() { offset = 0; return this.avancar(0); },
  // Demonstração: recria os dados de exemplo da loja atual.
  reiniciar() { offset = 0; state = novoEstado(); estados.set(lojaSlug, state); apiLog = []; sessao = null; zerarLimites(); emit(); },
  // Demonstração: passa a atender outra loja (só sem loja fixa por build ou endereço). Cada loja mantém o próprio estado; a sessão não passa de uma loja para outra.
  entrarNaLoja(slug) {
    if (!MODO_DEMO || LOJA_FIXA || !lojaDemo(slug) || slug === lojaSlug) return;
    lojaSlug = slug; gravarLojaSalva(slug);
    if (!estados.has(slug)) estados.set(slug, novoEstado(slug));
    state = estados.get(slug); sessao = null; apiLog = []; zerarLimites(); emit();
  },
  // Demonstração: simula o Admin da plataforma mudando a regra `avaliacaoMostraAnonimo` da loja (o painel da loja NUNCA muda; no servidor é a regra do Admin
  // com motivo e linha do tempo). Sem sessão de loja e sem rota no mapa: não existe fora da simulação.
  simularAdmin(regra, valor, motivo) {
    if (!MODO_DEMO || regra !== 'avaliacaoMostraAnonimo' || typeof valor !== 'boolean') return erro('Regra inválida.');
    const m = AV.validarMotivo(motivo); if (!m.ok) return erro(m.erro);
    return mutate((st, agora) => { st.regrasPlataforma = { ...(st.regrasPlataforma || {}), [regra]: valor }; (st.eventosPlataforma ||= []).push({ em: agora, regra, valor, motivo: m.motivo }); return { ok: true }; }, { metodo: 'PUT', rota: '/admin/lojas/{slug}/regras', origem: 'sistema', silencioso: true });
  },
  // POST /licenca/alerta  (no Spring Boot: grava e avisa o proprietário; aqui só entra no log da aba "Chamadas à API")
  alertaLicenca(info) {
    apiLog = [{ id: apiLog.length ? apiLog[0].id + 1 : 1, em: now(), metodo: 'POST', rota: '/licenca/alerta', origem: 'sistema', ok: true, detalhe: `${info.motivo}: ${String(info.host).slice(0, 80)} (build ${info.marca})` }, ...apiLog].slice(0, 60);
    emit();
  },
  iniciarRelogio(ms = 20000) {
    const id = setInterval(() => { mutate(() => ({ ok: true }), { silencioso: true }); }, ms);
    return () => clearInterval(id);
  },
};

function addLog(meta, ok, extra) {
  if (!meta || meta.silencioso) return;
  apiLog = [{ id: apiLog.length ? apiLog[0].id + 1 : 1, em: now(), metodo: meta.metodo, rota: meta.rota, origem: meta.origem || 'painel', ok, detalhe: extra || '' }, ...apiLog].slice(0, 60);
}

const LIMITE_CRESCIMENTO = 150000; // uma única operação não pode acrescentar mais que isso ao estado
function mutate(fn, meta) {
  const draft = structuredClone(state);
  const agora = now();
  const antes = JSON.stringify(state);
  let r;
  // `persistir`: a operação foi recusada, mas deixou um registro que precisa ficar (ex.: mensagem automática de DDD bloqueado).
  try {
    r = fn(draft, agora) || { ok: true };
    if (r.ok !== false || r.persistir) E.tick(draft, agora);
  } catch (e) { r = erro('Não foi possível concluir. Confira os dados informados.'); }
  if ((r.ok !== false || r.persistir) && JSON.stringify(draft).length - antes.length > LIMITE_CRESCIMENTO) r = erro('Texto grande demais.');
  if (r.ok === false && !r.persistir) { addLog(meta, false, (r.erros || [])[0]); emit(); return r; }
  if (JSON.stringify(draft) !== antes) state = draft;
  if (r.ok === false) { addLog(meta, false, (r.erros || [])[0]); emit(); return r; }
  addLog(meta, true);
  emit();
  return r;
}

const usuario = () => state.usuarios.find((u) => u.id === sessao) || null;
const erro = (msg) => ({ ok: false, erros: [msg] });
const semPermissao = () => erro('Você não tem permissão para isso.');
const exigir = (secao) => (R.pode(usuario(), secao) ? null : semPermissao());
const autor = () => E.autorUsuario(usuario());
// Modo demonstração do protótipo: a recuperação de senha mostra o código na resposta (simula o SMS/WhatsApp) e o simulador do banco fica ligado.
// Em produção isto é falso: o código só sai pelo canal e as rotas do banco simulado não existem.
export const MODO_DEMO = true;
// ---------- validação de entrada ----------
const finito = (v) => typeof v === 'number' ? Number.isFinite(v) : (typeof v === 'string' && /^\s*-?\d{1,15}(\.\d{1,6})?\s*$/.test(v) && Number.isFinite(Number(v)));
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const faixasValidas = (f) => Array.isArray(f) && f.length <= 6 && f.every((x) => Array.isArray(x) && x.length === 2 && HM.test(x[0]) && HM.test(x[1]) && x[0] < x[1]);
const semanaValida = (w) => !!w && typeof w === 'object' && !Array.isArray(w) && Object.keys(w).length <= 7 && Object.entries(w).every(([k, d]) => /^[0-6]$/.test(k) && d && typeof d.aberto === 'boolean' && faixasValidas(d.faixas));
const YMD = /^\d{4}-\d{2}-\d{2}$/;
// Lista de avisos (notificações): cada item precisa dizer quando e a que status se aplica; o resto é descartado.
const notificacaoValida = (n) => !!n && typeof n === 'object' && !Array.isArray(n) && ['dias', 'horas'].includes(n.modo)
  && (n.modo === 'dias' ? Number(n.dias) >= 0 && Number(n.dias) <= 30 && HM.test(n.hora || '') : HM.test(n.horas || ''))
  && (n.tipo === undefined || ['pergunta', 'aviso'].includes(n.tipo));
const notificacoesValidas = (l) => l == null || (Array.isArray(l) && l.length <= 10 && l.every(notificacaoValida));
const texto = (v, max) => typeof v === 'string' && v.length <= max;
// Campos que só existem em tipos com veículo/box (estética). Em outro tipo (barbearia) a API não os aceita: `pegar` os descarta como qualquer campo desconhecido.
const CAMPOS_VEICULO = ['veiculoId', 'veiculo', 'veiculos', 'placa', 'marca', 'modelo', 'cor', 'porte', 'portes'];
const CAMPOS_RECURSO = ['boxId', 'boxes'];
const permitidos = (campos) => campos.filter((k) => (capAtiva('usaVeiculo') || !CAMPOS_VEICULO.includes(k)) && (capAtiva('usaRecursoFisico') || !CAMPOS_RECURSO.includes(k)));
const porteOk = (p) => !capAtiva('precoPorPorte') || porteValido(p);
const pegar = (obj, campos) => Object.fromEntries(campos.filter((k) => Object.prototype.hasOwnProperty.call(obj || {}, k)).map((k) => [k, typeof obj[k] === 'string' && k !== 'senha' && k !== 'corpo' && k !== 'logo' && k !== 'foto' ? R.limparTexto(obj[k], 5000) : obj[k]]));
// Percentual de comissão: vazio/null = herdar (usa o do serviço ou o padrão); senão número de 0 a 100.
const lerPct = (v) => (v === null || v === undefined || v === '' ? { ok: true, v: null } : finito(v) && Number(v) >= 0 && Number(v) <= 100 ? { ok: true, v: Math.round(Number(v) * 100) / 100 } : { ok: false });
const semUsuarioSenha = (u) => { if (!u) return u; const { senha, ...resto } = u; return resto; };

// ---------- consultas (GET) ----------
// Suporte (chamados do usuário; o dono vê os da loja toda). Só o resumo: a conversa vem de `suporte.obter`.
export const chamadosDoUsuario = (st, user) => SU.chamadosVisiveis(st, user).map(SU.resumoDoChamado);
export const naoLidasDoSuporte = (st, user) => SU.naoLidasDoUsuario(st, user);
export function agendamentosVisiveis(st, user) {
  if (!user) return [];
  if (user.papel === 'profissional') return st.agendamentos.filter((a) => a.profissionalId === user.id);
  return st.agendamentos;
}
export function profissionaisVisiveis(st, user) {
  const atendem = st.usuarios.filter((u) => u.atende);
  if (!user) return atendem;
  return user.papel === 'profissional' ? atendem.filter((u) => u.id === user.id) : atendem;
}
export function destinosCalendario(st, a) {
  if (!st.estabelecimento.calendario.enviarEventos) return [];
  const b = st.usuarios.find((u) => u.id === a.profissionalId);
  return [...new Set([st.estabelecimento.email, b?.email].filter(Boolean))];
}
export function avisosDoUsuario(st, user) {
  if (!user) return [];
  return st.avisosPainel.filter((x) => (x.tipo === 'vinculo' ? R.podeAutorizarVinculo(user) : user.papel !== 'profissional' || x.profissionalId === user.id));
}
// Pedidos de vínculo de número novo: só quem pode autorizar vê (sem o CPF completo).
export function pedidosVinculoVisiveis(st, user) {
  if (!R.podeAutorizarVinculo(user)) return [];
  return (st.pedidosVinculo || []).map((p) => {
    const c = st.clientes.find((x) => x.id === p.clienteId);
    return { id: p.id, status: p.status, em: p.em, telefone: p.telefone, nome: p.nome, clienteId: p.clienteId, clienteNome: c?.nome || '(cadastro removido)', telefoneAtual: c?.telefone || '', cpf: cpfMascarado(p.cpf), decididoPor: p.decididoPor, decididoEm: p.decididoEm };
  }).sort((a, b) => b.em - a.em);
}

// ---------- autenticação ----------
// Proteções contra tentativa e erro. No back-end real: contador por usuário + IP no Redis/banco, hash BCrypt/Argon2 e código de uso único.
const LOGIN_MAX_FALHAS = 5, LOGIN_BLOQUEIO_MS = 15 * 60 * 1000, REC_VALIDADE_MS = 30 * 60 * 1000, REC_MAX_FALHAS = 5;
const falhasLogin = new Map(); // identificador normalizado → { n, ate }  (vale também para usuários que não existem: não revela cadastro)
const falhasRecuperacao = new Map(); // usuarioId → tentativas erradas do código atual
// Pedidos de código por CPF (existindo ou não): sem teto, cada pedido novo zeraria as tentativas erradas e permitiria adivinhar o código aos poucos.
const pedidosRecuperacao = new Map(); // CPF (dígitos) → { n, desde }
const REC_MAX_PEDIDOS = 5, REC_JANELA_PEDIDOS_MS = 60 * 60 * 1000;
function codigoSeguro() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) { const v = new Uint32Array(1); c.getRandomValues(v); return String(100000 + (v[0] % 900000)); }
  return String(Math.floor(100000 + Math.random() * 900000));
}
// Chave do contador de falhas: a conta (id) quando existe; senão o texto normalizado (CPF só com dígitos, o resto em minúsculas sem espaços).
// Assim "391.847.260-40", "391 847 260 40" e "ALAN" caem no mesmo contador e o bloqueio não é contornado por variações.
const chaveLogin = (id, u) => (u ? `u:${u.id}` : `t:${R.somenteDigitos(id).length === 11 ? R.somenteDigitos(id) : id.replace(/\s+/g, '')}`);
export const auth = {
  // POST /auth/login
  login(entrada) {
    const { identificador, senha } = entrada || {};
    const id = typeof identificador === 'string' ? identificador.trim().toLowerCase().slice(0, 200) : '';
    const agora = now();
    const dig = R.somenteDigitos(id);
    const u = id ? state.usuarios.find((x) => (dig.length === 11 && R.somenteDigitos(x.cpf) === dig) || String(x.apelido).toLowerCase() === id || String(x.email).toLowerCase() === id) : null;
    const chave = chaveLogin(id, u);
    const f = falhasLogin.get(chave);
    if (f && f.ate > agora) return erro(`Muitas tentativas. Tente de novo em ${Math.ceil((f.ate - agora) / 60000)} min.`);
    if (!u || typeof senha !== 'string' || u.senha !== senha) {
      const n = (f?.n || 0) + 1;
      if (falhasLogin.size > 5000) { // descarta só as chaves mais antigas e sem bloqueio ativo; limpar tudo soltaria quem está bloqueado
        for (const [k, v] of falhasLogin) { if (!(v.ate > agora)) falhasLogin.delete(k); if (falhasLogin.size <= 4000) break; }
        if (falhasLogin.size > 5000) falhasLogin.delete(falhasLogin.keys().next().value);
      }
      falhasLogin.set(chave, n >= LOGIN_MAX_FALHAS ? { n: 0, ate: agora + LOGIN_BLOQUEIO_MS } : { n, ate: 0 });
      return erro('Usuário ou senha incorretos.');
    }
    falhasLogin.delete(chave);
    sessao = u.id;
    emit();
    return { ok: true, usuario: semUsuarioSenha(u) };
  },
  // POST /auth/logout
  logout() { sessao = null; emit(); },
  // POST /auth/recuperar  (a resposta nunca traz o código, exceto no modo demonstração que simula o envio por SMS/WhatsApp/e-mail)
  iniciarRecuperacao(entrada) {
    const { cpf, telefone, canal } = entrada || {};
    return mutate((s, agora) => {
      const chave = R.somenteDigitos(cpf).slice(0, 20) || '-';
      const p = pedidosRecuperacao.get(chave);
      const atual = p && agora - p.desde < REC_JANELA_PEDIDOS_MS ? p : { n: 0, desde: agora };
      if (atual.n >= REC_MAX_PEDIDOS) return erro('Muitos pedidos de código. Tente de novo mais tarde.');
      if (pedidosRecuperacao.size > 5000) pedidosRecuperacao.delete(pedidosRecuperacao.keys().next().value);
      pedidosRecuperacao.set(chave, { n: atual.n + 1, desde: atual.desde });
      const u = s.usuarios.find((x) => R.somenteDigitos(x.cpf) === R.somenteDigitos(cpf) && R.somenteDigitos(x.telefone) === R.somenteDigitos(telefone));
      if (!u) return erro('Não encontramos um cadastro com esse CPF e telefone.');
      const codigo = codigoSeguro();
      s.recuperacoes = s.recuperacoes.filter((x) => x.usuarioId !== u.id); // só o último código vale
      s.recuperacoes.unshift({ id: `r${++s.seq}`, usuarioId: u.id, codigo, canal: canal === 'email' ? 'email' : 'whatsapp', em: agora });
      falhasRecuperacao.delete(u.id);
      return { ok: true, destino: canal === 'email' ? u.email : u.telefone, ...(MODO_DEMO ? { codigo } : {}) };
    }, { metodo: 'POST', rota: '/auth/recuperar', origem: 'painel' });
  },
  // POST /auth/redefinir  (código vale 30 min, uso único, 5 tentativas erradas invalidam)
  concluirRecuperacao(entrada) {
    const { cpf, codigo, senha } = entrada || {};
    return mutate((s, agora) => {
      if (typeof senha !== 'string' || senha.length < 4 || senha.length > 100) return erro('A nova senha precisa ter de 4 a 100 caracteres.');
      const u = s.usuarios.find((x) => R.somenteDigitos(x.cpf) === R.somenteDigitos(cpf));
      const r = u && s.recuperacoes.find((x) => x.usuarioId === u.id);
      if (!r || agora - r.em > REC_VALIDADE_MS) return erro('Código inválido ou expirado.');
      const falhas = falhasRecuperacao.get(u.id) || 0;
      if (falhas >= REC_MAX_FALHAS) return erro('Código inválido ou expirado.');
      if (r.codigo !== String(codigo ?? '').trim()) { falhasRecuperacao.set(u.id, falhas + 1); return erro('Código inválido ou expirado.'); }
      u.senha = senha;
      s.recuperacoes = s.recuperacoes.filter((x) => x.usuarioId !== u.id);
      falhasLogin.delete(`u:${u.id}`); // libera só quem recuperou a própria senha
      return { ok: true };
    }, { metodo: 'POST', rota: '/auth/redefinir', origem: 'painel' });
  },
};

// ---------- agendamentos (painel) ----------
// Veículo vindo de fora: `veiculoId` (um do cadastro do cliente) ou `veiculo` (novo: placa, marca, modelo, cor, porte). Só campos conhecidos; a validação do formato está em limparVeiculo.
function veiculoDeEntrada(d) {
  if (d.veiculoId !== undefined && !texto(d.veiculoId, 60)) return erro('Veículo inválido.');
  if (d.veiculo === undefined || d.veiculo === null) { delete d.veiculo; return null; }
  if (typeof d.veiculo !== 'object' || Array.isArray(d.veiculo)) return erro('Veículo inválido.');
  d.veiculo = pegar(d.veiculo, ['placa', 'marca', 'modelo', 'cor', 'porte']);
  return null;
}

export const agenda = {
  // POST /agendamentos
  criar(dados) {
    const u = usuario();
    if (!u) return semPermissao();
    if (u.papel === 'profissional' && dados.profissionalId !== u.id) return erro('Você só pode agendar na sua própria agenda.');
    if (!R.pode(u, 'agenda')) return semPermissao();
    const chave = dados?.cupomChave;
    if (chave !== undefined && chave !== null && chave !== '' && (typeof chave !== 'string' || chave.length > 40)) return erro('Cupom inválido.');
    return mutate((s, agora) => {
      const r = E.criarAgendamento(s, { ...dados, origem: 'painel' }, autor(), agora);
      if (!r.ok || !chave) return r;
      const c = CU.aplicarCupom(s, r.agendamento, chave, { quem: usuario().id, detalhado: true }, autor(), agora);
      return c.ok ? { ...r, desconto: c.desconto } : erro(c.erros[0]); // cupom recusado: o agendamento também não é criado (nada fica gravado)
    }, { metodo: 'POST', rota: '/agendamentos' });
  },
  // POST /atendimentos  (botão Atender: sem data ou data passada = atendimento já feito, concluído nessa data; data futura = agendamento)
  // Só exige ≥1 serviço ou produto; o resto vem dos campos obrigatórios de cada tipo (Estabelecimento > Regras). Telefone cria o cadastro do cliente.
  atender(entrada) {
    const u = usuario();
    if (!u || !R.pode(u, 'agenda')) return semPermissao();
    const d = pegar(entrada, permitidos(['servicoIds', 'produtos', 'nome', 'telefone', 'clienteId', 'profissionalId', 'vendedorId', 'formaPagamento', 'inicio', 'status', 'encaixe', 'cupomChave', 'veiculoId', 'veiculo', 'boxId', 'motivoRetroativo', 'assinaturaId']));
    if (d.servicoIds === undefined || d.servicoIds === null) d.servicoIds = [];
    if (!(Array.isArray(d.servicoIds) && d.servicoIds.length <= 10 && d.servicoIds.every((x) => texto(x, 60)))) return erro('Escolha até 10 serviços.');
    if (d.produtos === undefined || d.produtos === null) d.produtos = [];
    if (!(Array.isArray(d.produtos) && d.produtos.length <= 10 && d.produtos.every((p) => p && typeof p === 'object'))) return erro('Produtos inválidos.');
    d.produtos = d.produtos.map((p) => pegar(p, ['materialId', 'qtd']));
    for (const k of ['nome', 'telefone', 'clienteId', 'profissionalId', 'vendedorId', 'formaPagamento', 'status', 'cupomChave', 'veiculoId', 'boxId', 'assinaturaId']) {
      if (d[k] === undefined || d[k] === null || d[k] === '') { delete d[k]; continue; }
      if (!texto(d[k], k === 'nome' ? 60 : 60)) return erro('Dados inválidos em ' + k + '.');
    }
    if (d.formaPagamento !== undefined && !R.formaValida(d.formaPagamento)) return erro('Forma de pagamento inválida.');
    { const e = veiculoDeEntrada(d); if (e) return e; }
    if (d.inicio !== undefined && d.inicio !== null && (!finito(d.inicio) || Math.abs(Number(d.inicio)) > 8.64e15)) return erro('Data e hora inválidas.');
    if (d.inicio === null) delete d.inicio;
    if (d.encaixe !== undefined && typeof d.encaixe !== 'boolean') return erro('Encaixe inválido.');
    if (d.motivoRetroativo === undefined || d.motivoRetroativo === null || d.motivoRetroativo === '') delete d.motivoRetroativo;
    else if (!texto(d.motivoRetroativo, 300)) return erro('O motivo pode ter até 300 letras.');
    // Dia anterior ("esqueci de registrar") é com o proprietário, o administrador ou a recepção: o profissional só lança o que aconteceu hoje (senão poderia inventar comissão).
    if (u.papel === 'profissional' && d.inicio != null && Number(d.inicio) < startOfDay(now())) return erro('Lançar um dia anterior é com o proprietário ou a recepção. Peça a eles para registrar.');
    // Profissional atende e vende sempre como ele mesmo; recepção: vendedor padrão é quem está lançando (se tiver "Pode vender produtos").
    if (u.papel === 'profissional') { d.profissionalId = u.id; d.vendedorId = u.id; }
    else if (!d.vendedorId && d.produtos.length && u.podeVender !== false) d.vendedorId = u.id;
    return mutate((s, agora) => {
      const r = E.atender(s, d, autor(), agora);
      if (!r.ok || !d.cupomChave) return r;
      const c = CU.aplicarCupom(s, r.agendamento, d.cupomChave, { quem: usuario().id, detalhado: true }, autor(), agora);
      return c.ok ? { ...r, desconto: c.desconto } : erro(c.erros[0]);
    }, { metodo: 'POST', rota: '/atendimentos' });
  },
  // POST /atendimentos-locais  (cliente do balcão: serviços e/ou produtos e, se quiser, nome e telefone; telefone já cadastrado vincula o cliente; nunca cria cadastro)
  // Venda só de produto: sem serviços, com vendedor (quem ganha a comissão do produto). Profissional só registra no próprio nome e é o próprio vendedor.
  registrarLocal(entrada) {
    const u = usuario();
    if (!u || !R.pode(u, 'agenda')) return semPermissao();
    const d = pegar(entrada, permitidos(['servicoIds', 'nome', 'telefone', 'profissionalId', 'produtos', 'vendedorId', 'formaPagamento', 'veiculoId', 'veiculo']));
    if (d.veiculoId === '' || d.veiculoId === null) delete d.veiculoId;
    { const e = veiculoDeEntrada(d); if (e) return e; }
    if (d.formaPagamento !== undefined && d.formaPagamento !== null && d.formaPagamento !== '' && !R.formaValida(d.formaPagamento)) return erro('Forma de pagamento inválida.');
    if (d.produtos !== undefined && !(Array.isArray(d.produtos) && d.produtos.length <= 10 && d.produtos.every((p) => p && typeof p === 'object'))) return erro('Produtos inválidos.');
    if (d.produtos) d.produtos = d.produtos.map((p) => pegar(p, ['materialId', 'qtd']));
    if (d.telefone !== undefined && d.telefone !== null && d.telefone !== '' && !texto(d.telefone, 30)) return erro('Telefone inválido.');
    const temProdutos = Array.isArray(d.produtos) && d.produtos.length > 0;
    if (d.servicoIds === undefined || d.servicoIds === null) d.servicoIds = [];
    if (!(Array.isArray(d.servicoIds) && d.servicoIds.length <= 10 && d.servicoIds.every((x) => texto(x, 60)))) return erro('Escolha até 10 serviços.');
    if (!d.servicoIds.length && !temProdutos) return erro('Escolha ao menos um serviço ou um produto.');
    if (d.nome !== undefined && d.nome !== null && !texto(d.nome, 60)) return erro('O nome pode ter até 60 letras.');
    if (d.vendedorId !== undefined && d.vendedorId !== null && d.vendedorId !== '' && !texto(d.vendedorId, 60)) return erro('Vendedor inválido.');
    const profissionalId = u.papel === 'profissional' ? u.id : d.profissionalId;
    // Vendedor padrão: quem está lançando, se pode vender; senão o profissional do atendimento. O profissional vende sempre como ele mesmo.
    const vendedorId = u.papel === 'profissional' ? u.id : d.vendedorId || (u.podeVender !== false ? u.id : undefined);
    if (d.servicoIds.length && !texto(profissionalId, 60)) return erro(`Escolha o ${rot('profissional')} que atendeu.`);
    return mutate((s, agora) => E.registrarAtendimentoLocal(s, { profissionalId, servicoIds: d.servicoIds, nome: d.nome, telefone: d.telefone, produtos: d.produtos, vendedorId, formaPagamento: d.formaPagamento || undefined, veiculoId: d.veiculoId, veiculo: d.veiculo }, autor(), agora), { metodo: 'POST', rota: '/atendimentos-locais' });
  },
  // POST /agendamentos/{id}/servicos  (acrescenta serviços a um agendamento ou atendimento local; o status não muda)
  adicionarServicos(id, servicoIds) {
    const n = meuAgendamento(id); if (n) return n;
    if (!(Array.isArray(servicoIds) && servicoIds.length >= 1 && servicoIds.length <= 10 && servicoIds.every((x) => texto(x, 60)))) return erro('Escolha de 1 a 10 serviços.');
    return mutate((s, agora) => E.adicionarServicosAoAgendamento(s, id, servicoIds, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/servicos` });
  },
  // POST /agendamentos/{id}/produtos  |  DELETE /agendamentos/{id}/produtos/{materialId}  (produto = material do tipo "produto")
  adicionarProduto(id, entrada) {
    const n = meuAgendamento(id); if (n) return n;
    const p = pegar(entrada, ['materialId', 'qtd', 'vendedorId']);
    if (!texto(p.materialId, 60) || !finito(p.qtd)) return erro('Escolha o produto e a quantidade.');
    if (p.vendedorId !== undefined && p.vendedorId !== null && p.vendedorId !== '' && !texto(p.vendedorId, 60)) return erro('Vendedor inválido.');
    // Vendedor padrão: quem está lançando (se pode vender); o profissional vende como ele mesmo; só recepção/gestão escolhe outro.
    const eu = usuario();
    const vendedorId = eu.papel === 'profissional' ? eu.id : p.vendedorId || (eu.podeVender !== false ? eu.id : undefined);
    return mutate((s, agora) => E.adicionarProdutoAoAgendamento(s, id, { materialId: p.materialId, qtd: Number(p.qtd), vendedorId }, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/produtos` });
  },
  removerProduto(id, materialId) {
    const n = meuAgendamento(id); if (n) return n;
    if (!texto(materialId, 60)) return erro('Escolha o produto.');
    return mutate((s, agora) => E.removerProdutoDoAgendamento(s, id, materialId, autor(), agora), { metodo: 'DELETE', rota: `/agendamentos/${id}/produtos/${materialId}` });
  },
  // POST /agendamentos/{id}/cupom  |  DELETE /agendamentos/{id}/cupom
  aplicarCupom(id, chave) {
    const n = meuAgendamento(id); if (n) return n;
    if (state.agendamentos.find((x) => x.id === id)?.local) return erro('Atendimento local não usa cupom.');
    if (typeof chave !== 'string' || chave.length > 40) return erro('Informe a chave do cupom.');
    return mutate((s, agora) => CU.aplicarCupom(s, s.agendamentos.find((x) => x.id === id), chave, { quem: usuario().id, detalhado: true }, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/cupom` });
  },
  retirarCupom(id) {
    const n = meuAgendamento(id); if (n) return n;
    return mutate((s, agora) => CU.retirarCupom(s, s.agendamentos.find((x) => x.id === id), autor(), agora), { metodo: 'DELETE', rota: `/agendamentos/${id}/cupom` });
  },
  // GET /agendamentos/validar (sem gravar): usado para os avisos em vermelho do formulário
  validar(dados) {
    const u = usuario();
    if (!u) return { erros: ['Entre para continuar.'], pendentes: [], confirmados: [] };
    if (u.papel === 'profissional' && dados?.profissionalId !== u.id) return { erros: ['Você só vê a sua própria agenda.'], pendentes: [], confirmados: [] };
    return R.validarHorario(state, { ...dados, origem: 'painel', agora: now() });
  },
  // PUT /agendamentos/{id}/remarcar  ({ inicio, status?, profissionalId?, boxId? }: sem boxId, o carro continua no mesmo box se estiver livre)
  remarcar(id, dados) {
    if (dados?.boxId !== undefined && dados.boxId !== null && dados.boxId !== '' && !texto(dados.boxId, 60)) return erro('Box inválido.');
    const n = meuAgendamento(id) || (state.agendamentos.find((x) => x.id === id)?.local ? erro('Atendimento local não é remarcado.') : null) || (usuario().papel === 'profissional' && dados?.profissionalId && dados.profissionalId !== usuario().id ? semPermissao() : null); if (n) return n;
    return mutate((s, agora) => E.profissionalRemarca(s, id, dados, autor(), agora), { metodo: 'PUT', rota: `/agendamentos/${id}/remarcar` });
  },
  // PUT /agendamentos/{id}/forma-pagamento  ({ formaPagamento: 'pix' | 'dinheiro' | 'cartao' })  futuro ou concluído, nunca cancelado; profissional só nos seus; receita já lançada acompanha a troca
  mudarFormaPagamento(id, forma) {
    if (typeof id !== 'string' || !id || id.length > 60) return erro('Agendamento não encontrado.');
    if (!R.formaValida(forma)) return erro('Forma de pagamento inválida.');
    return meuAgendamento(id) || mutate((s, agora) => trocarFormaDoAgendamento(s, s.agendamentos.find((x) => x.id === id), forma, autor(), agora), { metodo: 'PUT', rota: `/agendamentos/${id}/forma-pagamento` });
  },
  // POST /agendamentos/{id}/cancelar
  cancelar(id) { return meuAgendamento(id) || mutate((s, agora) => E.profissionalCancela(s, id, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/cancelar` }); },
  // PUT /agendamentos/{id}/status
  alterarStatus(id, status) { return meuAgendamento(id) || (state.agendamentos.find((x) => x.id === id)?.local && status !== 'cancelado' ? erro('Atendimento local já nasce concluído.') : null) || mutate((s, agora) => E.profissionalAlteraStatus(s, id, status, autor(), agora), { metodo: 'PUT', rota: `/agendamentos/${id}/status` }); },
  // PUT /agendamentos/{id}/servicos
  editarServicos(id, ids) { return meuAgendamento(id) || (Array.isArray(ids) ? null : erro('Escolha os serviços.')) || mutate((s, agora) => E.profissionalEditaServicos(s, id, ids, autor(), agora), { metodo: 'PUT', rota: `/agendamentos/${id}/servicos` }); },
  // POST /agendamentos/{id}/confirmacao-servico
  confirmarServico(id, feitos) { return meuAgendamento(id) || mutate((s, agora) => E.confirmarServico(s, id, feitos, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/confirmacao-servico` }); },
  // POST /agendamentos/{id}/mensagens
  enviarMensagem(id, modeloId, valores) {
    const n = meuAgendamento(id); if (n) return n;
    return mutate((s, agora) => E.enviarMensagemDoProfissional(s, id, modeloId, valores, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/mensagens` });
  },
  // POST /agendamentos/{id}/iniciar-servico  (marcador "Em serviço"; o carro entrou no box)
  iniciarServico(id) { return meuAgendamento(id) || mutate((s, agora) => E.iniciarServico(s, id, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/iniciar-servico` }); },
  // POST /agendamentos/{id}/pronto  (marcador "Pronto para retirada"; manda o aviso "seu carro está pronto" uma vez)
  marcarPronto(id) { return meuAgendamento(id) || mutate((s, agora) => E.marcarPronto(s, id, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${id}/pronto` }); },
  // DELETE /agendamentos/{id}/andamento/{qual}  (qual = emServico | pronto; desfaz o marcador ligado por engano)
  desmarcarAndamento(id, qual) {
    if (!['emServico', 'pronto'].includes(qual)) return erro('Marcador inválido.');
    return meuAgendamento(id) || mutate((s, agora) => E.desmarcarAndamento(s, id, qual, autor(), agora), { metodo: 'DELETE', rota: `/agendamentos/${id}/andamento/${qual}` });
  },
  // PUT /avisos/{id}/lido
  marcarAvisoLido(id) {
    const u = usuario(); if (!u) return semPermissao();
    return mutate((s) => { const a = s.avisosPainel.find((x) => x.id === id && (u.papel !== 'profissional' || x.profissionalId === u.id)); if (a) a.lido = true; return { ok: true }; }, { metodo: 'PUT', rota: `/avisos/${id}/lido`, silencioso: true });
  },
};

// ---------- clientes ----------
export const clientes = {
  // POST /clientes  |  PUT /clientes/{id}
  salvar(entrada) {
    if (!R.pode(usuario(), 'clientes')) return semPermissao();
    const c = { ...pegar(entrada, permitidos(['id', 'nome', 'apelido', 'telefone', 'cpf', 'nascimento', 'veiculos', 'semMensagens'])) };
    if ('semMensagens' in c && typeof c.semMensagens !== 'boolean') return erro('Opção de receber mensagens inválida.');
    for (const k of ['nome', 'apelido', 'telefone', 'cpf', 'nascimento']) if (k in c && !texto(c[k], 100)) return erro('Texto inválido ou grande demais em ' + k + '.');
    if ('veiculos' in c && !(Array.isArray(c.veiculos) && c.veiculos.length <= LIMITE_VEICULOS && c.veiculos.every((v) => v && typeof v === 'object' && !Array.isArray(v)))) return erro(`Veículos inválidos: no máximo ${LIMITE_VEICULOS} por cliente.`);
    if (c.veiculos) c.veiculos = c.veiculos.map((v) => pegar(v, ['id', 'placa', 'marca', 'modelo', 'cor', 'porte']));
    return mutate((s, agora) => {
      if (!String(c.nome || '').trim()) return erro('Informe o nome ou apelido do cliente.');
      const tel = R.telefoneNacional(c.telefone);
      if (!R.telefoneBrasileiro(c.telefone) || !/^[1-9]\d/.test(tel)) return erro('Informe o telefone com DDD.');
      // CPF (opcional) válido e único na loja; a mensagem nunca diz de quem é. Nascimento: data real (aaaa-mm-dd) entre 1900 e hoje. Mesmas regras do servidor (F2).
      if (String(c.cpf || '').trim() && !cpfValido(c.cpf)) return erro('CPF inválido.');
      if (R.somenteDigitos(c.cpf) && s.clientes.some((x) => x.id !== c.id && R.somenteDigitos(x.cpf) === R.somenteDigitos(c.cpf))) return erro('Esse CPF já está cadastrado.');
      if (String(c.nascimento || '').trim()) {
        const d = new Date(`${c.nascimento}T00:00:00`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.nascimento) || Number.isNaN(d.getTime()) || ymd(d.getTime()) !== c.nascimento || d.getFullYear() < 1900 || d.getTime() > agora) return erro('Data de nascimento inválida.');
      }
      if (s.clientes.some((x) => x.id !== c.id && R.telefoneNacional(x.telefone) === tel && String(x.nome).toLowerCase() === String(c.nome).toLowerCase())) return erro('Já existe um cliente com esse nome e telefone.');
      // Veículos do cliente: placa válida (antiga ou Mercosul) e única por cliente; o id é sempre do servidor; veículo com agendamento ativo não sai da lista.
      let veiculos;
      if (c.veiculos) {
        const atuais = (c.id ? s.clientes.find((x) => x.id === c.id)?.veiculos : null) || [];
        veiculos = [];
        for (const v of c.veiculos) {
          const l = limparVeiculo(v); if (!l.ok) return erro(l.erro);
          if (veiculos.some((x) => chavePlaca(x.placa) === chavePlaca(l.veiculo.placa))) return erro(`A placa ${l.veiculo.placa} aparece duas vezes nesse cliente.`);
          const antigo = typeof v.id === 'string' && !veiculos.some((x) => x.id === v.id) ? atuais.find((x) => x.id === v.id) : null; // id repetido na mesma lista vira veículo novo
          veiculos.push({ id: antigo ? antigo.id : `ve${++s.seq}`, ...l.veiculo });
        }
        for (const v of atuais) {
          if (veiculos.some((x) => x.id === v.id)) continue;
          if (s.agendamentos.some((a) => a.clienteId === c.id && a.veiculoId === v.id && [R.STATUS.A_CONFIRMAR, R.STATUS.CONFIRMADO].includes(a.status) && a.inicio > agora)) return erro(`O veículo ${v.placa} tem agendamento ativo. Cancele ou remarque antes de removê-lo.`);
        }
      }
      delete c.veiculos;
      if (c.id) {
        const i = s.clientes.findIndex((x) => x.id === c.id);
        if (i < 0) return erro('Cliente não encontrado.');
        // Trocar o número de um cliente já cadastrado muda quem fala por ele no WhatsApp: proprietário, admin com Clientes ou o profissional dono do cadastro.
        const trocou = R.telefoneNacional(s.clientes[i].telefone) !== tel;
        if (trocou && !R.podeAlterarTelefone(usuario(), s, c.id)) return erro(`Só o proprietário, um admin ou o ${rot('profissional')} que atende esse cliente altera o telefone de um cliente já cadastrado.`);
        const anteriores = trocou ? [...(s.clientes[i].telefonesAnteriores || []), { telefone: s.clientes[i].telefone, ate: agora, autorizadoPor: usuario().nome }].slice(-5) : s.clientes[i].telefonesAnteriores;
        s.clientes[i] = { ...s.clientes[i], ...c, ...(veiculos ? { veiculos } : {}), ...(anteriores ? { telefonesAnteriores: anteriores } : {}) };
        return { ok: true, cliente: s.clientes[i] };
      }
      const novo = { apelido: '', cpf: '', nascimento: '', ...c, veiculos: veiculos || [], id: `c${++s.seq}` };
      s.clientes.push(novo);
      return { ok: true, cliente: novo };
    }, { metodo: c.id ? 'PUT' : 'POST', rota: c.id ? `/clientes/${c.id}` : '/clientes' });
  },
  // POST /clientes/vinculos/{id}/aprovar  |  /recusar   (proprietário ou admin com acesso a Clientes)
  aprovarVinculo(id) { return decidir(id, true); },
  recusarVinculo(id) { return decidir(id, false); },
};
function decidir(id, aprovar) {
  if (!R.podeAutorizarVinculo(usuario())) return semPermissao();
  if (!texto(id, 50)) return erro('Pedido não encontrado.');
  return mutate((s, agora) => E.decidirVinculo(s, id, aprovar, autor(), agora), { metodo: 'POST', rota: `/clientes/vinculos/${id}/${aprovar ? 'aprovar' : 'recusar'}` });
}

function validarPixCancelamento(c) {
  if (!c) return null;
  if (!['ultimo_aviso', 'dias', 'horas', 'nunca'].includes(c.modo)) return erro('Escolha quando cancelar o Pix pendente.');
  if (c.modo === 'dias' && (!(Number(c.dias) >= 0 && Number(c.dias) <= 30) || !/^\d{2}:\d{2}$/.test(c.hora || ''))) return erro('Informe os dias (0 a 30) e o horário do cancelamento do Pix.');
  if (c.modo === 'horas' && !/^\d{2}:\d{2}$/.test(c.horas || '')) return erro('Informe as horas antes do cancelamento do Pix.');
  return null;
}

// O grupo de movimentação do serviço é opcional (vazio = usa o do estabelecimento); o do estabelecimento é obrigatório.
function validarGrupo(s, id, { obrigatorio = false } = {}) {
  if (!id) return obrigatorio ? erro('Escolha o grupo de movimentação padrão.') : null;
  return (s.financeiro.grupos || []).some((g) => g.id === id) ? null : erro('Grupo de movimentação não encontrado.');
}

// Pares de agendamentos confirmados futuros que se sobrepõem na agenda do mesmo profissional ou no mesmo box (usado para não deixar uma mudança de serviço criar dupla reserva).
function paresSobrepostos(s, agora) {
  const ativos = s.agendamentos.filter((a) => a.status === R.STATUS.CONFIRMADO && a.inicio > agora).sort((a, b) => a.inicio - b.inicio);
  const oc = new Map(ativos.map((a) => [a.id, R.ocupacaoDe(s, a)]));
  const pares = [];
  for (const [i, a] of ativos.entries()) {
    const A = oc.get(a.id);
    for (const b of ativos.slice(i + 1)) {
      const B = oc.get(b.id);
      const doProfissional = a.profissionalId === b.profissionalId && A.profissional.some(([x, y]) => B.profissional.some(([c, d]) => R.sobrepoe(x, y, c, d)));
      const doBox = !!a.boxId && a.boxId === b.boxId && R.sobrepoe(A.box[0], A.box[1], B.box[0], B.box[1]);
      if (doProfissional || doBox) pares.push(`${a.id}|${b.id}`);
    }
  }
  return pares;
}
// ---------- serviços ----------
// Código do serviço ou do produto: vazio = o próximo número (criando) ou o que já tinha (editando); informado = único na lista do tipo.
function codigoDoItem(lista, informado, id, rotulo) {
  const c = CD.textoCodigo(informado);
  if (!c) { const atual = id ? lista.find((x) => x.id === id) : null; return { codigo: atual && CD.textoCodigo(atual.codigo) ? atual.codigo : CD.proximoCodigo(lista) }; }
  if (!CD.codigoValido(c)) return { erro: 'Código inválido: use até 20 letras, números, ponto, hífen ou sublinhado.' };
  if (CD.codigoEmUso(lista, c, id)) return { erro: `Já existe ${rotulo} com o código ${c}.` };
  return { codigo: c };
}
export const servicos = {
  // POST /servicos  |  PUT /servicos/{id}
  salvar(entrada) {
    const n = exigir('servicos'); if (n) return n;
    const sv = pegar(entrada, ['id', 'nome', 'preco', 'duracao', 'precos', 'duracoes', 'multiDia', 'combo', 'componentes', 'categoria', 'intervalo', 'antecedenciaH', 'notificacoes', 'confirmacaoServico', 'materiais', 'ativo', 'grupoMovimentacaoId', 'pixCancelamento', 'comissaoPct', 'codigo']);
    if ('comissaoPct' in sv && !R.ehDono(usuario())) delete sv.comissaoPct; // só o proprietário define comissão; para os outros o campo é ignorado
    if ('comissaoPct' in sv) { const c = lerPct(sv.comissaoPct); if (!c.ok) return erro('A comissão vai de 0 a 100%.'); sv.comissaoPct = c.v; }
    if ('nome' in sv && !texto(sv.nome, 100)) return erro('O nome do serviço pode ter até 100 caracteres.');
    return mutate((s, agora) => {
      if (!String(sv.nome || '').trim()) return erro('Informe o nome do serviço.');
      if (sv.multiDia !== undefined && typeof sv.multiDia !== 'boolean') return erro('Opção "vários dias" inválida.');
      if (sv.combo !== undefined && typeof sv.combo !== 'boolean') return erro('Opção de combo inválida.');
      if (sv.categoria !== undefined && sv.categoria !== null && !texto(sv.categoria, 30)) return erro('A categoria pode ter até 30 letras.');
      // Preço e duração por porte. Sem tabela, vale o preço/duração único para todos os portes (compatível com o cadastro simples); com tabela, os 5 portes são obrigatórios.
      const tabela = (bruto, unico, rotulo, ok, plural) => {
        // Valor único: vale para os 5 portes, mas também passa pelo teto (duração sem "vários dias" = no máximo 24 h).
        if (bruto === undefined || bruto === null) return finito(unico) ? (ok(Number(unico)) ? { v: { [PORTE_PADRAO]: Number(unico) } } : { erro: `Informe ${rotulo}.`, final: true }) : { erro: `Informe ${rotulo}.`, ausente: true };
        if (typeof bruto !== 'object' || Array.isArray(bruto) || Object.keys(bruto).some((k) => !PORTES.includes(k))) return { erro: `Tabela de ${plural} inválida.` };
        const v = {};
        // v124: só o Médio (valor base) é obrigatório; nos demais portes o preço sai do fator do porte e a duração é a base, a não ser que o dono defina o valor específico.
        const ativos = [PORTE_PADRAO];
        if ((bruto[PORTE_PADRAO] === undefined || bruto[PORTE_PADRAO] === null || bruto[PORTE_PADRAO] === '') && finito(unico)) bruto = { ...bruto, [PORTE_PADRAO]: unico };
        for (const p of PORTES) {
          const dado = bruto[p] !== undefined && bruto[p] !== null && bruto[p] !== '';
          if (!dado && !ativos.includes(p)) continue;
          if (!finito(bruto[p]) || !ok(Number(bruto[p]))) return { erro: `Informe ${rotulo} para o porte ${ROTULO_PORTE[p]}.` };
          v[p] = Number(bruto[p]);
        }
        return { v };
      };
      if (sv.preco !== undefined && sv.preco !== null && (!finito(sv.preco) || Number(sv.preco) < 0 || Number(sv.preco) > 100000)) return erro('Informe o preço.');
      if (sv.duracao !== undefined && sv.duracao !== null && (!finito(sv.duracao) || !(Number(sv.duracao) > 0) || Number(sv.duracao) > 1440 * 10)) return erro('A duração precisa ser maior que zero e de no máximo 24 horas.');
      const multi = sv.multiDia !== undefined ? sv.multiDia : !!s.servicos.find((x) => x.id === sv.id)?.multiDia;
      const limiteDur = multi ? 24 * 60 * 10 : 1440;
      const tp = tabela(sv.precos, sv.preco, 'o preço', (x) => x >= 0 && x <= 100000, 'preços'); if (tp.erro) return erro(tp.erro);
      const td = tabela(sv.duracoes, sv.duracao, 'a duração', (x) => x > 0 && x <= limiteDur, 'durações'); if (td.erro) return erro(td.ausente ? td.erro : td.final ? 'A duração precisa ser maior que zero e de no máximo 24 horas.' : multi ? td.erro : `${td.erro} A duração precisa ser maior que zero e de no máximo 24 horas.`);
      if (sv.combo) {
        const comp = sv.componentes;
        if (!(Array.isArray(comp) && comp.length >= 2 && comp.length <= 10 && new Set(comp).size === comp.length && comp.every((x) => texto(x, 60)))) return erro('Um combo junta de 2 a 10 serviços diferentes.');
        if (comp.some((x) => x === sv.id || !s.servicos.some((y) => y.id === x && !y.combo))) return erro('O combo só aceita serviços comuns já cadastrados (combo dentro de combo não vale).');
      }
      if (sv.intervalo !== undefined && sv.intervalo !== '' && (!finito(sv.intervalo) || Number(sv.intervalo) < 0 || Number(sv.intervalo) > 1440)) return erro('Intervalo inválido.');
      if (sv.antecedenciaH !== undefined && sv.antecedenciaH !== '' && (!finito(sv.antecedenciaH) || Number(sv.antecedenciaH) < 0 || Number(sv.antecedenciaH) > 8760)) return erro('Antecedência inválida.');
      if (!notificacoesValidas(sv.notificacoes)) return erro('Notificações inválidas: cada aviso precisa de modo (dias ou horas), horário HH:MM e tipo.');
      if (sv.materiais != null && !Array.isArray(sv.materiais)) return erro('Materiais inválidos.');
      if (sv.id && !s.servicos.some((x) => x.id === sv.id)) return erro('Serviço não encontrado.');
      const cod = codigoDoItem(s.servicos, sv.codigo, sv.id, 'serviço'); if (cod.erro) return erro(cod.erro);
      if ((sv.notificacoes || []).length > 10) return erro('No máximo 10 notificações.');
      { const e = validarPixCancelamento(sv.pixCancelamento); if (e) return e; }
      { const e = validarGrupo(s, sv.grupoMovimentacaoId); if (e) return e; }
      const mats = (sv.materiais || []).filter((m) => m.materialId);
      if (mats.some((m) => !(Number(m.qtd) > 0) || !s.materiais.some((x) => x.id === m.materialId && x.tipo !== 'produto'))) return erro('Cada material do serviço precisa de quantidade maior que zero (produtos à venda não entram como material).');
      if (new Set(mats.map((m) => m.materialId)).size !== mats.length) return erro('O mesmo material aparece duas vezes no serviço.');
      const dados = { ...sv, codigo: cod.codigo, materiais: mats.map((m) => ({ materialId: m.materialId, qtd: Number(m.qtd) })), precos: tp.v, duracoes: td.v, preco: tp.v.medio, duracao: td.v.medio, intervalo: Number(sv.intervalo || 0), antecedenciaH: Number(sv.antecedenciaH || 0) };
      // Campos opcionais só mudam quando vêm na chamada (editar o preço não zera a categoria nem o "vários dias").
      if (sv.multiDia !== undefined) dados.multiDia = sv.multiDia;
      if (sv.categoria !== undefined) dados.categoria = sv.categoria || '';
      if (sv.combo !== undefined || sv.componentes !== undefined) { dados.combo = !!sv.combo; dados.componentes = sv.combo ? [...sv.componentes] : []; }
      if (sv.id) {
        const i = s.servicos.findIndex((x) => x.id === sv.id);
        const antes = paresSobrepostos(s, agora);
        s.servicos[i] = { ...s.servicos[i], ...dados };
        // Mudar a duração ou o intervalo não pode sobrepor agendamentos confirmados que já existem.
        const novos = paresSobrepostos(s, agora).filter((p) => !antes.includes(p));
        if (novos.length) return erro('Com essa duração, agendamentos confirmados passariam a se sobrepor. Remarque-os antes de mudar o serviço.');
        return { ok: true, servico: s.servicos[i] };
      }
      const novo = { ativo: true, notificacoes: null, confirmacaoServico: null, grupoMovimentacaoId: null, materiais: [], multiDia: false, combo: false, componentes: [], categoria: '', ...dados, id: `s${++s.seq}` };
      novo.ordem = Math.max(0, ...s.servicos.map((x) => (Number.isFinite(x.ordem) ? x.ordem : 0))) + 1; // serviço novo entra no fim da ordem manual
      s.servicos.push(novo);
      return { ok: true, servico: novo };
    }, { metodo: sv.id ? 'PUT' : 'POST', rota: sv.id ? `/servicos/${sv.id}` : '/servicos' });
  },
  // PUT /servicos/ordem  { ids: [...] }  (ordem manual dos serviços; ids desconhecidos ou repetidos são ignorados e os que faltam seguem depois)
  reordenar(ids) {
    const n = exigir('servicos'); if (n) return n;
    if (!Array.isArray(ids) || ids.length > 300 || !ids.every((x) => typeof x === 'string' && x.length <= 60)) return erro('Ordem dos serviços inválida.');
    return mutate((s) => {
      const nova = aplicarOrdemManual(s.servicos, ids);
      for (const sv of s.servicos) sv.ordem = nova.get(sv.id);
      return { ok: true };
    }, { metodo: 'PUT', rota: '/servicos/ordem' });
  },
  // DELETE /servicos/{id}  (com histórico, só desativa)
  remover(id) {
    const n = exigir('servicos'); if (n) return n;
    return mutate((s) => {
      if (!s.servicos.some((x) => x.id === id)) return erro('Serviço não encontrado.');
      const usado = s.agendamentos.some((a) => a.servicoIds.includes(id)) || s.servicos.some((x) => (x.componentes || []).includes(id));
      if (usado) { s.servicos.find((x) => x.id === id).ativo = false; return { ok: true, desativado: true }; }
      s.servicos = s.servicos.filter((x) => x.id !== id);
      return { ok: true };
    }, { metodo: 'DELETE', rota: `/servicos/${id}` });
  },
};

// ---------- financeiro ----------
const meuAgendamento = (id) => {
  const u = usuario();
  const a = state.agendamentos.find((x) => x.id === id);
  if (!u || !a) return erro('Agendamento não encontrado.');
  if (!R.pode(u, 'agenda')) return semPermissao();
  if (u.papel === 'profissional' && a.profissionalId !== u.id) return semPermissao();
  return null;
};
const daCobranca = (id) => meuAgendamento((state.financeiro.cobrancas.find((c) => c.id === id) || {}).agendamentoId);
export const financeiro = {
  // POST /financeiro/lancamentos  e  PUT /financeiro/lancamentos/{id}
  salvarLancamento(d0) { const d = { ...(d0 || {}), descricao: typeof d0?.descricao === 'string' ? R.limparTexto(d0.descricao, 200) : '', categoria: typeof d0?.categoria === 'string' ? R.limparTexto(d0.categoria, 100) : '' }; return exigir('financeiro') || mutate((s, agora) => F.salvarLancamento(s, d, autor(), agora), { metodo: d.id ? 'PUT' : 'POST', rota: d.id ? `/financeiro/lancamentos/${d.id}` : '/financeiro/lancamentos' }); },
  // POST /financeiro/conciliacoes  (vários lançamentos × vários itens do extrato da mesma conta; a soma dos dois lados tem de bater)
  conciliarGrupo(d) { const n = exigir('financeiro'); if (n) return n; const x = pegar(d, ['extratoIds', 'lancamentoIds']); return mutate((s, agora) => F.conciliarEmGrupo(s, x, autor(), agora), { metodo: 'POST', rota: '/financeiro/conciliacoes' }); },
  // DELETE /financeiro/conciliacoes/{id}  (desfaz o grupo: itens voltam a aguardar conciliação)
  desfazerConciliacao(id) { return exigir('financeiro') || (texto(id, 60) ? mutate((s) => F.desfazerConciliacao(s, id), { metodo: 'DELETE', rota: `/financeiro/conciliacoes/${id}` }) : erro('Conciliação inválida.')); },
  // GET /financeiro/conciliacoes/sugestoes?conta=  (grupos sugeridos: mesmo valor, até 2 dias de diferença)
  sugestoesConciliacao(contaId) { return exigir('financeiro') || { ok: true, sugestoes: F.sugestoesConciliacao(state, texto(contaId, 60) ? contaId : undefined) }; },
  // DELETE /financeiro/lancamentos/{id}
  removerLancamento(id) { return exigir('financeiro') || mutate((s) => F.removerLancamento(s, id), { metodo: 'DELETE', rota: `/financeiro/lancamentos/${id}` }); },
  // POST /financeiro/contas  e  PUT /financeiro/contas/{id}  (conta bancária da loja)
  salvarConta(d) { return exigir('financeiro') || mutate((s) => F.salvarConta(s, d), { metodo: d.id ? 'PUT' : 'POST', rota: d.id ? `/financeiro/contas/${d.id}` : '/financeiro/contas' }); },
  // DELETE /financeiro/contas/{id}
  removerConta(id) { return exigir('financeiro') || mutate((s) => F.removerConta(s, id), { metodo: 'DELETE', rota: `/financeiro/contas/${id}` }); },
  // POST /financeiro/grupos  e  PUT /financeiro/grupos/{id}  (grupo de movimentação e a conta responsável)
  salvarGrupo(d) { return exigir('financeiro') || mutate((s) => F.salvarGrupo(s, d), { metodo: d.id ? 'PUT' : 'POST', rota: d.id ? `/financeiro/grupos/${d.id}` : '/financeiro/grupos' }); },
  // DELETE /financeiro/grupos/{id}
  removerGrupo(id) { return exigir('financeiro') || mutate((s) => F.removerGrupo(s, id), { metodo: 'DELETE', rota: `/financeiro/grupos/${id}` }); },
  // PUT /financeiro/contas/{id}/pix
  salvarPix(contaId, d) { return exigir('financeiro') || mutate((s) => F.salvarPix(s, contaId, d), { metodo: 'PUT', rota: `/financeiro/contas/${contaId}/pix` }); },
  // POST /agendamentos/{id}/cobrancas  (gera o Pix copia e cola para o CPF de quem vai pagar)
  gerarCobranca(agendamentoId, d) { return meuAgendamento(agendamentoId) || mutate((s, agora) => F.gerarCobranca(s, { ...d, agendamentoId }, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${agendamentoId}/cobrancas` }); },
  // POST /cobrancas/{id}/enviar  (manda o copia e cola pelo WhatsApp)
  enviarCobranca(id) { return daCobranca(id) || mutate((s, agora) => F.enviarCobranca(s, id, autor(), agora), { metodo: 'POST', rota: `/cobrancas/${id}/enviar` }); },
  // DELETE /cobrancas/{id}
  cancelarCobranca(id) { return daCobranca(id) || mutate((s, agora) => F.cancelarCobranca(s, id, autor(), agora), { metodo: 'DELETE', rota: `/cobrancas/${id}` }); },
  // POST /cobrancas/{id}/confirmar-pagamento  (forma padrão, manual)
  confirmarManual(id, obs) { return exigir('financeiro') || mutate((s, agora) => F.confirmarManual(s, id, obs, autor(), agora), { metodo: 'POST', rota: `/cobrancas/${id}/confirmar-pagamento` }); },
  // POST /agendamentos/{id}/valor-pago  {destino: 'credito' | 'despesa' | 'fora'}  (acerta o valor pago que sobrou: cancelado ou serviço excluído)
  // 'despesa' lança uma despesa no financeiro, então exige a seção Financeiro; crédito e "devolvido por fora" só exigem o agendamento.
  acertarValorPago(agendamentoId, destino) { return (destino === 'despesa' && exigir('financeiro')) || meuAgendamento(agendamentoId) || mutate((s, agora) => F.acertarValorPago(s, agendamentoId, destino, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${agendamentoId}/valor-pago` }); },
  manterComoCredito(agendamentoId) { return financeiro.acertarValorPago(agendamentoId, 'credito'); },
  // POST /agendamentos/{id}/usar-credito  (paga com o crédito do cliente, da mesma conta, o que falta cobrar)
  usarCredito(agendamentoId) { return meuAgendamento(agendamentoId) || mutate((s, agora) => F.usarCredito(s, agendamentoId, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${agendamentoId}/usar-credito` }); },
  // PUT /financeiro/contas/{id}/api-pix  (credenciais e certificado da API Pix do banco da conta)
  salvarApiPix(contaId, d) { return exigir('financeiro') || mutate((s) => F.salvarApiPix(s, contaId, d), { metodo: 'PUT', rota: `/financeiro/contas/${contaId}/api-pix` }); },
  // POST /financeiro/contas/{id}/api-pix/testar  (token, escopos e registro do webhook)
  testarApiPix(contaId) { return exigir('financeiro') || mutate((s, agora) => F.testarApiPix(s, contaId, agora), { metodo: 'POST', rota: `/financeiro/contas/${contaId}/api-pix/testar` }); },
  // DELETE /financeiro/contas/{id}/api-pix
  desativarApiPix(contaId) { return exigir('financeiro') || mutate((s) => F.desativarApiPix(s, contaId), { metodo: 'DELETE', rota: `/financeiro/contas/${contaId}/api-pix` }); },
  // POST /open-finance/contas/{id}/consentimento
  conectarOpenFinance(contaId) { return exigir('financeiro') || mutate((s, agora) => F.conectarOpenFinance(s, contaId, autor(), agora), { metodo: 'POST', rota: `/open-finance/contas/${contaId}/consentimento` }); },
  // DELETE /open-finance/contas/{id}/consentimento
  desconectarOpenFinance(contaId) { return exigir('financeiro') || mutate((s) => F.desconectarOpenFinance(s, contaId), { metodo: 'DELETE', rota: `/open-finance/contas/${contaId}/consentimento` }); },
  // POST /open-finance/contas/{id}/sincronizar
  sincronizar(contaId) { return exigir('financeiro') || mutate((s, agora) => F.sincronizar(s, contaId, autor(), agora), { metodo: 'POST', rota: `/open-finance/contas/${contaId}/sincronizar` }); },
  // POST /open-finance/extrato/{id}/autorizar | rejeitar | classificar | ignorar
  autorizarExtrato(id) { return exigir('financeiro') || mutate((s, agora) => F.autorizarExtrato(s, id, autor(), agora), { metodo: 'POST', rota: `/open-finance/extrato/${id}/autorizar` }); },
  rejeitarExtrato(id) { return exigir('financeiro') || mutate((s) => F.rejeitarExtrato(s, id), { metodo: 'POST', rota: `/open-finance/extrato/${id}/rejeitar` }); },
  classificarExtrato(id, d) { return exigir('financeiro') || mutate((s, agora) => F.classificarExtrato(s, id, d, autor(), agora), { metodo: 'POST', rota: `/open-finance/extrato/${id}/classificar` }); },
  ignorarExtrato(id) { return exigir('financeiro') || mutate((s) => F.ignorarExtrato(s, id), { metodo: 'POST', rota: `/open-finance/extrato/${id}/ignorar` }); },
};

// Simulador do banco (não existe na API real): o cliente paga o Pix no app do banco e o banco avisa a loja.
export const bancoSimulado = {
  // Webhook do Pix + Open Finance
  pagarPix(d) {
    if (!MODO_DEMO) return erro('Indisponível.');
    return mutate((s, agora) => F.bancoPagarPix(s, d, agora), { metodo: 'POST', rota: state.financeiro.contas.some((c) => c.apiPix.ativa) ? '/webhooks/pix' : '/banco/pix/pagar', origem: 'banco' });
  },
  lancar(d) {
    if (!MODO_DEMO) return erro('Indisponível.');
    return mutate((s, agora) => F.bancoLancar(s, d, agora), { metodo: 'POST', rota: '/banco/movimentos', origem: 'banco' });
  },
};

// ---------- comissão dos profissionais (só o proprietário paga) ----------
// Período: ou `mesTs` (mês inteiro) ou `{ deTs, ateTs }` (De/Até, dias inclusive, no máximo 366 dias).
const lerPeriodo = (p) => {
  if (finito(p)) return { mesTs: Number(p) };
  if (!p || !finito(p.deTs) || !finito(p.ateTs)) return { erro: 'Informe o período.' };
  const r = intervaloComissao({ deTs: Number(p.deTs), ateTs: Number(p.ateTs) });
  return r.erro ? { erro: r.erro } : { deTs: Number(p.deTs), ateTs: Number(p.ateTs) };
};
export const comissoes = {
  // GET /comissoes?mes=  ou  ?de=&ate=  (só o proprietário: por profissional, com a parte do estabelecimento)
  relatorio(periodo) {
    if (!R.ehDono(usuario())) return semPermissao();
    const per = lerPeriodo(periodo);
    if (per.erro) return erro(per.erro);
    return { ok: true, ...relatorioComissoes(state, per) };
  },
  // GET /comissoes/meu?mes=  ou  ?de=&ate=  (profissional, atendente e admin veem só o que eles recebem; nunca o valor cheio nem a parte do estabelecimento)
  meuMes(periodo) {
    const u = usuario();
    if (!u || !['profissional', 'atendente', 'admin'].includes(u.papel)) return semPermissao();
    const per = lerPeriodo(periodo);
    if (per.erro) return erro(per.erro);
    return { ok: true, ...relatorioDoProfissional(state, { ...per, profissionalId: u.id }) };
  },
  // POST /comissoes/pagamentos  (marca como pagas as partes abertas dos atendimentos concluídos do período e lança a despesa "Comissões")
  pagar(profissionalId, periodo) {
    if (!R.ehDono(usuario())) return semPermissao();
    if (!texto(profissionalId, 60)) return erro(`Informe o ${rot('profissional')} e o período.`);
    const per = lerPeriodo(periodo);
    if (per.erro) return erro(per.erro);
    if (per.mesTs !== undefined && Math.abs(per.mesTs) > 8.64e15) return erro(`Informe o ${rot('profissional')} e o período.`);
    return mutate((s, agora) => pagarComissao(s, { profissionalId, ...per }, autor(), agora), { metodo: 'POST', rota: '/comissoes/pagamentos' });
  },
  // POST /agendamentos/{id}/comissao/cancelar  { quem?, motivo }  (só o proprietário; motivo obrigatório; comissão paga não se cancela)
  cancelar(agendamentoId, entrada) {
    if (!R.ehDono(usuario())) return semPermissao();
    if (!texto(agendamentoId, 60)) return erro('Agendamento não encontrado.');
    const d = pegar(entrada || {}, permitidos(['quem', 'motivo']));
    if (d.quem !== undefined && d.quem !== null && d.quem !== '' && !texto(d.quem, 60)) return erro('Pessoa inválida.');
    if (d.motivo !== undefined && d.motivo !== null && !texto(d.motivo, 300)) return erro('O motivo pode ter até 300 letras.');
    return mutate((s, agora) => cancelarComissao(s, { agendamentoId, quem: d.quem || undefined, motivo: d.motivo }, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${agendamentoId}/comissao/cancelar` });
  },
  // POST /agendamentos/{id}/comissao/restaurar  { quem? }
  restaurar(agendamentoId, entrada) {
    if (!R.ehDono(usuario())) return semPermissao();
    if (!texto(agendamentoId, 60)) return erro('Agendamento não encontrado.');
    const d = pegar(entrada || {}, permitidos(['quem']));
    if (d.quem !== undefined && d.quem !== null && d.quem !== '' && !texto(d.quem, 60)) return erro('Pessoa inválida.');
    return mutate((s, agora) => restaurarComissao(s, { agendamentoId, quem: d.quem || undefined }, autor(), agora), { metodo: 'POST', rota: `/agendamentos/${agendamentoId}/comissao/restaurar` });
  },
};

// ---------- cupons e vales (Estabelecimento) ----------
export const cupons = {
  // GET /cupons  (a chave só sai para quem tem o menu Estabelecimento)
  listar() { return exigir('estabelecimento') || { ok: true, cupons: structuredClone(state.cupons || []) }; },
  // POST /cupons  |  PUT /cupons/{id}   (a chave é gerada no servidor; nunca vem do cliente)
  salvar(entrada) {
    const n = exigir('estabelecimento'); if (n) return n;
    const d = pegar(entrada, ['id', 'nome', 'tipo', 'servicoIds', 'percentual', 'valor', 'inicio', 'fim', 'usosMax', 'usosPorCliente']);
    if (d.id === undefined || d.id === null || d.id === '') delete d.id;
    else if (!texto(d.id, 60)) return erro('Cupom inválido.');
    if (!texto(d.nome, 60) || !Object.hasOwn(TIPOS_CUPOM, d.tipo)) return erro('Informe o nome (até 60 letras) e o tipo do cupom.');
    if (d.servicoIds !== undefined && !(Array.isArray(d.servicoIds) && d.servicoIds.length <= 10 && d.servicoIds.every((x) => texto(x, 60)))) return erro('Serviços inválidos.');
    for (const k of ['percentual', 'valor', 'usosMax', 'usosPorCliente']) if (d[k] !== undefined && d[k] !== null && d[k] !== '' && !finito(d[k])) return erro('Número inválido em ' + k + '.');
    for (const k of ['inicio', 'fim']) if (typeof d[k] !== 'string' || !YMD.test(d[k])) return erro('Informe as datas de início e fim da vigência.');
    const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));
    return mutate((s, agora) => CU.salvarCupom(s, { ...d, percentual: num(d.percentual), valor: num(d.valor), usosMax: num(d.usosMax) ?? 1, usosPorCliente: num(d.usosPorCliente) ?? 1, inicio: fromYmd(d.inicio), fim: fromYmd(d.fim) }, autor(), agora), { metodo: d.id ? 'PUT' : 'POST', rota: d.id ? `/cupons/${d.id}` : '/cupons' });
  },
  // POST /cupons/{id}/chave  (gera outra chave; a antiga deixa de valer)
  novaChave(id) { return exigir('estabelecimento') || mutate((s, agora) => CU.novaChave(s, id, agora), { metodo: 'POST', rota: `/cupons/${id}/chave` }); },
  // DELETE /cupons/{id}  (já usado: não apaga, só encerra e vai para o histórico)
  remover(id) { return exigir('estabelecimento') || mutate((s) => CU.removerCupom(s, id), { metodo: 'DELETE', rota: `/cupons/${id}` }); },
};

// ---------- planos de serviço (menu Planos; seção própria que o dono libera) ----------
const idOk = (v) => texto(v, 60);
export const planos = {
  // GET /planos  (catálogo + assinaturas com saldo derivado + pedidos do link + mensalidades em aberto do mês)
  listar() {
    const n = exigir('planos'); if (n) return n;
    const agora = now();
    const assinaturas = (state.assinaturas || []).map((a) => {
      const c = state.clientes.find((x) => x.id === a.clienteId);
      return { ...structuredClone(a), cliente: c ? { id: c.id, nome: c.nome, apelido: c.apelido || '' } : null, saldo: saldoAtual(state, a, agora), extrato: extrato(state, a, agora).linhas };
    });
    return { ok: true, planos: structuredClone(state.planos || []), assinaturas, pedidos: structuredClone((state.pedidosPlano || []).filter((p) => p.status === 'novo')), aReceber: aReceber(state, agora).map((a) => a.id), mes: AS_MES(agora) };
  },
  // POST /planos  |  PUT /planos/{id}
  salvar(entrada) {
    const n = exigir('planos'); if (n) return n;
    const d = pegar(entrada, ['id', 'nome', 'descricao', 'observacoes', 'preco', 'cortes', 'servicoIds', 'produtoIds', 'validadeMeses', 'adianta', 'acumuloMeses', 'intervaloDias', 'ativo']);
    if (d.id === undefined || d.id === null || d.id === '') delete d.id; else if (!idOk(d.id)) return erro('Plano inválido.');
    if (!texto(d.nome, 60)) return erro('Dê um nome ao plano (até 60 letras).');
    if (d.descricao !== undefined && !texto(String(d.descricao), 200, true)) return erro('A descrição pode ter até 200 letras.');
    for (const k of ['preco', 'cortes', 'adianta', 'acumuloMeses', 'intervaloDias', 'validadeMeses']) if (d[k] !== undefined && d[k] !== null && d[k] !== '' && !finito(d[k])) return erro('Número inválido em ' + k + '.');
    if (!(Array.isArray(d.servicoIds) && d.servicoIds.length <= 10 && d.servicoIds.every(idOk))) return erro('Escolha de 1 a 10 serviços.');
    if (d.produtoIds !== undefined && !(Array.isArray(d.produtoIds) && d.produtoIds.length <= 10 && d.produtoIds.every(idOk))) return erro('Escolha até 10 produtos.');
    if (d.observacoes !== undefined && !texto(String(d.observacoes), 300)) return erro('As observações podem ter até 300 letras.');
    if (d.ativo !== undefined && typeof d.ativo !== 'boolean') return erro('Situação inválida.');
    return mutate((s, agora) => AS.salvarPlano(s, { ...d, agora }, autor()), { metodo: d.id ? 'PUT' : 'POST', rota: d.id ? `/planos/${d.id}` : '/planos' });
  },
  // DELETE /planos/{id}  (já contratado: só desativa)
  remover(id) { return exigir('planos') || (!idOk(id) ? erro('Plano inválido.') : mutate((s) => AS.removerPlano(s, id), { metodo: 'DELETE', rota: `/planos/${id}` })); },
  // POST /assinaturas  ({ clienteId, planoId, inicioMes, diaCobranca })
  contratar(entrada) {
    const n = exigir('planos'); if (n) return n;
    const d = pegar(entrada, ['clienteId', 'planoId', 'inicioMes', 'diaCobranca']);
    if (!idOk(d.clienteId) || !idOk(d.planoId)) return erro('Escolha o cliente e o plano.');
    if (d.inicioMes !== undefined && d.inicioMes !== null && d.inicioMes !== '' && !texto(d.inicioMes, 7)) return erro('Mês de início inválido.');
    if (d.diaCobranca !== undefined && d.diaCobranca !== null && d.diaCobranca !== '' && !finito(d.diaCobranca)) return erro('Dia de cobrança inválido.');
    return mutate((s, agora) => AS.contratar(s, d, autor(), agora), { metodo: 'POST', rota: '/assinaturas' });
  },
  // POST /assinaturas/{id}/pagamentos  ({ mes, forma })
  pagar(id, entrada) {
    const n = exigir('planos'); if (n) return n;
    const d = pegar(entrada, ['mes', 'forma']);
    if (!idOk(id)) return erro('Assinatura inválida.');
    if (d.mes !== undefined && d.mes !== null && d.mes !== '' && !texto(d.mes, 7)) return erro('Mês inválido.');
    if (!texto(d.forma, 20)) return erro('Escolha como foi pago.');
    return mutate((s, agora) => AS.registrarPagamento(s, id, d, autor(), agora), { metodo: 'POST', rota: `/assinaturas/${id}/pagamentos` });
  },
  // POST /assinaturas/{id}/pagamentos/{pagId}/estorno  ({ motivo })
  estornar(id, pagId, motivo) {
    const n = exigir('planos'); if (n) return n;
    if (!idOk(id) || !idOk(pagId) || !texto(motivo, 200)) return erro('Informe a mensalidade e o motivo (até 200 letras).');
    return mutate((s, agora) => AS.estornarPagamento(s, id, pagId, motivo, autor(), agora), { metodo: 'POST', rota: `/assinaturas/${id}/pagamentos/${pagId}/estorno` });
  },
  // POST /assinaturas/{id}/encerrar  ({ motivo })
  encerrar(id, motivo) {
    const n = exigir('planos'); if (n) return n;
    if (!idOk(id) || !texto(motivo, 200)) return erro('Informe o motivo (até 200 letras).');
    return mutate((s, agora) => AS.encerrar(s, id, motivo, autor(), agora), { metodo: 'POST', rota: `/assinaturas/${id}/encerrar` });
  },
  // POST /assinaturas/{id}/quitar
  quitar(id) { return exigir('planos') || (!idOk(id) ? erro('Assinatura inválida.') : mutate((s, agora) => AS.quitarDivida(s, id, autor(), agora), { metodo: 'POST', rota: `/assinaturas/${id}/quitar` })); },
  // POST /assinaturas/{id}/fixos  ({ fixos: [{ dia 0-6, hm 'HH:MM', profissionalId, servicoIds }] })  — até 3 horários fixos por semana; troca a lista inteira
  definirFixos(id, entrada) {
    const n = exigir('planos'); if (n) return n;
    if (!idOk(id)) return erro('Assinatura inválida.');
    const d = pegar(entrada, ['fixos']);
    if (d.fixos !== undefined && !Array.isArray(d.fixos)) return erro('Horários fixos inválidos.');
    return mutate((s, agora) => AS.definirFixos(s, id, d.fixos || [], autor(), agora), { metodo: 'POST', rota: `/assinaturas/${id}/fixos` });
  },
  // POST /planos/pedidos/{id}/aceitar  |  /recusar
  aceitarPedido(id) { return exigir('planos') || (!idOk(id) ? erro('Pedido inválido.') : mutate((s, agora) => AS.aceitarPedido(s, id, autor(), agora), { metodo: 'POST', rota: `/planos/pedidos/${id}/aceitar` })); },
  recusarPedido(id) { return exigir('planos') || (!idOk(id) ? erro('Pedido inválido.') : mutate((s, agora) => AS.recusarPedido(s, id, autor(), agora), { metodo: 'POST', rota: `/planos/pedidos/${id}/recusar` })); },
  // GET /planos/cliente/{clienteId}  (Atender: plano ativo do cliente, quanto resta e se pode adiantar; quem lança na agenda precisa disso, sem ter a seção Planos)
  doCliente(clienteId) {
    const u = usuario();
    if (!u || !(R.pode(u, 'agenda') || R.pode(u, 'planos'))) return semPermissao();
    if (!idOk(clienteId)) return { ok: true, plano: null };
    return { ok: true, plano: AS.planoDoCliente(state, clienteId, now()) };
  },
};
const AS_MES = (agora) => { const d = new Date(agora); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

// Só para demonstração: acrescenta profissionais de exemplo (com ou sem foto) e um dia cheio, para ver a agenda com muita gente.
export const demo = {
  // POST /dev/profissionais-exemplo  (existe só no perfil `dev`)
  profissionaisExemplo(fotos) {
    if (!MODO_DEMO) return erro('Indisponível.');
    if (!R.ehDono(usuario())) return semPermissao();
    const lista = Array.isArray(fotos) ? fotos.slice(0, 12) : [];
    return mutate((s, agora) => {
      const NOMES = ['Rafael Moura', 'Diego Tavares', 'Bruno Lemos', 'Caio Ferraz', 'Thiago Brum', 'Leandro Pires', 'Matheus Rocha', 'Vitor Salles', 'Gustavo Neri', 'Henrique Lopes', 'Pedro Quadros', 'Rodrigo Maia'];
      const criados = [];
      NOMES.forEach((nome, i) => {
        const apelido = nome.split(' ')[0];
        if (s.usuarios.some((x) => x.apelido === apelido)) return;
        const digitos = String(900000000 + i * 7919).padStart(9, '0');
        const foto = lista[i] && fotoValida(lista[i]) ? lista[i] : null;
        const u = { id: `u-ex${i + 1}`, nome, apelido, cpf: `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${String(10 + i)}`, nascimento: '1995-01-15', email: `${apelido.toLowerCase()}@exemplo.invalid`, telefone: `(55) 9${String(8000 + i * 37).padStart(4, '0')}-${String(1000 + i * 91)}`, senha: '1234', papel: 'profissional', permissoes: {}, atende: true, escala: { semana: structuredClone(s.estabelecimento.escala.semana), excecoes: [] }, foto, cor: proximoSlot(s.usuarios) };
        s.usuarios.push(u); criados.push(u);
      });
      // um box para cada profissional (o carro ocupa um box do começo ao fim do serviço; sem box livre o dia de demonstração não enche)
      const boxes = capAtiva('usaRecursoFisico') ? s.estabelecimento.boxes || (s.estabelecimento.boxes = []) : [];
      while (capAtiva('usaRecursoFisico') && boxes.length < Math.min(20, s.usuarios.filter((x) => x.atende).length)) boxes.push({ id: `bx${++s.seq}`, nome: `Box ${boxes.length + 1}`, ativo: true });
      // um dia cheio: todos os profissionais (os novos e os antigos) com horários marcados no primeiro dia em que dá certo
      const horas = [[9, 0], [10, 0], [11, 0], [14, 0], [15, 30]];
      const servicos = [...exemploAtivo().servicosDia];
      const clientes = s.clientes.map((c) => c.id);
      let marcados = 0; let dia = null;
      for (let d = 0; d < 8 && dia === null; d++) {
        const base = addDays(startOfDay(agora), d);
        let ok = 0;
        criados.concat(s.usuarios.filter((x) => x.atende && !R.ehGestor(x) && !criados.includes(x))).forEach((b, bi) => {
          horas.forEach(([h, m], hi) => {
            if ((bi + hi) % 5 === 4) return; // nem todo mundo com a agenda igual
            const inicio = base + (h * 60 + m) * 60000;
            const cid = clientes[(bi + hi) % clientes.length];
            const r = E.criarAgendamento(s, { clienteId: cid, veiculoId: s.clientes.find((c) => c.id === cid)?.veiculos?.[0]?.id, profissionalId: b.id, servicoIds: [servicos[(bi + hi) % servicos.length]], inicio, status: (bi + hi) % 3 === 0 ? 'confirmado' : 'a_confirmar' }, autor(), agora);
            if (r.ok) ok++;
          });
        });
        if (ok) { dia = base; marcados = ok; }
      }
      return { ok: true, criados: criados.length, agendamentos: marcados, dia };
    }, { metodo: 'POST', rota: '/dev/profissionais-exemplo' });
  },
};

// ---------- estoque ----------
export const estoque = {
  // POST /materiais  |  PUT /materiais/{id}
  salvarMaterial(m) {
    const n = exigir('estoque'); if (n) return n;
    return mutate((s, agora) => {
      if (!String(m.nome || '').trim()) return erro('Informe o nome do material.');
      if (m.id && !s.materiais.some((x) => x.id === m.id)) return erro('Material não encontrado.');
      if (s.materiais.some((x) => x.id !== m.id && x.nome.toLowerCase() === m.nome.trim().toLowerCase())) return erro('Já existe um material com esse nome.');
      if (!texto(m.nome, 100) || (m.unidade != null && !texto(m.unidade, 20))) return erro('Nome ou unidade inválidos.');
      const tipo = m.tipo === undefined || m.tipo === null || m.tipo === '' ? 'material' : m.tipo;
      if (!['material', 'produto'].includes(tipo)) return erro('Tipo inválido: material ou produto.');
      if (tipo === 'produto' && (!finito(m.preco) || Number(m.preco) < 0 || Number(m.preco) > 100000)) return erro('Informe o preço de venda do produto.');
      // Comissão do vendedor sobre o produto (%): vazio ou 0 = sem comissão. Só o proprietário define; os demais mantêm o que já existe.
      const cp = lerPct(m.comissaoPct);
      if (!cp.ok) return erro('A comissão vai de 0 a 100%.');
      if (m.id) {
        const atual = s.materiais.find((x) => x.id === m.id);
        if (tipo === 'produto' && atual.tipo !== 'produto' && s.servicos.some((x) => (x.materiais || []).some((y) => y.materialId === m.id))) return erro('Este item é usado em serviços como material. Tire-o dos serviços antes de torná-lo produto.');
        if (tipo !== 'produto' && atual.tipo === 'produto' && s.agendamentos.some((a) => (a.produtos || []).some((p) => p.materialId === m.id))) return erro('Este produto já foi vendido em atendimentos; não pode virar material.');
      }
      for (const k of ['minimo', 'custo', 'estoque']) if (m[k] != null && m[k] !== '' && (!finito(m[k]) || Number(m[k]) < 0 || Number(m[k]) > 1e9)) return erro('Valores de estoque e custo não podem ser negativos nem inválidos.');
      m = { ...m, nome: R.limparTexto(m.nome, 100), unidade: R.limparTexto(m.unidade, 20) };
      const dados = { nome: m.nome.trim(), unidade: m.unidade || 'un', minimo: Number(m.minimo) || 0, custo: Number(m.custo) || 0, ativo: m.ativo !== false, tipo, preco: tipo === 'produto' ? Math.round(Number(m.preco) * 100) / 100 : 0 };
      // Grupo de movimentação do produto (opcional): define a conta que recebe a venda; vazio = o padrão do estabelecimento.
      if ('grupoMovimentacaoId' in m) { const e = validarGrupo(s, m.grupoMovimentacaoId || null); if (e) return e; dados.grupoMovimentacaoId = tipo === 'produto' && m.grupoMovimentacaoId ? m.grupoMovimentacaoId : null; }
      if (tipo === 'produto') {
        const cod = codigoDoItem(s.materiais.filter((x) => x.tipo === 'produto'), m.codigo, m.id, 'produto'); if (cod.erro) return erro(cod.erro);
        dados.codigo = cod.codigo;
      } else dados.codigo = null;
      if (tipo !== 'produto') dados.comissaoPct = null;
      else if (R.ehDono(usuario())) dados.comissaoPct = cp.v && cp.v > 0 ? cp.v : null;
      if (m.id) { Object.assign(s.materiais.find((x) => x.id === m.id), dados); return { ok: true }; }
      const novo = { id: `mt${++s.seq}`, ...dados, estoque: 0 };
      s.materiais.push(novo);
      const ini = Number(m.estoque) || 0;
      if (ini > 0) E.movimentarEstoque(s, { materialId: novo.id, tipo: 'entrada', qtd: ini, obs: 'Estoque inicial' }, autor(), agora);
      return { ok: true, material: novo };
    }, { metodo: m.id ? 'PUT' : 'POST', rota: m.id ? `/materiais/${m.id}` : '/materiais' });
  },
  // DELETE /materiais/{id}  (em uso ou com movimento, só desativa)
  removerMaterial(id) {
    const n = exigir('estoque'); if (n) return n;
    return mutate((s) => {
      if (!s.materiais.some((x) => x.id === id)) return erro('Material não encontrado.');
      const emUso = s.servicos.some((x) => (x.materiais || []).some((m) => m.materialId === id));
      const mov = s.movimentosEstoque.some((x) => x.materialId === id);
      if (emUso || mov) { s.materiais.find((x) => x.id === id).ativo = false; return { ok: true, desativado: true }; }
      s.materiais = s.materiais.filter((x) => x.id !== id);
      return { ok: true };
    }, { metodo: 'DELETE', rota: `/materiais/${id}` });
  },
  // POST /materiais/{id}/movimentos  (entrada ou ajuste de inventário)
  movimentar(dados) {
    const n = exigir('estoque'); if (n) return n;
    return mutate((s, agora) => E.movimentarEstoque(s, dados, autor(), agora), { metodo: 'POST', rota: `/materiais/${dados.materialId}/movimentos` });
  },
};

// ---------- equipe ----------
const agora = () => now();
// Desativar = deixar de receber novos agendamentos. O histórico fica; agendamentos futuros precisam ser resolvidos antes.
function bloqueioDesativar(s, u, ts) {
  const futuros = s.agendamentos.filter((a) => a.profissionalId === u.id && [R.STATUS.A_CONFIRMAR, R.STATUS.CONFIRMADO].includes(a.status) && a.inicio > ts);
  if (!futuros.length) return '';
  return `${u.apelido || u.nome} ainda tem ${futuros.length} ${futuros.length === 1 ? 'agendamento futuro' : 'agendamentos futuros'} (a confirmar ou confirmado). Remarque ou cancele antes de desativar.`;
}
export const equipe = {
  // PUT /usuarios/{id}/atendimento
  definirAtendimento(id, atende) {
    if (!R.ehDono(usuario())) return erro('Somente o dono ativa ou desativa a equipe.');
    return mutate((s, ts) => {
      const u = s.usuarios.find((x) => x.id === id);
      if (!u) return erro('Usuário não encontrado.');
      if (!atende) { const b = bloqueioDesativar(s, u, ts); if (b) return erro(b); }
      u.atende = !!atende;
      return { ok: true, usuario: semUsuarioSenha(u) };
    }, { metodo: 'PUT', rota: `/usuarios/${id}/atendimento` });
  },
  // POST /usuarios  |  PUT /usuarios/{id}
  salvar(entrada) {
    if (!R.ehDono(usuario())) return erro('Somente o dono cadastra e altera a equipe.');
    const u = pegar(entrada, ['id', 'nome', 'apelido', 'cpf', 'nascimento', 'email', 'telefone', 'senha', 'papel', 'permissoes', 'atende', 'foto', 'comissaoPct', 'comissaoProdutoPct', 'podeVender']);
    if ('comissaoPct' in u && !R.ehDono(usuario())) delete u.comissaoPct;
    if ('comissaoProdutoPct' in u && !R.ehDono(usuario())) delete u.comissaoProdutoPct;
    if ('podeVender' in u && typeof u.podeVender !== 'boolean') return erro('Escolha se a pessoa pode vender produtos.');
    if ('comissaoPct' in u) { const c = lerPct(u.comissaoPct); if (!c.ok) return erro('A comissão vai de 0 a 100%.'); u.comissaoPct = c.v; }
    if ('comissaoProdutoPct' in u) { const c = lerPct(u.comissaoProdutoPct); if (!c.ok) return erro('A comissão vai de 0 a 100%.'); u.comissaoProdutoPct = c.v; } // sobre produtos: vale quando o produto não tem a sua
    if ('foto' in u && u.foto !== null && !fotoValida(u.foto)) return erro('Foto inválida: use uma imagem PNG, JPEG ou WebP pequena.');
    for (const k of ['nome', 'apelido', 'cpf', 'nascimento', 'email', 'telefone', 'senha']) if (k in u && !texto(u[k], 150)) return erro('Texto inválido ou grande demais em ' + k + '.');
    if (('papel' in u || !u.id) && !['dono', 'admin', 'atendente', 'profissional'].includes(u.papel)) return erro('Escolha o perfil da pessoa.');
    if ('permissoes' in u) u.permissoes = R.limparPermissoes(u.permissoes);
    if (R.nomeReservado(u.nome) || R.nomeReservado(u.apelido)) return erro(R.NOME_RESERVADO); // `suporte` é do Admin da plataforma
    return mutate((s) => {
      if (!String(u.nome || '').trim() || !String(u.apelido || '').trim()) return erro('Informe o nome e o apelido.');
      if (R.somenteDigitos(u.cpf).length !== 11) return erro('Informe o CPF completo.');
      if (!String(u.email || '').includes('@')) return erro('Informe um e-mail válido.');
      if ((!u.id && (!u.senha || u.senha.length < 4)) || (u.senha && (u.senha.length < 4 || u.senha.length > 100))) return erro('A senha precisa ter de 4 a 100 caracteres.');
      const dup = (campo, igual) => s.usuarios.some((x) => x.id !== u.id && igual(x[campo]) );
      if (dup('cpf', (v) => R.somenteDigitos(v) === R.somenteDigitos(u.cpf))) return erro('Já existe alguém com esse CPF.');
      if (dup('apelido', (v) => String(v).toLowerCase() === String(u.apelido).toLowerCase())) return erro('Já existe alguém com esse apelido.');
      if (dup('email', (v) => String(v).toLowerCase() === String(u.email).toLowerCase())) return erro('Já existe alguém com esse e-mail.');
      if (u.id) {
        const i = s.usuarios.findIndex((x) => x.id === u.id);
        const atual = s.usuarios[i];
        if (atual.atende && !u.atende) { const bloqueio = bloqueioDesativar(s, atual, agora()); if (bloqueio) return erro(bloqueio); }
        const sobramDonos = s.usuarios.filter((x) => x.id !== u.id && x.papel === 'dono').length;
        if (atual.papel === 'dono' && u.papel !== 'dono' && !sobramDonos) return erro('É preciso ter pelo menos um dono.');
        s.usuarios[i] = { ...atual, ...u, senha: u.senha ? u.senha : atual.senha };
        return { ok: true, usuario: semUsuarioSenha(s.usuarios[i]) };
      }
      const E0 = s.estabelecimento.escala;
      const novo = { permissoes: {}, atende: !R.ehGestor(u), podeVender: true, ...u, id: `u${++s.seq}`, cor: proximoSlot(s.usuarios), escala: { semana: structuredClone(E0.semana), excecoes: [] } };
      s.usuarios.push(novo);
      return { ok: true, usuario: semUsuarioSenha(novo) };
    }, { metodo: u.id ? 'PUT' : 'POST', rota: u.id ? `/usuarios/${u.id}` : '/usuarios' });
  },
  // PUT /usuarios/me/foto  (cada pessoa troca só a própria foto; null remove)
  minhaFoto(foto) {
    const eu = usuario();
    if (!eu) return semPermissao();
    if (foto !== null && !fotoValida(foto)) return erro('Foto inválida: use uma imagem PNG, JPEG ou WebP pequena.');
    return mutate((s) => { const u = s.usuarios.find((x) => x.id === eu.id); u.foto = foto; return { ok: true }; }, { metodo: 'PUT', rota: '/usuarios/me/foto' });
  },
  // DELETE /usuarios/{id}
  remover(id) {
    if (!R.ehDono(usuario())) return semPermissao();
    return mutate((s) => {
      const alvo = s.usuarios.find((x) => x.id === id);
      if (!alvo) return erro('Usuário não encontrado.');
      if (id === sessao) return erro('Você não pode remover o seu próprio usuário.');
      if (alvo.papel === 'dono' && s.usuarios.filter((x) => x.papel === 'dono').length === 1) return erro('É preciso ter pelo menos um dono.');
      if (s.agendamentos.some((a) => a.profissionalId === id)) return erro('Esse usuário tem histórico de agendamentos e não pode ser removido. Desative-o: o histórico fica e ele deixa de receber novos agendamentos.');
      s.usuarios = s.usuarios.filter((x) => x.id !== id);
      return { ok: true };
    }, { metodo: 'DELETE', rota: `/usuarios/${id}` });
  },
  // PUT /usuarios/{id}/senha
  alterarSenha(senhaAtual, nova) {
    return mutate((s) => {
      const u = s.usuarios.find((x) => x.id === sessao);
      if (!u || u.senha !== senhaAtual) return erro('A senha atual está incorreta.');
      if (typeof nova !== 'string' || nova.length < 4 || nova.length > 100) return erro('A nova senha precisa ter de 4 a 100 caracteres.');
      u.senha = nova;
      return { ok: true };
    }, { metodo: 'PUT', rota: '/usuarios/me/senha' });
  },
};

// ---------- estabelecimento, escalas e calendário ----------
export const estabelecimento = {
  // PUT /estabelecimento  (o tipo é definido na criação da loja e nunca muda: `tipo` diferente do atual é recusado)
  salvar(entrada) {
    const n = exigir('estabelecimento'); if (n) return n;
    if (entrada && typeof entrada === 'object' && 'tipo' in entrada && entrada.tipo !== tipoDe(state.estabelecimento)) return erro('O tipo do estabelecimento não pode ser alterado depois de criado.');
    const patch = pegar(entrada, permitidos(['nome', 'telefone', 'endereco', 'enderecoNoLink', 'latitude', 'longitude', 'localizacaoNoWhatsapp', 'email', 'ddds', 'visaoPadrao', 'confirmacaoServico', 'grupoMovimentacaoId', 'notificacoes', 'escala', 'calendario', 'pixCancelamento', 'logo', 'corTema', 'corTema2', 'temaCor', 'linkAgendamento', 'comissaoPadrao', 'usaIntegracaoPix', 'formaPagamentoPadrao', 'contaPorForma', 'camposObrigatorios', 'boxes', 'portes', 'ordemServicos']));
    if ('comissaoPadrao' in patch && !R.ehDono(usuario())) delete patch.comissaoPadrao;
    if ('comissaoPadrao' in patch) { const c = lerPct(patch.comissaoPadrao); if (!c.ok || c.v === null) return erro('A comissão padrão vai de 0 a 100%.'); patch.comissaoPadrao = c.v; }
    for (const k of ['nome', 'telefone', 'endereco', 'email']) if (k in patch && !texto(patch[k], 200)) return erro('Texto grande demais em ' + k + '.');
    // Localização (GPS) e interruptores do endereço/WhatsApp (espelho de PUT /api/estabelecimento/local). Latitude e longitude andam juntas.
    for (const k of ['enderecoNoLink', 'localizacaoNoWhatsapp']) if (k in patch && typeof patch[k] !== 'boolean') return erro('Interruptor inválido.');
    if ('latitude' in patch || 'longitude' in patch) {
      const lat = patch.latitude, lng = patch.longitude;
      if ((lat === null || lat === undefined) !== (lng === null || lng === undefined)) return erro('Informe latitude e longitude juntas (ou deixe as duas vazias).');
      if (lat !== null && lat !== undefined && !(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return erro('Localização inválida: latitude de -90 a 90 e longitude de -180 a 180.');
    }
    {
      const e0 = state.estabelecimento;
      const lat = 'latitude' in patch ? patch.latitude : e0.latitude, endereco = 'endereco' in patch ? patch.endereco : e0.endereco;
      if (patch.localizacaoNoWhatsapp === true && (lat === null || lat === undefined)) return erro('Informe a localização (latitude e longitude) para enviá-la no WhatsApp.');
      if (patch.enderecoNoLink === true && !String(endereco || '').trim()) return erro('Informe o endereço para mostrá-lo no link de agendamento.');
    }
    if ('ddds' in patch) {
      // DDD é número de 11 a 99 (a agenda compara com Number); texto como '51' é convertido, repetidos são descartados.
      if (!(Array.isArray(patch.ddds) && patch.ddds.length <= 100 && patch.ddds.every((d) => (typeof d === 'number' || (typeof d === 'string' && /^\d{2}$/.test(d))) && Number.isInteger(Number(d)) && Number(d) >= 11 && Number(d) <= 99))) return erro('DDDs inválidos.');
      patch.ddds = [...new Set(patch.ddds.map(Number))];
    }
    if (patch.escala && !semanaValida(patch.escala.semana)) return erro('Escala inválida.');
    if ('notificacoes' in patch && !notificacoesValidas(patch.notificacoes)) return erro('Notificações inválidas: cada aviso precisa de modo (dias ou horas), horário HH:MM e tipo.');
    if ('calendario' in patch && !(patch.calendario && typeof patch.calendario === 'object' && typeof patch.calendario.enviarEventos === 'boolean')) return erro('Calendário inválido.');
    if ('logo' in patch && patch.logo !== null && !T.logoValida(patch.logo)) return erro('Logo inválida: use uma imagem PNG, JPEG ou WebP de até 100 KB.');
    if ('corTema' in patch && patch.corTema !== null && !T.corValida(patch.corTema)) return erro('Cor inválida.');
    if ('corTema2' in patch && patch.corTema2 !== null && !T.corValida(patch.corTema2)) return erro('Cor inválida.');
    if ('corTema' in patch && patch.corTema) patch.corTema = patch.corTema.toLowerCase();
    if ('corTema2' in patch && patch.corTema2) patch.corTema2 = patch.corTema2.toLowerCase();
    if ('logo' in patch && patch.logo === null) { patch.corTema = null; patch.corTema2 = null; } // sem logo não há cores dela
    if ('temaCor' in patch && !T.TEMAS_VALIDOS.includes(patch.temaCor)) return erro('Cor do tema inválida.');
    if ('linkAgendamento' in patch) {
      const l = patch.linkAgendamento;
      if (!(l && typeof l === 'object' && typeof l.ativo === 'boolean' && Number.isInteger(l.diasMax) && l.diasMax >= 1 && l.diasMax <= 60)) return erro('Link de agendamento inválido: ligado ou desligado e de 1 a 60 dias à frente.');
      if ('telefoneObrigatorio' in l && typeof l.telefoneObrigatorio !== 'boolean') return erro('Link de agendamento inválido: telefone obrigatório é sim ou não.');
      if ('nomeObrigatorio' in l && typeof l.nomeObrigatorio !== 'boolean') return erro('Link de agendamento inválido: nome obrigatório é sim ou não.');
      if ('veiculoObrigatorio' in l && !(Array.isArray(l.veiculoObrigatorio) && l.veiculoObrigatorio.length <= 4 && new Set(l.veiculoObrigatorio).size === l.veiculoObrigatorio.length && l.veiculoObrigatorio.every((x) => CAMPOS_VEICULO_EXIGIVEIS.includes(x)))) return erro('Link de agendamento inválido: dados do veículo obrigatórios.');
      patch.linkAgendamento = { ativo: l.ativo, diasMax: l.diasMax, telefoneObrigatorio: l.telefoneObrigatorio !== false, nomeObrigatorio: l.nomeObrigatorio !== false, veiculoObrigatorio: Array.isArray(l.veiculoObrigatorio) ? [...l.veiculoObrigatorio] : [...PU.VEICULO_DE_FABRICA_NO_LINK] };
    }
    if ('usaIntegracaoPix' in patch && typeof patch.usaIntegracaoPix !== 'boolean') return erro('Opção de integração Pix inválida.');
    if ('formaPagamentoPadrao' in patch && patch.formaPagamentoPadrao !== '' && !R.formaValida(patch.formaPagamentoPadrao)) return erro('Forma de pagamento padrão inválida.');
    if ('contaPorForma' in patch) {
      const c = patch.contaPorForma;
      if (!(c && typeof c === 'object' && Object.keys(c).every((k) => R.formaValida(k) && typeof c[k] === 'string' && c[k].length <= 60))) return erro('Contas por forma de pagamento inválidas.');
      patch.contaPorForma = { pix: '', dinheiro: '', cartao: '', ...c };
    }
    if ('camposObrigatorios' in patch) {
      const c = patch.camposObrigatorios;
      const ok = c && typeof c === 'object' && ['futuro', 'local'].every((k) => Array.isArray(c[k]) && c[k].length <= 9 && new Set(c[k]).size === c[k].length && c[k].every((x) => Object.hasOwn(E.CAMPOS_ATENDER, x) && !(k === 'futuro' && x === 'formaPagamento')));
      if (!ok) return erro('Campos obrigatórios inválidos.');
      patch.camposObrigatorios = { futuro: [...c.futuro], local: [...c.local] };
    }
    if ('ordemServicos' in patch && !modoOrdemValido(patch.ordemServicos)) return erro('Ordem dos serviços inválida: mais usados primeiro ou a ordem que você definiu.');
    if ('visaoPadrao' in patch && !['dia', 'semana', 'mes'].includes(patch.visaoPadrao)) return erro('Visão padrão inválida.');
    if ('confirmacaoServico' in patch && typeof patch.confirmacaoServico !== 'boolean') return erro(`${Voc('confirmacao')} inválida.`);
    if ('boxes' in patch) {
      const b = patch.boxes;
      if (!(Array.isArray(b) && b.length >= 1 && b.length <= 20 && b.every((x) => x && typeof x === 'object' && !Array.isArray(x) && texto(x.nome, 30) && String(x.nome).trim() && (x.ativo === undefined || typeof x.ativo === 'boolean')))) return erro('Boxes inválidos: de 1 a 20, cada um com nome de até 30 letras.');
      if (new Set(b.map((x) => String(x.nome).trim().toLowerCase())).size !== b.length) return erro('Dois boxes têm o mesmo nome.');
      if (!b.some((x) => x.ativo !== false)) return erro('Deixe ao menos um box ativo.');
      patch.boxes = b.map((x) => pegar(x, ['id', 'nome', 'ativo']));
    }
    return mutate((s, agora) => {
      if (patch.portes) {
        // Porte é por id: o nome pode mudar. Porte já usado (veículo de cliente ou agendamento) não é apagado, só desativado; o Médio fica sempre.
        const r = sanearPortes(patch.portes, () => `pt${++s.seq}`);
        if (!r.ok) return erro(r.erro);
        const atuais = s.estabelecimento.portes || PORTES_DE_FABRICA;
        for (const antigo of atuais) {
          const depois = r.portes.find((x) => x.id === antigo.id);
          const usado = s.clientes.some((c) => (c.veiculos || []).some((v) => v.porte === antigo.id)) || s.agendamentos.some((a) => a.porte === antigo.id);
          if (!depois && usado) return erro(`O porte ${antigo.nome} já foi usado: desative em vez de remover.`);
          if (depois && !depois.ativo && antigo.ativo !== false && s.agendamentos.some((a) => a.porte === antigo.id && [R.STATUS.A_CONFIRMAR, R.STATUS.CONFIRMADO].includes(a.status) && a.inicio > agora)) return erro(`O porte ${antigo.nome} tem agendamentos futuros: desative depois deles.`);
        }
        s.estabelecimento.portes = r.portes;
        delete patch.portes;
      }
      if (patch.boxes) {
        // Box é por id: o nome pode mudar. Box usado por algum agendamento não é apagado (só desativado) e não é desativado com carro agendado.
        const atuais = s.estabelecimento.boxes || [];
        const novos = patch.boxes.map((x) => ({ id: atuais.some((y) => y.id === x.id) ? x.id : `bx${++s.seq}`, nome: String(x.nome).trim(), ativo: x.ativo !== false }));
        for (const antigo of atuais) {
          const depois = novos.find((x) => x.id === antigo.id);
          const usos = s.agendamentos.filter((a) => a.boxId === antigo.id);
          if (!depois && usos.length) return erro(`${antigo.nome} tem histórico de atendimentos: desative em vez de remover.`);
          if (depois && !depois.ativo && antigo.ativo !== false && usos.some((a) => [R.STATUS.A_CONFIRMAR, R.STATUS.CONFIRMADO].includes(a.status) && R.ocupacaoDe(s, a).box[1] > agora)) return erro(`${antigo.nome} tem carro agendado. Remarque antes de desativar.`);
        }
        s.estabelecimento.boxes = novos;
        delete patch.boxes;
      }
      { const e = validarPixCancelamento(patch.pixCancelamento); if (e) return e; }
      if ('grupoMovimentacaoId' in patch) { const e = validarGrupo(s, patch.grupoMovimentacaoId, { obrigatorio: true }); if (e) return e; }
      if (patch.contaPorForma) for (const id of Object.values(patch.contaPorForma)) if (id && !F.contaDe(s, id)) return erro('Conta não encontrada.');
      const { escala, ...resto } = patch;
      const depois = { ...s.estabelecimento, ...resto };
      if (depois.temaCor === 'logo' && !(T.logoValida(depois.logo) && T.corValida(depois.corTema))) {
        if ('temaCor' in patch) return erro('Envie uma logo com cor marcante para usar as cores dela.');
        resto.temaCor = 'padrao'; // a logo saiu (ou perdeu a cor): volta ao tema padrão
      }
      Object.assign(s.estabelecimento, resto);
      if (escala) s.estabelecimento.escala.semana = escala.semana;
      return { ok: true };
    }, { metodo: 'PUT', rota: '/estabelecimento' });
  },
  // PUT /usuarios/{id}/escala
  salvarEscalaProfissional(id, semana) {
    const u = usuario();
    if (!(R.ehDono(u) || u?.id === id || R.pode(u, 'agenda') && R.ehGestor(u))) return semPermissao();
    if (!semanaValida(semana)) return erro('Escala inválida.');
    return mutate((s) => { const alvo = s.usuarios.find((x) => x.id === id); if (!alvo) return erro('Usuário não encontrado.'); alvo.escala.semana = semana; return { ok: true }; }, { metodo: 'PUT', rota: `/usuarios/${id}/escala` });
  },
};

function podeEscopo(escopo) {
  const u = usuario();
  if (!u) return false;
  if (escopo === 'estab') return R.pode(u, 'estabelecimento');
  return R.ehDono(u) || u.id === escopo || (R.ehGestor(u) && R.pode(u, 'agenda'));
}
const escalaDoEscopo = (s, escopo) => (escopo === 'estab' ? s.estabelecimento.escala : s.usuarios.find((x) => x.id === escopo).escala);

// Agendamentos futuros que deixam de caber depois de aplicar as exceções.
export function afetadosPorExcecoes(st, escopo, exs, agora) {
  const s = structuredClone(st);
  escalaDoEscopo(s, escopo).excecoes.push(...exs);
  const dias = new Set(exs.flatMap((e) => diasDaExcecao(e).map(ymd)));
  return s.agendamentos.filter((a) => {
    if (![R.STATUS.A_CONFIRMAR, R.STATUS.CONFIRMADO].includes(a.status) || a.inicio <= agora) return false;
    if (escopo !== 'estab' && a.profissionalId !== escopo) return false;
    // Serviço de vários dias: conta qualquer dia em que ele trabalha (não só o da entrada).
    const antes = R.ocupacaoDe(st, st.agendamentos.find((x) => x.id === a.id));
    if (!antes.blocos.some(([b0]) => dias.has(ymd(b0)))) return false;
    const depois = R.ocupacao(s, { profissionalId: a.profissionalId, inicio: a.inicio, servicoIds: a.servicoIds, porte: a.porte });
    return !depois || JSON.stringify(depois.blocos) !== JSON.stringify(antes.blocos);
  }).map((a) => st.agendamentos.find((x) => x.id === a.id));
}

// Exceção de escala: datas AAAA-MM-DD, no máximo 1 ano de duração e, no tipo horário, faixas HH:MM válidas.
function erroExcecao(ex) {
  if (!ex || typeof ex !== 'object') return 'Exceção inválida.';
  if (typeof ex.inicio !== 'string' || !YMD.test(ex.inicio) || Number.isNaN(Date.parse(ex.inicio))) return 'Escolha a data.';
  if (ex.fim != null && ex.fim !== '') {
    if (typeof ex.fim !== 'string' || !YMD.test(ex.fim) || Number.isNaN(Date.parse(ex.fim))) return 'Data final inválida.';
    if (ex.fim < ex.inicio) return 'A data final não pode ser antes da inicial.';
    if (Date.parse(ex.fim) - Date.parse(ex.inicio) > 366 * 86400000) return 'O período pode ter no máximo 1 ano.';
  }
  if (ex.tipo != null && !['folga', 'feriado', 'horario'].includes(ex.tipo)) return 'Tipo de exceção inválido.';
  if (ex.tipo === 'horario' && !(Array.isArray(ex.faixas) && ex.faixas.length && faixasValidas(ex.faixas))) return 'Informe ao menos uma faixa de horário válida (HH:MM).';
  if (ex.faixas != null && !faixasValidas(ex.faixas)) return 'Faixas de horário inválidas.';
  return null;
}
export const excecoes = {
  // GET /excecoes/impacto
  impacto(escopo, ex) {
    if (!podeEscopo(escopo) || erroExcecao(ex)) return [];
    try { return afetadosPorExcecoes(state, escopo, [ex], now()); } catch (e) { return []; }
  },
  // POST /excecoes
  salvar(escopo, ex0, destino, ids = []) {
    if (!podeEscopo(escopo)) return semPermissao();
    const ex = pegar(ex0, ['tipo', 'inicio', 'fim', 'faixas', 'rotulo', 'origem']);
    if (typeof ex.rotulo === 'string') ex.rotulo = R.limparTexto(ex.rotulo, 100);
    { const m = erroExcecao(ex); if (m) return erro(m); }
    if (!['cancelar', 'avisar'].includes(destino) && Array.isArray(ids) && ids.length) return erro('Escolha o que fazer com os agendamentos afetados.');
    return mutate((s, agora) => {
      const nova = { ...ex, id: `x${++s.seq}` };
      escalaDoEscopo(s, escopo).excecoes.push(nova);
      // Só entram os agendamentos que a exceção de fato afeta (recalculado aqui, nunca confiando na lista enviada) e que ainda estão valendo.
      const afetados = new Set(afetadosPorExcecoes(s, escopo, [nova], agora).map((a) => a.id));
      const validos = (Array.isArray(ids) ? ids : []).filter((id) => afetados.has(id));
      if (validos.length) E.resolverAfetados(s, validos, destino, autor(), agora);
      return { ok: true, excecao: nova };
    }, { metodo: 'POST', rota: '/excecoes' });
  },
  // DELETE /excecoes/{id}
  remover(escopo, id) {
    if (!podeEscopo(escopo)) return semPermissao();
    return mutate((s) => { const e = escalaDoEscopo(s, escopo); e.excecoes = e.excecoes.filter((x) => x.id !== id); return { ok: true }; }, { metodo: 'DELETE', rota: `/excecoes/${id}` });
  },
  // PUT /estabelecimento/calendario-feriados
  impactoFeriados() {
    const exs = FERIADOS_NACIONAIS.map(([d, r]) => ({ id: `cal-${d}`, tipo: 'feriado', inicio: d, fim: d, rotulo: r, origem: 'calendario' }));
    return afetadosPorExcecoes(state, 'estab', exs, now());
  },
  vincularFeriados(vincular, destino, ids = []) {
    if (!R.pode(usuario(), 'estabelecimento')) return semPermissao();
    return mutate((s, agora) => {
      const afetados = new Set(afetadosPorExcecoes(s, 'estab', FERIADOS_NACIONAIS.map(([d, r]) => ({ id: `cal-${d}`, tipo: 'feriado', inicio: d, fim: d, rotulo: r, origem: 'calendario' })), agora).map((a) => a.id));
      ids = (Array.isArray(ids) ? ids : []).filter((id) => afetados.has(id));
      const e = s.estabelecimento.escala;
      e.excecoes = e.excecoes.filter((x) => x.origem !== 'calendario');
      if (vincular) {
        for (const [d, r] of FERIADOS_NACIONAIS) {
          if (!e.excecoes.some((x) => x.inicio <= d && d <= (x.fim || x.inicio) && x.tipo !== 'horario')) e.excecoes.push({ id: `cal-${d}`, tipo: 'feriado', inicio: d, fim: d, rotulo: r, origem: 'calendario' });
        }
        if (ids.length) E.resolverAfetados(s, ids, destino, autor(), agora);
      }
      s.estabelecimento.calendario.feriadosVinculado = !!vincular;
      return { ok: true };
    }, { metodo: 'PUT', rota: '/estabelecimento/calendario-feriados' });
  },
};

// ---------- modelos de mensagem ----------
export const modelos = {
  // POST /modelos  |  PUT /modelos/{id}
  salvar(entrada) {
    { const n = exigir('estabelecimento'); if (n) return n; } // os modelos vão para todos os clientes e dependem de aprovação da Meta
    const m = pegar(entrada, ['id', 'nome', 'categoria', 'idioma', 'corpo', 'botoes', 'variaveis']);
    if (!texto(m.nome ?? '', 100) || !texto(m.corpo ?? '', 1024)) return erro('Texto grande demais.');
    if (m.botoes != null && !(Array.isArray(m.botoes) && m.botoes.length <= 3 && m.botoes.every((b) => texto(b, 25)))) return erro('Botões inválidos.');
    return mutate((s) => {
      if (!String(m.nome || '').trim()) return erro('Dê um nome ao modelo.');
      if (m.id && (s.modelos.find((x) => x.id === m.id) || {}).sistema !== false) return erro('Os modelos do sistema não podem ser alterados.');
      const erros = validarModelo(m.corpo);
      if (erros.length) return { ok: false, erros };
      const vars = [...new Set([...String(m.corpo).matchAll(/\{\{(\d+)\}\}/g)].map((x) => Number(x[1])))].length;
      const variaveis = Array.from({ length: vars }, (_, i) => (m.variaveis && m.variaveis[i]) || `Variável ${i + 1}`);
      if (m.id) {
        const i = s.modelos.findIndex((x) => x.id === m.id);
        s.modelos[i] = { ...s.modelos[i], ...m, variaveis };
        return { ok: true, modelo: s.modelos[i] };
      }
      const novo = { categoria: 'Utilidade', idioma: 'pt_BR', botoes: [], sistema: false, aprovacao: 'em análise', ...m, variaveis, id: `m${++s.seq}`, chave: `custom-${s.seq}` };
      s.modelos.push(novo);
      return { ok: true, modelo: novo };
    }, { metodo: m.id ? 'PUT' : 'POST', rota: m.id ? `/modelos/${m.id}` : '/modelos' });
  },
  // DELETE /modelos/{id}
  remover(id) {
    { const n = exigir('estabelecimento'); if (n) return n; }
    return mutate((s) => {
      const m = s.modelos.find((x) => x.id === id);
      if (!m || m.sistema) return erro('Os modelos do sistema não podem ser removidos.');
      s.modelos = s.modelos.filter((x) => x.id !== id);
      return { ok: true };
    }, { metodo: 'DELETE', rota: `/modelos/${id}` });
  },
};

// ---------- entrada do WhatsApp (chamadas feitas pela integração, sem usuário do painel) ----------
const W = (rota, metodo = 'POST') => ({ metodo, rota, origem: 'whatsapp' });
// O número do remetente vem do canal do WhatsApp (nunca do texto da mensagem). Toda ação sobre um agendamento ou cadastro exige que
// ele pertença a esse número: saber o id (ou o CPF) de outra pessoa não dá acesso a nada dela.
const telOk = (tel) => !!R.telefoneDoCanal(tel);
const donoDoNumero = (c, tel) => !!c && telOk(tel) && R.telefoneNacional(c.telefone) === R.telefoneDoCanal(tel);
const doRemetente = (agId, tel) => {
  const a = state.agendamentos.find((x) => x.id === agId);
  return a && donoDoNumero(state.clientes.find((c) => c.id === a.clienteId), tel) ? null : erro('Agendamento não encontrado.');
};
const resumoAg = (a) => ({ id: a.id, inicio: a.inicio, status: a.status, profissionalId: a.profissionalId, servicoIds: [...a.servicoIds], motivoCancelamento: a.motivoCancelamento });
export const whatsapp = {
  // GET /whatsapp/clientes?telefone=  (só acha cadastro do próprio número)
  identificar({ telefone, cpf, nome } = {}) { return R.identificarCliente(state.clientes, { telefone, cpf, nome }); },
  clientePorTelefone(telefone) { return telOk(telefone) ? state.clientes.filter((c) => R.telefoneNacional(c.telefone) === R.telefoneDoCanal(telefone)) : []; },
  dddPermitido(telefone) { const n = R.telefoneDoCanal(telefone); return !!n && state.estabelecimento.ddds.includes(Number(n.slice(0, 2))); },
  // POST /whatsapp/bloqueio-ddd
  bloquearDdd(telefone) { if (!telOk(telefone)) return erro('Telefone inválido.'); return mutate((s, agora) => { E.enviarAoCliente(s, null, 'ddd', agora, { telefone, valores: [], origem: 'Resposta automática' }); return { ok: true }; }, W('/whatsapp/bloqueio-ddd')); },
  // GET /whatsapp/disponibilidade
  horariosLivres({ profissionalId, dayTs, servicoIds, porte } = {}) {
    if (R.errosServicoIds(state, servicoIds) || !Number.isFinite(dayTs) || !porteOk(porte)) return [];
    try { return R.horariosLivres(state, { profissionalId, dayTs, servicoIds, porte, agora: now(), origem: 'whatsapp' }); } catch (e) { return []; }
  },
  profissionaisComHorario({ inicio, servicoIds, porte } = {}) {
    if (R.errosServicoIds(state, servicoIds) || !Number.isFinite(inicio) || !porteOk(porte)) return [];
    try { return R.profissionaisDisponiveis(state, { inicio, servicoIds, porte, agora: now() }); } catch (e) { return []; }
  },
  // POST /whatsapp/agendamentos
  agendar(dados) { return mutate((s, agora) => E.clienteAgenda(s, dados || {}, agora), W('/whatsapp/agendamentos')); },
  // POST /whatsapp/agendamentos/{id}/confirmar
  confirmar(id, telefone) { return doRemetente(id, telefone) || mutate((s, agora) => E.clienteConfirma(s, id, agora), W(`/whatsapp/agendamentos/${id}/confirmar`)); },
  // POST /whatsapp/agendamentos/{id}/cancelar  (só com 24 h ou mais de antecedência; confere o dono do número)
  cancelar(id, telefone) { return doRemetente(id, telefone) || mutate((s, agora) => E.clienteCancela(s, id, agora), W(`/whatsapp/agendamentos/${id}/cancelar`)); },
  // GET /whatsapp/agendamentos/{id}/pode-cancelar
  podeCancelar(id, telefone) { const a = state.agendamentos.find((x) => x.id === id); return !doRemetente(id, telefone) && E.clientePodeCancelar(a, now()); },
  // PUT /whatsapp/agendamentos/{id}/servicos  (gera a notificação "Serviços alterados" com pergunta de confirmação)
  editarServicos(id, servicoIds, telefone) { return doRemetente(id, telefone) || mutate((s, agora) => E.clienteEditaServicos(s, id, servicoIds, agora), W(`/whatsapp/agendamentos/${id}/servicos`)); },
  // GET /whatsapp/clientes/{id}/credito  (só do próprio número; só crédito já revisado pelo profissional e que não expirou)
  meuCredito(clienteId, telefone) {
    if (!donoDoNumero(state.clientes.find((c) => c.id === clienteId), telefone)) return { total: 0, itens: [], venceEm: null };
    return F.resumoCreditoDoCliente(state, clienteId, now());
  },
  // POST /whatsapp/agendamentos/{id}/usar-credito
  usarCredito(id, telefone) { return doRemetente(id, telefone) || mutate((s, agora) => { const a = s.agendamentos.find((x) => x.id === id); const c = s.clientes.find((x) => x.id === a.clienteId); return F.clienteUsaCredito(s, id, E.AUTOR_CLIENTE(c), agora); }, W(`/whatsapp/agendamentos/${id}/usar-credito`)); },
  // POST /whatsapp/agendamentos/{id}/cupom  (chave errada, vencida ou esgotada: sempre a mesma resposta; 5 erros seguidos bloqueiam o número por 15 min)
  usarCupom(id, telefone, chave) {
    const n = doRemetente(id, telefone); if (n) return n;
    if (typeof chave !== 'string' || chave.length > 40) return erro(CU.GENERICO);
    return mutate((s, agora) => { const a = s.agendamentos.find((x) => x.id === id); const c = s.clientes.find((x) => x.id === a.clienteId); return CU.aplicarCupom(s, a, chave, { quem: `tel:${R.telefoneNacional(telefone)}` }, E.AUTOR_CLIENTE(c), agora); }, W(`/whatsapp/agendamentos/${id}/cupom`));
  },
  // GET /whatsapp/agendamentos/{id}/credito-usavel  (quanto do crédito vale neste horário: só o da mesma conta que falta cobrar)
  creditoUsavel(id, telefone) { if (doRemetente(id, telefone)) return 0; const a = state.agendamentos.find((x) => x.id === id); return F.creditoUsavelNoAgendamento(state, a, now()); },
  // GET /whatsapp/agendamentos/{id}/valores?servicos=  (valores do horário como ficaram combinados: preço congelado dos serviços que já estavam, catálogo só nos novos)
  valoresDoHorario(id, telefone, servicoIds) {
    if (doRemetente(id, telefone)) return { itens: [], acrescimos: 0, total: 0 };
    const a = state.agendamentos.find((x) => x.id === id);
    const ids = Array.isArray(servicoIds) ? servicoIds.filter((x) => typeof x === 'string').slice(0, 10) : a.servicoIds;
    const itens = itensDoAgendamento(state, { ...a, status: R.STATUS.A_CONFIRMAR, servicosFeitos: null, servicoIds: ids }).filter((i) => state.servicos.some((x) => x.id === i.id));
    const acrescimos = Math.round(itens.reduce((t, i) => t + i.acrescimo, 0) * 100) / 100;
    const descontos = Math.round(itens.reduce((t, i) => t + (i.desconto || 0), 0) * 100) / 100;
    return { itens: itens.map((i) => ({ nome: i.nome, valor: i.valor })), acrescimos, descontos, cupom: a.cupom ? a.cupom.nome : null, total: Math.round((itens.reduce((t, i) => t + i.valor, 0) + acrescimos - descontos) * 100) / 100 };
  },
  // GET /whatsapp/agendamentos/{id}/a-pagar
  aPagar(id, telefone) { if (doRemetente(id, telefone)) return 0; const a = state.agendamentos.find((x) => x.id === id); return F.faltaDoAgendamento(state, a); },
  // POST /whatsapp/agendamentos/{id}/remarcar
  remarcar(id, inicio, telefone) { return doRemetente(id, telefone) || mutate((s, agora) => E.clienteRemarca(s, id, inicio, agora), W(`/whatsapp/agendamentos/${id}/remarcar`)); },
  // PUT /whatsapp/clientes/{id}
  editarMeusDados(id, entrada, telefone) {
    const patch = pegar(entrada, ['nome', 'apelido', 'cpf', 'nascimento']);
    for (const k of Object.keys(patch)) if (!texto(patch[k], 100)) return erro('Texto inválido em ' + k + '.');
    if (!donoDoNumero(state.clientes.find((x) => x.id === id), telefone)) return erro('Cliente não encontrado.');
    return mutate((s) => {
      const c = s.clientes.find((x) => x.id === id);
      if (!c) return erro('Cliente não encontrado.');
      // O CPF identifica o cadastro: não pode ser trocado por um que já pertence a outro cliente (a mensagem não diz de quem é).
      if (R.somenteDigitos(patch.cpf) && s.clientes.some((x) => x.id !== id && R.somenteDigitos(x.cpf) === R.somenteDigitos(patch.cpf))) return erro(`Não foi possível alterar o CPF. Fale com a ${rot('loja')}.`);
      if ('nome' in patch && !String(patch.nome).trim()) return erro('O nome ou apelido é obrigatório.');
      Object.assign(c, patch);
      return { ok: true, cliente: c };
    }, W(`/whatsapp/clientes/${id}`, 'PUT'));
  },
  // GET /whatsapp/agendamentos?telefone=  (resumo, sem histórico interno)
  meusAgendamentos(clienteId, telefone) {
    if (!donoDoNumero(state.clientes.find((c) => c.id === clienteId), telefone)) return [];
    return state.agendamentos.filter((a) => a.clienteId === clienteId && [R.STATUS.A_CONFIRMAR, R.STATUS.CONFIRMADO].includes(a.status) && a.inicio > now()).sort((a, b) => a.inicio - b.inicio).map(resumoAg);
  },
  // Agendamento cancelado por conflito/falta que o cliente ainda pode remarcar
  remarcaveis(clienteId, telefone) {
    if (!donoDoNumero(state.clientes.find((c) => c.id === clienteId), telefone)) return [];
    return state.agendamentos.filter((a) => a.clienteId === clienteId && ((a.status === R.STATUS.CANCELADO && ['conflito', 'falta_confirmacao'].includes(a.motivoCancelamento)) || a.status === R.STATUS.A_CONFIRMAR || a.status === R.STATUS.CONFIRMADO)).sort((a, b) => b.inicio - a.inicio).map(resumoAg);
  },
};

// ---------- avaliações do atendimento (seção `avaliacoes`; spec: docs/F5-avaliacoes.md) ----------
// Quem enxerga: dono/master e quem tem a seção veem tudo; o profissional, mesmo sem a seção, vê só as próprias e o próprio resumo.
// Anônimo: sem a regra da loja (`regrasPlataforma.avaliacaoMostraAnonimo`, só o Admin muda) o DTO não carrega a identidade.
const escopoAv = (u) => (!u ? null : R.pode(u, 'avaliacoes') ? { soDe: '' } : u.papel === 'profissional' ? { soDe: u.id } : null);
const filtroAv = (f) => {
  const d = pegar(f, ['de', 'ate', 'profissionalId', 'servicoId']);
  for (const k of ['de', 'ate', 'profissionalId', 'servicoId']) if (d[k] !== undefined && d[k] !== null && !texto(d[k], 60)) return { erro: 'Filtro inválido.' };
  return { d };
};
const aplicarFiltroAv = (esc, u, filtros) => {
  const f = filtroAv(filtros); if (f.erro) return f;
  if (esc.soDe) f.d.profissionalId = esc.soDe; // o profissional nunca escolhe outro
  const dono = R.ehDono(u);
  const r = AV.filtrarAvaliacoes((state.avaliacoes || []).filter((x) => dono || !x.oculta), f.d);
  return r.erro ? { erro: r.erro } : { lista: r.lista, dono };
};
export const avaliacoes = {
  // GET /api/avaliacoes?de=&ate=&profissionalId=&servicoId=  (mais recentes primeiro, até 500; oculta só aparece ao dono)
  listar(filtros) {
    const u = usuario(); const esc = escopoAv(u); if (!esc) return semPermissao();
    const r = aplicarFiltroAv(esc, u, filtros); if (r.erro) return erro(r.erro);
    const lista = [...r.lista].sort((a, b) => b.em - a.em).slice(0, 500).map((x) => AV.paraPainel(state, x, { verOculta: r.dono }));
    return { ok: true, avaliacoes: lista, mostraAnonimo: AV.mostraAnonimo(state), soMinhas: !!esc.soDe };
  },
  // GET /api/avaliacoes/resumo?de=&ate=&profissionalId=&servicoId=  (média com 1 casa, total e distribuição 1 a 5; ocultas não contam)
  resumo(filtros) {
    const u = usuario(); const esc = escopoAv(u); if (!esc) return semPermissao();
    const r = aplicarFiltroAv(esc, u, filtros); if (r.erro) return erro(r.erro);
    return { ok: true, ...AV.resumir(r.lista.filter((x) => !x.oculta)) };
  },
  // GET /api/agendamentos/{id}/avaliacao  (a estrela do cartão: pode pedir? se não, por quê; só visível para quem enxerga o agendamento)
  situacao(id) {
    const u = usuario(); if (!u || !R.pode(u, 'agenda')) return semPermissao();
    if (!idOk(id)) return erro('Atendimento inválido.');
    const a = agendamentosVisiveis(state, u).find((x) => x.id === id); if (!a) return erro('Atendimento não encontrado.');
    const motivo = AV.situacaoDoPedido(state, a);
    return { ok: true, motivo, aviso: motivo === 'ok' ? '' : AV.MOTIVOS_SEM_PEDIDO[motivo], jaAvaliou: !!AV.avaliacaoDe(state, a.id), pedidaEm: a.avaliacaoPedida ? a.avaliacaoPedida.em : null };
  },
  // POST /api/agendamentos/{id}/avaliacao/pedido  (gera o token pessoal, devolvido UMA vez; marca `avaliacaoPedida`; pedir de novo troca o link anterior)
  pedir(id) {
    const u = usuario(); if (!u || !R.pode(u, 'agenda')) return semPermissao();
    if (!idOk(id)) return erro('Atendimento inválido.');
    if (!agendamentosVisiveis(state, u).some((x) => x.id === id)) return erro('Atendimento não encontrado.');
    return mutate((s, agora) => {
      const a = s.agendamentos.find((x) => x.id === id);
      const motivo = AV.situacaoDoPedido(s, a);
      if (motivo !== 'ok') return { ok: false, motivo, erros: [AV.MOTIVOS_SEM_PEDIDO[motivo]] };
      if (AV.avaliacaoDe(s, a.id)) return { ok: false, motivo: 'ja_avaliou', erros: ['Este cliente já avaliou este atendimento.'] };
      const cli = s.clientes.find((c) => c.id === a.clienteId);
      const token = AV.emitirAcesso(s, a.id, agora);
      a.avaliacaoPedida = { em: agora, por: u.id };
      return { ok: true, token, telefone: cli.telefone, nome: cli.apelido || cli.nome, loja: s.estabelecimento.nome };
    }, { metodo: 'POST', rota: `/agendamentos/${id}/avaliacao/pedido` });
  },
  // POST /api/avaliacoes/{id}/ocultar  { motivo }  (só dono/master; não apaga: o registro e o histórico ficam)
  ocultar(id, entrada) { return mudarOculta(id, entrada, true); },
  // POST /api/avaliacoes/{id}/reexibir  { motivo }
  reexibir(id, entrada) { return mudarOculta(id, entrada, false); },
};
function mudarOculta(id, entrada, ocultar) {
  const u = usuario(); if (!R.ehDono(u)) return semPermissao();
  if (!idOk(id)) return erro('Avaliação inválida.');
  const m = AV.validarMotivo(pegar(entrada, ['motivo']).motivo); if (!m.ok) return erro(m.erro);
  return mutate((s, agora) => {
    const av = (s.avaliacoes || []).find((x) => x.id === id);
    if (!av) return erro('Avaliação não encontrada.');
    if ((av.oculta === true) === ocultar) return erro(ocultar ? 'Esta avaliação já está oculta.' : 'Esta avaliação já está visível.');
    av.oculta = ocultar; av.motivoOculta = ocultar ? m.motivo : ''; av.ocultaEm = ocultar ? agora : null;
    (av.historico ||= []).push({ acao: ocultar ? 'ocultou' : 'reexibiu', em: agora, por: u.id, motivo: m.motivo });
    return { ok: true };
  }, { metodo: 'POST', rota: `/avaliacoes/${String(id).slice(0, 20)}/${ocultar ? 'ocultar' : 'reexibir'}` });
}

// ---------- mensagens em lote (fila de WhatsApp; seção `avaliacoes`) ----------
// Sem a API da Meta não existe envio automático: a fila é uma lista e cada contato abre o wa.me com a mensagem pronta (um clique por pessoa).
// O telefone inteiro nunca vai na lista (mascarado); só `abrirItem` o devolve, no clique de quem vai enviar.
const MAX_FILAS = 20;
const filaParaPainel = (f) => ({ id: f.id, tipo: f.tipo, criadaEm: f.criadaEm, filtros: { ...f.filtros }, modelo: f.modelo, encerrada: f.encerrada === true, contagem: structuredClone(f.contagem), itens: f.itens.map((i) => ({ id: i.id, agendamentoId: i.agendamentoId, nome: i.nome, telefoneMascarado: i.telefoneMascarado, servicos: [...i.servicos], inicio: i.inicio, status: i.status, em: i.em || null })) });
const filaDoUsuario = (st, u, id) => (st.filasMensagem || []).find((f) => f.id === id && f.criadaPor === u.id);
const filtrosFila = (entrada) => {
  const d = pegar(entrada, ['tipo', 'de', 'ate', 'profissionalId', 'servicoId', 'modelo']);
  for (const k of ['de', 'ate', 'profissionalId', 'servicoId', 'tipo']) if (d[k] !== undefined && d[k] !== null && !texto(d[k], 60)) return { erro: 'Filtro inválido.' };
  return { d };
};
export const mensagens = {
  // GET /api/mensagens/fila?tipo=&de=&ate=&profissionalId=&servicoId=  (prévia de quem entraria; não grava nada)
  fila(filtros) {
    const n = exigir('avaliacoes'); if (n) return n;
    const f = filtrosFila(filtros); if (f.erro) return erro(f.erro);
    const r = AV.montarFila(state, f.d); if (r.erro) return erro(r.erro);
    return { ok: true, ...r, limite: AV.FILA_MAX };
  },
  // POST /api/mensagens/filas  { tipo, de, ate, profissionalId, servicoId, modelo }  (cria a fila; uma aberta por pessoa; até 200 contatos)
  iniciarFila(entrada) {
    const n = exigir('avaliacoes'); if (n) return n;
    const u = usuario();
    const f = filtrosFila(entrada); if (f.erro) return erro(f.erro);
    const tipo = f.d.tipo === undefined ? 'avaliacao' : f.d.tipo;
    const mod = AV.validarModelo(f.d.modelo, tipo); if (!mod.ok) return erro(mod.erro);
    return mutate((s, agora) => {
      if ((s.filasMensagem || []).some((x) => x.criadaPor === u.id && !x.encerrada)) return erro('Termine ou encerre a fila aberta antes de criar outra.');
      const r = AV.montarFila(s, { ...f.d, tipo }); if (r.erro) return erro(r.erro);
      if (!r.itens.length) return erro('Ninguém para receber a mensagem com esses filtros.');
      const fila = { id: `fm${++s.seq}`, tipo, criadaEm: agora, criadaPor: u.id, filtros: { de: f.d.de || '', ate: f.d.ate || '', profissionalId: f.d.profissionalId || '', servicoId: f.d.servicoId || '' }, modelo: mod.modelo, encerrada: false, contagem: r.contagem, itens: r.itens.map((i, k) => ({ id: `i${k + 1}`, ...i, status: 'pendente', em: null })) };
      s.filasMensagem = [...(s.filasMensagem || []), fila].slice(-MAX_FILAS);
      return { ok: true, fila: filaParaPainel(fila) };
    }, { metodo: 'POST', rota: '/mensagens/filas' });
  },
  // GET /api/mensagens/filas/atual  (a fila aberta de quem está logado, com o andamento; null se não houver)
  filaAtual() {
    const n = exigir('avaliacoes'); if (n) return n;
    const f = [...(state.filasMensagem || [])].reverse().find((x) => x.criadaPor === usuario().id && !x.encerrada);
    return { ok: true, fila: f ? filaParaPainel(f) : null };
  },
  // POST /api/mensagens/filas/{filaId}/itens/{itemId}/abrir  (devolve o telefone e, no pedido de avaliação, o token pessoal UMA vez; o item vira "aberto")
  // Ficou impossível (sem telefone agora, já avaliou, pediu para não receber): o item é pulado e fica registrado (persistir).
  abrirItem(filaId, itemId) {
    const n = exigir('avaliacoes'); if (n) return n;
    if (!idOk(filaId) || !idOk(itemId)) return erro('Item inválido.');
    const u = usuario();
    if (!filaDoUsuario(state, u, filaId)) return erro('Fila não encontrada.');
    return mutate((s, agora) => {
      const fila = filaDoUsuario(s, u, filaId);
      const it = fila.itens.find((x) => x.id === itemId);
      if (!it) return erro('Item não encontrado.');
      if (fila.encerrada) return erro('Esta fila foi encerrada.');
      if (!['pendente', 'aberto'].includes(it.status)) return erro('Este contato já foi tratado.');
      const a = s.agendamentos.find((x) => x.id === it.agendamentoId);
      const motivo = AV.situacaoDoPedido(s, a);
      const cli = motivo === 'ok' ? s.clientes.find((c) => c.id === a.clienteId) : null;
      if (!cli || (fila.tipo === 'avaliacao' && AV.avaliacaoDe(s, a.id))) { it.status = 'pulou'; it.em = agora; it.motivo = motivo === 'ok' ? 'ja_avaliou' : motivo; return { ok: false, persistir: true, motivo: it.motivo, erros: ['Este contato não pode mais receber a mensagem e foi pulado.'] }; }
      let token = null;
      if (fila.tipo === 'avaliacao') { token = AV.emitirAcesso(s, a.id, agora); a.avaliacaoPedida = { em: agora, por: u.id }; }
      it.status = 'aberto'; it.em = agora;
      return { ok: true, tipo: fila.tipo, modelo: fila.modelo, token, telefone: cli.telefone, nome: cli.apelido || cli.nome, loja: s.estabelecimento.nome };
    }, { metodo: 'POST', rota: `/mensagens/filas/${String(filaId).slice(0, 20)}/itens/${String(itemId).slice(0, 20)}/abrir` });
  },
  // PUT /api/mensagens/filas/{filaId}/itens/{itemId}  { status: 'enviado' | 'pulou' }  (enviado só depois de aberto)
  marcarItem(filaId, itemId, status) {
    const n = exigir('avaliacoes'); if (n) return n;
    if (!idOk(filaId) || !idOk(itemId) || !['enviado', 'pulou'].includes(status)) return erro('Item inválido.');
    const u = usuario();
    if (!filaDoUsuario(state, u, filaId)) return erro('Fila não encontrada.');
    return mutate((s, agora) => {
      const fila = filaDoUsuario(s, u, filaId);
      const it = fila.itens.find((x) => x.id === itemId);
      if (!it) return erro('Item não encontrado.');
      if (fila.encerrada) return erro('Esta fila foi encerrada.');
      if (status === 'enviado' && it.status !== 'aberto') return erro('Abra a conversa no WhatsApp antes de marcar como enviado.');
      if (!['pendente', 'aberto'].includes(it.status)) return erro('Este contato já foi tratado.');
      it.status = status; it.em = agora;
      return { ok: true, fila: filaParaPainel(fila) };
    }, { metodo: 'PUT', rota: `/mensagens/filas/${String(filaId).slice(0, 20)}/itens/${String(itemId).slice(0, 20)}` });
  },
  // POST /api/mensagens/filas/{filaId}/encerrar  (pausar não encerra; encerrar libera criar outra fila)
  encerrarFila(filaId) {
    const n = exigir('avaliacoes'); if (n) return n;
    if (!idOk(filaId)) return erro('Fila inválida.');
    const u = usuario();
    if (!filaDoUsuario(state, u, filaId)) return erro('Fila não encontrada.');
    return mutate((s) => { filaDoUsuario(s, u, filaId).encerrada = true; return { ok: true }; }, { metodo: 'POST', rota: `/mensagens/filas/${String(filaId).slice(0, 20)}/encerrar` });
  },
};

// ---------- porta pública: autoagendamento pelo link (sem login) ----------
// Não usa sessão: a identidade é um token pessoal (ou telefone + código de 6 dígitos). Nada aqui devolve dado de outro cliente nem horário ocupado.
// Limites de uso por telefone e geral; no Spring Boot viram rate limit no gateway + contador no banco.
const limitesPublicos = new Map();
function estourou(chave, max, janelaMs) {
  const t = now();
  const l = (limitesPublicos.get(chave) || []).filter((x) => t - x < janelaMs);
  if (l.length >= max) { limitesPublicos.set(chave, l); return true; }
  l.push(t); limitesPublicos.set(chave, l);
  if (limitesPublicos.size > 2000) limitesPublicos.delete(limitesPublicos.keys().next().value);
  return false;
}
const P = (rota, metodo = 'POST') => ({ metodo, rota, origem: 'link' });
const MUITAS = 'Muitas tentativas. Aguarde um pouco e tente de novo.';
const tokenOk = (t) => typeof t === 'string' && t.length === 48;
const servicosPorIdsPublico = (a) => R.servicosPorIds(state, a.servicoIds || [], a.porte).map((x) => x.nome);
export const publico = {

  // GET /publico/planos  (catálogo à venda: nome, descrição, valor, cortes e serviços; nada de cliente)
  planos() { return { ok: true, planos: planosPublicos(state) }; },
  // POST /publico/planos/pedidos  (nome + telefone + plano; entra "a confirmar" para o dono; resposta igual se já pediu)
  pedirPlano(entrada) {
    const d = pegar(entrada, ['nome', 'telefone', 'planoId', 'site']);
    if (!texto(d.nome, 60) || !texto(d.telefone, 30) || !texto(d.planoId, 60)) return erro('Informe o nome, o telefone e o plano.');
    if (d.site !== undefined && !texto(String(d.site), 100, true)) return erro('Dados inválidos.');
    const tel = R.telefoneNacional(d.telefone);
    if (estourou(`pp:${tel}`, 3, 15 * 60000) || estourou('pp:*', 60, 60000)) return erro(MUITAS);
    return mutate((s, agora) => AS.pedirPlanoPorLink(s, d, agora), P('/publico/planos/pedidos'));
  },
  // GET /publico/planos/uso?telefone=&servicoIds=&inicio=  (a tela do cliente avisa "este horário usa um atendimento do seu plano" antes de pedir; só sim ou não)
  usoDoPlano(entrada) {
    const d = pegar(entrada, ['telefone', 'servicoIds', 'inicio']);
    if (!texto(d.telefone, 30) || !Array.isArray(d.servicoIds) || d.servicoIds.length > 10 || !d.servicoIds.every((x) => texto(x, 60)) || !finito(d.inicio)) return erro('Dados inválidos.');
    const tel = R.telefoneNacional(d.telefone);
    if (estourou(`pu:${tel}`, 10, 15 * 60000) || estourou('pu:*', 120, 60000)) return erro(MUITAS);
    return AS.usoDoPlanoPorTelefone(state, { telefone: d.telefone, servicoIds: d.servicoIds, inicio: Number(d.inicio) }, now());
  },
  // GET /publico/planos/saldo?telefone=  (só quantos atendimentos restam por plano; resposta genérica se não houver; 5 consultas por telefone a cada 15 min)
  saldoDoPlano(telefone) {
    if (!texto(telefone, 30)) return erro('Informe o telefone com DDD.');
    const tel = R.telefoneNacional(telefone);
    if (estourou(`ps:${tel}`, 5, 15 * 60000) || estourou('ps:*', 120, 60000)) return erro(MUITAS);
    return AS.saldoPorTelefone(state, telefone, now());
  },
  // GET /publico/avaliacoes/{token}  (token pessoal; só loja, serviços, profissional e data; nunca o nome do cliente; qualquer falha = a mesma resposta)
  dadosAvaliacao(token) {
    if (estourou('avd:*', 300, 60000)) return erro(MUITAS);
    const achou = AV.acharAcesso(state, token, now());
    if (!achou) return estourou('avf:*', 60, 60000) ? erro(MUITAS) : erro(AV.ERRO_AVALIACAO);
    const a = achou.agendamento;
    const b = state.usuarios.find((x) => x.id === a.profissionalId);
    return { ok: true, loja: state.estabelecimento.nome, servicos: servicosPorIdsPublico(a), profissional: b ? b.apelido || b.nome : '', quando: a.inicio };
  },
  // POST /publico/avaliacoes  { token, nota 1-5, texto? (até 500), anonimo? }  (uso único; token errado/vencido/usado = resposta genérica; isca `site` preenchida = ignora)
  avaliar(entrada) {
    const d = pegar(entrada, ['token', 'nota', 'texto', 'anonimo', 'site']);
    if (d.site !== undefined && !texto(String(d.site), 100)) return erro(AV.ERRO_AVALIACAO);
    if (d.site) return { ok: true }; // robô: finge que deu certo e não grava
    if (estourou('av:*', 120, 60000)) return erro(MUITAS);
    if (!AV.tokenValido(d.token)) return estourou('avf:*', 60, 60000) ? erro(MUITAS) : erro(AV.ERRO_AVALIACAO);
    return mutate((s, agora) => AV.registrarAvaliacao(s, d.token, d, agora), P('/publico/avaliacoes'));
  },
  // GET /publico/config  (só nome, serviços ativos e profissionais que atendem)
  config() { return PU.configPublica(state); },
  // GET /publico/dias-livres?profissionalId=&servicoIds=&porte=&de=&dias=
  diasLivres({ profissionalId, servicoIds, porte, de, dias } = {}) {
    if (!finito(de) || !porteOk(porte) || !Array.isArray(servicoIds) || servicoIds.length > 10 || (profissionalId && !texto(profissionalId, 60))) return [];
    try { return PU.diasLivres(state, { profissionalId: profissionalId || '', servicoIds, porte, deTs: Number(de), dias, agora: now() }); } catch (e) { return []; }
  },
  // GET /publico/horarios?profissionalId=&servicoIds=&porte=&dia=  (devolve só { inicio, profissionalId }: nunca quem ocupa os outros horários)
  horarios({ profissionalId, servicoIds, porte, dayTs } = {}) {
    if (!finito(dayTs) || !porteOk(porte) || !Array.isArray(servicoIds) || servicoIds.length > 10 || (profissionalId && !texto(profissionalId, 60))) return [];
    try { return PU.horariosPublicos(state, { profissionalId: profissionalId || '', servicoIds, porte, dayTs: Number(dayTs), agora: now() }); } catch (e) { return []; }
  },
  // POST /publico/agendamentos  (nome + telefone + placa, modelo e porte do veículo; nasce "Cliente agendou"; devolve o token pessoal)
  agendar(entrada) {
    const d = pegar(entrada, permitidos(['nome', 'telefone', 'placa', 'marca', 'modelo', 'cor', 'porte', 'servicoIds', 'profissionalId', 'inicio', 'lembretes', 'site']));
    // nome e telefone podem faltar se o dono tirou a obrigatoriedade (agendarPorLink confere); aqui só o tipo e o tamanho
    for (const [k, n] of [['nome', 60], ['telefone', 30]]) if (d[k] !== undefined && d[k] !== null && (typeof d[k] !== 'string' || d[k].length > n)) return erro('Dados inválidos.');
    for (const k of ['placa', 'marca', 'modelo', 'cor', 'porte']) if (d[k] !== undefined && d[k] !== null && !texto(d[k], 40)) return erro('Dados do veículo inválidos.');
    if (!(Array.isArray(d.servicoIds) && d.servicoIds.length >= 1 && d.servicoIds.length <= 10 && d.servicoIds.every((x) => texto(x, 60)))) return erro('Escolha de 1 a 10 serviços.');
    if (d.profissionalId !== undefined && d.profissionalId !== null && d.profissionalId !== '' && !texto(d.profissionalId, 60)) return erro(`${Rot('profissional')} inválido.`);
    if (!finito(d.inicio)) return erro('Escolha um dia e um horário.');
    if (d.lembretes !== undefined && typeof d.lembretes !== 'boolean') return erro('Opção de lembretes inválida.');
    if (d.site !== undefined && !texto(d.site, 100)) return erro('Dados inválidos.');
    const tel = R.telefoneNacional(d.telefone);
    if (estourou(`ag:${tel}`, 5, 60000) || estourou('ag:*', 120, 60000)) return erro(MUITAS);
    return mutate((s, agora) => PU.agendarPorLink(s, { ...d, inicio: Number(d.inicio), profissionalId: d.profissionalId || '' }, agora), P('/publico/agendamentos'));
  },
  // POST /publico/acesso/codigo  (manda um código de 6 dígitos pelo canal; a resposta é sempre a mesma, exista o cadastro ou não)
  pedirCodigo(telefone) {
    if (!texto(telefone, 30)) return erro('Informe o telefone com DDD.');
    const tel = R.telefoneNacional(telefone);
    if (estourou(`cod:${tel}`, 3, 15 * 60000) || estourou('cod:*', 120, 60000)) return { ok: true }; // sem revelar o limite
    return mutate((s, agora) => PU.pedirCodigo(s, telefone, agora), P('/publico/acesso/codigo'));
  },
  // POST /publico/acesso  (telefone + código; 5 tentativas, 30 min, uso único; devolve o token pessoal)
  entrar({ telefone, codigo } = {}) {
    if (!texto(telefone, 30) || !texto(String(codigo ?? ''), 12)) return erro(PU.ERRO_ACESSO);
    if (estourou(`ent:${R.telefoneNacional(telefone)}`, 15, 15 * 60000)) return erro(MUITAS);
    return mutate((s, agora) => PU.validarCodigo(s, telefone, codigo, agora), P('/publico/acesso'));
  },
  // GET /publico/meus-agendamentos  (token pessoal; só os do próprio cliente)
  meus(token) { return tokenOk(token) ? PU.meusAgendamentos(state, token, now()) : erro(PU.ERRO_ACESSO); },
  // GET /publico/meus-agendamentos/{id}/dias-livres  |  /horarios
  diasParaRemarcar(token, id, de, dias) { return tokenOk(token) && finito(de) ? PU.diasParaRemarcar(state, token, id, Number(de), dias, now()) : []; },
  horariosParaRemarcar(token, id, dayTs) { return tokenOk(token) && finito(dayTs) ? PU.horariosParaRemarcar(state, token, id, Number(dayTs), now()) : []; },
  // POST /publico/meus-agendamentos/{id}/remarcar
  remarcar(token, id, inicio) {
    if (!tokenOk(token) || !finito(inicio)) return erro(PU.ERRO_NAO_ACHEI);
    if (estourou(`rem:${token}`, 10, 60000)) return erro(MUITAS);
    return mutate((s, agora) => PU.remarcarPorLink(s, token, id, Number(inicio), agora), P(`/publico/meus-agendamentos/${String(id).slice(0, 20)}/remarcar`));
  },
  // POST /publico/meus-agendamentos/{id}/cancelar  (24 h ou mais de antecedência, conferido aqui)
  cancelar(token, id) {
    if (!tokenOk(token)) return erro(PU.ERRO_NAO_ACHEI);
    if (estourou(`can:${token}`, 10, 60000)) return erro(MUITAS);
    return mutate((s, agora) => PU.cancelarPorLink(s, token, id, agora), P(`/publico/meus-agendamentos/${String(id).slice(0, 20)}/cancelar`));
  },
  // PUT /publico/lembretes  (aceitar ou recusar os avisos de 24 h e 2 h)
  lembretes(token, quer) {
    if (!tokenOk(token) || typeof quer !== 'boolean') return erro(PU.ERRO_ACESSO);
    return mutate((s, agora) => PU.definirLembretes(s, token, quer, agora), P('/publico/lembretes', 'PUT'));
  },
};

// ---------- suporte (chamados com a equipe da plataforma) ----------
// No sistema real isto fala com a Admin API pelo servidor (`/api/suporte/*`); aqui o chamado fica no estado da loja e a demonstração responde sozinha.
// Loja e usuário vêm da sessão, nunca da entrada.
// v119: só o proprietário abre chamados de fábrica; os outros só se o proprietário liberar a seção Suporte no cadastro deles.
const usuarioSuporte = () => { const u = usuario(); return u && R.pode(u, 'suporte') ? u : null; };
export const suporte = {
  // GET /suporte/chamados
  listar() { const u = usuarioSuporte(); return u ? { ok: true, chamados: chamadosDoUsuario(state, u) } : semPermissao(); },
  // GET /suporte/chamados/nao-lidas
  naoLidas() { const u = usuarioSuporte(); return u ? { ok: true, naoLidas: SU.naoLidasDoUsuario(state, u) } : semPermissao(); },
  // POST /suporte/chamados  { assunto, categoria, texto, anexos? }  (até 3 imagens em base64; tipo pelo conteúdo)
  abrir(entrada) {
    const u = usuarioSuporte(); if (!u) return semPermissao();
    return mutate((s, agora) => SU.abrirChamado(s, s.usuarios.find((x) => x.id === u.id), pegar(entrada, ['assunto', 'categoria', 'texto', 'anexos']), agora), { metodo: 'POST', rota: '/suporte/chamados' });
  },
  // GET /suporte/chamados/{id}  (abrir marca como lido)
  obter(id) {
    const u = usuarioSuporte(); if (!u) return semPermissao();
    if (!texto(id, 40)) return erro('Chamado não encontrado.');
    return mutate((s) => SU.lerChamado(s, s.usuarios.find((x) => x.id === u.id), id), { metodo: 'GET', rota: `/suporte/chamados/${String(id).slice(0, 20)}`, silencioso: true });
  },
  // GET /suporte/chamados/{id}/anexos/{anexoId}  (os bytes da imagem; de outro usuário = não existe)
  imagem(id, anexoId) {
    const u = usuarioSuporte(); if (!u) return semPermissao();
    if (!texto(id, 40) || !texto(anexoId, 40)) return erro('Imagem não encontrada.');
    return SU.imagemDoChamado(state, state.usuarios.find((x) => x.id === u.id), id, anexoId);
  },
  // POST /suporte/chamados/{id}/mensagens  { texto, anexos? }
  responder(id, textoNovo, anexos) {
    const u = usuarioSuporte(); if (!u) return semPermissao();
    if (!texto(id, 40)) return erro('Chamado não encontrado.');
    if (typeof textoNovo !== 'string') return erro('A mensagem é obrigatória.');
    return mutate((s, agora) => SU.responderChamado(s, s.usuarios.find((x) => x.id === u.id), id, textoNovo, agora, Array.isArray(anexos) ? anexos : undefined), { metodo: 'POST', rota: `/suporte/chamados/${String(id).slice(0, 20)}/mensagens` });
  },
};
