/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Serviços de exemplo da barbearia para o assistente de primeiro acesso (e para Estabelecimento > Reconfigurar): uma lista ampla, por categoria,
// para o dono marcar o que a casa oferece. Valem de ponto de partida (preço e duração se ajustam no assistente e depois em Serviços).
// Os 5 serviços do seed (Corte somente tesoura, Corte na máquina, Corte Degradê, Barba, Barba Degradê) continuam sendo a base de dados de exemplo
// da loja de demonstração e entram aqui só com a categoria; o que está abaixo NÃO entra no seed (a v64 da barbearia segue intacta).
// Chaves: minúsculas, números e hífen (até 40). Nome único (o servidor deduplica por nome). Sem "combo" (dependem de componentes que o servidor ainda não tem):
// os pacotes abaixo são serviços comuns com duração e preço do conjunto. Depois de mudar esta lista rode `node tools/gerar-catalogo.mjs`.

export const ORDEM_DE_CATEGORIAS = ['Cortes', 'Barba', 'Corte e barba', 'Sobrancelha e acabamento', 'Cuidados', 'Coloração e química'];

// Categoria dos serviços que já existem no seed (o seed não tem categoria).
export const CATEGORIAS_DO_SEED = {
  's-tesoura': 'Cortes', 's-maquina': 'Cortes', 's-degrade': 'Cortes',
  's-barba': 'Barba', 's-barba-degrade': 'Barba',
};

// { id, nome, categoria, preco (R$), duracao (min), intervalo (min entre um atendimento e o próximo) }
export const SERVICOS_DE_EXEMPLO = [
  // Cortes
  { id: 's-corte-social', nome: 'Corte social (clássico)', categoria: 'Cortes', preco: 45, duracao: 40, intervalo: 10 },
  { id: 's-corte-navalhado', nome: 'Corte navalhado', categoria: 'Cortes', preco: 50, duracao: 45, intervalo: 10 },
  { id: 's-degrade-navalhado', nome: 'Degradê navalhado', categoria: 'Cortes', preco: 55, duracao: 50, intervalo: 10 },
  { id: 's-corte-infantil', nome: 'Corte infantil (até 12 anos)', categoria: 'Cortes', preco: 35, duracao: 30, intervalo: 5 },
  // Barba
  { id: 's-barba-toalha', nome: 'Barba com toalha quente', categoria: 'Barba', preco: 45, duracao: 40, intervalo: 5 },
  { id: 's-barboterapia', nome: 'Barboterapia (barba spa)', categoria: 'Barba', preco: 65, duracao: 55, intervalo: 5 },
  { id: 's-barba-desenhada', nome: 'Barba desenhada (design)', categoria: 'Barba', preco: 40, duracao: 35, intervalo: 5 },
  { id: 's-aparar-barba', nome: 'Aparar barba na máquina', categoria: 'Barba', preco: 25, duracao: 20, intervalo: 5 },
  { id: 's-bigode', nome: 'Bigode', categoria: 'Barba', preco: 15, duracao: 15, intervalo: 5 },
  // Corte e barba (pacotes)
  { id: 's-corte-barba', nome: 'Corte + barba', categoria: 'Corte e barba', preco: 70, duracao: 70, intervalo: 10 },
  { id: 's-degrade-barba', nome: 'Degradê + barba degradê', categoria: 'Corte e barba', preco: 80, duracao: 80, intervalo: 10 },
  { id: 's-corte-sobrancelha', nome: 'Corte + sobrancelha', categoria: 'Corte e barba', preco: 60, duracao: 55, intervalo: 10 },
  { id: 's-dia-do-noivo', nome: 'Dia do noivo (corte, barba e cuidados)', categoria: 'Corte e barba', preco: 250, duracao: 180, intervalo: 15 },
  // Sobrancelha e acabamento
  { id: 's-sobrancelha-navalha', nome: 'Sobrancelha na navalha', categoria: 'Sobrancelha e acabamento', preco: 20, duracao: 15, intervalo: 5 },
  { id: 's-sobrancelha-pinca', nome: 'Sobrancelha com pinça', categoria: 'Sobrancelha e acabamento', preco: 25, duracao: 15, intervalo: 5 },
  { id: 's-depil-nariz-orelha', nome: 'Depilação de nariz e orelha', categoria: 'Sobrancelha e acabamento', preco: 20, duracao: 15, intervalo: 5 },
  { id: 's-pezinho', nome: 'Pezinho (acabamento)', categoria: 'Sobrancelha e acabamento', preco: 15, duracao: 15, intervalo: 5 },
  // Cuidados
  { id: 's-limpeza-pele', nome: 'Limpeza de pele', categoria: 'Cuidados', preco: 60, duracao: 40, intervalo: 5 },
  { id: 's-black-mask', nome: 'Máscara black mask', categoria: 'Cuidados', preco: 30, duracao: 20, intervalo: 5 },
  { id: 's-hidratacao', nome: 'Hidratação capilar', categoria: 'Cuidados', preco: 40, duracao: 30, intervalo: 5 },
  { id: 's-lavar-secar', nome: 'Lavar e secar o cabelo', categoria: 'Cuidados', preco: 15, duracao: 15, intervalo: 5 },
  { id: 's-massagem-capilar', nome: 'Massagem capilar relaxante', categoria: 'Cuidados', preco: 30, duracao: 20, intervalo: 5 },
  // Coloração e química
  { id: 's-pigmentacao-barba', nome: 'Pigmentação de barba', categoria: 'Coloração e química', preco: 50, duracao: 40, intervalo: 5 },
  { id: 's-coloracao-barba', nome: 'Coloração de barba', categoria: 'Coloração e química', preco: 45, duracao: 30, intervalo: 5 },
  { id: 's-camuflagem', nome: 'Camuflagem de fios brancos (cabelo)', categoria: 'Coloração e química', preco: 60, duracao: 45, intervalo: 5 },
  { id: 's-luzes', nome: 'Luzes (mechas)', categoria: 'Coloração e química', preco: 150, duracao: 120, intervalo: 10 },
  { id: 's-platinado', nome: 'Platinado (descoloração)', categoria: 'Coloração e química', preco: 160, duracao: 150, intervalo: 10 },
  { id: 's-selagem', nome: 'Selagem / progressiva masculina', categoria: 'Coloração e química', preco: 120, duracao: 90, intervalo: 10 },
  { id: 's-permanente', nome: 'Permanente (cachos)', categoria: 'Coloração e química', preco: 140, duracao: 120, intervalo: 10 },
];
