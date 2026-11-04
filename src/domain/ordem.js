/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:6604e2d8ab */
// Ordem personalizada de itens (menu, abas, colunas, marcadores). Funções puras: não dependem da tela nem do armazenamento.
// A ordem salva nunca é confiada: vem do navegador (ou, no back-end, do cadastro do usuário) e pode estar velha, adulterada ou de outra versão.

export const ORDEM_MAX_ITENS = 40;
export const ORDEM_MAX_TAMANHO_ID = 60;

// Mantém só ids de texto curtos, sem repetição, no máximo ORDEM_MAX_ITENS. Qualquer outra coisa vira lista vazia.
export function sanearOrdem(salva) {
  if (!Array.isArray(salva)) return [];
  const vistos = new Set();
  const ok = [];
  for (const x of salva) {
    if (typeof x !== 'string' || !x || x.length > ORDEM_MAX_TAMANHO_ID || vistos.has(x)) continue;
    vistos.add(x);
    ok.push(x);
    if (ok.length >= ORDEM_MAX_ITENS) break;
  }
  return ok;
}

// Aplica a ordem salva à lista atual de ids: o que foi salvo e ainda existe vem primeiro, na ordem salva;
// o que é novo (ou nunca foi ordenado) entra depois, na ordem padrão; o que não existe mais é ignorado.
// `fixos` ficam sempre no fim, na ordem padrão (ex.: coluna de ações da tabela).
export function aplicarOrdem(padrao, salva, fixos = []) {
  const todos = [...padrao];
  const nosFixos = new Set(fixos);
  const moveis = todos.filter((id) => !nosFixos.has(id));
  const existe = new Set(moveis);
  const primeiros = sanearOrdem(salva).filter((id) => existe.has(id));
  const usados = new Set(primeiros);
  return [...primeiros, ...moveis.filter((id) => !usados.has(id)), ...todos.filter((id) => nosFixos.has(id))];
}

// Move `id` para a posição de `alvo` (antes ou depois dele). Devolve uma lista nova; ids desconhecidos não mudam nada.
export function moverPara(lista, id, alvo, depois = false) {
  if (id === alvo || !lista.includes(id) || !lista.includes(alvo)) return [...lista];
  const sem = lista.filter((x) => x !== id);
  const i = sem.indexOf(alvo);
  sem.splice(depois ? i + 1 : i, 0, id);
  return sem;
}

// Move `id` um passo (delta -1 ou +1) dentro da lista, respeitando os itens fixos do fim (não passam deles).
export function moverPasso(lista, id, delta, fixos = []) {
  const i = lista.indexOf(id);
  if (i < 0 || fixos.includes(id)) return [...lista];
  const moveis = lista.filter((x) => !fixos.includes(x));
  const j = Math.max(0, Math.min(moveis.length - 1, i + delta));
  if (j === i) return [...lista];
  const sem = moveis.filter((x) => x !== id);
  sem.splice(j, 0, id);
  return [...sem, ...lista.filter((x) => fixos.includes(x))];
}

// A ordem salva só precisa existir se for diferente da padrão.
export const ehOrdemPadrao = (padrao, lista) => padrao.length === lista.length && padrao.every((x, i) => x === lista[i]);

// Chave da preferência: sempre por usuário e por tela. O contexto é texto fixo do código, nunca digitado por quem usa.
export const chaveOrdem = (contexto, usuarioId) => `ordem:${contexto}:${usuarioId}`;

// Janela de 7 dias para ranquear os itens mais usados do menu
export const DIAS_USO_MENU_MS = 7 * 86400000;

// Registra um uso do item no histórico de acessos (com timestamps). Remove registros mais velhos que a janela para não crescer indefinidamente.
export function registrarUsoMenu(historico, id, agora = Date.now(), janelaMs = DIAS_USO_MENU_MS) {
  if (typeof id !== 'string' || !id) return historico && typeof historico === 'object' ? { ...historico } : {};
  const base = historico && typeof historico === 'object' ? { ...historico } : {};
  const corte = agora - janelaMs;
  const lista = Array.isArray(base[id]) ? base[id].filter((ts) => typeof ts === 'number' && ts >= corte) : [];
  lista.push(agora);
  base[id] = lista;
  for (const k of Object.keys(base)) {
    if (k !== id && Array.isArray(base[k])) {
      base[k] = base[k].filter((ts) => typeof ts === 'number' && ts >= corte);
    }
  }
  return base;
}

// Ordena os itens do menu:
// 1. Quem teve uso nos últimos 7 dias fica primeiro, ordenado pela quantidade de acessos na janela (mais usado primeiro; desempate pelo uso mais recente).
// 2. Itens sem uso na janela NÃO mudam de posição entre si: preservam exatamente a ordem que tinham na lista anterior (ou padrão).
export function ordenarMenuPorUso(itens, historico, agora = Date.now(), janelaMs = DIAS_USO_MENU_MS) {
  if (!Array.isArray(itens)) return [];
  const corte = agora - janelaMs;
  const contagens = new Map();
  const ultimos = new Map();

  for (const [k, lista] of Object.entries(historico || {})) {
    if (!Array.isArray(lista)) continue;
    const recentes = lista.filter((ts) => typeof ts === 'number' && ts >= corte);
    if (recentes.length > 0) {
      contagens.set(k, recentes.length);
      ultimos.set(k, Math.max(...recentes));
    }
  }

  const usados = [];
  const semUso = [];

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const id = Array.isArray(item) ? item[0] : (typeof item === 'object' && item !== null ? item.id : item);
    const qtd = contagens.get(id) || 0;
    if (qtd > 0) {
      usados.push({ item, id, qtd, ultimo: ultimos.get(id) || 0, pos: i });
    } else {
      semUso.push(item);
    }
  }

  usados.sort((a, b) => b.qtd - a.qtd || b.ultimo - a.ultimo || a.pos - b.pos);

  return [...usados.map((u) => u.item), ...semUso];
}

