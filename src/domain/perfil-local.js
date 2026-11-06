/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Dados que o cliente digitou no #agendar (nome, telefone, veículo), guardados só no navegador dele para preencher o formulário da próxima vez.
// Puro: recebe e devolve texto/objeto; quem lê e grava o localStorage é a página. Sem cupom, sem token, sem nada da agenda.
const CAMPOS = { nome: 60, tel: 16, placa: 8, modelo: 40, marca: 30, cor: 20, porte: 20 };
const limpa = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export const chavePerfil = (slug) => `agendz-perfil-${String(slug || 'loja').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`;

export function lerPerfil(texto) {
  let v = null;
  try { v = JSON.parse(texto || 'null'); } catch { v = null; }
  const saida = {};
  for (const [k, max] of Object.entries(CAMPOS)) saida[k] = v && typeof v === 'object' ? limpa(v[k], max) : '';
  return saida;
}

// Junta o que já estava guardado com o que foi enviado; campo vazio no envio não apaga o que havia.
export function mesclarPerfil(antigo, novo) {
  const saida = { ...lerPerfil(JSON.stringify(antigo || {})) };
  for (const [k, max] of Object.entries(CAMPOS)) { const t = limpa(novo && novo[k], max); if (t) saida[k] = t; }
  return saida;
}
