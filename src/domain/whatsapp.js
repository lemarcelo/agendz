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

// Mensagem padrão de reagendamento (o profissional remarcou o horário do cliente). Nome, serviço, novo dia e hora; endereço da loja só quando houver.
// `dataHora` já vem escrita (ex.: "sábado, 31 de outubro, às 14:00"). Sem cadastro de cliente ou sem telefone o painel nem pergunta.
export function textoReagendamento({ nomeEstab, nomeCliente, servicos, dataHora, endereco, mapaUrl }) {
  const limpa = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const primeiro = limpa(nomeCliente, 60).split(' ')[0];
  const loja = limpa(nomeEstab, 60);
  const sv = limpa(servicos, 120);
  const ende = limpa(endereco, 160);
  const mapa = String(mapaUrl ?? '').trim();
  let m = `Olá${primeiro ? `, ${primeiro}` : ''}! Precisamos reagendar o seu horário${loja ? ` na ${loja}` : ''}${sv ? ` (${sv})` : ''}.\nO novo horário é ${limpa(dataHora, 80)}.`;
  if (ende) m += `\n📍 ${ende}`;
  if (/^https:\/\/[^\s]{1,200}$/.test(mapa)) m += `\nComo chegar: ${mapa}`;
  m += '\nSe não puder nesse horário, é só responder por aqui.';
  return m.slice(0, MAX_TEXTO);
}

// Número do cliente no formato do wa.me (55 + DDD + número), ou '' quando não é um telefone brasileiro válido (aí o WhatsApp abre sem contato).
export function numeroWhatsapp(telefone) {
  const d = String(telefone ?? '').replace(/\D/g, '');
  const nac = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  return /^[1-9][0-9][2-9][0-9]{7,8}$/.test(nac) && (nac.length === 10 || nac[2] === '9') ? `55${nac}` : '';
}

// Endereço universal (https://wa.me): no celular abre o aplicativo; no computador abre o aplicativo instalado ou o WhatsApp Web.
// Nunca usar o esquema whatsapp:// no clique: em vários navegadores, sem aplicativo registrado, ele troca a tela do painel por uma página de erro em branco.
export function enderecosWhatsapp(texto, telefone) {
  const t = encodeURIComponent(String(texto ?? '').slice(0, MAX_TEXTO));
  const n = numeroWhatsapp(telefone);
  return { wa: `https://wa.me/${n}?text=${t}` };
}
