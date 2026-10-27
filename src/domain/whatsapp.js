/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:51f51f76a0 */
// Endereço para abrir o WhatsApp com uma mensagem pronta (sem número: o dono escolhe o contato). Puro, sem tela.
const MAX_TEXTO = 400;

// Mensagem que vai junto com o link de agendamento.
export function textoConvite(nomeEstab, link) {
  const nome = String(nomeEstab ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const l = String(link ?? '').trim().slice(0, 200);
  return (nome ? `Agende seu horário na ${nome}: ${l}` : `Agende seu horário: ${l}`).slice(0, MAX_TEXTO);
}

// Endereço universal (https://wa.me): no celular abre o aplicativo; no computador abre o aplicativo instalado ou o WhatsApp Web.
// Nunca usar o esquema whatsapp:// no clique: em vários navegadores, sem aplicativo registrado, ele troca a tela do painel por uma página de erro em branco.
export function enderecosWhatsapp(texto) {
  const t = encodeURIComponent(String(texto ?? '').slice(0, MAX_TEXTO));
  return { wa: `https://wa.me/?text=${t}` };
}
