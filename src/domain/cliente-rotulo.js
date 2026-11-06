/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco C: como o cliente aparece na agenda, no Atender e nas listas. Apelido é o que identifica; sem apelido, o nome; NUNCA o telefone.
// Cadastro criado só com telefone (`semNome`) guarda o telefone no campo nome para respeitar a unicidade (loja + telefone + nome): esse "nome" não é nome.
export const SEM_NOME = 'Sem nome';
const limpo = (x) => String(x == null ? '' : x).trim();

// Nome de verdade do cadastro, ou '' quando o campo guarda só o telefone.
export const nomeReal = (c) => (!c || c.semNome ? '' : limpo(c.nome));

// Rótulo curto de cartões e listas: apelido > nome > "Sem nome".
export const rotuloDoCliente = (c) => limpo(c && c.apelido) || nomeReal(c) || SEM_NOME;
