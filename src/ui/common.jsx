/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:a59180eaec */
import React, { useEffect, useRef } from 'react';
import { visualDoCartao } from '../domain/marcadores.js';
import { useOrdem } from './ordem.jsx';
import { coresDaEquipe, corDaPessoa, fotoValida } from '../domain/foto.js';
import { useStore } from './hooks.js';
import { P } from './icones.js';


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

// Depois de um erro de formulário: leva o aviso até a vista. A janela é longa e o aviso fica no fim; sem isto, "Salvar" parece não fazer nada.
export function rolarAoErro() {
  const rolar = () => { try { document.querySelector('.modal [role="alert"]')?.scrollIntoView({ block: 'nearest' }); } catch { /* sem rolagem */ } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(rolar)); else rolar();
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
