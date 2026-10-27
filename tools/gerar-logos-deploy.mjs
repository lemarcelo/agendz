/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Gera deploy/logos/<slug>.txt (uma linha: o data URL da logo) a partir das constantes do front. Rode `node tools/gerar-logos-deploy.mjs` depois de trocar uma logo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { LOGO_APEX } from '../src/tipos/estetica_automotiva/logo-apex.js';
import { LOGO_DALFORNO } from '../src/tipos/barbearia/logo-dalforno.js';
import { LOGO_OFFBOX } from '../src/tipos/barbearia/logo-offbox.js';

export const LOGOS_DEPLOY = { apex: LOGO_APEX, dalforno: LOGO_DALFORNO, offbox: LOGO_OFFBOX };

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync('deploy/logos', { recursive: true });
  for (const [slug, logo] of Object.entries(LOGOS_DEPLOY)) writeFileSync(`deploy/logos/${slug}.txt`, `${logo}\n`);
  console.log(`logos geradas: ${Object.keys(LOGOS_DEPLOY).join(', ')}`);
}
