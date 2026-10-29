/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Regras puras do formulário Atender do site real (F2 parte 5c). A decisão de verdade é do servidor (POST /api/atendimentos); aqui só o que a tela
// precisa saber antes de enviar: se é atendimento já feito ou agendamento, se o dia é anterior a hoje (pede motivo) e o resumo de serviços.
import { startOfDay } from './time.js';
import { PORTE_PADRAO, placaValida, porteValido } from './veiculos.js';

const MARGEM_MS = 60000; // mesma tolerância do servidor: até 1 minuto à frente ainda é "agora"

// 'futuro' = agendamento; 'local' = atendimento já feito (agora ou passado). Sem data é agora.
export function tipoDoAtendimento(inicio, agora) {
  return Number.isFinite(inicio) && inicio > agora + MARGEM_MS ? 'futuro' : 'local';
}

// Lançamento de um dia anterior a hoje: exige o motivo e é só do dono/recepção.
export const ehRetroativo = (inicio, agora) => Number.isFinite(inicio) && tipoDoAtendimento(inicio, agora) === 'local' && inicio < startOfDay(agora);

// Regras do Atender (Estabelecimento > Regras, no servidor: GET /api/estabelecimento/regras-atendimento). De fábrica: agendamento pede nome e telefone
// (o aviso do horário vai por telefone), atendimento local não pede nada e a forma padrão é Pix.
export const FORMAS_PAGAMENTO = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão']];
export const CAMPOS_DO_ATENDER = { nome: 'nome', telefone: 'telefone', profissional: 'profissional', vendedor: 'vendedor', formaPagamento: 'forma de pagamento' };
export const REGRAS_DE_FABRICA = { formaPagamentoPadrao: 'pix', futuro: ['nome', 'telefone'], local: [] };
export const formaValida = (f) => FORMAS_PAGAMENTO.some(([k]) => k === f);

// Forma que vale para o atendimento local: a escolhida ou o padrão. '' = sem padrão e nada escolhido (precisa escolher).
export function formaEfetiva(regras, escolhida) {
  if (escolhida) return formaValida(escolhida) ? escolhida : '';
  const r = regras || REGRAS_DE_FABRICA;
  return formaValida(r.formaPagamentoPadrao) ? r.formaPagamentoPadrao : '';
}

// Campos obrigatórios que ainda faltam (na ordem das regras), com o rótulo que a tela mostra. O servidor confere de novo.
// O que o formulário já traz por padrão (profissional escolhido, vendedor, forma padrão) conta como preenchido.
export function camposFaltando(tipo, { nome, telefone, cliente, profissionalId, vendedorId, temProdutos, forma }, regras = REGRAS_DE_FABRICA) {
  const tem = {
    nome: !!(String(nome || '').trim() || (cliente && !cliente.semNome)),
    telefone: String(telefone || '').replace(/\D/g, '').length >= 10 || !!cliente,
    profissional: !!profissionalId,
    vendedor: !temProdutos || !!vendedorId,
    formaPagamento: tipo === 'futuro' || !!forma,
  };
  const lista = (regras && Array.isArray(regras[tipo]) ? regras[tipo] : REGRAS_DE_FABRICA[tipo]) || [];
  return lista.filter((k) => tem[k] === false).map((k) => CAMPOS_DO_ATENDER[k]);
}

// Campos que as regras exigem em cada tipo (para marcar com * no formulário).
export const exige = (regras, tipo, campo) => ((regras && regras[tipo]) || REGRAS_DE_FABRICA[tipo] || []).includes(campo);

// Preço e duração do serviço no porte do veículo (estética: `precos`/`duracoes` por porte; sem o mapa ou sem porte, os do cadastro, que são os do médio).
// Só para mostrar: o servidor recalcula e congela.
export function servicoNoPorte(s, porte) {
  if (!s.precos && !s.duracoes) return { preco: Number(s.preco) || 0, duracaoMin: Number(s.duracaoMin) || 0 };
  const p = porteValido(porte) ? porte : PORTE_PADRAO;
  const preco = s.precos ? Number(s.precos[p]) : NaN;
  const dur = s.duracoes ? Number(s.duracoes[p]) : NaN;
  return { preco: Number.isFinite(preco) && preco >= 0 ? preco : Number(s.preco) || 0, duracaoMin: Number.isFinite(dur) && dur > 0 ? dur : Number(s.duracaoMin) || 0 };
}

// Soma de preço e minutos dos serviços marcados (só para mostrar; o servidor recalcula). `porte` só conta onde o serviço tem preço por porte.
export function resumoDosServicos(servicos, ids, porte) {
  const marcados = servicos.filter((s) => ids.includes(s.id)).map((s) => servicoNoPorte(s, porte));
  return { qtd: marcados.length, total: marcados.reduce((t, s) => t + s.preco, 0), minutos: marcados.reduce((t, s) => t + s.duracaoMin, 0) };
}

