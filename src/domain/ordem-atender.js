/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ordem da tela Atender (v133, B9b): o proprietário escolhe, para cada tipo de atendimento (agendamento futuro e atendimento feito), a ordem das ETAPAS
// (cliente, veículo, serviços, quando, produtos) e a ordem dos CAMPOS dentro de Veículo e de Cliente. Sem escolha vale a ordem de fábrica de cada tela
// (`PADRAO_PAINEL` no site real, `PADRAO_ARTIFACT` na demonstração). O servidor tem o mesmo saneamento (`OrdemDoAtender.java`), com os mesmos casos em
// backend/src/test/resources/equivalencia/ordem-atender.json. Lista salva nunca é usada direto: sempre passa por `sanearOrdemAtender`.

export const TIPOS_DE_ATENDIMENTO = ['futuro', 'local'];
export const ETAPAS = ['cliente', 'veiculo', 'servicos', 'quando', 'produtos'];
export const CAMPOS_DO_VEICULO = ['placa', 'modelo', 'marca', 'cor', 'porte'];
export const CAMPOS_DO_CLIENTE = ['nome', 'telefone'];
export const ROTULO_ETAPA = { cliente: 'Cliente', veiculo: 'Veículo', servicos: 'Serviços', quando: 'Quando', produtos: 'Produtos' };
export const ROTULO_CAMPO = { placa: 'Placa', modelo: 'Modelo', marca: 'Marca', cor: 'Cor', porte: 'Porte', nome: 'Nome', telefone: 'Telefone' };

const UMA = (etapas) => ({ etapas: [...etapas], veiculo: [...CAMPOS_DO_VEICULO], cliente: [...CAMPOS_DO_CLIENTE] });
const PARA_OS_DOIS = (etapas) => ({ futuro: UMA(etapas), local: UMA(etapas) });

/** Ordem de fábrica do site real (a de hoje): Cliente → Veículo → Serviços → Quando → Produtos. */
export const PADRAO_PAINEL = PARA_OS_DOIS(['cliente', 'veiculo', 'servicos', 'quando', 'produtos']);
/** Ordem de fábrica da demonstração (a de hoje): Serviços → Quando → Produtos → Cliente → Veículo. */
export const PADRAO_ARTIFACT = PARA_OS_DOIS(['servicos', 'quando', 'produtos', 'cliente', 'veiculo']);
/** "Como a página do cliente": Veículo (porte primeiro) → Serviços → Quando → Dados do cliente → Produtos. */
export const COMO_A_PAGINA_DO_CLIENTE = {
  futuro: { etapas: ['veiculo', 'servicos', 'quando', 'cliente', 'produtos'], veiculo: ['porte', 'placa', 'modelo', 'marca', 'cor'], cliente: ['nome', 'telefone'] },
  local: { etapas: ['veiculo', 'servicos', 'quando', 'cliente', 'produtos'], veiculo: ['porte', 'placa', 'modelo', 'marca', 'cor'], cliente: ['nome', 'telefone'] },
};

/** Uma lista de ids: só os conhecidos, sem repetir, na ordem dada; os que faltam entram no fim, na ordem do padrão. */
export function sanearLista(valor, conhecidos, padrao) {
  const vistos = new Set();
  const saida = [];
  for (const x of Array.isArray(valor) ? valor.slice(0, 20) : []) {
    if (typeof x === 'string' && conhecidos.includes(x) && !vistos.has(x)) { vistos.add(x); saida.push(x); }
  }
  for (const x of padrao) if (!vistos.has(x)) { vistos.add(x); saida.push(x); }
  return saida;
}

/** { futuro, local } completo e válido a partir de qualquer valor (lixo, parcial ou ausente). */
export function sanearOrdemAtender(valor, padrao = PADRAO_PAINEL) {
  const v = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  const saida = {};
  for (const t of TIPOS_DE_ATENDIMENTO) {
    const o = v[t] && typeof v[t] === 'object' && !Array.isArray(v[t]) ? v[t] : {};
    saida[t] = {
      etapas: sanearLista(o.etapas, ETAPAS, padrao[t].etapas),
      veiculo: sanearLista(o.veiculo, CAMPOS_DO_VEICULO, padrao[t].veiculo),
      cliente: sanearLista(o.cliente, CAMPOS_DO_CLIENTE, padrao[t].cliente),
    };
  }
  return saida;
}

/** O valor de entrada tem a forma certa? (objeto com futuro/local, listas de texto curtas). Usado na gravação: forma errada é recusada, lista parcial é completada. */
export function ordemAtenderValida(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  for (const k of Object.keys(valor)) if (!TIPOS_DE_ATENDIMENTO.includes(k)) return false;
  for (const t of TIPOS_DE_ATENDIMENTO) {
    if (valor[t] === undefined) continue;
    const o = valor[t];
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    for (const k of Object.keys(o)) if (!['etapas', 'veiculo', 'cliente'].includes(k)) return false;
    for (const k of ['etapas', 'veiculo', 'cliente']) {
      if (o[k] === undefined) continue;
      if (!Array.isArray(o[k]) || o[k].length > 20 || !o[k].every((x) => typeof x === 'string' && x.length <= 20)) return false;
    }
  }
  return true;
}

/** Sobe (-1) ou desce (+1) o item `id` numa lista; nas pontas não faz nada. */
export function moverItem(lista, id, delta) {
  const i = lista.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return [...lista];
  const n = [...lista];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}
