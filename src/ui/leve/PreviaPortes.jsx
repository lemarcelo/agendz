/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Prévia dos preços dos serviços enquanto o dono define o fator de cada porte (v124): lista alguns serviços e deixa pesquisar pelo nome.
// Componente puro (sem API): recebe os serviços e a lista de portes em edição; vale para o Artifact e para o site real.
import React, { useState } from 'react';
import { fmtMoney } from '../../domain/time.js';
import { fatorEmTexto, previaDosPrecos } from '../../domain/previa-portes.js';

export default function PreviaPortes({ servicos, portes, limite = 6 }) {
  const [busca, setBusca] = useState('');
  const { total, itens } = previaDosPrecos(servicos, portes, busca, limite);
  return (
    <section className="previa-portes" data-testid="porte-previa" aria-label="Prévia dos preços">
      <h3 className="previa-portes-titulo">Prévia dos preços</h3>
      <p className="muted">Preço do serviço no porte = preço base (Médio) × fator. Se o serviço tem preço específico no porte, ele vale no lugar do fator.</p>
      <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={60} autoComplete="off" placeholder="Pesquisar serviço pelo nome" aria-label="Pesquisar serviço" data-testid="porte-previa-busca" />
      {itens.length === 0 && <p className="muted" data-testid="porte-previa-vazio">{(servicos || []).length ? 'Nenhum serviço com esse nome.' : 'Cadastre serviços para ver a prévia.'}</p>}
      <ul className="previa-portes-lista">
        {itens.map((s) => (
          <li key={s.id} className="previa-portes-item" data-testid={`porte-previa-${s.id}`}>
            <b>{s.nome}</b> <span className="muted">base {fmtMoney(s.base)}</span>
            <ul className="previa-portes-precos">
              {s.linhas.map((l) => (
                <li key={l.chave} data-testid={`porte-previa-${s.id}-${l.chave}`}>
                  <span>{l.nome || 'Porte novo'}</span>{' '}
                  <b>{l.preco === null ? '—' : fmtMoney(l.preco)}</b>{' '}
                  <small className="muted">{l.especifico ? 'preço específico' : l.fator === null ? 'fator inválido' : `× ${fatorEmTexto(l.fator)}`}</small>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {total > itens.length && <small className="muted" data-testid="porte-previa-mais">Mostrando {itens.length} de {total}. Pesquise pelo nome para achar outros.</small>}
    </section>
  );
}
