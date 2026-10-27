/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Barbearia: capacidades, rótulos, frases, visual e dados de exemplo do tipo. Registrado em src/domain/tipos.js.
export const DEFINICAO = Object.freeze({
  id: 'barbearia',
  nome: 'Barbearia',
  capacidades: Object.freeze({ usaVeiculo: false, precoPorPorte: false, usaRecursoFisico: false, multiDia: false, prontoParaRetirada: false }),
  rotulos: Object.freeze({
    profissional: Object.freeze({ s: 'barbeiro', p: 'barbeiros', g: 'm' }),
    recurso: Object.freeze({ s: 'cadeira', p: 'cadeiras', g: 'f' }),
    loja: Object.freeze({ s: 'barbearia', p: 'barbearias', g: 'f' }),
    atendimento: Object.freeze({ s: 'corte', p: 'cortes', g: 'm' }),
  }),
  vocab: Object.freeze({
    confirmacao: 'confirmação de corte', tendoConfirmado: 'o corte confirmado',
    exemploValeNome: 'Vale corte do aniversário', exemploVales: 'um vale corte, um vale barba', exemploServicosVale: 'Corte, Barba',
    exemploMaterial: 'Pomada modeladora',
    materialDica: 'Material é consumido nos serviços (pomada, papel). Produto é vendido ao cliente e pode ser adicionado a um atendimento.',
    estoqueCadastre: 'Cadastre os materiais (pomada, papel para o pescoço…) e informe em cada serviço quanto ele usa. Quando o atendimento é concluído, o estoque baixa sozinho.',
    estoqueConsumo: 'Quando o atendimento é concluído, essas quantidades saem do estoque.',
    exemploCategorias: 'Cortes, Barba',
    exemploFolga: 'Folga do Kiko',
    saudacao: 'Bem-vindo à {nome} 💈', saudacaoVolta: 'Bem-vindo de volta à {nome} 💈',
  }),
  visual: Object.freeze({ temaPadrao: 'auto', iconeMarca: 'scissors', iconeServicos: 'scissors', fundoClaro: '#f4f1ea', fundoEscuro: '#141517' }),
  exemplo: Object.freeze({ servicosDia: Object.freeze(['s-tesoura', 's-maquina', 's-degrade', 's-barba']) }), // segue o claro/escuro do sistema; o usuário alterna automático → escuro → claro
});
