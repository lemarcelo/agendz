/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Dados de exemplo do tipo BARBEARIA (copiados da Agenda Barbearia v64, só com o vocabulário interno do Agendz: barbeiro = profissionalId etc.).
// O que a API real devolveria. Tudo é gerado em relação ao "agora" para a agenda nunca ficar vazia.
import { atribuirCodigos } from '../../domain/codigo.js';
import { escalaPadrao, diaAberto, faixasDoDia } from '../../domain/schedule.js';
import { addDays, startOfDay, tsAt, MIN } from '../../domain/time.js';
import { modelosPadrao } from '../../domain/templates.js';
import { montarPlano } from '../../domain/rules.js';

export function criarEstadoBarbearia(agora) {
  const estab = {
    tipo: 'barbearia', // definido na criação da loja e nunca muda (domain/tipos.js)
    nome: 'Barbearia Dalforno',
    telefone: '(55) 99912-3456',
    email: 'contato@barbeariadalforno.com.br',
    ddds: [51, 53, 54, 55],
    visaoPadrao: 'semana',
    confirmacaoServico: false,
    camposObrigatorios: { futuro: [], local: [] }, // campos que o botão Atender exige em cada tipo (nome, telefone, esteticista, vendedor, formaPagamento)
    temaCor: 'padrao', // cor do tema: 'padrao' | 'logo' | id de PALETAS (domain/tema.js)
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
    escala: escalaPadrao(),
    calendario: { feriadosVinculado: false, feriadosNome: 'Feriados no Brasil', enviarEventos: true },
  };

  const usuarios = [
    { id: 'u-alan', nome: 'Alan Dalforno', apelido: 'Alan', cpf: '391.847.260-40', nascimento: '1990-04-12', email: 'alan@barbeariadalforno.com.br', telefone: '(55) 99701-1122', senha: '1234', papel: 'dono', permissoes: {}, atende: true, escala: escalaPadrao() },
    { id: 'u-kiko', nome: 'Kiko Gindri', apelido: 'Kiko', cpf: '724.093.518-32', nascimento: '1994-09-03', email: 'kiko@barbeariadalforno.com.br', telefone: '(55) 99644-3050', senha: '1234', papel: 'profissional', permissoes: {}, atende: true, escala: escalaPadrao() },
    { id: 'u-tailuan', nome: 'Tailuan', apelido: 'Tailuan', cpf: '158.602.947-94', nascimento: '1998-01-27', email: 'tailuan@barbeariadalforno.com.br', telefone: '(53) 99822-7741', senha: '1234', papel: 'profissional', permissoes: {}, atende: true, escala: escalaPadrao() },
  ];

  const servicos = [
    { id: 's-tesoura', nome: 'Corte somente tesoura', preco: 40, duracao: 40, intervalo: 10, antecedenciaH: 2, notificacoes: null, confirmacaoServico: null, materiais: [{ materialId: 'mt-papel', qtd: 1 }, { materialId: 'mt-pomada', qtd: 8 }] },
    { id: 's-maquina', nome: 'Corte na máquina', preco: 40, duracao: 40, intervalo: 10, antecedenciaH: 2, notificacoes: null, confirmacaoServico: null, materiais: [{ materialId: 'mt-papel', qtd: 1 }, { materialId: 'mt-pomada', qtd: 8 }] },
    { id: 's-degrade', nome: 'Corte Degradê', preco: 40, duracao: 40, intervalo: 10, antecedenciaH: 2, notificacoes: null, confirmacaoServico: null, materiais: [{ materialId: 'mt-papel', qtd: 1 }, { materialId: 'mt-pomada', qtd: 10 }] },
    { id: 's-barba', nome: 'Barba', preco: 35, duracao: 40, intervalo: 5, antecedenciaH: 1, notificacoes: null, confirmacaoServico: null, materiais: [{ materialId: 'mt-lamina', qtd: 1 }, { materialId: 'mt-espuma', qtd: 15 }] },
    { id: 's-barba-degrade', nome: 'Barba Degradê', preco: 35, duracao: 40, intervalo: 5, antecedenciaH: 1, notificacoes: null, confirmacaoServico: null, materiais: [{ materialId: 'mt-lamina', qtd: 1 }, { materialId: 'mt-espuma', qtd: 15 }, { materialId: 'mt-papel', qtd: 1 }] },
  ];

  const clientes = [
    { id: 'c-marcelo', nome: 'Marcelo Santos', apelido: 'Marcelo', cpf: '284.510.937-79', nascimento: '1988-06-21', telefone: '(55) 99711-4020' },
    { id: 'c-igor', nome: 'Igor Filipin', apelido: 'Igor', cpf: '503.976.128-77', nascimento: '1996-11-08', telefone: '(54) 99633-8812' },
    { id: 'c-jon', nome: 'Jon Paul Frigo', apelido: 'Jon', cpf: '', nascimento: '', telefone: '(51) 99588-3374' },
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
    materiais: [
      { id: 'mt-pomada', nome: 'Pomada modeladora', unidade: 'g', estoque: 500, minimo: 100, custo: 0.12, ativo: true },
      { id: 'mt-papel', nome: 'Papel para o pescoço', unidade: 'un', estoque: 200, minimo: 50, custo: 0.05, ativo: true },
      { id: 'mt-lamina', nome: 'Lâmina de barbear', unidade: 'un', estoque: 40, minimo: 10, custo: 1.2, ativo: true },
      { id: 'mt-espuma', nome: 'Espuma de barbear', unidade: 'ml', estoque: 800, minimo: 200, custo: 0.03, ativo: true },
      { id: 'pr-pomada', nome: 'Pomada modeladora 100 g (venda)', tipo: 'produto', preco: 45, comissaoPct: 10, unidade: 'un', estoque: 12, minimo: 3, custo: 22, ativo: true },
      { id: 'pr-oleo', nome: 'Óleo para barba 30 ml (venda)', tipo: 'produto', preco: 38, unidade: 'un', estoque: 8, minimo: 2, custo: 17, ativo: true },
    ],
    movimentosEstoque: [],
    financeiro: {
      // Contas da barbearia: cada uma com a sua chave Pix, API Pix e Open Finance. O grupo de movimentação diz qual conta é responsável.
      contas: [
        {
          id: 'ct1', apelido: 'Conta principal', banco: 'Sicredi', agencia: '0101', conta: '12345-6',
          pix: { tipoChave: 'aleatoria', chave: '5f8d2c1e-7a34-4b9e-9c06-3e1b8a7d4f52', recebedor: 'Barbearia Dalforno', cidade: 'Passo Fundo', validadeH: 24 },
          apiPix: { banco: null, ambiente: 'homologacao', urlBase: '', clientId: '', clientSecret: '', certificadoNome: '', chavePrivadaNome: '', cadeiaNome: '', appKey: '', escopos: ['cob.write', 'cob.read', 'pix.read', 'webhook.write'], webhookUrl: 'https://api.barbeariadalforno.com.br/webhooks/pix', ativa: false, testadoEm: null },
          openFinance: { conectado: false, consentimentoEm: null, validoAte: null, ultimaSync: null },
        },
        {
          id: 'ct2', apelido: 'Conta de fornecedores', banco: 'Banco do Brasil', agencia: '3322', conta: '98765-4',
          pix: { tipoChave: 'aleatoria', chave: 'c9a41d07-2b6e-4f3a-8d15-7e0b92f6a3c8', recebedor: 'Barbearia Dalforno', cidade: 'Passo Fundo', validadeH: 24 },
          apiPix: { banco: null, ambiente: 'homologacao', urlBase: '', clientId: '', clientSecret: '', certificadoNome: '', chavePrivadaNome: '', cadeiaNome: '', appKey: '', escopos: ['cob.write', 'cob.read', 'pix.read', 'webhook.write'], webhookUrl: 'https://api.barbeariadalforno.com.br/webhooks/pix', ativa: false, testadoEm: null },
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
      { id: 'cp-corte', chave: 'CRTE-VALE-4M7X', nome: 'Vale corte', tipo: 'servico', servicoIds: ['s-tesoura', 's-maquina', 's-degrade'], percentual: null, valor: null, inicio: startOfDay(agora - 7 * 86400000), fim: startOfDay(agora + 60 * 86400000), usosMax: 50, usosPorCliente: 1, ativo: true, criadoEm: agora - 7 * 86400000, autor: { nome: 'Alan', id: 'u-alan' } },
      { id: 'cp-barba', chave: 'BARB-AVAL-E2K9', nome: 'Vale barba', tipo: 'servico', servicoIds: ['s-barba', 's-barba-degrade'], percentual: null, valor: null, inicio: startOfDay(agora - 7 * 86400000), fim: startOfDay(agora + 60 * 86400000), usosMax: 50, usosPorCliente: 1, ativo: true, criadoEm: agora - 6 * 86400000, autor: { nome: 'Alan', id: 'u-alan' } },
      { id: 'cp-dez', chave: 'DEZP-ARCT-8K3H', nome: '10% de desconto', tipo: 'percentual', servicoIds: [], percentual: 10, valor: null, inicio: startOfDay(agora - 7 * 86400000), fim: startOfDay(agora + 60 * 86400000), usosMax: 100, usosPorCliente: 1, ativo: true, criadoEm: agora - 5 * 86400000, autor: { nome: 'Alan', id: 'u-alan' } },
    ],
    cuponsTentativas: {},
    agendamentos: [],
    modelos: modelosPadrao('barbearia'),
    mensagensCliente: [],
    avisosPainel: [],
    pedidosVinculo: [],
    recuperacoes: [],
  };

  let n = 0;
  const novo = (o) => {
    const a = {
      id: `a${++n}`, encaixe: false, reagendado: false, origem: 'whatsapp', faltaConfirmacao: null, servicosFeitos: null, motivoCancelamento: null,
      criadoEm: agora - 3 * 24 * 60 * MIN, plano: [], log: [], precos: {}, acrescimos: {}, estoqueBaixado: null, ...o,
    };
    a.inicio = tsAt(a.dia, a.hora);
    delete a.dia; delete a.hora;
    if (!o.plano) {
      const sv = servicos.filter((x) => a.servicoIds.includes(x.id));
      const plano = montarPlano({ inicio: a.inicio, servicos: sv, estab, agora: a.criadoEm });
      a.plano = a.status === 'a_confirmar' ? plano : plano.map((p) => ({ ...p, estado: 'pulada' }));
    }
    s.agendamentos.push(a);
    return a;
  };
  const sis = { tipo: 'sistema', nome: 'Sistema' };
  const cli = (id) => { const c = clientes.find((x) => x.id === id); return { tipo: 'cliente', nome: c.apelido, id }; };

  // Concluídos (passado): dão o "Último atendimento" dos clientes.
  novo({ clienteId: 'c-marcelo', profissionalId: 'u-kiko', servicoIds: ['s-maquina', 's-barba'], status: 'concluido', dia: dia(-4), hora: '09:00', servicosFeitos: ['s-maquina', 's-barba'], acrescimos: { 's-maquina': 10 }, log: [
    { id: 'l1', em: agora - 5 * 86400000, autor: cli('c-marcelo'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l2', em: agora - 4 * 86400000, autor: sis, campo: 'status', de: 'Confirmado', para: 'Concluído (automático)' },
  ] });
  novo({ clienteId: 'c-jon', profissionalId: 'u-tailuan', servicoIds: ['s-degrade'], status: 'concluido', dia: dia(-1), hora: '15:00', servicosFeitos: ['s-degrade'], log: [
    { id: 'l3', em: agora - 3 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' },
  ] });

  novo({ clienteId: 'c-igor', profissionalId: 'u-alan', servicoIds: ['s-tesoura', 's-barba'], status: 'concluido', dia: dia(-2), hora: '10:00', servicosFeitos: ['s-tesoura', 's-barba'], acrescimos: { 's-tesoura': 5 }, log: [
    { id: 'l20', em: agora - 4 * 86400000, autor: cli('c-igor'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l21', em: agora - 4 * 86400000, autor: { tipo: 'profissional', nome: 'Alan', id: 'u-alan' }, campo: 'acréscimo', de: 'sem acréscimo', para: 'Corte somente tesoura: R$ 5,00' },
  ] });
  novo({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-barba'], status: 'concluido', dia: dia(-3), hora: '15:00', servicosFeitos: ['s-barba'], log: [
    { id: 'l22', em: agora - 5 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' },
  ] });

  // Um de cada status.
  novo({ clienteId: 'c-igor', profissionalId: 'u-alan', servicoIds: ['s-tesoura'], status: 'confirmado', dia: dia(1), hora: '10:00', log: [
    { id: 'l4', em: agora - 86400000, autor: cli('c-igor'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l5', em: agora - 3600000, autor: cli('c-igor'), campo: 'status', de: 'A confirmar', para: 'Confirmado' },
  ] });
  novo({ clienteId: 'c-marcelo', profissionalId: 'u-kiko', servicoIds: ['s-degrade', 's-barba-degrade'], status: 'a_confirmar', dia: dia(2), hora: '14:00', log: [
    { id: 'l6', em: agora - 7200000, autor: cli('c-marcelo'), campo: 'criação', de: null, para: 'agendamento criado' },
  ] });
  novo({ clienteId: 'c-jon', profissionalId: 'u-alan', servicoIds: ['s-barba'], status: 'cancelado', motivoCancelamento: 'profissional', dia: dia(2), hora: '16:00', log: [
    { id: 'l7', em: agora - 2 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l8', em: agora - 3600000, autor: { tipo: 'profissional', nome: 'Alan', id: 'u-alan' }, campo: 'status', de: 'A confirmar', para: 'Cancelado' },
  ] });
  // Remarcado (etiqueta laranja).
  const d3 = dia(3);
  novo({ clienteId: 'c-igor', profissionalId: 'u-tailuan', servicoIds: ['s-maquina'], status: 'a_confirmar', reagendado: true, dia: d3, hora: '09:00', log: [
    { id: 'l9', em: agora - 2 * 86400000, autor: cli('c-igor'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l10', em: agora - 3600000, autor: cli('c-igor'), campo: 'data e hora', de: `${fmtD(addDays(d3, -1))} às 09:00`, para: `${fmtD(d3)} às 09:00` },
  ] });
  // A confirmar, sem resposta (vermelho): todas as notificações já foram enviadas.
  const dRed = dia(1);
  novo({ clienteId: 'c-jon', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], status: 'a_confirmar', dia: dRed, hora: '16:00', plano: [
    { idx: 0, tipo: 'pergunta', programado: tsAt(addDays(dRed, -1), '17:00'), enviarEm: tsAt(addDays(dRed, -1), '17:00'), estado: 'enviada', enviadaEm: null },
    { idx: 1, tipo: 'aviso', programado: tsAt(dRed, '14:00'), enviarEm: tsAt(dRed, '14:00'), estado: 'enviada', enviadaEm: null },
  ], log: [{ id: 'l11', em: agora - 4 * 86400000, autor: cli('c-jon'), campo: 'criação', de: null, para: 'agendamento criado' }] });
  // Um cliente com horário de manhã de hoje/próximo dia para dar vida ao "Hoje".
  novo({ clienteId: 'c-marcelo', profissionalId: 'u-alan', servicoIds: ['s-degrade'], status: 'confirmado', dia: dia(0), hora: '14:30', log: [
    { id: 'l12', em: agora - 2 * 86400000, autor: cli('c-marcelo'), campo: 'criação', de: null, para: 'agendamento criado' },
    { id: 'l13', em: agora - 86400000, autor: cli('c-marcelo'), campo: 'status', de: 'A confirmar', para: 'Confirmado' },
  ] });

  // Financeiro de exemplo: duas despesas lançadas à mão e movimentos do banco que o Open Finance ainda vai importar.
  const dFin = (n) => startOfDay(agora - n * 86400000);
  const dMes = (d) => { const x = new Date(agora); x.setDate(d); return startOfDay(Math.min(x.getTime(), agora)); };
  s.financeiro.lancamentos.push(
    { id: 'f1', tipo: 'despesa', descricao: 'Aluguel do salão', valor: 1200, data: dMes(5), categoria: 'Aluguel', origem: 'manual', grupoId: 'g1', contaId: 'ct1', conciliado: false, extratoId: null, criadoEm: agora - 6 * 86400000, autor: { tipo: 'profissional', nome: 'Alan', id: 'u-alan' } },
    { id: 'f2', tipo: 'despesa', descricao: 'Conta de luz', valor: 186.9, data: dMes(8), categoria: 'Energia e água', origem: 'manual', grupoId: 'g1', contaId: 'ct1', conciliado: false, extratoId: null, criadoEm: agora - 3 * 86400000, autor: { tipo: 'profissional', nome: 'Alan', id: 'u-alan' } },
  );
  s.banco.movimentos.push(
    { id: 'bk1', contaId: 'ct1', em: dMes(5) + 10 * 3600000, tipo: 'debito', valor: 1200, descricao: 'Pix enviado: aluguel', contraparte: { nome: 'Imobiliária Serra', cpf: '' }, txid: null, e2e: 'E0000000001', importado: false },
    { id: 'bk2', contaId: 'ct1', em: dMes(8) + 9 * 3600000, tipo: 'debito', valor: 186.9, descricao: 'Pagamento de boleto: RGE Sul', contraparte: { nome: 'RGE Sul', cpf: '' }, txid: null, e2e: 'E0000000002', importado: false },
    { id: 'bk3', contaId: 'ct1', em: dFin(2) + 15 * 3600000, tipo: 'debito', valor: 320, descricao: 'Compra no débito: Distribuidora Barber', contraparte: { nome: 'Distribuidora Barber', cpf: '' }, txid: null, e2e: 'E0000000003', importado: false },
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
