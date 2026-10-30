/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Login automático (v119): este é o ÚNICO ponto que guarda um token no aparelho, e só o token de REDE CONFIÁVEL (o que o servidor emitiu depois de a pessoa aceitar
// "logar automaticamente nesta rede"). Token comum (24 h) nunca é guardado. Tudo em try/catch (janela privada ou storage bloqueado = simplesmente não lembra).
// Fora da rede confiável o servidor só aceita o token por 24 h desde o login; "Sair", trocar a senha ou remover a rede derrubam o token no servidor.
const chave = (slug) => `agendz-rede:${String(slug || '').replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`;
const FORMATO = /^[\w-]{10,2000}\.[\w-]{10,2000}\.[\w-]{10,2000}$/;

export function lembrarSessaoDaRede(slug, token) {
  try { if (FORMATO.test(String(token))) globalThis.localStorage.setItem(chave(slug), token); } catch { /* sem storage: não lembra */ }
}
export function sessaoGuardada(slug) {
  try { const v = globalThis.localStorage.getItem(chave(slug)); return v && FORMATO.test(v) ? v : null; } catch { return null; }
}
export function esquecerSessaoDaRede(slug) {
  try { globalThis.localStorage.removeItem(chave(slug)); } catch { /* nada a esquecer */ }
}
