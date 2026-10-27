/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:f213c510f9 */
// Marcadores (legenda) da agenda: o que cada um significa, quantos casos há no período e quais agendamentos casam com o filtro.
import { statusVisual } from './rules.js';
import { capAtiva } from './tipos.js';

// Ordem padrão. O usuário pode reordenar; as chaves são fixas (testids e filtros usam elas).
export const MARCADORES = [
  { k: 'a-confirmar', cor: 'amarelo', rotulo: 'A confirmar', check: false },
  { k: 'cliente-agendou', cor: 'roxo', rotulo: 'Cliente agendou', check: false },
  { k: 'confirmado', cor: 'azul', rotulo: 'Confirmado', check: false },
  { k: 'em-servico', cor: 'ciano', rotulo: 'Em serviço', check: false },
  { k: 'pronto', cor: 'turquesa', rotulo: 'Pronto para retirada', check: false },
  { k: 'concluido', cor: 'verde', rotulo: 'Concluído', check: true },
  { k: 'sem-resposta', cor: 'vermelho', rotulo: 'A confirmar, sem resposta', check: false },
  { k: 'cancelado', cor: 'cinza', rotulo: 'Cancelado', check: false },
  { k: 'reagendado', cor: 'laranja', rotulo: 'Reagendado', check: false },
];
export const CHAVES_MARCADORES = MARCADORES.map((m) => m.k);
// Marcadores do andamento do carro só existem em tipo com "pronto para retirada" (estética); a legenda da barbearia não os mostra.
const DO_ANDAMENTO = ['em-servico', 'pronto'];
export const chavesAtivas = () => CHAVES_MARCADORES.filter((k) => capAtiva('prontoParaRetirada') || !DO_ANDAMENTO.includes(k));

const DA_COR = { roxo: 'cliente-agendou', amarelo: 'a-confirmar', azul: 'confirmado', verde: 'concluido', vermelho: 'sem-resposta', cinza: 'cancelado' };

// Marcadores que um agendamento tem: sempre o do status e, além dele, "reagendado" quando foi remarcado e o andamento do carro
// ("Em serviço" ou "Pronto para retirada", só enquanto está confirmado; pronto vale mais que em serviço).
export function marcadoresDe(a, agora) {
  const ks = [DA_COR[statusVisual(a, agora).chave]];
  if (a.reagendado) ks.push('reagendado');
  if (a.status === 'confirmado') { if (a.pronto) ks.push('pronto'); else if (a.emServico) ks.push('em-servico'); }
  return ks;
}

// Visual do cartão: o status de sempre, mas um carro confirmado que já entrou no box ("Em serviço") ou que está esperando o dono ("Pronto para retirada") aparece com a cor do andamento.
export function visualDoCartao(a, agora) {
  const v = statusVisual(a, agora);
  if (a.status === 'confirmado') {
    if (a.pronto) return { chave: 'turquesa', rotulo: 'Pronto para retirada', check: false };
    if (a.emServico) return { chave: 'ciano', rotulo: 'Em serviço', check: false };
  }
  return v;
}

export function contarMarcadores(lista, agora) {
  const c = Object.fromEntries(CHAVES_MARCADORES.map((k) => [k, 0]));
  for (const a of lista) for (const k of marcadoresDe(a, agora)) c[k]++;
  return c;
}

// Sem marcadores escolhidos, tudo aparece. Com escolha, aparece quem tem pelo menos um dos marcadores escolhidos.
export function casaMarcadores(a, escolhidos, agora) {
  const ok = (escolhidos || []).filter((k) => CHAVES_MARCADORES.includes(k));
  if (!ok.length) return true;
  return marcadoresDe(a, agora).some((k) => ok.includes(k));
}
