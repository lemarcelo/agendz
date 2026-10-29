/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:51f51f76a0 */
// Endereço para abrir o WhatsApp com uma mensagem pronta (sem número: o dono escolhe o contato). Puro, sem tela.
const MAX_TEXTO = 500;

// Mensagem que vai junto com o link de agendamento. `localizacaoUrl` (opcional, só quando a loja ligou o envio) vai numa linha à parte: o WhatsApp reconhece
// o link do mapa e mostra o cartão da localização. Só https é aceito.
export function textoConvite(nomeEstab, link, localizacaoUrl) {
  const nome = String(nomeEstab ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const l = String(link ?? '').trim().slice(0, 200);
  const base = nome ? `Agende seu horário na ${nome}: ${l}` : `Agende seu horário: ${l}`;
  const mapa = String(localizacaoUrl ?? '').trim();
  return (/^https:\/\/[^\s]{1,200}$/.test(mapa) ? `${base}\n📍 Como chegar: ${mapa}` : base).slice(0, MAX_TEXTO);
}

// Endereço universal (https://wa.me): no celular abre o aplicativo; no computador abre o aplicativo instalado ou o WhatsApp Web.
// Nunca usar o esquema whatsapp:// no clique: em vários navegadores, sem aplicativo registrado, ele troca a tela do painel por uma página de erro em branco.
export function enderecosWhatsapp(texto) {
  const t = encodeURIComponent(String(texto ?? '').slice(0, MAX_TEXTO));
  return { wa: `https://wa.me/?text=${t}` };
}
