/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ordem dos serviços no Atender e no link do cliente (v123). Dois modos, escolhidos pelo dono em Estabelecimento > Regras:
//  - 'uso' (padrão): os mais usados em cima (contagem DERIVADA dos agendamentos não cancelados, nunca um contador guardado); empate cai na ordem manual.
//  - 'manual': a ordem que o dono montou na lista de Serviços (setas subir/descer; guardada em `servico.ordem`).
// A ordem manual vale sempre como desempate. A contagem nunca vai ao cliente (o link recebe só a lista já ordenada).
export const MODOS_ORDEM = ['uso', 'manual'];
export const MODO_ORDEM_PADRAO = 'uso';
export const modoOrdemValido = (m) => typeof m === 'string' && MODOS_ORDEM.includes(m);

// Ordem manual: `ordem` crescente; sem `ordem` (cadastro antigo) fica depois, na posição original; empate final por nome.
export function porOrdemManual(servicos) {
  const num = (s) => (Number.isFinite(s.ordem) ? s.ordem : Infinity);
  return servicos.map((s, i) => ({ s, i })).sort((a, b) => num(a.s) - num(b.s) || a.i - b.i || String(a.s.nome).localeCompare(String(b.s.nome), 'pt-BR')).map((o) => o.s);
}

// Quantas vezes cada serviço foi usado: agendamentos que não foram cancelados (feitos, confirmados ou a confirmar). Combo conta o combo (e não cada componente).
export function usoDosServicos(agendamentos) {
  const m = new Map();
  for (const a of agendamentos || []) {
    if (!a || a.status === 'cancelado') continue;
    for (const id of a.servicoIds || []) m.set(id, (m.get(id) || 0) + 1);
  }
  return m;
}

// Lista ordenada pelo modo. `uso` = Map de usoDosServicos (só é lida no modo 'uso').
export function ordenarServicos(servicos, modo, uso) {
  const base = porOrdemManual(servicos);
  if (modo !== 'uso') return base;
  const n = (s) => (uso && uso.get(s.id)) || 0;
  return base.map((s, i) => ({ s, i })).sort((a, b) => n(b.s) - n(a.s) || a.i - b.i).map((o) => o.s);
}

// Serviços do estado já na ordem das telas de atendimento (modo da loja; sem modo gravado vale o padrão 'uso').
export const servicosNaOrdemDaLoja = (st, lista = st.servicos) => ordenarServicos(lista, modoOrdemValido(st.estabelecimento.ordemServicos) ? st.estabelecimento.ordemServicos : MODO_ORDEM_PADRAO, usoDosServicos(st.agendamentos));

// Nova ordem manual a partir de uma lista de ids (a que o dono montou): números 1, 2, 3… só para os ids conhecidos e sem repetir; os que faltam seguem depois, na ordem de antes.
export function aplicarOrdemManual(servicos, ids) {
  const conhecidos = new Set(servicos.map((s) => s.id));
  const vistos = new Set();
  const fila = [];
  for (const id of Array.isArray(ids) ? ids : []) if (typeof id === 'string' && conhecidos.has(id) && !vistos.has(id)) { vistos.add(id); fila.push(id); }
  for (const s of porOrdemManual(servicos)) if (!vistos.has(s.id)) { vistos.add(s.id); fila.push(s.id); }
  return new Map(fila.map((id, i) => [id, i + 1]));
}
