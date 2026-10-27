/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Pré-visualização do assistente de primeiro acesso no Artifact/demonstração: mesma interface do adaptador real (api-real.js `onboarding`),
// mas NADA é gravado (nem na loja de exemplo). Os serviços de exemplo vêm da loja atual (domain/catalogo.js). Só roda em MODO_DEMO.
import { store } from './api.js';
import { catalogoDeEstado, expedienteDeEstado } from '../domain/catalogo.js';
import { tipoDe } from '../domain/tipos.js';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // sem 0/O, 1/l/I (igual ao servidor)
const senha = () => { const b = new Uint32Array(12); crypto.getRandomValues(b); return Array.from(b, (n) => ALFABETO[n % ALFABETO.length]).join(''); };
const loginDe = (nome, usados) => {
  let base = nome.trim().split(/\s+/)[0].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  if (base.length < 2) base = 'pro';
  let l = base; for (let n = 2; usados.has(l); n++) l = base + n;
  return l;
};

export function criarAdaptadorDemo() {
  let passo = 'servicos'; let concluido = false;
  const feitos = new Set(); const usados = new Set(); let expediente = null;
  const catalogo = () => catalogoDeEstado(store.getState());
  return {
    async carregar() { return { ok: true, estado: { tipo: tipoDe(store.getState().estabelecimento), passo, concluido, servicos: catalogo(), jaCadastrados: [...feitos], expedienteSugerido: expedienteDeEstado(store.getState()), expediente } }; },
    async servicos(itens) {
      const chaves = new Set(catalogo().map((s) => s.chave));
      if (!Array.isArray(itens) || itens.some((i) => !i || !chaves.has(i.chave))) return { ok: false, erro: 'Serviço de exemplo desconhecido' };
      let criados = 0; let jaExistiam = 0;
      for (const i of itens) { if (feitos.has(i.chave)) jaExistiam++; else { feitos.add(i.chave); criados++; } }
      passo = 'equipe';
      return { ok: true, resultado: { criados, jaExistiam } };
    },
    async equipe(pessoas) {
      if (!Array.isArray(pessoas) || pessoas.length > 10) return { ok: false, erro: 'No máximo 10 pessoas por vez' };
      const saida = pessoas.map((p) => { const login = loginDe(String(p.nome || ''), usados); usados.add(login); return { nome: String(p.nome || '').slice(0, 80), login, senhaTemporaria: senha(), atende: p.atende !== false }; });
      passo = 'expediente';
      return { ok: true, pessoas: saida };
    },
    async expediente(semana) {
      const abertos = Object.values(semana || {}).filter((d) => d && d.aberto);
      if (abertos.length) expediente = { semana };
      passo = 'pronto';
      return { ok: true };
    },
    async concluir() { passo = 'pronto'; concluido = true; return { ok: true }; },
  };
}
