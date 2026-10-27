/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:9d8f856bfa */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { aplicarOrdem, chaveOrdem, ehOrdemPadrao, moverPara, moverPasso, sanearOrdem } from '../domain/ordem.js';
import { useUser } from './hooks.js';

// Ordem personalizada de menus, abas, colunas e marcadores: segurar um item e arrastar (toque ou mouse), ou Alt + setas no teclado.
// A ordem fica salva por usuário neste navegador (mesma chave `ordem:<tela>:<usuário>`); no back-end vira preferência do usuário
// (PUT /usuarios/me/preferencias). O que está salvo nunca é confiado: passa por `sanearOrdem` e `aplicarOrdem`.

export const ESPERA_MS = 380; // quanto tempo segurar para começar a arrastar
const TOLERANCIA_PX = 8; // mexer mais que isso antes do tempo é rolagem, não arrasto

// ---------- armazenamento ----------
const cache = new Map();
const ouvintes = new Set();
let versao = 0;
const avisar = () => { versao++; ouvintes.forEach((f) => f()); };
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f); };

function lerOrdem(chave) {
  if (cache.has(chave)) return cache.get(chave);
  let v = [];
  try { v = sanearOrdem(JSON.parse(localStorage.getItem(chave))); } catch { v = []; }
  cache.set(chave, v);
  return v;
}
function gravarOrdem(chave, lista) {
  const v = sanearOrdem(lista);
  cache.set(chave, v);
  try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem armazenamento: vale só nesta sessão */ }
  avisar();
}
const chavesDoUsuario = (usuarioId) => {
  const fim = `:${usuarioId}`;
  const ks = new Set([...cache.keys()].filter((k) => k.startsWith('ordem:') && k.endsWith(fim)));
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('ordem:') && k.endsWith(fim)) ks.add(k); } } catch { /* sem armazenamento */ }
  return [...ks];
};
export function restaurarOrdens(usuarioId) {
  for (const k of chavesDoUsuario(usuarioId)) { cache.delete(k); try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } }
  avisar();
}
export function useTemOrdemPersonalizada() {
  const u = useUser();
  useSyncExternalStore(assinar, () => versao);
  return !!u && chavesDoUsuario(u.id).some((k) => lerOrdem(k).length > 0);
}

// ---------- aviso para leitor de tela ----------
function anunciar(texto) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('anuncio-ordem');
  if (!el) {
    el = document.createElement('div');
    el.id = 'anuncio-ordem'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.className = 'so-leitor';
    document.body.appendChild(el);
  }
  el.textContent = texto;
}

// Com o arrasto ativo o navegador não pode rolar a tela junto com o dedo.
const arrasto = { ativo: false };
if (typeof document !== 'undefined') {
  document.addEventListener('touchmove', (e) => { if (arrasto.ativo && e.cancelable) e.preventDefault(); }, { passive: false });
}

// Item sob o ponteiro: o mais próximo (no eixo escolhido) entre os itens da mesma lista.
function itemSob(contexto, x, y, eixo) {
  let melhor = null;
  for (const el of document.querySelectorAll(`[data-ordem="${contexto}"]`)) {
    const r = el.getBoundingClientRect();
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const d = eixo === 'x' ? dx : eixo === 'y' ? dy : Math.hypot(dx, dy);
    if (!melhor || d < melhor.d) melhor = { d, id: el.getAttribute('data-ordem-id'), depois: eixo === 'y' ? y > r.top + r.height / 2 : x > r.left + r.width / 2 };
  }
  return melhor;
}

/**
 * Ordem de uma lista de itens.
 * @param contexto texto fixo que identifica a lista (ex.: 'nav', 'abas:financeiro', 'col:lancamentos'); falsy = sem reordenar
 * @param padrao ids na ordem padrão
 * @param opcoes { fixos: ids que ficam sempre no fim, eixo: 'x' | 'y' | 'xy', rotulo: (id) => texto para o leitor de tela }
 * @returns { ids, props(id), classe(id), arrastando }
 */
