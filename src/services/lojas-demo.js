/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Lojas (tenants) de demonstração do protótipo. No sistema real isto é a tabela `loja` + `loja_dominio` no PostgreSQL (F1): cada loja tem
// `slug`, `tipo` (definido na criação, nunca muda) e os domínios que apontam para ela. Docs: docs/F1-lojas-por-dns.md.
import { criarEstadoInicial } from '../tipos/estetica_automotiva/seed.js';
import { criarEstadoBarbearia } from '../tipos/barbearia/seed.js';
import { LOGO_DALFORNO } from '../tipos/barbearia/logo-dalforno.js';
import { LOGO_OFFBOX } from '../tipos/barbearia/logo-offbox.js';
import { PESSOAS_POR_LOJA } from './pessoas-demo.js';
import { resolverLoja, slugValido } from '../domain/tenant.js';

// Segunda barbearia da demonstração: mesmos dados de exemplo da barbearia, com o nome e o e-mail trocados (são dados fictícios; os reais entram na F1).
const trocarTextos = (v, pares) => {
  if (typeof v === 'string') return pares.reduce((s, [de, para]) => s.replaceAll(de, para), v);
  if (Array.isArray(v)) return v.map((x) => trocarTextos(x, pares));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trocarTextos(x, pares)]));
  return v;
};
// Cada loja tem a própria logo (a seed do tipo barbearia não traz logo: é a base das duas lojas).
// Build de equivalência (AGENDZ_TIPO fixo, usado pela suíte da barbearia v64): sem logo, como na v64 (docs/EQUIVALENCIA-BARBEARIA.md).
const TIPO_FIXO = (typeof __AGENDZ_TIPO__ !== 'undefined' ? __AGENDZ_TIPO__ : (typeof process !== 'undefined' && process.env ? process.env.AGENDZ_TIPO : '')) || '';
const comLogo = (estado, logo) => (TIPO_FIXO ? estado : { ...estado, estabelecimento: { ...estado.estabelecimento, logo } });
const criarEstadoDalforno = (agora) => comLogo(criarEstadoBarbearia(agora), LOGO_DALFORNO);
const criarEstadoOffbox = (agora) => comLogo(trocarTextos(criarEstadoBarbearia(agora), [['Barbearia Dalforno', 'Offbox Barbearia'], ['barbeariadalforno.com.br', 'offbox.example.com'], ['Alan Dalforno', 'Alan Souza']]), LOGO_OFFBOX);

// Site publicado (build com AGENDZ_DOMINIO): pessoas de exemplo de cada loja (pessoas-demo.js). Os builds de teste e o Artifact mantêm Davi, Pablo, Alan, Kiko…
const PUBLICADO = typeof __AGENDZ_DOMINIO__ !== 'undefined' && !!__AGENDZ_DOMINIO__ && !TIPO_FIXO;
const comPessoas = (slug, criar) => (agora) => (PUBLICADO ? PESSOAS_POR_LOJA[slug](criar(agora)) : criar(agora));

export const LOJAS_DEMO = Object.freeze([
  Object.freeze({ slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva', criar: comPessoas('apex', criarEstadoInicial) }),
  Object.freeze({ slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', criar: comPessoas('dalforno', criarEstadoDalforno) }),
  Object.freeze({ slug: 'offbox', nome: 'Offbox', tipo: 'barbearia', criar: comPessoas('offbox', criarEstadoOffbox) }),
]);
export const LOJA_PADRAO = 'apex';
export const lojaDemo = (slug) => LOJAS_DEMO.find((l) => l.slug === slug) || null;

// Configuração de DNS do protótipo (no real, vem do banco): subdomínios de `dominiosBase` e domínios próprios.
const DOMINIO_DO_BUILD = typeof __AGENDZ_DOMINIO__ !== 'undefined' ? __AGENDZ_DOMINIO__ : '';
export const CONFIG_DNS = Object.freeze({
  dominiosBase: Object.freeze(['agendz.com.br', 'localhost', ...(DOMINIO_DO_BUILD ? [DOMINIO_DO_BUILD] : [])]), // o build de produção acrescenta o domínio real (AGENDZ_DOMINIO)
  // `localhost` deixa testar `dalforno.localhost` sem mexer no DNS
  dominios: Object.freeze({ 'agenda.apexestetica.com.br': 'apex', 'agenda.barbeariadalforno.com.br': 'dalforno' }),
  permitirQuery: !DOMINIO_DO_BUILD, // `?loja=dalforno`: só demonstração e desenvolvimento; o build com domínio real desliga
});

// Loja pedida pelo endereço da página. { slug, via, existe }: slug nulo = o endereço não aponta para loja (usa a escolha salva ou a padrão);
// existe falso = o endereço aponta para uma loja que não existe (a tela mostra "loja não encontrada").
export function lojaDoEndereco(loc = globalThis.location) {
  if (!loc) return { slug: null, via: null, existe: false };
  const r = resolverLoja({ hostname: loc.hostname, pathname: loc.pathname, search: loc.search }, CONFIG_DNS);
  return { ...r, existe: !!r.slug && !!lojaDemo(r.slug) };
}
export { slugValido };
