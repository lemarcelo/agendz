/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atalho entre telas do Artifact: quem pede (ex.: o aviso "falta cadastrar o box" na Agenda) deixa a sub-aba de Estabelecimento que deve abrir; a tela a consome uma vez.
let pedida = null;
export const pedirAbaEstabelecimento = (aba) => { pedida = typeof aba === 'string' ? aba : null; };
export const consumirAbaEstabelecimento = () => { const a = pedida; pedida = null; return a; };
