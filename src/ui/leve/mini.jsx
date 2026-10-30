/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Peças básicas de tela SEM dependência da API simulada (nem de hooks.js): usadas pela casca do site real e pelo assistente de primeiro acesso.
// Mesmas classes de CSS de common.jsx, então o visual é o mesmo.
import React from 'react';
import { P } from '../icones.js';

export function Icone({ n, size = 18 }) {
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
}
export const Aviso = ({ tipo = 'info', children, ...p }) => <div className={`aviso aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : undefined} {...p}><Icone n={tipo === 'erro' ? 'alert' : 'info'} size={17} /><div>{children}</div></div>;
export const Campo = ({ rotulo: r, dica, children }) => <label className="campo"><span className="campo-rotulo">{r}</span>{children}{dica && <small className="muted">{dica}</small>}</label>;
export const Btn = ({ variante = 'neutro', tamanho, children, ...p }) => <button type="button" className={`btn btn-${variante}${tamanho === 'sm' ? ' btn-sm' : ''}`} {...p}>{children}</button>;