export function useOrdem(contexto, padrao, { fixos = [], eixo = 'xy', rotulo = (id) => id, aoSegurar = null } = {}) {
  const user = useUser();
  const chave = chaveOrdem(contexto || '_', user?.id || 'anonimo');
  const salva = useSyncExternalStore(assinar, () => lerOrdem(chave));
  const base = aplicarOrdem(padrao, salva, fixos);
  const [previa, setPrevia] = useState(null);
  const [arrastando, setArrastando] = useState(null);
  const ids = previa || base;
  const g = useRef(null);
  const suprimir = useRef(null); // id do item que acabou de ser arrastado: o clique que o navegador gera ao soltar é descartado
  const focar = useRef(null);
  const ult = useRef({});
  ult.current = { base, fixos, chave, contexto, eixo, rotulo, aoSegurar };

  useEffect(() => {
    if (!focar.current) return;
    const el = document.querySelector(`[data-ordem="${contexto}"][data-ordem-id="${focar.current}"]`);
    focar.current = null;
    if (el && el.focus) el.focus();
  });
  useEffect(() => () => { if (g.current) { clearTimeout(g.current.timer); arrasto.ativo = false; } }, []);

  const iniciar = useCallback((id, e) => {
    if (g.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { base: b0 } = ult.current;
    const s = { id, ativo: false, lista: b0, timer: null };
    g.current = s;
    const x0 = e.clientX; const y0 = e.clientY; const pid = e.pointerId;
    const fim = () => {
      clearTimeout(s.timer);
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', cancelar);
      document.removeEventListener('keydown', tecla);
      arrasto.ativo = false;
      document.body.classList.remove('arrastando-ordem');
      g.current = null;
      setArrastando(null); setPrevia(null);
    };
    const cancelar = () => fim();
    const soltar = (ev) => {
      if (ev.pointerId !== pid) return;
      if (s.ativo) {
        const { chave: k, rotulo: r, aoSegurar: seg } = ult.current;
        if (seg && s.lista.join('|') === b0.join('|')) { suprimir.current = id; setTimeout(() => { suprimir.current = null; }, 400); fim(); seg(id); return; } // segurou sem mover: não é arrasto
        gravarOrdem(k, s.lista);
        suprimir.current = id; setTimeout(() => { suprimir.current = null; }, 400);
        anunciar(`${r(id)} movido para a posição ${s.lista.indexOf(id) + 1} de ${s.lista.length}`);
      }
      fim();
    };
    const tecla = (ev) => { if (ev.key === 'Escape') { suprimir.current = s.ativo ? id : null; fim(); } };
    const mover = (ev) => {
      if (ev.pointerId !== pid) return;
      if (!s.ativo) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > TOLERANCIA_PX) fim(); return; }
      if (ev.cancelable) ev.preventDefault();
      const { contexto: c, eixo: ex } = ult.current;
      const alvo = itemSob(c, ev.clientX, ev.clientY, ex);
      if (!alvo || alvo.id === id) return;
      const nova = moverPara(s.lista, id, alvo.id, alvo.depois);
      if (nova.join('|') !== s.lista.join('|') && !ult.current.fixos.includes(alvo.id)) { s.lista = nova; setPrevia(nova); }
    };
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', cancelar);
    document.addEventListener('keydown', tecla);
    s.timer = setTimeout(() => {
      s.ativo = true; arrasto.ativo = true;
      document.body.classList.add('arrastando-ordem');
      setArrastando(id); setPrevia(s.lista);
      try { navigator.vibrate?.(12); } catch { /* sem vibração */ }
    }, ESPERA_MS);
  }, []);

  const teclado = useCallback((id, e) => {
    if (!e.altKey) return;
    const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const { base: b, fixos: fx, chave: k, rotulo: r } = ult.current;
    const nova = moverPasso(b, id, delta, fx);
    focar.current = id;
    if (nova.join('|') !== b.join('|')) gravarOrdem(k, nova); else setPrevia(null);
    anunciar(`${r(id)} na posição ${nova.indexOf(id) + 1} de ${nova.length}`);
  }, []);

  const props = (id) => {
    if (!contexto || fixos.includes(id)) return {};
    return {
      'data-ordem': contexto,
      'data-ordem-id': id,
      'aria-roledescription': 'item reordenável',
      'aria-keyshortcuts': 'Alt+ArrowLeft Alt+ArrowRight',
      onPointerDown: (e) => iniciar(id, e),
      onKeyDown: (e) => teclado(id, e),
      onClickCapture: (e) => { if (suprimir.current === id) { e.preventDefault(); e.stopPropagation(); suprimir.current = null; } },
      onContextMenu: (e) => { if (g.current) e.preventDefault(); },
    };
  };
  const classe = (id) => (!contexto || fixos.includes(id) ? '' : `reordenavel${arrastando === id ? ' arrastando' : ''}`);
  return { ids, props, classe, arrastando, personalizada: !ehOrdemPadrao(padrao, base) };
}
