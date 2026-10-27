/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0a4cf8cc5d */
// Regras de seleção dos marcadores (status) e dos profissionais: clique = um só; gesto = vários.
// `minimo` é quantos precisam ficar marcados (profissional: 1; status: 0).
const lista = (sel) => (Array.isArray(sel) ? sel : sel ? [sel] : []);

/** Clique simples: troca a seleção para só `id`. Clicar no único marcado desmarca (se o mínimo permitir). */
export function escolherUnico(sel, id, minimo = 0) {
  const s = lista(sel);
  if (s.length === 1 && s[0] === id) return minimo > 0 ? s : [];
  return [id];
}

/** Gesto de múltipla escolha: liga ou desliga `id` sem mexer nos outros. Nunca deixa abaixo do mínimo. */
export function alternarMulti(sel, id, minimo = 0) {
  const s = lista(sel);
  if (!s.includes(id)) return [...s, id];
  return s.length - 1 < minimo ? s : s.filter((x) => x !== id);
}

/** X do marcador: tira só `id`. */
export const removerUm = (sel, id, minimo = 0) => (lista(sel).includes(id) ? alternarMulti(sel, id, minimo) : lista(sel));

/** Escolhas lembradas que ainda existem; sem nenhuma válida, usa o padrão. */
export function sanearSelecao(salva, existentes, padrao) {
  const ok = [...new Set(lista(salva))].filter((id) => existentes.includes(id));
  return ok.length ? ok : padrao ? [padrao] : [];
}
