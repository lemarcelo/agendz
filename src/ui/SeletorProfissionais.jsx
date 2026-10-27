/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0aa67ef63d */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Icon } from './common.jsx';
import { fmtDateShort, fmtHM, sameDay } from '../domain/time.js';
import { BotaoRemover, useGestosSelecao } from './selecao.jsx';
import { rot, rots } from '../domain/tipos.js';

// Seletor único e compacto (qualquer número de profissionais, qualquer largura): mostra de quem é a agenda aberta, com a seta à direita; a lista abre ao tocar e RECOLHE ao escolher.
// "Todos" = nenhum profissional marcado. Nome comprido é cortado com reticências (nunca se sobrepõe a outro botão).
// Clique escolhe um só (troca a agenda). Segurar, dois cliques (só mouse) ou Ctrl/Shift + clique junta vários sem fechar a lista; o X tira só aquele.
export const LIMITE_CARTOES = 6;

export default function SeletorProfissionais({ profissionais, selecionados, onEscolher, onAlternar, onRemover, contagemHoje, proximo, agora }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const raiz = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return profissionais.filter((b) => !q || `${b.apelido || ''} ${b.nome}`.toLowerCase().includes(q));
  }, [profissionais, busca]);
  const atual = profissionais.find((b) => b.id === selecionados[0]);
  const marcados = profissionais.filter((b) => selecionados.includes(b.id));
  const fechar = () => { clearTimeout(timer.current); setAberto(false); setBusca(''); };
  const escolher = (id) => { onEscolher(id); fechar(); };
  // Um clique escolhe e recolhe a lista; o recolher espera um instante para o duplo clique (juntar vários) ainda acertar o mesmo item.
  const gestos = useGestosSelecao({
    sel: selecionados,
    aoUnico: (id) => { onEscolher(id); clearTimeout(timer.current); timer.current = setTimeout(fechar, 320); },
    aoMulti: (id, base) => { clearTimeout(timer.current); onAlternar(id, base); },
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="seletor-barb" ref={raiz} data-testid="seletor-profissionais">
      <div className="seletor-linha">
        <button type="button" className="filtro seletor-botao on" onClick={() => setAberto(!aberto)} aria-expanded={aberto} aria-haspopup="listbox" data-testid="filtro-abrir">
          {atual ? <Avatar nome={atual.apelido || atual.nome} foto={atual.foto} chave={atual.id} /> : <span className="avatar avatar-todos"><Icon n="users" size={16} /></span>}
          <span className="filtro-txt"><b title={atual ? `${atual.apelido || atual.nome}` : undefined}>{atual ? `${atual.apelido || atual.nome}${marcados.length > 1 ? ` +${marcados.length - 1}` : ''}` : `Todos`}</b><small>{atual ? `${profissionais.length} no total · toque para trocar` : `${profissionais.length} ${profissionais.length === 1 ? rot('profissional') : rots('profissional')} · toque para trocar`}</small></span>
          <span className="seletor-seta"><Icon n={aberto ? 'up' : 'down'} size={16} /></span>
        </button>
        {aberto && (
          <div className="seletor-painel" role="listbox" aria-label={`Escolher a agenda do ${rot('profissional')}`} data-testid="seletor-painel">
            <input type="search" className="busca" placeholder={`Buscar ${rot('profissional')}`} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label={`Buscar ${rot('profissional')}`} data-testid="seletor-busca" autoFocus />
            <div className="seletor-acoes">
              <span className="muted">{lista.length} {lista.length === 1 ? 'resultado' : 'resultados'}</span>
            </div>
            <ul className="seletor-lista">
              {!busca.trim() && (
                <li>
                  <button type="button" role="option" aria-selected={!selecionados.length} aria-pressed={!selecionados.length} className={`seletor-item ${!selecionados.length ? 'on' : ''}`} onClick={() => escolher('')} data-testid="filtro-todos">
                    <span className={`caixa ${!selecionados.length ? 'on' : ''}`} aria-hidden="true">{!selecionados.length && <Icon n="check" size={12} stroke={3} />}</span>
                    <span className="avatar avatar-todos"><Icon n="users" size={16} /></span>
                    <span className="filtro-txt"><b>Todos</b><small>{profissionais.length} {profissionais.length === 1 ? rot('profissional') : rots('profissional')}</small></span>
                  </button>
                </li>
              )}
              {lista.map((b) => {
                const on = selecionados.includes(b.id);
                const p = proximo(b.id);
                return (
                  <li key={b.id}>
                    <button type="button" role="option" aria-selected={on} aria-pressed={on} className={`seletor-item ${on ? 'on' : ''}`} {...gestos(b.id)} data-testid={`filtro-${b.id}`}>
                      <span className={`caixa ${on ? 'on' : ''}`} aria-hidden="true">{on && <Icon n="check" size={12} stroke={3} />}</span>
                      <Avatar nome={b.apelido || b.nome} foto={b.foto} chave={b.id} />
                      <span className="filtro-txt"><b>{b.apelido || b.nome}</b><small>{contagemHoje(b.id)} hoje{p ? ` · próx. ${sameDay(p.inicio, agora) ? '' : `${fmtDateShort(p.inicio)} `}${fmtHM(p.inicio)}` : ''}</small></span>
                    </button>
                  </li>
                );
              })}
              {!lista.length && <li className="muted seletor-vazio">Nenhum {rot('profissional')} com esse nome.</li>}
            </ul>
          </div>
        )}
      </div>
      {marcados.length > 1 && (
        <div className="seletor-marcados" data-testid="seletor-marcados">
          {marcados.map((b) => (
            <span className="marc" key={b.id}><span className="chip" data-testid={`marcado-${b.id}`}>{b.apelido || b.nome}</span><BotaoRemover id={b.id} rotulo={b.apelido || b.nome} onClick={() => onRemover(b.id)} /></span>
          ))}
        </div>
      )}
    </div>
  );
}
