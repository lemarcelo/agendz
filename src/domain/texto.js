/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Texto digitado por pessoas: tira caracteres de controle e limita acentos/marcas empilhadas (texto "zalgo", sequências de vogais tailandesas etc.),
// que não quebram nada mas se espalham por cima das linhas vizinhas. Até 2 marcas seguidas cobrem qualquer idioma real.
export function limparTexto(v, max = 200) {
  if (typeof v !== 'string') return v;
  return v.normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .slice(0, max);
}
