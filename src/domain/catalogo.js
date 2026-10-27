/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Catálogo de serviços de exemplo de um tipo (assistente de primeiro acesso), derivado dos serviços de um estado de seed.
// Mesma função no gerador dos arquivos do back-end (tools/gerar-catalogo.mjs) e na pré-visualização do Artifact. Combos ficam de fora.
export function catalogoDeEstado(estado) {
  return (estado.servicos || []).filter((s) => !s.combo).map((s) => ({
    chave: s.id, nome: s.nome, categoria: s.categoria || null, preco: s.preco, duracaoMin: s.duracao, intervaloMin: s.intervalo ?? 0, multiDia: !!s.multiDia,
    precos: s.precos || null, duracoes: s.duracoes || null,
  }));
}

// Expediente sugerido do tipo (semana do estabelecimento do seed): { semana: { 0..6: { aberto, faixas: [['09:00','20:00']] } } }.
export function expedienteDeEstado(estado) {
  const semana = {};
  for (let d = 0; d < 7; d++) {
    const dia = estado.estabelecimento.escala.semana[d];
    semana[d] = { aberto: !!dia.aberto, faixas: dia.aberto ? dia.faixas.map(([a, b]) => [a, b]) : [] };
  }
  return { semana };
}
