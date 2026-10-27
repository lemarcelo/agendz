/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:d40522447f */
// Cupons e vales: criar, aplicar a um agendamento e retirar. Aqui mora a regra que mexe no estado (a parte pura está em cupons.js).
import { aposEditarValores, nextId, registrar } from './engine.js';
import { acharPorChave, descontosDoCupom, ehHistorico, situacaoDoCupom, fotoDoCupom, gerarChave, LIMITE_CUPONS, MOTIVO_TEXTO, podeResgatar, BLOQUEIO_MIN, TENTATIVAS_MAX } from './cupons.js';
import { itensDoAgendamento, r2, somaItens } from './reports.js';
import { fmtMoney } from './time.js';
import { voc } from './tipos.js';

const falha = (m) => ({ ok: false, erros: [m] });
export const GENERICO = 'Cupom inválido ou indisponível.'; // a mesma resposta para chave que não existe, vencida ou esgotada: ninguém descobre chaves por tentativa

// ---------- limite de tentativas erradas (por telefone no WhatsApp, por usuário no painel) ----------
function bloqueadoAte(s, quem, agora) {
  const t = (s.cuponsTentativas || {})[quem];
  return t && t.ate && t.ate > agora ? t.ate : 0;
}
function registrarErro(s, quem, agora) {
  const mapa = (s.cuponsTentativas = s.cuponsTentativas || {});
  for (const k of Object.keys(mapa)) if ((mapa[k].ate || 0) < agora && agora - (mapa[k].ultima || 0) > 3600000) delete mapa[k]; // limpa o que esfriou
  if (Object.keys(mapa).length >= 500) return; // teto de memória: o limite já vale para quem está nele
  const t = mapa[quem] || { n: 0, ate: 0, ultima: 0 };
  t.n = t.ate && t.ate <= agora ? 1 : t.n + 1; t.ultima = agora;
  if (t.n >= TENTATIVAS_MAX) { t.ate = agora + BLOQUEIO_MIN * 60000; t.n = 0; }
  mapa[quem] = t;
}
const limparErros = (s, quem) => { if (s.cuponsTentativas) delete s.cuponsTentativas[quem]; };

// ---------- cadastro do cupom (painel: Estabelecimento) ----------
// d já passou por `pegar` e pelos limites na API; aqui só as regras de negócio.
export function salvarCupom(s, d, autor, agora) {
  s.cupons = s.cupons || [];
  const existente = d.id ? s.cupons.find((c) => c.id === d.id) : null;
  if (d.id && !existente) return falha('Cupom não encontrado.');
  if (existente && ehHistorico(situacaoDoCupom(s, existente, agora))) return falha('Cupom do histórico não se altera. Use-o como modelo para criar outro.');
  if (!d.id && s.cupons.length >= LIMITE_CUPONS) return falha(`Limite de ${LIMITE_CUPONS} cupons atingido: remova ou desative os antigos.`);
  if (!['servico', 'percentual', 'valor'].includes(d.tipo)) return falha('Escolha o tipo: vale serviço, desconto em % ou em R$.');
  if (!String(d.nome || '').trim()) return falha('Dê um nome ao cupom (ex.: "'+voc('exemploValeNome')+'").');
  const servicoIds = [...new Set(d.servicoIds || [])];
  if (servicoIds.some((id) => !s.servicos.some((x) => x.id === id))) return falha('Serviço não encontrado.');
  if (d.tipo === 'servico' && !servicoIds.length) return falha('O vale precisa dizer qual serviço ele cobre (ex.: '+voc('exemploServicosVale')+').');
  if (d.tipo === 'percentual' && !(d.percentual >= 1 && d.percentual <= 100)) return falha('O desconto em % vai de 1 a 100.');
  if (d.tipo === 'valor' && !(d.valor > 0 && d.valor <= 10000)) return falha('Informe o valor do desconto em reais (maior que zero).');
  if (!Number.isFinite(d.inicio) || !Number.isFinite(d.fim)) return falha('Informe a data de início e a de fim da vigência.');
  if (d.fim < d.inicio) return falha('A vigência termina antes de começar.');
  if (!(d.usosMax >= 1 && d.usosMax <= 10000)) return falha('Quantas vezes o cupom pode ser usado no total: de 1 a 10000.');
  if (!(d.usosPorCliente >= 1 && d.usosPorCliente <= 100)) return falha('Quantas vezes cada cliente pode usar: de 1 a 100.');
  const campos = { nome: d.nome, tipo: d.tipo, servicoIds, percentual: d.tipo === 'percentual' ? d.percentual : null, valor: d.tipo === 'valor' ? r2(d.valor) : null, inicio: d.inicio, fim: d.fim, usosMax: d.usosMax, usosPorCliente: d.usosPorCliente };
  if (existente) { Object.assign(existente, campos); return { ok: true, cupom: existente }; }
  let chave = gerarChave();
  while (s.cupons.some((c) => c.chave === chave)) chave = gerarChave();
  const c = { id: nextId(s, 'cp'), chave, ...campos, ativo: true, criadoEm: agora, autor: { nome: autor?.nome, id: autor?.id } };
  s.cupons.push(c);
  return { ok: true, cupom: c };
}

