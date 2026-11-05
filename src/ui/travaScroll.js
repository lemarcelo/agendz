/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
import { useEffect } from 'react';

let modaisAbertos = 0;
let observadorIniciado = false;
let posicaoAnterior = 0;

const SELETORES_MODAIS = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '.modal-fundo',
  '.detalhe-fundo-real',
  '.atender-fundo-real',
  '.perfil-fundo-real'
].join(',');

export function travarScroll() {
  if (typeof document === 'undefined') return;
  if (!document.body.classList.contains('trava-scroll-modal')) {
    posicaoAnterior = window.scrollY;
    document.body.style.setProperty('--trava-scroll-top', `${-posicaoAnterior}px`);
  }
  document.documentElement.classList.add('trava-scroll-modal');
  document.body.classList.add('trava-scroll-modal');
}

export function destravarScroll() {
  if (typeof document === 'undefined') return;
  if (modaisAbertos <= 0) {
    const existemNoDom = document.querySelector(SELETORES_MODAIS);
    if (!existemNoDom) {
      const restaurar = getComputedStyle(document.body).position === 'fixed';
      document.documentElement.classList.remove('trava-scroll-modal');
      document.body.classList.remove('trava-scroll-modal');
      document.body.style.removeProperty('--trava-scroll-top');
      if (restaurar) window.scrollTo(0, posicaoAnterior);
    }
  }
}

/**
 * Hook React para travar a rolagem da página externa enquanto um modal/sobreposição estiver aberto.
 * Ao desmontar ou receber ativo=false, restaura o scroll imediatamente.
 */
export function useTravaScroll(ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    modaisAbertos++;
    travarScroll();

    return () => {
      modaisAbertos = Math.max(0, modaisAbertos - 1);
      destravarScroll();
    };
  }, [ativo]);
}

/**
 * Observador global defensivo: garante que QUALQUER modal colocado no DOM
 * (mesmo se o desenvolvedor esquecer de invocar o hook) receba a trava de scroll imediatamente.
 */
export function iniciarObservadorModais() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || observadorIniciado) return;
  observadorIniciado = true;

  const verificar = () => {
    const temModal = document.querySelector(SELETORES_MODAIS);
    if (temModal) {
      travarScroll();
    } else if (modaisAbertos <= 0) {
      destravarScroll();
    }
  };

  const observer = new MutationObserver(() => {
    verificar();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    verificar();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      verificar();
    });
  }

  // Previne encadeamento de scroll do wheel se cair no backdrop
  window.addEventListener('wheel', (e) => {
    if (document.body.classList.contains('trava-scroll-modal')) {
      const dentroDeRolavel = e.target && e.target.closest && e.target.closest(SELETORES_MODAIS);
      if (!dentroDeRolavel) {
        e.preventDefault();
      }
    }
  }, { passive: false });
}

// Inicia imediatamente ao carregar em ambiente browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  iniciarObservadorModais();
}
