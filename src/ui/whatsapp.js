/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:185a3f8765 */
// Abre o WhatsApp numa aba nova com a mensagem pronta. Chame direto do clique (o navegador só deixa abrir nesse momento).
// Usa um link comum com target="_blank" (o caminho que vale também dentro do Artifact) e nunca sai da página do painel.
import { enderecosWhatsapp } from '../domain/whatsapp.js';

export function abrirWhatsapp(texto, telefone) {
  try {
    const a = document.createElement('a');
    a.href = enderecosWhatsapp(texto, telefone).wa; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return true;
  } catch { return false; }
}
