/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estética automotiva: capacidades, rótulos, frases, visual e dados de exemplo do tipo. Registrado em src/domain/tipos.js.
export const DEFINICAO = Object.freeze({
  id: 'estetica_automotiva',
  nome: 'Estética automotiva',
  capacidades: Object.freeze({ usaVeiculo: true, precoPorPorte: true, usaRecursoFisico: true, multiDia: true, prontoParaRetirada: true }),
  rotulos: Object.freeze({
    profissional: Object.freeze({ s: 'esteticista', p: 'esteticistas', g: 'm' }),
    recurso: Object.freeze({ s: 'box', p: 'boxes', g: 'm' }),
    loja: Object.freeze({ s: 'loja', p: 'lojas', g: 'f' }),
    atendimento: Object.freeze({ s: 'serviço', p: 'serviços', g: 'm' }),
  }),
  vocab: Object.freeze({
    confirmacao: 'confirmação do serviço', tendoConfirmado: 'os serviços confirmados',
    exemploValeNome: 'Vale lavagem do aniversário', exemploVales: 'um vale lavagem, um vale polimento', exemploServicosVale: 'Lavagem, Polimento',
    exemploMaterial: 'Shampoo automotivo',
    materialDica: 'Material é consumido nos serviços (shampoo, polidor, cera, coating). Produto é vendido ao cliente (ex.: aromatizante) e pode ser adicionado a um atendimento.',
    estoqueCadastre: 'Cadastre os materiais (shampoo, polidor, cera, coating…) e informe em cada serviço quanto ele usa. Quando o atendimento é concluído, o estoque baixa sozinho.',
    estoqueConsumo: 'Quando o atendimento é concluído, essas quantidades saem do estoque (produtos químicos: shampoo, polidor, cera, coating…).',
    exemploCategorias: 'Lavagem, Proteção',
    exemploFolga: 'Folga do Pablo',
    saudacao: 'Aqui é {nome} 🚗', saudacaoVolta: 'Aqui é {nome} 🚗',
  }),
  visual: Object.freeze({ temaPadrao: 'escuro', iconeMarca: 'car', iconeServicos: 'brush', fundoClaro: '#f1f4f8', fundoEscuro: '#0d0f12' }),
  exemplo: Object.freeze({ servicosDia: Object.freeze(['s-lav-simples', 's-lav-detalhada', 's-higien-interna', 's-lav-motor']) }), // serviços do dia cheio da demonstração // escuro por padrão; o claro é escolha do usuário; não segue o sistema
});
