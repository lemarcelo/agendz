/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:a59180eaec */
import React, { useEffect, useRef } from 'react';
import { visualDoCartao } from '../domain/marcadores.js';
import { useOrdem } from './ordem.jsx';
import { coresDaEquipe, corDaPessoa, fotoValida } from '../domain/foto.js';
import { useStore } from './hooks.js';

const P = {
  calendar: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M9 20v-6h6v6',
  team: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  msg: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zM15.5 7.5l3 3L22 7l-3-3',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  more: 'M12 12h.01M19 12h.01M5 12h.01',
  menu: 'M3 12h18M3 6h18M3 18h18',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  car: 'M5 17H3v-5l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 5v5h-2M5 17a2 2 0 1 0 4 0M15 17a2 2 0 1 0 4 0M9 17h6M3 12h18',
  brush: 'M18.4 2.6a2 2 0 0 1 2.9 2.8L12 15l-3-3zM9 12c-2.5 0-4 1.6-4 4 0 1.5-.8 2.6-2 3.4 4.6 1.6 9-.4 9-5.4',
  gauge: 'M12 14l4-5M3.3 17a10 10 0 1 1 17.4 0',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
};

export function Icon({ n, size = 18, className = '', stroke = 2 }) {
  return (
    <svg className={`ico ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[n]} />
    </svg>
  );
}

export function Btn({ children, variante = 'neutro', icone, tamanho, className = '', ...p }) {
  return (
    <button type="button" className={`btn btn-${variante} ${tamanho === 'sm' ? 'btn-sm' : ''} ${className}`} {...p}>
      {icone && <Icon n={icone} size={tamanho === 'sm' ? 15 : 17} />}
      {children}
    </button>
  );
}

export function Campo({ rotulo, dica, erro, children, className = '' }) {
  return (
    <label className={`campo ${className}`}>
      {rotulo && <span className="campo-rotulo">{rotulo}</span>}
      {children}
      {dica && !erro && <span className="campo-dica">{dica}</span>}
      {erro && <span className="campo-erro">{erro}</span>}
    </label>
  );
}

export function Modal({ titulo, onClose, children, rodape, largura = 560, sub }) {
  const ref = useRef(null);
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', f);
    const first = ref.current?.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
    if (first && window.matchMedia('(min-width: 700px)').matches) first.focus();
    return () => document.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ '--larg': `${largura}px` }} role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <header className="modal-topo">
          <div>
            <h2>{titulo}</h2>
            {sub && <p className="muted">{sub}</p>}
          </div>
          <button type="button" className="icone-btn" onClick={onClose} aria-label="Fechar"><Icon n="x" /></button>
        </header>
        <div className="modal-corpo">{children}</div>
        {rodape && <footer className="modal-rodape">{rodape}</footer>}
      </div>
    </div>
  );
}

export function StatusChip({ a, agora, pequeno }) {
  const v = visualDoCartao(a, agora);
  return (
    <span className={`chip st-${v.chave} ${pequeno ? 'chip-p' : ''}`}>
      {v.check ? <Icon n="check" size={13} stroke={3} /> : <i className="ponto" />}
      {v.rotulo}
    </span>
  );
}

export function Etiquetas({ a }) {
  return (
    <>
      {a.reagendado && <span className="chip chip-reag">Reagendado</span>}
      {a.encaixe && <span className="chip chip-encaixe">Encaixe</span>}
    </>
  );
}

export function Vazio({ icone = 'info', titulo, texto, acao }) {
  return (
    <div className="vazio">
      <Icon n={icone} size={28} />
      <strong>{titulo}</strong>
      {texto && <p className="muted">{texto}</p>}
      {acao}
    </div>
  );
}

export function Aviso({ tipo = 'info', children, icone }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : undefined}>
      <Icon n={icone || (tipo === 'erro' ? 'alert' : 'info')} size={17} />
      <div>{children}</div>
    </div>
  );
}

export function Interruptor({ checked, onChange, rotulo, descricao, id, testid }) {
  return (
    <label className="interruptor">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} id={id} data-testid={testid} />
      <span className="trilho"><span className="bolinha" /></span>
      <span className="interruptor-txt"><span>{rotulo}</span>{descricao && <small className="muted">{descricao}</small>}</span>
    </label>
  );
}

// `ordem` = nome da lista de abas: com ele, segurar uma aba e arrastar muda a ordem (salva por usuário); Alt + setas faz o mesmo no teclado.
export function Abas({ itens, valor, onChange, ordem }) {
  const idDe = (k) => String(k) || '_vazio';
  const rot = Object.fromEntries(itens.map(([k, r]) => [idDe(k), r]));
  const o = useOrdem(ordem ? `abas:${ordem}` : null, itens.map(([k]) => idDe(k)), { eixo: 'x', rotulo: (id) => rot[id] ?? id });
  const porId = new Map(itens.map(([k, r]) => [idDe(k), [k, r]]));
  return (
    <div className="abas" role="tablist">
      {o.ids.map((id) => {
        const [k, r] = porId.get(id);
        return <button key={id} type="button" role="tab" aria-selected={valor === k} className={`${valor === k ? 'on' : ''} ${o.classe(id)}`.trim()} onClick={() => onChange(k)} {...o.props(id)}>{r}</button>;
      })}
    </div>
  );
}

// Foto redonda do profissional. Sem foto: a inicial do nome sobre uma cor própria que **não se repete na equipe** (`chave` = id do usuário; ver `coresDaEquipe`).
// `mini` = miniatura para o calendário.
export function Avatar({ nome, foto, chave, mini = false, className = '' }) {
  const { state } = useStore();
  const cls = `avatar${mini ? ' avatar-mini' : ''} ${className}`.trim();
  if (fotoValida(foto)) return <img className={`${cls} avatar-foto`} src={foto} alt="" draggable={false} />;
  return <span className={`${cls} avatar-inicial`} style={{ background: coresDaEquipe(state.usuarios).get(chave) || corDaPessoa(chave || nome) }}>{String(nome || '?').trim().charAt(0).toUpperCase()}</span>;
}
