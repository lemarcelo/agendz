/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:fb5bb42b75 */
// Cupons e vales (puro): chave de resgate, vigência, limites de uso e quanto cada cupom desconta. Não conhece a tela nem o estado.
// Tipos: 'servico' (vale lavagem, vale polimento, vale X: o serviço sai de graça), 'percentual' (% sobre os serviços) e 'valor' (R$ fixo).
export const TIPOS_CUPOM = { servico: 'Vale serviço (de graça)', percentual: 'Desconto em %', valor: 'Desconto em R$' };
export const LIMITE_CUPONS = 200;
export const TENTATIVAS_MAX = 5; // chaves erradas seguidas antes do bloqueio
export const BLOQUEIO_MIN = 15;

const r2 = (n) => Math.round(n * 100) / 100;
// Sem 0, O, 1, I: a chave é lida e digitada por gente. 32 símbolos x 12 posições = 60 bits (não dá para adivinhar nem testar em massa).
export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function gerarChave() {
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b); // 256 é múltiplo de 32: sem viés
  const s = Array.from(b, (x) => ALFABETO[x % 32]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

// Aceita minúsculas, espaços e hífens a mais; devolve a chave no formato XXXX-XXXX-XXXX ou null se não for uma chave possível.
export function normalizarChave(entrada) {
  const s = String(entrada ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 12 || [...s].some((ch) => !ALFABETO.includes(ch))) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

// Comparação sem parar no primeiro caractere diferente (não deixa o tempo de resposta denunciar a chave).
export function igualConstante(a, b) {
  const x = String(a); const y = String(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return d === 0;
}

export function acharPorChave(cupons, entrada) {
  const k = normalizarChave(entrada);
  if (!k) return null;
  let achado = null;
  for (const c of cupons || []) if (igualConstante(c.chave, k)) achado = c; // percorre todos de propósito
  return achado;
}

export const fimDaVigencia = (c) => { const d = new Date(c.fim); d.setHours(23, 59, 59, 999); return d.getTime(); };

export const usosDoCupom = (s, c) => (s.agendamentos || []).filter((a) => a.cupom?.cupomId === c.id && a.status !== 'cancelado');
export const usosDoClienteNoCupom = (s, c, clienteId) => usosDoCupom(s, c).filter((a) => a.clienteId === clienteId);

// 'inativo' | 'futuro' | 'expirado' | 'esgotado' | 'vigente'
export function situacaoDoCupom(s, c, agora) {
  if (!c.ativo) return 'inativo';
  if (agora < c.inicio) return 'futuro';
  if (agora > fimDaVigencia(c)) return 'expirado';
  if (usosDoCupom(s, c).length >= c.usosMax) return 'esgotado';
  return 'vigente';
}
export const ROTULO_SITUACAO = { inativo: 'Encerrado', futuro: 'Ainda não começou', expirado: 'Venceu', esgotado: 'Esgotado', vigente: 'Valendo' };
// Venceu a vigência ou foi encerrado: sai da lista de cupons e fica no histórico (nunca é apagado nem editado; dá para usar como modelo de outro).
export const ehHistorico = (sit) => sit === 'expirado' || sit === 'inativo';

export function podeResgatar(s, c, clienteId, agora) {
  const sit = situacaoDoCupom(s, c, agora);
  if (sit !== 'vigente') return { ok: false, motivo: sit };
  if (usosDoClienteNoCupom(s, c, clienteId).length >= c.usosPorCliente) return { ok: false, motivo: 'ja_usou' };
  return { ok: true };
}
export const MOTIVO_TEXTO = { inativo: 'Esse cupom foi encerrado.', futuro: 'Esse cupom ainda não começou a valer.', expirado: 'Esse cupom venceu.', esgotado: 'Esse cupom já foi usado até o limite.', ja_usou: 'Esse cliente já usou esse cupom o máximo de vezes.' };

// Cópia do que o cupom valia quando foi aplicado: mudar o cupom depois não mexe em agendamento que já o usa.
export const fotoDoCupom = (c) => ({ cupomId: c.id, nome: c.nome, tipo: c.tipo, servicoIds: [...(c.servicoIds || [])], percentual: c.percentual ?? null, valor: c.valor ?? null });

// Quanto cada item do agendamento desconta. itens: [{ id, valor }]. Nunca passa do valor do serviço; acréscimo não tem desconto.
export function descontosDoCupom(cp, itens) {
  const out = {};
  if (!cp || !Array.isArray(itens)) return out;
  const vale = (i) => !(cp.servicoIds || []).length || cp.servicoIds.includes(i.id);
  const elegiveis = itens.filter((i) => vale(i) && i.valor > 0);
  if (cp.tipo === 'servico') {
    const alvo = elegiveis.filter((i) => (cp.servicoIds || []).includes(i.id)).sort((a, b) => b.valor - a.valor)[0];
    if (alvo) out[alvo.id] = r2(alvo.valor); // um serviço por vale: o mais caro que ele cobre
  } else if (cp.tipo === 'percentual') {
    const p = Math.min(100, Math.max(0, Number(cp.percentual) || 0));
    for (const i of elegiveis) { const d = r2(Math.min(i.valor, (i.valor * p) / 100)); if (d > 0) out[i.id] = d; }
  } else if (cp.tipo === 'valor') {
    let resta = Math.max(0, Number(cp.valor) || 0);
    for (const i of [...elegiveis].sort((a, b) => b.valor - a.valor)) {
      const d = r2(Math.min(resta, i.valor));
      if (d > 0) { out[i.id] = d; resta = r2(resta - d); }
    }
  }
  return out;
}
