/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:8fef20e3c5 */
// Modelos de mensagem no formato de template da Meta (variáveis posicionais {{1}}, {{2}}...).
import { TIPO_PADRAO } from './tipos.js';
import { modelosBarbearia } from '../tipos/barbearia/templates.js';
import { modelosEsteticaAutomotiva } from '../tipos/estetica_automotiva/templates.js';

export const CATEGORIAS = ['Utilidade', 'Marketing', 'Autenticação'];

// Modelos de mensagem que um estabelecimento novo já recebe: cada tipo tem o seu conjunto (pasta do tipo). Tipo novo = registrar aqui.
const MODELOS_DO_TIPO = { estetica_automotiva: modelosEsteticaAutomotiva, barbearia: modelosBarbearia };
export function modelosPadrao(tipo = TIPO_PADRAO) { return (MODELOS_DO_TIPO[tipo] || MODELOS_DO_TIPO[TIPO_PADRAO])(); }

const VAR = /\{\{(\d+)\}\}/g;

export function variaveisDoCorpo(corpo) {
  return [...String(corpo).matchAll(VAR)].map((m) => Number(m[1]));
}

// Regras de aprovação da Meta que dá para checar aqui.
export function validarModelo(corpo) {
  const erros = [];
  const t = String(corpo || '').trim();
  if (!t) return ['Escreva o texto da mensagem.'];
  if (/^\{\{\d+\}\}/.test(t)) erros.push('O texto não pode começar com uma variável.');
  if (/\{\{\d+\}\}[.!?…]*$/.test(t) && /\{\{\d+\}\}$/.test(t)) erros.push('O texto não pode terminar com uma variável.');
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(t)) erros.push('Duas variáveis não podem ficar coladas.');
  const vars = variaveisDoCorpo(t);
  const unicas = [...new Set(vars)].sort((a, b) => a - b);
  if (unicas.some((v, i) => v !== i + 1)) erros.push('As variáveis precisam ser {{1}}, {{2}}, {{3}}... em sequência.');
  if (/\{[^{]|[^}]\}/.test(t.replace(VAR, ''))) erros.push('Use chaves duplas nas variáveis, como {{1}}.');
  return erros;
}

export function renderizar(modelo, valores = []) {
  return String(modelo.corpo).replace(VAR, (_, n) => (valores[Number(n) - 1] ?? `{{${n}}}`));
}
