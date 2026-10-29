/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Localização (GPS) da loja: lê latitude e longitude de um texto colado (as duas separadas por vírgula, ou um link do Google Maps) e confere a faixa.
// Puro, sem tela. O link do mapa que vai no WhatsApp e na página do cliente é montado pelo servidor; aqui só se interpreta o que a pessoa cola.
const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PADROES = [
  new RegExp(`!3d${NUM}!4d${NUM}`),               // link longo do Maps (ponto marcado)
  new RegExp(`@${NUM},${NUM}`),                   // https://www.google.com/maps/@-25.4,-49.2,17z e /place/.../@lat,lng
  new RegExp(`[?&](?:q|ll|query|destination)=${NUM}(?:,|%2C)\\s*${NUM}`), // ?q=lat,lng
  new RegExp(`^\\s*${NUM}\\s*[,;]\\s*${NUM}\\s*$`), // "lat, lng" colado direto (como o Maps copia ao tocar no ponto)
];

export const latitudeValida = (n) => Number.isFinite(n) && n >= -90 && n <= 90;
export const longitudeValida = (n) => Number.isFinite(n) && n >= -180 && n <= 180;

// Devolve { lat, lng } (6 casas) ou null. Aceita vírgula decimal só no formato "lat, lng" com ponto; nunca inventa valor.
export function coordenadasDeTexto(texto) {
  const t = String(texto ?? '').trim().slice(0, 2000);
  if (!t) return null;
  for (const re of PADROES) {
    const m = re.exec(t);
    if (!m) continue;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (latitudeValida(lat) && longitudeValida(lng)) return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
  }
  return null;
}

// Parte de um link https depois de "https://" (vazio se não for https ou tiver espaço). Quem monta o href escreve `https://${caminhoHttps(url)}`, então nunca sai
// javascript: nem http: (regra de tests/security.test.mjs).
export const caminhoHttps = (url) => { const m = /^https:\/\/([^\s]{1,300})$/.exec(String(url ?? '')); return m ? m[1] : ''; };