// A chave vazou ou foi compartilhada demais: a antiga deixa de valer na hora. Agendamentos que já usaram continuam com o desconto.
export function novaChave(s, id, agora) {
  const c = (s.cupons || []).find((x) => x.id === id);
  if (!c) return falha('Cupom não encontrado.');
  if (ehHistorico(situacaoDoCupom(s, c, agora))) return falha('Cupom do histórico não tem chave nova.');
  let chave = gerarChave();
  while (s.cupons.some((x) => x.chave === chave)) chave = gerarChave();
  c.chave = chave;
  return { ok: true, cupom: c };
}

export function removerCupom(s, id) {
  const c = (s.cupons || []).find((x) => x.id === id);
  if (!c) return falha('Cupom não encontrado.');
  if (s.agendamentos.some((a) => a.cupom?.cupomId === id)) { c.ativo = false; return { ok: true, desativado: true }; } // tem histórico: só desativa
  s.cupons.splice(s.cupons.indexOf(c), 1);
  return { ok: true };
}

// ---------- uso no agendamento ----------
// quem: texto que identifica quem tenta (telefone no WhatsApp, id do usuário no painel). detalhado: o painel vê o motivo; o cliente não.
export function aplicarCupom(s, a, chave, { quem, detalhado = false }, autor, agora) {
  if (!['a_confirmar', 'confirmado'].includes(a.status)) return falha('Só dá para usar cupom em horário a confirmar ou confirmado.');
  const ate = bloqueadoAte(s, quem, agora);
  if (ate) return falha(`Muitas tentativas com chave errada. Tente de novo em ${Math.max(1, Math.ceil((ate - agora) / 60000))} min.`);
  if (a.cupom) return falha('Esse horário já tem um cupom. Retire o atual para usar outro.');
  const c = acharPorChave(s.cupons, chave);
  if (!c) { registrarErro(s, quem, agora); return { ...falha(GENERICO), persistir: true }; } // a tentativa errada fica registrada mesmo com a operação recusada
  const pode = podeResgatar(s, c, a.clienteId, agora);
  if (!pode.ok) return falha(detalhado ? MOTIVO_TEXTO[pode.motivo] : GENERICO);
  const foto = fotoDoCupom(c);
  const itens = itensDoAgendamento(s, { ...a, cupom: foto });
  const desconto = somaItens(itens).descontos;
  if (!(desconto > 0)) return falha('Esse cupom não vale para os serviços deste horário.');
  limparErros(s, quem);
  a.cupom = { ...foto, aplicadoEm: agora, por: autor?.nome };
  registrar(s, a, autor, 'cupom', null, `${c.nome}: desconto de ${fmtMoney(desconto)}`, agora);
  for (const g of aposEditarValores) g(s, a, autor, agora);
  return { ok: true, desconto, nome: c.nome };
}

export function retirarCupom(s, a, autor, agora) {
  if (!['a_confirmar', 'confirmado'].includes(a.status)) return falha('Só dá para retirar o cupom de horário a confirmar ou confirmado.');
  if (!a.cupom) return falha('Esse horário não tem cupom.');
  const antes = a.cupom.nome;
  delete a.cupom;
  registrar(s, a, autor, 'cupom', antes, 'retirado', agora);
  for (const g of aposEditarValores) g(s, a, autor, agora);
  return { ok: true };
}

export const descontoDoAgendamento = (s, a) => somaItens(itensDoAgendamento(s, a)).descontos;
export { descontosDoCupom };
