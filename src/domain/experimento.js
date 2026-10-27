/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Experimentos de tela, SÓ para o Artifact de avaliação. Ligados por AGENDZ_EXPERIMENTO no build (build.mjs); o build normal, o do site e o da barbearia
// recebem '' e o código do experimento é descartado (tests/estatico.test.mjs confere que não sobra nada no index.html).

// Rolagem lembrada da Agenda (só no experimento): valor lido é sempre saneado; fora do intervalo, volta ao topo.
export function sanearRolagem(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 200000 ? Math.round(n) : 0;
}
export function sanearModoExperimento(v) {
  return v === 'calendario' ? 'calendario' : 'horarios';
}
