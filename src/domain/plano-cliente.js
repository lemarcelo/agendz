/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco "Plano" da ficha do cliente (puro, igual no Artifact e no site real): a partir da resposta de `planos.listar` separa o plano em andamento do cliente,
// o histórico curto, a dívida de plano encerrado e o texto do vencimento. Nenhuma regra nova: o saldo e a dívida continuam derivados dos atendimentos pelo servidor.
import { rotuloMes, somaMeses } from './planos.js';

export const HISTORICO_MAX = 3;
export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 200;

// `dados`: { planos, assinaturas, aReceber, mes } como `planos.listar` devolve (Artifact e site real têm o mesmo formato).
export function resumoDoCliente(dados, clienteId) {
  const todas = ((dados && dados.assinaturas) || []).filter((a) => a.clienteId === clienteId);
  const aberta = todas.find((a) => a.status === 'ativa' || a.status === 'pendente') || null;
  const encerradas = todas.filter((a) => a.status === 'cancelada').sort((a, b) => (b.encerradoEm || 0) - (a.encerradoEm || 0));
  const divida = encerradas.reduce((t, a) => t + (a.divida > 0 && !a.dividaQuitada ? a.divida : 0), 0);
  const ex = aberta && Array.isArray(aberta.extrato) ? aberta.extrato : [];
  return {
    aberta,
    historico: encerradas.slice(0, HISTORICO_MAX),
    divida,
    catalogo: ((dados && dados.planos) || []).filter((p) => p.ativo !== false),
    emAberto: !!aberta && ((dados && dados.aReceber) || []).includes(aberta.id),
    // Trocar de plano encerra o atual: com atendimento adiantado sem pagar isso deixaria dívida e travaria o plano novo.
    dividaPrevista: ex.length ? Math.max(0, -ex[ex.length - 1].saldoFim) : 0,
  };
}

// Uma linha: situação da mensalidade e o dia em que vence.
export function textoVencimento(a, { emAberto, mes }) {
  if (!a) return '';
  const dia = a.diaCobranca || 5;
  if (a.status === 'pendente') return `Aguardando a primeira mensalidade · vence dia ${dia}`;
  if (emAberto) return `Mensalidade de ${rotuloMes(mes)} em aberto · vence dia ${dia}`;
  if (a.saldo && a.saldo.pagoMes) return `Mensalidade de ${rotuloMes(mes)} paga · próxima: dia ${dia} de ${rotuloMes(somaMeses(mes, 1))}`;
  return `Mensalidade de ${rotuloMes(mes)} · vence dia ${dia}`;
}

export const nomeDoPlano = (p) => `${p.nome} · ${p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`;

// Motivo de trocar/encerrar: 5 a 200 letras (mesma regra do servidor; a mensagem dele continua valendo).
export const motivoValido = (m) => { const t = String(m || '').trim(); return t.length >= MOTIVO_MIN && t.length <= MOTIVO_MAX; };

// Mensagem quando o plano anterior já foi encerrado e o novo não saiu (outra pessoa mexeu no meio): nunca deixa a pessoa sem saber o que ficou feito.
export const avisoTrocaParcial = (erro) => `O plano anterior foi encerrado, mas o novo não foi criado: ${erro} Use “Adicionar plano” para tentar de novo.`;
