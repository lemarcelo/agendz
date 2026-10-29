/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atualização automática das telas do site real: chama `aoAtualizar` a cada `intervaloMs` enquanto a aba está visível, e na hora em que a aba volta a ser
// vista, a janela ganha foco ou a internet volta. Assim o que o cliente fez pelo link (pedir, remarcar, cancelar) aparece na agenda sem recarregar.
// Aba escondida não consulta o servidor. Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import { useEffect, useRef } from 'react';

export const INTERVALO_PADRAO_MS = 20000;

export function useAtualizacaoAutomatica(aoAtualizar, intervaloMs = INTERVALO_PADRAO_MS) {
  const ultimo = useRef(aoAtualizar);
  ultimo.current = aoAtualizar;
  useEffect(() => {
    const visivel = () => !globalThis.document || globalThis.document.visibilityState !== 'hidden';
    const agora = () => { if (visivel()) ultimo.current(); };
    const id = setInterval(agora, intervaloMs);
    globalThis.document?.addEventListener('visibilitychange', agora);
    globalThis.addEventListener?.('focus', agora);
    globalThis.addEventListener?.('online', agora);
    return () => {
      clearInterval(id);
      globalThis.document?.removeEventListener('visibilitychange', agora);
      globalThis.removeEventListener?.('focus', agora);
      globalThis.removeEventListener?.('online', agora);
    };
  }, [intervaloMs]);
}
