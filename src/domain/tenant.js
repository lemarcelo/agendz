/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Qual loja (tenant) esta requisição é? A resposta vem SÓ do endereço usado (DNS/URL), nunca de um campo que o cliente escreve no corpo.
// Função pura: a mesma regra roda no navegador (para escolher tipo e tema) e é espelhada no Spring (filtro que lê o cabeçalho Host).
// Ordem: domínio próprio cadastrado > subdomínio da plataforma > caminho `/agendar/{slug}` > `?loja=` (só demonstração e desenvolvimento).
// Docs: docs/F1-lojas-por-dns.md.

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
// Nomes que a plataforma usa para si; nenhuma loja pode ter um destes como slug.
export const SLUGS_RESERVADOS = Object.freeze(['www', 'app', 'api', 'admin', 'painel', 'static', 'assets', 'mail', 'agendar', 'login', 'suporte', 'status']);
export const slugValido = (s) => typeof s === 'string' && SLUG_RE.test(s) && !SLUGS_RESERVADOS.includes(s);

const limparHost = (h) => String(h || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');

// loc = { hostname, pathname, search }; cfg = { dominiosBase: ['agendz.com.br'], dominios: { 'agenda.apexestetica.com.br': 'apex' }, permitirQuery: false }
// Devolve { slug, via } ou { slug: null, via: null } quando o endereço não aponta para nenhuma loja (a tela mostra "loja não encontrada";
// em produção nunca cai numa loja padrão).
export function resolverLoja(loc = {}, cfg = {}) {
  const host = limparHost(loc.hostname);
  const dominios = cfg.dominios || {};
  if (host && Object.prototype.hasOwnProperty.call(dominios, host)) return { slug: dominios[host], via: 'dominio' };
  for (const base of cfg.dominiosBase || []) {
    const b = limparHost(base);
    if (host.endsWith('.' + b)) {
      const sub = host.slice(0, -(b.length + 1)); // exatamente um rótulo: `apex.agendz.com.br`; `a.b.agendz.com.br` não vale
      if (slugValido(sub)) return { slug: sub, via: 'subdominio' };
      return { slug: null, via: null };
    }
  }
  const m = /^\/agendar\/([^/?#]+)\/?$/.exec(String(loc.pathname || ''));
  if (m && slugValido(m[1].toLowerCase())) return { slug: m[1].toLowerCase(), via: 'caminho' };
  if (cfg.permitirQuery) {
    const q = new URLSearchParams(String(loc.search || '')).get('loja');
    if (q && slugValido(q.toLowerCase())) return { slug: q.toLowerCase(), via: 'query' };
  }
  return { slug: null, via: null };
}
