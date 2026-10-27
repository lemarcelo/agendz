/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:284727d5b5 */
import React, { useRef } from 'react';
import { Icon } from './common.jsx';

// Gestos de seleção: clique = um só; segurar (toque ou mouse), duplo clique (só mouse) ou Ctrl/Shift + clique = juntar com os outros.
// `ordem` = true quando o item já usa `useOrdem` (que detecta o segurar sozinho e chama `aoSegurar`).
export const ESPERA_SEGURAR_MS = 450;
const TOLERANCIA_PX = 8;

export function useGestosSelecao({ sel, aoUnico, aoMulti, segurar = true }) {
  const g = useRef({ tipo: '', timer: 0, x: 0, y: 0, longo: null, antes: null });
  const limpar = () => { clearTimeout(g.current.timer); g.current.timer = 0; };
  const props = (id) => ({
    onPointerDownCapture: (e) => {
      g.current.tipo = e.pointerType; g.current.x = e.clientX; g.current.y = e.clientY;
      if (!segurar || (e.pointerType === 'mouse' && e.button !== 0)) return;
      limpar();
      g.current.timer = setTimeout(() => {
        g.current.timer = 0; g.current.longo = id;
        try { navigator.vibrate?.(12); } catch { /* sem vibração */ }
        aoMulti(id);
      }, ESPERA_SEGURAR_MS);
    },
    onPointerMove: (e) => { if (g.current.timer && Math.hypot(e.clientX - g.current.x, e.clientY - g.current.y) > TOLERANCIA_PX) limpar(); },
    onPointerUp: limpar,
    onPointerCancel: limpar,
    onPointerLeave: limpar,
    onContextMenu: (e) => { if (g.current.longo === id) e.preventDefault(); },
    onClick: (e) => {
      if (g.current.longo === id) { g.current.longo = null; return; } // o clique que sobra depois de segurar
      if (e.ctrlKey || e.metaKey || e.shiftKey) { aoMulti(id); return; }
      if (e.detail >= 2 && g.current.tipo === 'mouse') { aoMulti(id, g.current.antes); return; } // duplo clique: só no computador
      g.current.antes = sel;
      aoUnico(id);
    },
  });
  return props;
}

/** X pequeno no topo do marcador: tira só aquele da seleção. Fica fora do botão para não aninhar botões. */
export function BotaoRemover({ rotulo, onClick, id }) {
  return (
    <button type="button" className="marc-x" onClick={onClick} aria-label={`Remover ${rotulo} da seleção`} title={`Remover ${rotulo}`} data-testid={`remover-${id}`}>
      <Icon n="x" size={10} stroke={3.5} />
    </button>
  );
}
