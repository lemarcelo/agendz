/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Regras puras do formulário Atender do site real (F2 parte 5c). A decisão de verdade é do servidor (POST /api/atendimentos); aqui só o que a tela
// precisa saber antes de enviar: se é atendimento já feito ou agendamento, se o dia é anterior a hoje (pede motivo) e o resumo de serviços.
import { startOfDay } from './time.js';

const MARGEM_MS = 60000; // mesma tolerância do servidor: até 1 minuto à frente ainda é "agora"

// 'futuro' = agendamento; 'local' = atendimento já feito (agora ou passado). Sem data é agora.
export function tipoDoAtendimento(inicio, agora) {
  return Number.isFinite(inicio) && inicio > agora + MARGEM_MS ? 'futuro' : 'local';
}

// Lançamento de um dia anterior a hoje: exige o motivo e é só do dono/recepção.
export const ehRetroativo = (inicio, agora) => Number.isFinite(inicio) && tipoDoAtendimento(inicio, agora) === 'local' && inicio < startOfDay(agora);

// Campos que o servidor exige por padrão: agendamento pede nome e telefone (o aviso do horário vai por telefone); atendimento local não pede nada.
export function camposFaltando(tipo, { nome, telefone, cliente }) {
  if (tipo !== 'futuro') return [];
  const faltam = [];
  if (!String(nome || '').trim() && !(cliente && !cliente.semNome)) faltam.push('nome');
  if (String(telefone || '').replace(/\D/g, '').length < 10 && !cliente) faltam.push('telefone');
  return faltam;
}

// Soma de preço e minutos dos serviços marcados (só para mostrar; o servidor recalcula).
export function resumoDosServicos(servicos, ids) {
  const marcados = servicos.filter((s) => ids.includes(s.id));
  return { qtd: marcados.length, total: marcados.reduce((t, s) => t + (Number(s.preco) || 0), 0), minutos: marcados.reduce((t, s) => t + (Number(s.duracaoMin) || 0), 0) };
}

// Busca por nome ou código na lista de serviços (sem diferenciar acento nem maiúscula).
const limpo = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function filtrarServicos(servicos, busca) {
  const q = limpo(busca).trim();
  return q ? servicos.filter((s) => limpo(s.nome).includes(q) || limpo(s.codigo).includes(q)) : servicos;
}

// ---------- produtos (5d-4a) ----------
// Busca por nome ou código na lista de produtos (mesma regra dos serviços).
export const filtrarProdutos = (produtos, busca) => {
  const q = limpo(busca).trim();
  return q ? produtos.filter((p) => limpo(p.nome).includes(q) || limpo(p.codigo).includes(q)) : produtos;
};

// Quantidade dentro do que o servidor aceita (1 a 999, inteira); vazio ou inválido volta a 1.
export const qtdValida = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1; };

// Soma dos produtos escolhidos (`itens` = [{ materialId, qtd }]), só para mostrar: o servidor congela o preço e confere o estoque.
export function resumoDosProdutos(produtos, itens) {
  let qtd = 0, total = 0;
  for (const it of itens) {
    const p = produtos.find((x) => x.id === it.materialId);
    if (!p) continue;
    qtd += it.qtd;
    total += (Number(p.preco) || 0) * it.qtd;
  }
  return { linhas: itens.length, qtd, total: Math.round(total * 100) / 100 };
}

// Quem vende por padrão: quem está lançando, se pode vender; senão quem atende; senão o primeiro que pode vender. Vazio se ninguém pode.
export function vendedorPadrao(equipe, meuId, profissionalId) {
  const pode = equipe.filter((p) => p.podeVender !== false);
  return (pode.find((p) => p.id === meuId) || pode.find((p) => p.id === profissionalId) || pode[0] || {}).id || '';
}

// Pode enviar? Serviço ou produto; horário futuro exige serviço (produto sozinho só no atendimento de agora). Devolve o aviso ou ''.
export function faltaItem(tipo, servicoIds, produtos) {
  if (servicoIds.length === 0 && produtos.length === 0) return 'Escolha ao menos um serviço ou um produto.';
  if (tipo === 'futuro' && servicoIds.length === 0) return 'Para agendar um horário futuro, escolha ao menos um serviço. Produto sozinho só no atendimento de agora.';
  return '';
}
