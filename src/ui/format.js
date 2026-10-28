/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:456638ae25 */
import { nomeBox, servicosPorIds, ultimoAtendimento } from '../domain/rules.js';
import { fmtDate, fmtHM, fmtDateShort } from '../domain/time.js';
import { Rot } from '../domain/tipos.js';

export const nomeServicos = (st, a) => servicosPorIds(st, a.servicoIds, a.porte).map((s) => s.nome).join(' + ') || ((a.produtos || []).length ? 'Venda de produtos' : '');
export const clienteDe = (st, a) => st.clientes.find((c) => c.id === a.clienteId);
export const nomeCliente = (st, a) => { if (a.local && !a.clienteId) return a.nomeAvulso || 'Atendimento local'; const c = clienteDe(st, a); return c ? (c.apelido || c.nome) : '—'; };
// "Civic · ABC-1234" (vazio em venda de produto)
export const textoVeiculo = (a) => (a.veiculo ? [a.veiculo.modelo, a.veiculo.placa].filter(Boolean).join(' · ') : '');
export const textoBox = (st, a) => (a.boxId ? nomeBox(st, a.boxId) : '');
export const profissionalDe = (st, a) => st.usuarios.find((u) => u.id === a.profissionalId);
export const nomeProfissional = (st, a) => { const b = profissionalDe(st, a); return b ? (b.apelido || b.nome) : '—'; };

export function textoUltimo(st, a) {
  if (a.local && !a.clienteId) return 'Atendimento local (sem cadastro de cliente)';
  const u = ultimoAtendimento(st, a.clienteId, a.id);
  if (u.tipo === 'concluido') return `Último atendimento: ${fmtDate(u.inicio)} · ${u.servicos}`;
  if (u.tipo === 'cancelado') return `Último serviço cancelado: ${fmtDate(u.inicio)} às ${fmtHM(u.inicio)} · ${u.servicos}`;
  return 'Primeiro atendimento';
}

export const textoSemConfirmacao = (st, a) => `${nomeCliente(st, a)} não confirmou o agendamento de ${nomeServicos(st, a)} com ${nomeProfissional(st, a)}, marcado para ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}.`;

export const campoLog = { andamento: 'Andamento do carro', box: 'Box', veículo: 'Veículo', produtos: 'Produtos', 'data e hora': 'Data e hora', status: 'Status', serviços: 'Serviços', get profissional() { return Rot('profissional'); }, 'criação': 'Criação', aviso: 'Aviso', 'lançamento retroativo': 'Lançamento atrasado', 'comissão': 'Comissão' };
export { fmtDateShort };
