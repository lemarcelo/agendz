/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Gera backend/src/main/resources/catalogo/<tipo>.json: o expediente sugerido e os serviços de exemplo de cada tipo, para o assistente de primeiro acesso marcar.
// Vêm dos seeds do front (src/tipos/<tipo>/seed.js), a fonte única. Rode `node tools/gerar-catalogo.mjs` depois de mudar um seed;
// tests/catalogo.test.mjs falha se os arquivos divergirem. Combos ficam de fora (dependem de componentes que o servidor ainda não tem).
import { mkdirSync, writeFileSync } from 'node:fs';
import { criarEstadoBarbearia } from '../src/tipos/barbearia/seed.js';
import { criarEstadoInicial } from '../src/tipos/estetica_automotiva/seed.js';
import { catalogoDeEstado, expedienteDeEstado } from '../src/domain/catalogo.js';

const AGORA = Date.UTC(2026, 9, 12, 12, 0, 0); // fixo: o catálogo não pode mudar conforme o dia em que o gerador roda
const FONTES = { barbearia: () => criarEstadoBarbearia(AGORA), estetica_automotiva: () => criarEstadoInicial(AGORA) };

export function catalogoDoTipo(tipo) {
  const estado = FONTES[tipo]();
  return { tipo, expediente: expedienteDeEstado(estado), servicos: catalogoDeEstado(estado) };
}
export const TIPOS_DO_CATALOGO = Object.keys(FONTES);
export const caminhoDoCatalogo = (tipo) => `backend/src/main/resources/catalogo/${tipo}.json`;
export const textoDoCatalogo = (tipo) => `${JSON.stringify(catalogoDoTipo(tipo), null, 2)}\n`;

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync('backend/src/main/resources/catalogo', { recursive: true });
  for (const t of TIPOS_DO_CATALOGO) writeFileSync(caminhoDoCatalogo(t), textoDoCatalogo(t));
  console.log(`catálogos gerados: ${TIPOS_DO_CATALOGO.join(', ')}`);
}
