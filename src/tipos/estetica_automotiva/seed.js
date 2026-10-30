/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:54c3d8d098 */
// Dados de exemplo (o que a API real devolveria). Tudo é gerado em relação ao "agora" para a agenda nunca ficar vazia.
import { atribuirCodigos } from '../../domain/codigo.js';
import { escalaPadrao, diaAberto, faixasDoDia } from '../../domain/schedule.js';
import { LOGO_APEX, COR_APEX_VERDE, COR_APEX_LIMA } from './logo-apex.js';

// Horário de funcionamento da Apex (perfil do WhatsApp): 09:00 às 20:00, sem pausa, de segunda a sábado.
const escalaApex = () => escalaPadrao([1, 2, 3, 4, 5, 6], [['09:00', '20:00']]);
import { addDays, startOfDay, tsAt, MIN } from '../../domain/time.js';
import { modelosPadrao } from '../../domain/templates.js';
import { montarPlano } from '../../domain/rules.js';
import { fotoDoVeiculo } from '../../domain/veiculos.js';


export function criarEstadoInicial(agora) {
  const estab = {
    tipo: 'estetica_automotiva', // definido na criação da loja e nunca muda (domain/tipos.js)
    nome: 'Apex',
    telefone: '(55) 9235-8784',
    endereco: 'Rua Visconde de Pelotas, 412, Nossa Senhora do Rosário, Santa Maria - RS, 97010-440',
    logo: LOGO_APEX,
    corTema: COR_APEX_VERDE,
    corTema2: COR_APEX_LIMA,
    email: 'contato@apexestetica.com.br',
    ddds: [51, 53, 54, 55],
    visaoPadrao: 'semana',
    confirmacaoServico: false,
    camposObrigatorios: { futuro: [], local: [] }, // campos que o botão Atender exige em cada tipo (nome, telefone, esteticista, vendedor, formaPagamento)
    temaCor: 'logo', // cor do tema: 'padrao' | 'logo' | id de PALETAS (domain/tema.js). Na Apex: as cores da logo (verde→lima)
    linkAgendamento: { ativo: true, diasMax: 30 }, // link público de autoagendamento (ligado, até 30 dias à frente)
    usaIntegracaoPix: true, // desligado: Pix vira só um registro manual (sem cobrança, QR, extrato nem sincronização)
    formaPagamentoPadrao: 'pix', // 'pix' | 'dinheiro' | 'cartao' | '' (vazio: o atendimento local obriga escolher)
    contaPorForma: { pix: '', dinheiro: '', cartao: '' }, // conta que recebe cada forma; vazio = conta do grupo de movimentação
    grupoMovimentacaoId: 'g1', // grupo padrão: define a conta que recebe os serviços e paga as despesas sem grupo próprio
    // Pergunta de confirmação 1 dia antes, às 17:00; depois um aviso 2 horas antes.
    notificacoes: [
      { id: 'n1', modo: 'dias', dias: 1, hora: '17:00', tipo: 'pergunta' },
      { id: 'n2', modo: 'horas', horas: '02:00', tipo: 'aviso' },
    ],
    // Boxes (vagas de serviço): cada carro ocupa um box do começo ao fim do serviço. Configuráveis em Estabelecimento > Boxes.
    boxes: [{ id: 'bx1', nome: 'Box 1', ativo: true }, { id: 'bx2', nome: 'Box 2', ativo: true }, { id: 'bx3', nome: 'Box 3', ativo: true }],
    escala: escalaApex(),
    calendario: { feriadosVinculado: false, feriadosNome: 'Feriados no Brasil', enviarEventos: true },
  };

  const usuarios = [
    { id: 'u-davi', nome: 'Davi', apelido: 'Davi', cpf: '391.847.260-40', nascimento: '1990-04-12', email: 'davi@apexestetica.com.br', telefone: '(55) 99701-1122', senha: '1234', papel: 'dono', permissoes: {}, atende: true, escala: escalaApex() },
    { id: 'u-pablo', nome: 'Pablo', apelido: 'Pablo', cpf: '724.093.518-32', nascimento: '1994-09-03', email: 'pablo@apexestetica.com.br', telefone: '(55) 99644-3050', senha: '1234', papel: 'profissional', permissoes: {}, atende: true, escala: escalaApex() },
    { id: 'u-marcelo', nome: 'Marcelo', apelido: 'Marcelo', cpf: '158.602.947-94', nascimento: '1998-01-27', email: 'marcelo@apexestetica.com.br', telefone: '(53) 99822-7741', senha: '1234', papel: 'profissional', permissoes: {}, atende: true, escala: escalaApex() },
  ];


  // Preço e duração por porte, na ordem: pequeno, médio, grande, SUV, pickup. `preco` e `duracao` espelham o médio.
  const P = ['pequeno', 'medio', 'grande', 'suv', 'pickup'];
  const porPorte = (v) => Object.fromEntries(P.map((p, i) => [p, v[i]]));
  const sv = (id, nome, categoria, preco, duracao, o = {}) => ({
    id, nome, categoria, precos: porPorte(preco), duracoes: porPorte(duracao), preco: preco[1], duracao: duracao[1],
    intervalo: 10, antecedenciaH: 2, notificacoes: null, confirmacaoServico: null, materiais: [], multiDia: false, combo: false, ...o,
  });
  const servicos = [
    sv('s-lav-simples', 'Lavagem simples', 'Lavagem', [40, 50, 60, 70, 70], [30, 40, 45, 50, 50], { materiais: [{ materialId: 'mt-microfibra', qtd: 1 }, { materialId: 'mt-shampoo', qtd: 30 }] }),
    sv('s-lav-detalhada', 'Lavagem detalhada', 'Lavagem', [90, 110, 130, 150, 150], [90, 110, 130, 140, 140], { materiais: [{ materialId: 'mt-microfibra', qtd: 3 }, { materialId: 'mt-shampoo', qtd: 50 }, { materialId: 'mt-desengraxante', qtd: 20 }] }),
    sv('s-lav-motor', 'Lavagem de motor', 'Lavagem', [60, 70, 80, 90, 90], [30, 40, 40, 50, 50], { antecedenciaH: 1, materiais: [{ materialId: 'mt-desengraxante', qtd: 50 }, { materialId: 'mt-microfibra', qtd: 1 }] }),
    sv('s-higien-interna', 'Higienização interna', 'Interior', [180, 220, 260, 300, 300], [90, 100, 120, 140, 140], { materiais: [{ materialId: 'mt-limpa-estofados', qtd: 120 }, { materialId: 'mt-microfibra', qtd: 2 }] }),
    sv('s-hidrat-couro', 'Hidratação de couro', 'Interior', [120, 150, 180, 200, 200], [60, 75, 90, 90, 90], { materiais: [{ materialId: 'mt-hidratante-couro', qtd: 60 }, { materialId: 'mt-microfibra', qtd: 1 }] }),
    sv('s-higien-ar', 'Higienização do ar-condicionado', 'Interior', [90, 100, 110, 120, 120], [30, 40, 40, 45, 45], { antecedenciaH: 1, materiais: [{ materialId: 'mt-limpa-estofados', qtd: 40 }] }),
    sv('s-descontam', 'Descontaminação de pintura', 'Pintura', [200, 250, 300, 350, 350], [90, 120, 150, 150, 150], { materiais: [{ materialId: 'mt-argila', qtd: 1 }, { materialId: 'mt-shampoo', qtd: 30 }] }),
    sv('s-polimento-comercial', 'Polimento comercial', 'Pintura', [250, 300, 380, 450, 450], [120, 150, 180, 210, 210], { materiais: [{ materialId: 'mt-polidor', qtd: 40 }, { materialId: 'mt-microfibra', qtd: 2 }] }),
    sv('s-polim-tecnico', 'Polimento técnico', 'Pintura', [600, 750, 950, 1100, 1100], [300, 420, 540, 600, 600], { multiDia: true, antecedenciaH: 24, materiais: [{ materialId: 'mt-polidor', qtd: 90 }, { materialId: 'mt-microfibra', qtd: 4 }] }),
    sv('s-cristalizacao', 'Cristalização', 'Proteção', [350, 420, 520, 600, 600], [180, 210, 240, 270, 270], { materiais: [{ materialId: 'mt-polidor', qtd: 30 }, { materialId: 'mt-microfibra', qtd: 2 }] }),
    sv('s-vitrificacao', 'Vitrificação cerâmica', 'Proteção', [1500, 1800, 2200, 2600, 2600], [600, 720, 840, 900, 900], { multiDia: true, antecedenciaH: 24, materiais: [{ materialId: 'mt-coating', qtd: 30 }, { materialId: 'mt-microfibra', qtd: 5 }] }),
    sv('s-enceramento', 'Enceramento', 'Proteção', [100, 130, 160, 190, 190], [45, 60, 75, 90, 90], { materiais: [{ materialId: 'mt-cera', qtd: 40 }, { materialId: 'mt-microfibra', qtd: 1 }] }),
    sv('s-revit-plasticos', 'Revitalização de plásticos', 'Detalhes', [70, 90, 110, 130, 130], [30, 40, 50, 60, 60], { antecedenciaH: 1, materiais: [{ materialId: 'mt-revitalizador', qtd: 30 }] }),
    sv('s-rest-farois', 'Restauração de faróis', 'Detalhes', [160, 180, 180, 200, 200], [60, 60, 60, 75, 75], { materiais: [{ materialId: 'mt-polidor', qtd: 20 }] }),
    sv('s-imperm-vidros', 'Impermeabilização de vidros', 'Detalhes', [90, 110, 130, 150, 150], [40, 50, 60, 60, 60], { materiais: [{ materialId: 'mt-coating', qtd: 15 }] }),
    // Combo: preço e duração próprios por porte; sem lista de materiais própria, consome os dos serviços que o compõem.
    sv('s-combo-det-cera', 'Detalhada + Cera', 'Combos', [170, 210, 250, 290, 290], [125, 160, 190, 215, 215], { combo: true, componentes: ['s-lav-detalhada', 's-enceramento'] }),
  ];

  const clientes = [
    { id: 'c-marcelo', nome: 'Marcelo Santos', apelido: 'Marcelo', cpf: '284.510.937-79', nascimento: '1988-06-21', telefone: '(55) 99711-4020', veiculos: [
      { id: 've-m1', placa: 'ABC1D23', marca: 'Honda', modelo: 'Civic', cor: 'Prata', porte: 'medio' },
    ] },
    { id: 'c-igor', nome: 'Igor Filipin', apelido: 'Igor', cpf: '503.976.128-77', nascimento: '1996-11-08', telefone: '(54) 99633-8812', veiculos: [
      { id: 've-i1', placa: 'IJK-5073', marca: 'Fiat', modelo: 'Strada', cor: 'Branca', porte: 'pickup' },
    ] },
    { id: 'c-jon', nome: 'Jon Paul Frigo', apelido: 'Jon', cpf: '', nascimento: '', telefone: '(51) 99588-3374', veiculos: [
      { id: 've-j1', placa: 'BRA2E19', marca: 'Renault', modelo: 'Kwid', cor: 'Vermelho', porte: 'pequeno' },
      { id: 've-j2', placa: 'RIO2A19', marca: 'Volkswagen', modelo: 'T-Cross', cor: 'Cinza', porte: 'suv' },
    ] },
  ];

  const base = { usuarios, servicos, clientes, estabelecimento: estab };
  const dia = (n) => {
    if (n === 0) return faixasDoDia(estab.escala, agora).length ? startOfDay(agora) : diaAberto(estab, agora, 1);
    let d = startOfDay(agora);
    for (let i = 0; i < Math.abs(n); i++) d = diaAberto(estab, d, n > 0 ? 1 : -1);
    return d;
  };

  const s = {
    seq: 100,
    ...base,
    // Materiais = químicos e insumos que os serviços consomem; produtos = itens vendidos no balcão.
    materiais: [
      { id: 'mt-shampoo', nome: 'Shampoo automotivo', unidade: 'ml', estoque: 5000, minimo: 1000, custo: 0.03, ativo: true },
      { id: 'mt-microfibra', nome: 'Microfibra', unidade: 'un', estoque: 60, minimo: 15, custo: 3.5, ativo: true },
      { id: 'mt-argila', nome: 'Barra de argila', unidade: 'un', estoque: 12, minimo: 3, custo: 28, ativo: true },
      { id: 'mt-desengraxante', nome: 'Desengraxante', unidade: 'ml', estoque: 4000, minimo: 1000, custo: 0.04, ativo: true },
      { id: 'mt-limpa-estofados', nome: 'Limpa-estofados', unidade: 'ml', estoque: 3000, minimo: 800, custo: 0.06, ativo: true },
      { id: 'mt-polidor', nome: 'Polidor', unidade: 'ml', estoque: 2000, minimo: 500, custo: 0.15, ativo: true },
      { id: 'mt-cera', nome: 'Cera de carnaúba', unidade: 'g', estoque: 1500, minimo: 300, custo: 0.12, ativo: true },
      { id: 'mt-coating', nome: 'Coating cerâmico', unidade: 'ml', estoque: 300, minimo: 60, custo: 1.8, ativo: true },
      { id: 'mt-hidratante-couro', nome: 'Hidratante de couro', unidade: 'ml', estoque: 1500, minimo: 400, custo: 0.1, ativo: true },
      { id: 'mt-revitalizador', nome: 'Revitalizador de plásticos', unidade: 'ml', estoque: 1500, minimo: 400, custo: 0.08, ativo: true },
      { id: 'pr-aromatizante', nome: 'Aromatizante automotivo (venda)', tipo: 'produto', preco: 45, comissaoPct: 10, unidade: 'un', estoque: 12, minimo: 3, custo: 22, ativo: true },
      { id: 'pr-cera-spray', nome: 'Cera em spray 500 ml (venda)', tipo: 'produto', preco: 38, unidade: 'un', estoque: 8, minimo: 2, custo: 17, ativo: true },
    ],
    movimentosEstoque: [],
    financeiro: {
      // Contas da Apex: cada uma com a sua chave Pix, API Pix e Open Finance. O grupo de movimentação diz qual conta é responsável.
      contas: [
        {
          id: 'ct1', apelido: 'Conta principal', banco: 'Sicredi', agencia: '0101', conta: '12345-6',
          pix: { tipoChave: 'aleatoria', chave: '5f8d2c1e-7a34-4b9e-9c06-3e1b8a7d4f52', recebedor: 'Apex', cidade: 'Passo Fundo', validadeH: 24 },
          apiPix: { banco: null, ambiente: 'homologacao', urlBase: '', clientId: '', clientSecret: '', certificadoNome: '', chavePrivadaNome: '', cadeiaNome: '', appKey: '', escopos: ['cob.write', 'cob.read', 'pix.read', 'webhook.write'], webhookUrl: 'https://api.apexestetica.com.br/webhooks/pix', ativa: false, testadoEm: null },
          openFinance: { conectado: false, consentimentoEm: null, validoAte: null, ultimaSync: null },
        },
        {
          id: 'ct2', apelido: 'Conta de fornecedores', banco: 'Banco do Brasil', agencia: '3322', conta: '98765-4',
          pix: { tipoChave: 'aleatoria', chave: 'c9a41d07-2b6e-4f3a-8d15-7e0b92f6a3c8', recebedor: 'Apex', cidade: 'Passo Fundo', validadeH: 24 },
          apiPix: { banco: null, ambiente: 'homologacao', urlBase: '', clientId: '', clientSecret: '', certificadoNome: '', chavePrivadaNome: '', cadeiaNome: '', appKey: '', escopos: ['cob.write', 'cob.read', 'pix.read', 'webhook.write'], webhookUrl: 'https://api.apexestetica.com.br/webhooks/pix', ativa: false, testadoEm: null },
          openFinance: { conectado: false, consentimentoEm: null, validoAte: null, ultimaSync: null },
        },
      ],
      grupos: [
        { id: 'g1', nome: 'Geral', contaId: 'ct1' },
        { id: 'g2', nome: 'Fornecedores e produtos', contaId: 'ct2' },
      ],
      lancamentos: [], cobrancas: [], extrato: [], creditos: [], baixas: [],
    },
    banco: { movimentos: [] },
    comissoesPagas: [],
    // Chaves de exemplo (só da demonstração; em produção cada chave é gerada de forma aleatória no servidor).
    cupons: [
      { id: 'cp-lavagem', chave: 'LAVA-VALE-4M7X', nome: 'Vale lavagem', tipo: 'servico', servicoIds: ['s-lav-simples', 's-lav-detalhada', 's-higien-interna'], percentual: null, valor: null, inicio: startOfDay(agora - 7 * 86400000), fim: startOfDay(agora + 60 * 86400000), usosMax: 50, usosPorCliente: 1, ativo: true, criadoEm: agora - 7 * 86400000, autor: { nome: 'Davi', id: 'u-davi' } },
      { id: 'cp-polimento', chave: 'POLI-VALE-E2K9', nome: 'Vale polimento', tipo: 'servico', servicoIds: ['s-polimento-comercial', 's-polim-tecnico', 's-cristalizacao'], percentual: null, valor: null, inicio: startOfDay(agora - 7 * 86400000), fim: startOfDay(agora + 60 * 86400000), usosMax: 50, usosPorCliente: 1, ativo: true, criadoEm: agora - 6 * 86400000, autor: { nome: 'Davi', id: 'u-davi' } },
      { id: 'cp-dez', chave: 'DEZP-ARCT-8K3H', nome: '10% de desconto', tipo: 'percentual', servicoIds: [], percentual: 10, valor: null, inicio: startOfDay(agora - 7 * 86400000), fim: startOfDay(agora + 60 * 86400000), usosMax: 100, usosPorCliente: 1, ativo: true, criadoEm: agora - 5 * 86400000, autor: { nome: 'Davi', id: 'u-davi' } },
    ],
    cuponsTentativas: {},
    agendamentos: [],
    modelos: modelosPadrao('estetica_automotiva'),
    mensagensCliente: [],
    avisosPainel: [],
    pedidosVinculo: [],
    recuperacoes: [],
  };

  let n = 0;
  // `vei` = id do veículo do cliente (o agendamento guarda uma cópia, o porte e o box); `box` = box do carro.
  const novo = (o) => {
    const c = clientes.find((x) => x.id === o.clienteId);
    const v = c.veiculos.find((x) => x.id === o.vei);
    const a = {
      id: `a${++n}`, encaixe: false, reagendado: false, origem: 'whatsapp', faltaConfirmacao: null, servicosFeitos: null, motivoCancelamento: null,
      criadoEm: agora - 3 * 24 * 60 * MIN, plano: [], log: [], precos: {}, acrescimos: {}, estoqueBaixado: null, ...o,
      veiculoId: v.id, veiculo: fotoDoVeiculo(v), porte: v.porte, boxId: o.box,
    };
    delete a.vei; delete a.box;
    a.inicio = tsAt(a.dia, a.hora);
    delete a.dia; delete a.hora;
    if (!o.plano) {
      const lista = servicos.filter((x) => a.servicoIds.includes(x.id));
      const plano = montarPlano({ inicio: a.inicio, servicos: lista, estab, agora: a.criadoEm });
      a.plano = a.status === 'a_confirmar' ? plano : plano.map((p) => ({ ...p, estado: 'pulada' }));
    }
    s.agendamentos.push(a);
    return a;
  };
  const sis = { tipo: 'sistema', nome: 'Sistema' };
  const cli = (id) => { const c = clientes.find((x) => x.id === id); return { tipo: 'cliente', nome: c.apelido, id }; };

  // Concluídos (passado): dão o "Último atendimento" dos clientes.
  novo({ clienteId: 'c-marcelo', vei: 've-m1', box: 'bx1', profissionalId: 'u-pablo', servicoIds: ['s-lav-detalhada', 's-enceramento'], status: 'concluido', dia: dia(-4), hora: '09:00', servicosFeitos: ['s-lav-detalhada', 's-enceramento'], acrescimos: { 's-lav-detalhada': 10 }, log: [
    { id: 'l1', em: agora - 5 * 86400000, autor: cli('c-marcelo'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l2', em: agora - 4 * 86400000, autor: sis, campo: 'status', de: 'Confirmado', para: 'Concluído (automático)' },
  ] });
  novo({ clienteId: 'c-jon', vei: 've-j1', box: 'bx2', profissionalId: 'u-pablo', servicoIds: ['s-higien-interna'], status: 'concluido', dia: dia(-1), hora: '15:00', servicosFeitos: ['s-higien-interna'], log: [
    { id: 'l3', em: agora - 3 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' },
  ] });

  novo({ clienteId: 'c-igor', vei: 've-i1', box: 'bx1', profissionalId: 'u-davi', servicoIds: ['s-lav-simples', 's-lav-motor'], status: 'concluido', dia: dia(-2), hora: '10:00', servicosFeitos: ['s-lav-simples', 's-lav-motor'], acrescimos: { 's-lav-simples': 5 }, log: [
    { id: 'l20', em: agora - 4 * 86400000, autor: cli('c-igor'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l21', em: agora - 4 * 86400000, autor: { tipo: 'profissional', nome: 'Davi', id: 'u-davi' }, campo: 'acréscimo', de: 'sem acréscimo', para: 'Lavagem simples: R$ 5,00' },
  ] });
  novo({ clienteId: 'c-jon', vei: 've-j1', box: 'bx2', profissionalId: 'u-pablo', servicoIds: ['s-lav-motor'], status: 'concluido', dia: dia(-3), hora: '15:00', servicosFeitos: ['s-lav-motor'], log: [
    { id: 'l22', em: agora - 5 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' },
  ] });

  // Um de cada status.
  novo({ clienteId: 'c-igor', vei: 've-i1', box: 'bx1', profissionalId: 'u-davi', servicoIds: ['s-lav-simples'], status: 'confirmado', dia: dia(1), hora: '10:00', log: [
    { id: 'l4', em: agora - 86400000, autor: cli('c-igor'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l5', em: agora - 3600000, autor: cli('c-igor'), campo: 'status', de: 'A confirmar', para: 'Confirmado' },
  ] });
  novo({ clienteId: 'c-marcelo', vei: 've-m1', box: 'bx1', profissionalId: 'u-pablo', servicoIds: ['s-higien-interna', 's-polimento-comercial'], status: 'a_confirmar', dia: dia(2), hora: '14:00', log: [
    { id: 'l6', em: agora - 7200000, autor: cli('c-marcelo'), campo: 'criação', de: null, para: 'agendamento criado' },
  ] });
  novo({ clienteId: 'c-jon', vei: 've-j1', box: 'bx2', profissionalId: 'u-davi', servicoIds: ['s-lav-motor'], status: 'cancelado', motivoCancelamento: 'profissional', dia: dia(2), hora: '16:00', log: [
    { id: 'l7', em: agora - 2 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l8', em: agora - 3600000, autor: { tipo: 'profissional', nome: 'Davi', id: 'u-davi' }, campo: 'status', de: 'A confirmar', para: 'Cancelado' },
  ] });
  // Remarcado (etiqueta laranja).
  const d3 = dia(3);
  novo({ clienteId: 'c-igor', vei: 've-i1', box: 'bx1', profissionalId: 'u-marcelo', servicoIds: ['s-lav-detalhada'], status: 'a_confirmar', reagendado: true, dia: d3, hora: '09:00', log: [
    { id: 'l9', em: agora - 2 * 86400000, autor: cli('c-igor'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l10', em: agora - 3600000, autor: cli('c-igor'), campo: 'data e hora', de: `${fmtD(addDays(d3, -1))} às 09:00`, para: `${fmtD(d3)} às 09:00` },
  ] });
  // A confirmar, sem resposta (vermelho): todas as notificações já foram enviadas.
  const dRed = dia(1);
  novo({ clienteId: 'c-jon', vei: 've-j1', box: 'bx2', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], status: 'a_confirmar', dia: dRed, hora: '16:00', plano: [
    { idx: 0, tipo: 'pergunta', programado: tsAt(addDays(dRed, -1), '17:00'), enviarEm: tsAt(addDays(dRed, -1), '17:00'), estado: 'enviada', enviadaEm: null },
    { idx: 1, tipo: 'aviso', programado: tsAt(dRed, '14:00'), enviarEm: tsAt(dRed, '14:00'), estado: 'enviada', enviadaEm: null },
  ], log: [{ id: 'l11', em: agora - 4 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' }] });
  // Um cliente com horário de hoje/próximo dia para dar vida ao "Hoje".
  novo({ clienteId: 'c-marcelo', vei: 've-m1', box: 'bx2', profissionalId: 'u-davi', servicoIds: ['s-higien-interna'], status: 'confirmado', dia: dia(0), hora: '14:30', log: [
    { id: 'l12', em: agora - 2 * 86400000, autor: cli('c-marcelo'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l13', em: agora - 86400000, autor: cli('c-marcelo'), campo: 'status', de: 'A confirmar', para: 'Confirmado' },
  ] });
  // Serviço de vários dias em andamento: o T-Cross entrou no Box 3 no último dia aberto e só é retirado quando a vitrificação termina (usa só o expediente aberto).
  novo({ clienteId: 'c-jon', vei: 've-j2', box: 'bx3', profissionalId: 'u-marcelo', servicoIds: ['s-vitrificacao'], status: 'confirmado', dia: dia(-1), hora: '09:00', emServico: { em: tsAt(dia(-1), '09:10') }, log: [
    { id: 'l14', em: agora - 3 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l15', em: agora - 2 * 86400000, autor: cli('c-jon'), campo: 'status', de: 'A confirmar', para: 'Confirmado' },
    { id: 'l16', em: tsAt(dia(-1), '09:10'), autor: { tipo: 'profissional', nome: 'Marcelo', id: 'u-marcelo' }, campo: 'andamento', de: null, para: 'Em serviço' },
  ] });

  // Financeiro de exemplo: duas despesas lançadas à mão e movimentos do banco que o Open Finance ainda vai importar.
  const dFin = (n) => startOfDay(agora - n * 86400000);
  const dMes = (d) => { const x = new Date(agora); x.setDate(d); return startOfDay(Math.min(x.getTime(), agora)); };
  s.financeiro.lancamentos.push(
    { id: 'f1', tipo: 'despesa', descricao: 'Aluguel do galpão', valor: 1200, data: dMes(5), categoria: 'Aluguel', origem: 'manual', grupoId: 'g1', contaId: 'ct1', conciliado: false, extratoId: null, criadoEm: agora - 6 * 86400000, autor: { tipo: 'profissional', nome: 'Davi', id: 'u-davi' } },
    { id: 'f2', tipo: 'despesa', descricao: 'Conta de luz', valor: 186.9, data: dMes(8), categoria: 'Energia e água', origem: 'manual', grupoId: 'g1', contaId: 'ct1', conciliado: false, extratoId: null, criadoEm: agora - 3 * 86400000, autor: { tipo: 'profissional', nome: 'Davi', id: 'u-davi' } },
  );
  s.banco.movimentos.push(
    { id: 'bk1', contaId: 'ct1', em: dMes(5) + 10 * 3600000, tipo: 'debito', valor: 1200, descricao: 'Pix enviado: aluguel', contraparte: { nome: 'Imobiliária Serra', cpf: '' }, txid: null, e2e: 'E0000000001', importado: false },
    { id: 'bk2', contaId: 'ct1', em: dMes(8) + 9 * 3600000, tipo: 'debito', valor: 186.9, descricao: 'Pagamento de boleto: RGE Sul', contraparte: { nome: 'RGE Sul', cpf: '' }, txid: null, e2e: 'E0000000002', importado: false },
    { id: 'bk3', contaId: 'ct1', em: dFin(2) + 15 * 3600000, tipo: 'debito', valor: 320, descricao: 'Compra no débito: Distribuidora Auto Química', contraparte: { nome: 'Distribuidora Auto Química', cpf: '' }, txid: null, e2e: 'E0000000003', importado: false },
    { id: 'bk4', contaId: 'ct1', em: dFin(3) + 11 * 3600000, tipo: 'credito', valor: 40, descricao: 'Pix recebido', contraparte: { nome: 'Igor Filipin', cpf: '50397612877' }, txid: null, e2e: 'E0000000004', importado: false },
  );

  atribuirCodigos(s.servicos); atribuirCodigos(s.materiais.filter((m) => m.tipo === 'produto'));
  s.seq = 200;
  return s;
}

function fmtD(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
