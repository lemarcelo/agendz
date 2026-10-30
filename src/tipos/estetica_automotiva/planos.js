/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Modelos de plano mensal (clube de assinatura) da estética automotiva, no botão "Usar modelo" do catálogo de Planos. Só preenchem o formulário:
// nada é gravado até o dono salvar, e o dono ajusta valor, serviços, validade e regras. O plano é por atendimento e nunca depende de veículo, porte ou box:
// o serviço coberto sai de graça pelo preço do porte do veículo no dia. Serviços e produtos vêm por NOME (a loja pode ter outro id); o que a loja não tem fica de fora.
// Referência de mercado (pesquisa em outubro/2026, sem tabela pública de preços que valesse copiar): clubes de lavagem ilimitada nos EUA e redes de
// estética/lavagem do Brasil vendem pacotes mensais de 2 a 4 lavagens, com extras (cera, aromatizante) e prazo de 3 a 12 meses; os valores abaixo são
// só ponto de partida e foram pensados para ficar abaixo do avulso (lavagem simples R$ 50 e detalhada R$ 110 no porte médio da casa).
const LAVAGENS = ['Lavagem simples', 'Lavagem detalhada'];

export const MODELOS_DE_PLANO = [
  { chave: 'pl-lavagem-mensal', nome: 'Lavagem Mensal', descricao: 'Duas lavagens por mês para o carro viver limpo.', observacoes: 'Lavagem simples ou detalhada, uma a cada semana.', preco: 120, cortes: 2, servicos: LAVAGENS, produtos: [], adianta: 1, acumuloMeses: 2, intervaloDias: 7, validadeMeses: 0 },
  { chave: 'pl-cuidado-total', nome: 'Clube Cuidado Total', descricao: 'Quatro atendimentos por mês, com lavagem de motor e um aromatizante incluso.', observacoes: 'Um atendimento por semana; o aromatizante sai de graça em cada atendimento.', preco: 240, cortes: 4, servicos: [...LAVAGENS, 'Lavagem de motor'], produtos: ['Aromatizante automotivo'], adianta: 1, acumuloMeses: 2, intervaloDias: 5, validadeMeses: 0 },
  { chave: 'pl-brilho-premium', nome: 'Brilho Premium', descricao: 'Dois atendimentos por mês de cuidado completo, por seis meses.', observacoes: 'Lavagem detalhada, higienização interna, enceramento e plásticos. Plano de seis meses.', preco: 390, cortes: 2, servicos: ['Lavagem detalhada', 'Higienização interna', 'Enceramento', 'Revitalização de plásticos'], produtos: [], adianta: 1, acumuloMeses: 3, intervaloDias: 10, validadeMeses: 6 },
];
