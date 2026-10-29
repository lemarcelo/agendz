/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Suporte dentro do sistema da loja (A4), versão simulada: chamados do usuário com a equipe da plataforma. Espelha o servidor (`/api/suporte/*`, que fala com a
// Admin API): o dono vê todos os chamados da loja, os demais só os que abriram; nota interna, prioridade e atribuição nem existem aqui; fechado não recebe
// mais mensagens (abre outro); 5 chamados novos por hora por usuário e 20 mensagens por hora por chamado. A demonstração responde sozinha ao abrir.
import { limparTexto } from './texto.js';
import { nextId } from './engine.js';

export const CATEGORIAS = ['duvida', 'problema', 'sugestao', 'cobranca', 'outro'];
export const NOVOS_POR_HORA = 5;
export const MENSAGENS_POR_HORA = 20;
const HORA = 3600000;
const erro = (m) => ({ ok: false, erros: [m] });
// Texto limpo (sem controle, quebras normalizadas, aparado). Passou do limite = `null` (recusa, como o servidor), nunca corta calado.
const limpo = (v, max) => { const t = typeof v === 'string' ? limparTexto(v.replace(/\r\n?/g, '\n'), 20000).trim() : ''; return t.length > max ? null : t; };

const doUsuario = (user) => (c) => c.usuarioId === user.id;
export function chamadosVisiveis(st, user) {
  if (!user) return [];
  const todos = st.suporteChamados || [];
  return (user.papel === 'dono' ? todos : todos.filter(doUsuario(user))).slice().sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}
export const naoLidasDoUsuario = (st, user) => chamadosVisiveis(st, user).reduce((n, c) => n + (c.naoLidas || 0), 0);

// O que o cliente enxerga de um chamado (sem mensagens, para a lista) e com a conversa.
const resumo = (c) => ({ id: c.id, usuarioNome: c.usuarioNome, assunto: c.assunto, categoria: c.categoria, status: c.status, criadoEm: c.criadoEm, atualizadoEm: c.atualizadoEm, naoLidas: c.naoLidas || 0 });
export const resumoDoChamado = resumo;
export const conversaDoChamado = (c) => ({ ...resumo(c), msgs: c.msgs.map((m) => ({ id: m.id, autorTipo: m.autorTipo, autorNome: m.autorNome, texto: m.texto, criadoEm: m.criadoEm })) });

export function abrirChamado(s, user, entrada, agora) {
  if (!user) return erro('Você não tem permissão para isso.');
  const assunto = limpo(entrada && entrada.assunto, 120);
  const texto = limpo(entrada && entrada.texto, 4000);
  if (assunto === null) return erro('O assunto pode ter até 120 caracteres.');
  if (texto === null) return erro('A mensagem pode ter até 4000 caracteres.');
  if (!assunto) return erro('O assunto é obrigatório.');
  if (!texto) return erro('A mensagem é obrigatória.');
  if (!CATEGORIAS.includes(entrada && entrada.categoria)) return erro('Escolha o tipo do chamado.');
  s.suporteChamados = s.suporteChamados || [];
  if (s.suporteChamados.filter((c) => c.usuarioId === user.id && agora - c.criadoEm < HORA).length >= NOVOS_POR_HORA) return erro('Você abriu muitos chamados em pouco tempo. Aguarde um pouco.');
  const c = { id: nextId(s, 'ch'), usuarioId: user.id, usuarioNome: user.apelido || user.nome, usuarioPapel: user.papel, assunto, categoria: entrada.categoria, status: 'em_atendimento', criadoEm: agora, atualizadoEm: agora, naoLidas: 1, msgs: [] };
  c.msgs.push({ id: nextId(s, 'cm'), autorTipo: 'cliente', autorNome: c.usuarioNome, texto, criadoEm: agora });
  c.msgs.push({ id: nextId(s, 'cm'), autorTipo: 'suporte', autorNome: 'Suporte Agendz', texto: 'Recebemos o seu chamado e já estamos olhando. (Resposta automática da demonstração: no sistema real, quem responde é a equipe do Agendz.)', criadoEm: agora });
  s.suporteChamados.push(c);
  return { ok: true, chamado: conversaDoChamado(c) };
}

function achar(s, user, id) {
  const c = (s.suporteChamados || []).find((x) => x.id === id);
  if (!user || !c || (user.papel !== 'dono' && c.usuarioId !== user.id)) return null; // de outro usuário = igual a não existir
  return c;
}

export function lerChamado(s, user, id) {
  const c = achar(s, user, id);
  if (!c) return erro('Chamado não encontrado.');
  c.naoLidas = 0;
  return { ok: true, chamado: conversaDoChamado(c) };
}

export function responderChamado(s, user, id, texto, agora) {
  const c = achar(s, user, id);
  if (!c) return erro('Chamado não encontrado.');
  if (c.status === 'fechado') return erro('Este chamado foi fechado. Abra um novo chamado.');
  const t = limpo(texto, 4000);
  if (t === null) return erro('A mensagem pode ter até 4000 caracteres.');
  if (!t) return erro('A mensagem é obrigatória.');
  if (c.msgs.filter((m) => m.autorTipo === 'cliente' && agora - m.criadoEm < HORA).length >= MENSAGENS_POR_HORA) return erro('Muitas mensagens em pouco tempo. Aguarde um pouco.');
  c.msgs.push({ id: nextId(s, 'cm'), autorTipo: 'cliente', autorNome: user.apelido || user.nome, texto: t, criadoEm: agora });
  if (c.status === 'aguardando_cliente' || c.status === 'resolvido') c.status = 'em_atendimento';
  c.atualizadoEm = agora;
  c.naoLidas = 0;
  return { ok: true, chamado: conversaDoChamado(c) };
}
