/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Modelos de plano mensal da barbearia (botão "Usar modelo" no catálogo de Planos). São só ponto de partida: o botão PREENCHE o formulário e nada é gravado
// até o dono salvar. Os serviços vêm por NOME (os da loja podem ter outro id): vale o primeiro serviço ativo da loja com um dos nomes de cada grupo; o que a loja
// não tem fica de fora e o dono escolhe à mão. Valores pensados para a tabela da casa (corte R$ 40, barba R$ 35): o plano sempre sai mais barato que avulso.
// `intervaloDias`: dias mínimos entre dois atendimentos do plano; `adianta`: atendimentos a mais que pode pedir; `acumuloMeses`: meses que o saldo acumula.
const CORTES = ['Corte somente tesoura', 'Corte na máquina', 'Corte Degradê', 'Corte social (clássico)', 'Corte navalhado', 'Degradê navalhado'];
const DEGRADES = ['Corte Degradê', 'Degradê navalhado'];
const NAVALHADOS = ['Corte navalhado', 'Degradê navalhado', 'Sobrancelha na navalha'];
const BARBAS = ['Barba', 'Barba Degradê', 'Barba com toalha quente', 'Barba desenhada (design)'];

export const MODELOS_DE_PLANO = [
  { chave: 'pl-degrade-em-dia', nome: 'Degradê em Dia', descricao: 'Dois cortes degradê por mês para o visual nunca sair do ponto.', preco: 75, cortes: 2, servicos: DEGRADES, adianta: 1, acumuloMeses: 2, intervaloDias: 7 },
  { chave: 'pl-navalhado-premium', nome: 'Navalhado Premium', descricao: 'Dois cortes navalhados por mês, com acabamento na navalha.', preco: 85, cortes: 2, servicos: NAVALHADOS, adianta: 1, acumuloMeses: 2, intervaloDias: 7 },
  { chave: 'pl-visual-completo', nome: 'Visual Completo', descricao: 'Corte e barba em dois atendimentos por mês: cabelo e barba sempre alinhados.', preco: 125, cortes: 2, servicos: [...CORTES, ...BARBAS], adianta: 1, acumuloMeses: 2, intervaloDias: 7 },
  { chave: 'pl-barbeiro-vip', nome: 'Barbeiro VIP', descricao: 'Um atendimento por semana, com corte e barba, e mais folga para adiantar ou guardar.', preco: 165, cortes: 4, servicos: [...CORTES, ...BARBAS], adianta: 2, acumuloMeses: 3, intervaloDias: 5 },
];
