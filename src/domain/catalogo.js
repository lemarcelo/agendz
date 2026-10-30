/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Catálogo de serviços de exemplo de um tipo (assistente de primeiro acesso), derivado dos serviços de um estado de seed.
// Mesma função no gerador dos arquivos do back-end (tools/gerar-catalogo.mjs) e na pré-visualização do Artifact. Combos ficam de fora.
import { PRODUTOS_DE_EXEMPLO as PRODUTOS_BARBEARIA } from '../tipos/barbearia/produtos.js';
import { MODELOS_DE_PLANO as MODELOS_BARBEARIA } from '../tipos/barbearia/planos.js';
import { MODELOS_DE_PLANO as MODELOS_ESTETICA } from '../tipos/estetica_automotiva/planos.js';
import { PRODUTOS_DE_EXEMPLO as PRODUTOS_ESTETICA } from '../tipos/estetica_automotiva/produtos.js';
import { CATEGORIAS_DO_SEED as CATEGORIAS_BARBEARIA, ORDEM_DE_CATEGORIAS as ORDEM_BARBEARIA, SERVICOS_DE_EXEMPLO as EXTRAS_BARBEARIA } from '../tipos/barbearia/catalogo.js';

export function catalogoDeEstado(estado) {
  return (estado.servicos || []).filter((s) => !s.combo).map((s) => ({
    chave: s.id, nome: s.nome, categoria: s.categoria || null, preco: s.preco, duracaoMin: s.duracao, intervaloMin: s.intervalo ?? 0, multiDia: !!s.multiDia,
    precos: s.precos || null, duracoes: s.duracoes || null,
  }));
}

// Expediente sugerido do tipo (semana do estabelecimento do seed): { semana: { 0..6: { aberto, faixas: [['09:00','20:00']] } } }.
export function expedienteDeEstado(estado) {
  const semana = {};
  for (let d = 0; d < 7; d++) {
    const dia = estado.estabelecimento.escala.semana[d];
    semana[d] = { aberto: !!dia.aberto, faixas: dia.aberto ? dia.faixas.map(([a, b]) => [a, b]) : [] };
  }
  return { semana };
}

// Serviços de exemplo extras de cada tipo (além dos do seed), a categoria dos que já existem no seed e a ordem das categorias.
// Tipo sem entrada aqui usa só o seed.
const EXTRAS_DO_TIPO = { barbearia: { extras: EXTRAS_BARBEARIA, categorias: CATEGORIAS_BARBEARIA, ordem: ORDEM_BARBEARIA } };

// Catálogo completo do assistente de primeiro acesso: serviços do seed do tipo (com a categoria sugerida) + os extras que o seed não tem (por nome, sem repetir),
// agrupados por categoria na ordem do tipo. Mesma função no gerador dos arquivos do back-end, na pré-visualização e no Reconfigurar do Artifact.
export function catalogoDoTipo(tipo, estadoDoSeed) {
  const x = EXTRAS_DO_TIPO[tipo] || { extras: [], categorias: {}, ordem: [] };
  const base = catalogoDeEstado(estadoDoSeed).map((s) => ({ ...s, categoria: s.categoria || x.categorias[s.chave] || null }));
  const nomes = new Set(base.map((s) => s.nome.toLowerCase()));
  const extras = x.extras.filter((e) => !nomes.has(e.nome.toLowerCase())).map((e) => ({
    chave: e.id, nome: e.nome, categoria: e.categoria || null, preco: e.preco, duracaoMin: e.duracao, intervaloMin: e.intervalo ?? 0, multiDia: false, precos: null, duracoes: null,
  }));
  const lista = [...base, ...extras];
  if (!x.ordem.length) return lista;
  const pos = (c) => { const i = x.ordem.indexOf(c); return i < 0 ? x.ordem.length : i; };
  return lista.map((s, i) => [s, i]).sort((a, b) => pos(a[0].categoria) - pos(b[0].categoria) || a[1] - b[1]).map(([s]) => s);
}

// Produtos para vender sugeridos pelo assistente (por tipo; sem entrada = lista vazia, o dono descreve os próprios). Cópia nova a cada chamada.
const PRODUTOS_DO_TIPO = { barbearia: PRODUTOS_BARBEARIA, estetica_automotiva: PRODUTOS_ESTETICA };
export function produtosDoTipo(tipo) {
  return (PRODUTOS_DO_TIPO[tipo] || []).map((p) => ({ chave: p.chave, nome: p.nome, preco: p.preco }));
}

// Modelos de plano mensal por tipo (botão "Usar modelo" em Planos; sem entrada = lista vazia e o botão nem aparece). Cópia nova a cada chamada.
const MODELOS_DE_PLANO_DO_TIPO = { barbearia: MODELOS_BARBEARIA, estetica_automotiva: MODELOS_ESTETICA };
export function modelosDePlanoDoTipo(tipo) {
  return (MODELOS_DE_PLANO_DO_TIPO[tipo] || []).map((m) => ({ observacoes: '', produtos: [], validadeMeses: 0, ...m, servicos: [...m.servicos], produtos: [...(m.produtos || [])] }));
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Preenche o formulário de plano a partir de um modelo: os serviços da loja (ativos, sem combo) cujo nome bate com os do modelo, no máximo 10.
// Não grava nada; `faltou` diz se a loja não tem nenhum dos serviços do modelo (o dono escolhe à mão).
export function formularioDoModelo(modelo, servicosDaLoja, materiaisDaLoja = []) {
  const nomes = new Set(modelo.servicos.map(semAcento));
  const achados = (servicosDaLoja || []).filter((x) => x.ativo !== false && !x.combo && nomes.has(semAcento(x.nome))).slice(0, 10);
  const pn = (modelo.produtos || []).map(semAcento);
  const prods = (materiaisDaLoja || []).filter((x) => x.tipo === 'produto' && x.ativo !== false && pn.some((n) => semAcento(x.nome).startsWith(n))).slice(0, 10);
  return {
    form: { nome: modelo.nome, descricao: modelo.descricao, observacoes: modelo.observacoes || '', preco: modelo.preco, cortes: modelo.cortes, servicoIds: achados.map((x) => x.id), produtoIds: prods.map((x) => x.id), validadeMeses: modelo.validadeMeses || 0, adianta: modelo.adianta, acumuloMeses: modelo.acumuloMeses, intervaloDias: modelo.intervaloDias, ativo: true },
    faltou: achados.length === 0,
  };
}
