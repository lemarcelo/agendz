/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Pré-visualização do assistente de primeiro acesso no Artifact/demonstração: mesma interface do adaptador real (api-real.js `onboarding`),
// mas NADA é gravado (nem na loja de exemplo). Os serviços de exemplo vêm da loja atual (domain/catalogo.js). Só roda em MODO_DEMO.
import { store } from './api.js';
import { catalogoDoTipo, expedienteDeEstado } from '../domain/catalogo.js';
import { cap, tipoDe } from '../domain/tipos.js';
import { criarEstadoInicial } from '../tipos/estetica_automotiva/seed.js';
import { criarEstadoBarbearia } from '../tipos/barbearia/seed.js';

const AGORA = Date.UTC(2026, 9, 12, 12, 0, 0); // fixo: o catálogo de exemplo do tipo não muda conforme o dia
const SEEDS = { estetica_automotiva: () => criarEstadoInicial(AGORA), barbearia: () => criarEstadoBarbearia(AGORA) };

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sem 0/O, 1/l/I (igual ao servidor)
const senha = () => { const b = new Uint32Array(12); crypto.getRandomValues(b); return Array.from(b, (n) => ALFABETO[n % ALFABETO.length]).join(''); };
const loginDe = (nome, usados) => {
  let base = nome.trim().split(/\s+/)[0].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  if (base.length < 2) base = 'pro';
  let l = base; for (let n = 2; usados.has(l); n++) l = base + n;
  return l;
};

