/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Busca por termos do seletor "quem realiza / quais serviços" (leve/SeletorVinculo.jsx): sem acento, sem diferença de maiúscula e com várias palavras
// (todas precisam aparecer, em qualquer ordem, no nome ou na nota/código do item).
export const normalizarBusca = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** `itens` = [{ id, rotulo, nota? }]. Termo vazio devolve todos, na ordem recebida. */
export function filtrarPorTermo(itens, termo) {
  const palavras = normalizarBusca(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return itens;
  return itens.filter((x) => {
    const alvo = normalizarBusca(`${x.rotulo} ${x.nota || ''}`);
    return palavras.every((p) => alvo.includes(p));
  });
}
