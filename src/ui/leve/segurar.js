/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Toque longo (v119): segurar ~0,5 s com o mouse ou o dedo chama `aoSegurar`. Mexer mais que a tolerância (rolar a lista) cancela, e o clique que
// sobra ao soltar é engolido (não abre o cartão). Sem dependência de API: serve ao Artifact e ao site real.
import { useRef } from 'react';

export const ESPERA_TOQUE_LONGO_MS = 500;
const TOLERANCIA_PX = 8;

export function useToqueLongo(aoSegurar, ms = ESPERA_TOQUE_LONGO_MS) {
  const g = useRef({ timer: 0, x: 0, y: 0, longo: false });
  const limpar = () => { clearTimeout(g.current.timer); g.current.timer = 0; };
  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      g.current.x = e.clientX; g.current.y = e.clientY; g.current.longo = false;
      limpar();
      g.current.timer = setTimeout(() => {
        g.current.timer = 0; g.current.longo = true;
        try { navigator.vibrate?.(12); } catch { /* sem vibração */ }
        aoSegurar();
      }, ms);
    },
    onPointerMove: (e) => { if (g.current.timer && Math.hypot(e.clientX - g.current.x, e.clientY - g.current.y) > TOLERANCIA_PX) limpar(); },
    onPointerUp: limpar,
    onPointerCancel: limpar,
    onPointerLeave: limpar,
    onContextMenu: (e) => { if (g.current.longo) e.preventDefault(); }, // o menu do toque longo do navegador não atrapalha
    onClickCapture: (e) => { if (g.current.longo) { g.current.longo = false; e.stopPropagation(); e.preventDefault(); } },
  };
}