// `reconfigurar` (Estabelecimento > Reconfigurar): o catálogo é o do TIPO (seed) e já estão "na loja" os que ainda existem na loja atual por nome
// (apagou um serviço? ele volta a aparecer para marcar); o expediente atual é o da loja. Continua sem gravar nada.
// Histórico da pré-visualização (vive só nesta página). Só a mais recente com mudança se desfaz; refazer só se nada mais novo mudou.
const HIST = [];
const mudou = (h) => h.servicosCriados + h.pessoasCriadas + h.produtosCriados > 0 || h.expedienteTrocado || h.comissaoTrocada || h.linkTrocado;
const visiveis = () => HIST.filter(mudou).map((h, i, l) => ({
  ...h, podeDesfazer: !h.desfeitaEm && !l.slice(0, i).some((n) => !n.desfeitaEm), podeRefazer: !!h.desfeitaEm && i === 0,
}));
export function criarAdaptadorDemo({ reconfigurar = false } = {}) {
  let passo = 'servicos'; let concluido = reconfigurar;
  const atual = () => store.getState();
  const catalogo = () => { const t = tipoDe(atual().estabelecimento); return catalogoDoTipo(t, reconfigurar && SEEDS[t] ? SEEDS[t]() : atual()); };
  const nomesDaLoja = () => new Set((atual().servicos || []).map((x) => String(x.nome).toLowerCase()));
  const feitos = new Set(reconfigurar ? catalogo().filter((x) => nomesDaLoja().has(x.nome.toLowerCase())).map((x) => x.chave) : []);
  const nomesProdutos = () => new Set((atual().materiais || []).filter((m) => m.tipo === 'produto' && m.ativo !== false).map((m) => String(m.nome).toLowerCase()));
  const feitosProd = new Set(); let comissao = null; // pré-visualização: o que foi "criado" nesta página
  const boxesFeitos = new Set(reconfigurar ? (atual().estabelecimento?.boxes || []).filter((b) => b && b.ativo !== false).map((b) => String(b.nome).toLowerCase()) : []); // nomes (minúsculos) dos boxes; nada é gravado
  const usados = new Set(); let expediente = reconfigurar ? expedienteDeEstado(atual()) : null;
  // Histórico só em memória (pré-visualização: nada é gravado). Em pré-visualização qualquer senha preenchida vale.
  let abertaId = null;
  const linkDemo = { telefoneObrigatorio: true, nomeObrigatorio: true, veiculoObrigatorio: ['placa', 'modelo', 'porte'] };
  const nova = () => { if (!abertaId) { abertaId = 'r-' + (HIST.length + 1); HIST.unshift({ id: abertaId, criadaEm: new Date().toISOString(), por: 'Você', servicosCriados: 0, pessoasCriadas: 0, produtosCriados: 0, expedienteTrocado: false, linkTrocado: false, comissaoTrocada: false, desfeitaEm: '' }); } return HIST.find((h) => h.id === abertaId); };
  return {
    async confirmarSenha(senha) { if (typeof senha !== 'string' || !senha) return { ok: false, erro: 'Senha incorreta' }; abertaId = null; return { ok: true }; },
    async historico() { return { ok: true, itens: visiveis() }; },
    async desfazer(id, senha) {
      if (!senha) return { ok: false, erro: 'Senha incorreta' };
      const h = HIST.find((x) => x.id === id);
      if (!h || h.desfeitaEm || visiveis().find((x) => x.id === id)?.podeDesfazer !== true) return { ok: false, erro: 'Só a reconfiguração mais recente pode ser desfeita, e só por 30 dias' };
      h.desfeitaEm = new Date().toISOString();
      return { ok: true, itens: visiveis() };
    },
    async refazer(id, senha) {
      if (!senha) return { ok: false, erro: 'Senha incorreta' };
      const h = HIST.find((x) => x.id === id);
      if (!h || !h.desfeitaEm || visiveis().find((x) => x.id === id)?.podeRefazer !== true) return { ok: false, erro: 'Não é mais possível refazer esta reconfiguração' };
      h.desfeitaEm = '';
      return { ok: true, itens: visiveis() };
    },
    async carregar() {
      const pc = Number(atual().estabelecimento?.comissaoPadrao);
      const geral = comissao ?? (reconfigurar && Number.isFinite(pc) ? pc : 50);
      return { ok: true, estado: { tipo: tipoDe(store.getState().estabelecimento), passo, concluido, servicos: catalogo(), jaCadastrados: [...feitos], expedienteSugerido: expedienteDeEstado(store.getState()), expediente,
        comissaoPadrao: geral, produtosCadastrados: [...(reconfigurar ? [...nomesProdutos()] : []), ...feitosProd],
        usaBox: cap(store.getState().estabelecimento, 'usaRecursoFisico'), boxes: [...boxesFeitos] } };
    },
    async produtos(itens) {
      if (!Array.isArray(itens) || itens.length > 30) return { ok: false, erro: 'No máximo 30 produtos por vez' };
      for (const p of itens) {
        const nome = String((p && p.nome) || '').trim();
        if (nome.length < 1 || nome.length > 100) return { ok: false, erro: 'Informe o nome do produto' };
        if (!(Number(p.preco) >= 0 && Number(p.preco) <= 100000)) return { ok: false, erro: 'Informe o preço de venda do produto.' };
        if (p.comissaoPct != null && !(Number(p.comissaoPct) >= 0 && Number(p.comissaoPct) <= 100)) return { ok: false, erro: 'A comissão vai de 0 a 100%.' };
        if (p.estoque != null && !(Number(p.estoque) >= 0 && Number(p.estoque) <= 1000000000)) return { ok: false, erro: 'Valores de estoque e custo não podem ser negativos nem inválidos.' };
      }
      const base = reconfigurar ? nomesProdutos() : new Set();
      let criados = 0; let jaExistiam = 0;
      for (const p of itens) {
        const k = String(p.nome).trim().replace(/\s+/g, ' ').toLowerCase();
        if (base.has(k) || feitosProd.has(k)) jaExistiam++; else { feitosProd.add(k); criados++; }
      }
      if (reconfigurar && criados) nova().produtosCriados += criados;
      return { ok: true, resultado: { criados, jaExistiam } };
    },
    async comissao(padrao) {
      if (!(Number(padrao) >= 0 && Number(padrao) <= 100)) return { ok: false, erro: 'A comissão vai de 0 a 100%.' };
      comissao = Math.round(Number(padrao) * 100) / 100;
      if (reconfigurar) nova().comissaoTrocada = true;
      return { ok: true, padrao: comissao };
    },
    async servicos(itens, proprios = []) {
      const chaves = new Set(catalogo().map((s) => s.chave));
      if (!Array.isArray(itens) || itens.some((i) => !i || !chaves.has(i.chave))) return { ok: false, erro: 'Serviço de exemplo desconhecido' };
      if (!Array.isArray(proprios) || proprios.length > 20) return { ok: false, erro: 'No máximo 20 serviços próprios por vez' };
      for (const p of proprios) {
        const nome = String((p && p.nome) || '').trim();
        if (nome.length < 2 || nome.length > 80) return { ok: false, erro: 'Informe o nome do serviço (de 2 a 80 letras)' };
        if (!(Number(p.preco) >= 0 && Number(p.preco) <= 100000)) return { ok: false, erro: 'Confira o preço do serviço' };
        if (!(Number.isInteger(Number(p.duracaoMin)) && p.duracaoMin >= 1 && p.duracaoMin <= 14400)) return { ok: false, erro: 'Confira a duração do serviço' };
      }
      let criados = 0; let jaExistiam = 0;
      for (const i of itens) { if (feitos.has(i.chave)) jaExistiam++; else { feitos.add(i.chave); criados++; } }
      for (const p of proprios) { const k = `proprio:${String(p.nome).trim().toLowerCase()}`; if (feitos.has(k)) jaExistiam++; else { feitos.add(k); criados++; } }
      if (reconfigurar && criados) nova().servicosCriados += criados;
      passo = 'equipe';
      return { ok: true, resultado: { criados, jaExistiam } };
    },
    async equipe(pessoas) {
      if (!Array.isArray(pessoas) || pessoas.length > 10) return { ok: false, erro: 'No máximo 10 pessoas por vez' };
      if (pessoas.some((p) => p && ((p.comissaoPct != null && !(Number(p.comissaoPct) >= 0 && Number(p.comissaoPct) <= 100)) || (p.comissaoProdutoPct != null && !(Number(p.comissaoProdutoPct) >= 0 && Number(p.comissaoProdutoPct) <= 100))))) return { ok: false, erro: 'A comissão vai de 0 a 100%.' };
      const saida = pessoas.map((p) => { const login = loginDe(String(p.nome || ''), usados); usados.add(login); return { nome: String(p.nome || '').slice(0, 80), login, senhaTemporaria: senha(), atende: p.atende !== false }; });
      passo = 'expediente';
      if (reconfigurar && saida.length) nova().pessoasCriadas += saida.length;
      return { ok: true, pessoas: saida };
    },
    async boxes(nomes) {
      if (!Array.isArray(nomes) || nomes.length > 20) return { ok: false, erro: 'No máximo 20 boxes.' };
      let criados = 0; let jaExistiam = 0;
      for (const n of nomes) {
        const nome = String(n || '').trim().replace(/\s+/g, ' ');
        if (!nome || nome.length > 30) return { ok: false, erro: 'Cada box precisa de um nome de até 30 letras.' };
        if (boxesFeitos.has(nome.toLowerCase())) jaExistiam++; else { boxesFeitos.add(nome.toLowerCase()); criados++; }
      }
      passo = 'expediente';
      return { ok: true, resultado: { criados, jaExistiam } };
    },
    async expediente(semana) {
      const abertos = Object.values(semana || {}).filter((d) => d && d.aberto);
      if (abertos.length) { expediente = { semana }; if (reconfigurar) nova().expedienteTrocado = true; }
      passo = 'pronto';
      return { ok: true };
    },
    // B9a: Link do cliente (pré-visualização: guarda só nesta página; o padrão de fábrica do link é exigir tudo)
    async linkObter() { return { ok: true, link: { ...linkDemo } }; },
    async link(d) {
      d = d || {};
      if (typeof d.nomeObrigatorio === 'boolean') linkDemo.nomeObrigatorio = d.nomeObrigatorio;
      if (typeof d.telefoneObrigatorio === 'boolean') linkDemo.telefoneObrigatorio = d.telefoneObrigatorio;
      if (Array.isArray(d.veiculoObrigatorio)) linkDemo.veiculoObrigatorio = d.veiculoObrigatorio.filter((x) => ['placa', 'modelo', 'porte'].includes(x));
      if (reconfigurar) nova().linkTrocado = true;
      return { ok: true };
    },
    async concluir() { passo = 'pronto'; concluido = true; return { ok: true }; },
  };
}
