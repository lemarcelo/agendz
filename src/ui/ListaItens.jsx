/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:82d80cf5e0 */
import React, { useState } from 'react';
import { casaBusca } from '../domain/codigo.js';
import { Icon } from './common.jsx';

// Lista de serviços ou de produtos de um grupo, com a lupa à direita do título: pesquisa pelo nome ou pelo código.
// `itens` já vem na ordem certa (últimos usados primeiro); `renderItem(item)` desenha cada linha; `selecionado(item)` conta o que ficou fora da busca.
export default function ListaItens({ titulo, itens, renderItem, selecionado, testid, className = 'campo-largo conj lista-itens' }) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const visiveis = itens.filter((i) => casaBusca(i, busca));
  const ocultos = selecionado ? itens.filter((i) => !visiveis.includes(i) && selecionado(i)).length : 0;
  const fechar = () => { setAberta(false); setBusca(''); };
  return (
    <fieldset className={className} data-testid={testid}>
      <legend className="so-leitor">{titulo}</legend>
      <div className="lista-itens-cab">
        <b>{titulo}</b>
        <button type="button" className="icone-btn" onClick={() => (aberta ? fechar() : setAberta(true))} aria-expanded={aberta} aria-label={`Pesquisar em ${titulo.toLowerCase()} por nome ou código`} title="Pesquisar por nome ou código" data-testid={`${testid}-lupa`}><Icon n={aberta ? 'x' : 'search'} size={17} /></button>
      </div>
      {aberta && <input type="search" className="busca" placeholder="Nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } }} aria-label={`Buscar em ${titulo.toLowerCase()}`} data-testid={`${testid}-busca`} autoFocus />}
      <div className="servicos-coluna">
        {visiveis.map(renderItem)}
        {!visiveis.length && <p className="muted" data-testid={`${testid}-vazio`}>Nada encontrado para "{busca}".</p>}
      </div>
      {ocultos > 0 && <p className="muted">{ocultos === 1 ? '1 item marcado fica fora da busca.' : `${ocultos} itens marcados ficam fora da busca.`}</p>}
    </fieldset>
  );
}
