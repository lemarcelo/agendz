/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:b747928441 */
import { useSyncExternalStore, useState, useEffect, useCallback } from 'react';
import { store } from '../services/api.js';
import { chat } from '../services/chat.js';

export const useStore = () => useSyncExternalStore(store.subscribe, store.getSnapshot);
export const useChat = () => useSyncExternalStore(chat.subscribe, chat.getSnapshot);

export function useUser() {
  const { state, sessao } = useStore();
  return state.usuarios.find((u) => u.id === sessao) || null;
}

// Avisos rápidos (toasts)
let toasts = [];
let tsnap = [];
const tl = new Set();
export function toast(texto, tipo = 'ok') {
  const t = { id: Math.random().toString(36).slice(2), texto, tipo };
  toasts = [...toasts, t].slice(-3);
  tsnap = toasts;
  tl.forEach((l) => l());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); tsnap = toasts; tl.forEach((l) => l()); }, tipo === 'erro' ? 6000 : 3000);
}
export const useToasts = () => useSyncExternalStore((l) => { tl.add(l); return () => tl.delete(l); }, () => tsnap);

export function useMedia(q) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    f();
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

export function useLocal(key, inicial) {
  const [v, setV] = useState(() => { try { const x = localStorage.getItem(key); return x === null ? inicial : JSON.parse(x); } catch { return inicial; } });
  const set = useCallback((n) => { setV(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* sem armazenamento */ } }, [key]);
  return [v, set];
}
