/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Produtos para vender sugeridos à barbearia no assistente de primeiro acesso (e em Estabelecimento > Reconfigurar). São só ponto de partida:
// o dono marca, ajusta preço, comissão e estoque, e pode descrever os próprios. Nada vem marcado e nada entra no seed (a v64 segue intacta).
// Comissão vazia = sem comissão para quem vende; só o proprietário define. Nome único na loja (o servidor não recria um nome que já existe).
export const PRODUTOS_DE_EXEMPLO = [
  { chave: 'pr-pomada', nome: 'Pomada modeladora 100 g', preco: 45 },
  { chave: 'pr-oleo-barba', nome: 'Óleo para barba 30 ml', preco: 38 },
  { chave: 'pr-balm', nome: 'Balm pós-barba 60 g', preco: 35 },
  { chave: 'pr-shampoo-barba', nome: 'Shampoo para barba 140 ml', preco: 32 },
  { chave: 'pr-cera', nome: 'Cera capilar 80 g', preco: 30 },
  { chave: 'pr-pente', nome: 'Pente de madeira', preco: 18 },
];