// ---------- estética: veículo e box (V25) ----------
// Veículo novo digitado no Atender: placa válida (antiga ou Mercosul), modelo e porte. Devolve o aviso ou ''. O servidor confere de novo.
export function faltaVeiculoNovo(v) {
  if (!v || !String(v.placa || '').trim()) return 'Informe a placa do veículo.';
  if (!placaValida(v.placa)) return 'Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23).';
  if (!String(v.modelo || '').trim()) return 'Informe o modelo do veículo.';
  if (!porteValido(v.porte)) return 'Escolha o porte do veículo.';
  return '';
}

// Serviço exige veículo; só produto, não. Devolve o aviso ou '' (`escolhido` = veículo já cadastrado, `novo` = o digitado).
export function faltaVeiculo(usaVeiculo, servicoIds, escolhido, novo) {
  if (!usaVeiculo || servicoIds.length === 0) return '';
  if (escolhido) return '';
  return novo ? faltaVeiculoNovo(novo) : 'Escolha o veículo do atendimento.';
}

// Porte que vale para o resumo: o do veículo escolhido, o do digitado ou o médio.
export const porteDoAtendimento = (escolhido, novo) => (escolhido && porteValido(escolhido.porte) ? escolhido.porte : novo && porteValido(novo.porte) ? novo.porte : PORTE_PADRAO);

// Boxes que o formulário pode oferecer: só os ativos.
export const boxesAtivos = (boxes) => (boxes || []).filter((b) => b.ativo !== false);

// Editor de boxes (Estabelecimento > Boxes): devolve o aviso ou '' antes de enviar. O servidor confere de novo (1 a 20, nome até 30, sem repetir, ao menos um ativo).
export function erroDosBoxes(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return 'Cadastre ao menos um box.';
  if (lista.length > 20) return 'No máximo 20 boxes.';
  const vistos = new Set();
  for (const b of lista) {
    const nome = String(b.nome || '').trim();
    if (!nome || nome.length > 30) return 'Dê um nome de até 30 letras a cada box.';
    if (vistos.has(nome.toLowerCase())) return 'Dois boxes têm o mesmo nome.';
    vistos.add(nome.toLowerCase());
  }
  if (!lista.some((b) => b.ativo !== false)) return 'Deixe ao menos um box ativo.';
  return '';
}

// Busca por nome ou código na lista de serviços (sem diferenciar acento nem maiúscula).
const limpo = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function filtrarServicos(servicos, busca) {
  const q = limpo(busca).trim();
  return q ? servicos.filter((s) => limpo(s.nome).includes(q) || limpo(s.codigo).includes(q)) : servicos;
}

// ---------- produtos (5d-4a) ----------
// Busca por nome ou código na lista de produtos (mesma regra dos serviços).
export const filtrarProdutos = (produtos, busca) => {
  const q = limpo(busca).trim();
  return q ? produtos.filter((p) => limpo(p.nome).includes(q) || limpo(p.codigo).includes(q)) : produtos;
};

// Quantidade dentro do que o servidor aceita (1 a 999, inteira); vazio ou inválido volta a 1.
export const qtdValida = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(999, Math.max(1, n)) : 1; };

// Soma dos produtos escolhidos (`itens` = [{ materialId, qtd }]), só para mostrar: o servidor congela o preço e confere o estoque.
export function resumoDosProdutos(produtos, itens) {
  let qtd = 0, total = 0;
  for (const it of itens) {
    const p = produtos.find((x) => x.id === it.materialId);
    if (!p) continue;
    qtd += it.qtd;
    total += (Number(p.preco) || 0) * it.qtd;
  }
  return { linhas: itens.length, qtd, total: Math.round(total * 100) / 100 };
}

// Quem vende por padrão: quem está lançando, se pode vender; senão quem atende; senão o primeiro que pode vender. Vazio se ninguém pode.
export function vendedorPadrao(equipe, meuId, profissionalId) {
  const pode = equipe.filter((p) => p.podeVender !== false);
  return (pode.find((p) => p.id === meuId) || pode.find((p) => p.id === profissionalId) || pode[0] || {}).id || '';
}

// Pode enviar? Serviço ou produto; horário futuro exige serviço (produto sozinho só no atendimento de agora). Devolve o aviso ou ''.
export function faltaItem(tipo, servicoIds, produtos) {
  if (servicoIds.length === 0 && produtos.length === 0) return 'Escolha ao menos um serviço ou um produto.';
  if (tipo === 'futuro' && servicoIds.length === 0) return 'Para agendar um horário futuro, escolha ao menos um serviço. Produto sozinho só no atendimento de agora.';
  return '';
}
