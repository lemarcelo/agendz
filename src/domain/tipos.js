/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Tipos de estabelecimento. O tipo é um perfil de capacidades e de rótulos, definido na CRIAÇÃO da loja e que nunca muda depois.
// Tipo novo = uma entrada nova em TIPOS (sem mexer nas telas). As telas perguntam a capacidade (`cap`) e pedem o rótulo (`rot`),
// nunca "é estética?". Spec: docs/F0-tipos-de-estabelecimento.md. No Spring Boot, TIPOS vira a tabela `tipo_estabelecimento`.

import { DEFINICAO as estetica } from '../tipos/estetica_automotiva/definicao.js';
import { DEFINICAO as barbearia } from '../tipos/barbearia/definicao.js';

export const TIPO_PADRAO = 'estetica_automotiva';

// Capacidades (D1): o que cada tipo usa. Telas e regras só aparecem quando a capacidade está ligada.
const CAPACIDADES = ['usaVeiculo', 'precoPorPorte', 'usaRecursoFisico', 'multiDia', 'prontoParaRetirada'];

// Rótulos (D2): { s: singular, p: plural, g: gênero 'm' | 'f' }. A forma capitalizada é derivada.
// Registro: cada tipo vive em src/tipos/<tipo>/definicao.js. Tipo novo = pasta nova + uma linha aqui.
export const TIPOS = Object.freeze({
  [estetica.id]: estetica,
  [barbearia.id]: barbearia,
});

export const NOMES_CAPACIDADE = Object.freeze([...CAPACIDADES]);
export const tipoValido = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(TIPOS, id);
export const listaDeTipos = () => Object.values(TIPOS).map((t) => ({ id: t.id, nome: t.nome }));

// Tipo de uma loja: o guardado, se for um tipo conhecido; senão o padrão (lojas antigas não têm o campo).
export const tipoDe = (estab) => (estab && tipoValido(estab.tipo) ? estab.tipo : TIPO_PADRAO);
export const cap = (estab, nome) => !!TIPOS[tipoDe(estab)].capacidades[nome];

const maiuscula = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
export function rotulo(estab, chave, { plural = false, capitalizado = false } = {}) {
  const r = TIPOS[tipoDe(estab)].rotulos[chave] || TIPOS[TIPO_PADRAO].rotulos[chave];
  if (!r) return '';
  const t = plural ? r.p : r.s;
  return capitalizado ? maiuscula(t) : t;
}
// Artigo de um rótulo ('o' ou 'a'), para frases como "Escolha o box" / "Escolha a cadeira".
export function artigo(estab, chave, { indefinido = false } = {}) {
  const r = TIPOS[tipoDe(estab)].rotulos[chave] || TIPOS[TIPO_PADRAO].rotulos[chave];
  const f = !!r && r.g === 'f';
  return indefinido ? (f ? 'uma' : 'um') : (f ? 'a' : 'o');
}

// Tipo ativo no navegador: a tela atende UMA loja por vez, então o store avisa aqui qual é o tipo dela (a cada mudança de estado).
// Os atalhos abaixo leem esse tipo, para textos de telas e de regras não precisarem carregar a loja em cada chamada.
let ativo = TIPO_PADRAO;
export const definirTipoAtivo = (estab) => { ativo = tipoDe(estab); };
export const tipoAtivo = () => ativo;
export const temaPadraoAtivo = () => TIPOS[ativo].visual.temaPadrao; // 'auto' | 'escuro' (diferença visual por tipo, registrada em docs/EQUIVALENCIA-BARBEARIA.md)
export const fundoAtivo = (escuro) => TIPOS[ativo].visual[escuro ? 'fundoEscuro' : 'fundoClaro']; // fundo do tema do tipo (o destaque é calculado contra ele)
// Frases e exemplos próprios do tipo (texto que muda de um tipo para outro e não é só um rótulo). `{nome}` é trocado pelo nome da loja.
export function vocabulario(estab, chave, vars = {}) {
  const v = TIPOS[tipoDe(estab)].vocab[chave] ?? TIPOS[TIPO_PADRAO].vocab[chave] ?? '';
  return Object.entries(vars).reduce((t, [k, x]) => t.replaceAll(`{${k}}`, x), v);
}
export const voc = (chave, vars) => vocabulario({ tipo: ativo }, chave, vars);
export const Voc = (chave, vars) => maiuscula(voc(chave, vars));
export const iconeMarcaAtivo = () => TIPOS[ativo].visual.iconeMarca; // ícone da marca quando a loja não tem logo
export const iconeServicosAtivo = () => TIPOS[ativo].visual.iconeServicos; // ícone do menu Serviços
export const exemploAtivo = () => TIPOS[ativo].exemplo;
export const capAtiva = (nome) => cap({ tipo: ativo }, nome);
export const rot = (chave) => rotulo({ tipo: ativo }, chave);
export const Rot = (chave) => rotulo({ tipo: ativo }, chave, { capitalizado: true });
export const rots = (chave) => rotulo({ tipo: ativo }, chave, { plural: true });
export const Rots = (chave) => rotulo({ tipo: ativo }, chave, { plural: true, capitalizado: true });
export const artigoAtivo = (chave, opcoes) => artigo({ tipo: ativo }, chave, opcoes);
