/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:153add4674 */
// Marcas de autoria e conferência do ambiente. Os valores __MARCA_*__ entram no build (build.mjs); sem build valem 'dev'.
// Nada aqui trava ou estraga o app: uma cópia fora dos endereços licenciados só deixa um registro discreto (veja verificarAmbiente).
/* global __MARCA_ID__, __MARCA_SIG__, __MARCA_ZW__, __HOSTS_LICENCIADOS__ */
export const MARCA = {
  id: typeof __MARCA_ID__ !== 'undefined' ? __MARCA_ID__ : 'dev',
  sig: typeof __MARCA_SIG__ !== 'undefined' ? __MARCA_SIG__ : '',
  zw: typeof __MARCA_ZW__ !== 'undefined' ? __MARCA_ZW__ : '',
};
// Acrescenta a marca invisível (zero-width) ao fim de um texto da interface. Em texto copiado e colado ela vai junto.
export const marcar = (texto) => `${texto}${MARCA.zw}`;

// Endereços onde o app pode rodar. Em produção, o build define a lista da Apex (AUTORIA_HOSTS). Os de teste e de publicação do Artifact já entram.
const PADRAO = ['localhost', '127.0.0.1', 'claude.ai', 'claudeusercontent.com', 'anthropic.com'];
export const hostsLicenciados = () => [...PADRAO, ...(typeof __HOSTS_LICENCIADOS__ !== 'undefined' ? __HOSTS_LICENCIADOS__ : [])];
const casa = (host, h) => host === h || host.endsWith(`.${h}`);

// Confere onde o app está rodando. Arquivo local (sem host) vale. Qualquer outro endereço fica registrado, sem aviso na tela e sem mudar o comportamento.
export function verificarAmbiente(loc) {
  const host = String((loc && loc.hostname) || '').toLowerCase();
  const protocolo = String((loc && loc.protocol) || '');
  if (!host || protocolo === 'file:') return { ok: true, host };
  return hostsLicenciados().some((h) => casa(host, h)) ? { ok: true, host } : { ok: false, host, marca: MARCA.id, motivo: 'host fora da lista licenciada' };
}
