/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Seletor "quem realiza o serviço" / "quais serviços a pessoa realiza" (bloco A1): à esquerda a lista de opções com BUSCA por termos enquanto se digita
// (clicar adiciona); à direita a caixa dos escolhidos, com rolagem e um X em cada item. É a MESMA tela nos dois lados (Serviços > Editar e Equipe > Editar):
// ambos gravam a mesma tabela no servidor (`profissional_servico`). Só apresentação: quem usa carrega e salva.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useState } from 'react';
import { filtrarPorTermo } from '../../domain/busca-vinculo.js';
import { Btn, Icone } from './mini.jsx';

export default function SeletorVinculo({ titulo, ajuda, itens, marcados, aoMudar, desabilitado = false, testid, rotuloBusca = 'Buscar' }) {
  const [busca, setBusca] = useState('');
  const set = new Set(marcados || []);
  const escolhidos = itens.filter((x) => set.has(x.id));
  const disponiveis = itens.filter((x) => !set.has(x.id));
  const achados = filtrarPorTermo(disponiveis, busca);
  const adicionar = (ids) => aoMudar([...new Set([...(marcados || []), ...ids])]);
  const remover = (id) => aoMudar((marcados || []).filter((x) => x !== id));
  return (
    <fieldset className="conj vinculo-conj" disabled={desabilitado} data-testid={testid}>
      <legend>{titulo}</legend>
      {ajuda && <p className="muted">{ajuda}</p>}
      {itens.length === 0 ? <p className="muted" data-testid={`${testid}-vazio`}>Nada cadastrado ainda.</p> : (
        <div className="vinculo-duplo">
          <div className="vinculo-coluna" data-testid={`${testid}-disponiveis`}>
            <div className="vinculo-cab"><b>Opções</b><small className="muted">{disponiveis.length}</small></div>
            <input type="search" className="busca" placeholder={rotuloBusca} aria-label={rotuloBusca} value={busca} maxLength={60} autoComplete="off" onChange={(e) => setBusca(e.target.value)} data-testid={`${testid}-busca`} />
            <ul className="vinculo-lista" data-testid={`${testid}-lista`}>
              {achados.map((x) => (
                <li key={x.id}>
                  <button type="button" className="vinculo-item" onClick={() => adicionar([x.id])} aria-label={`Adicionar ${x.rotulo}`} data-testid={`${testid}-add-${x.id}`}>
                    <Icone n="plus" size={14} /><span>{x.rotulo}{x.nota ? <small className="muted"> · {x.nota}</small> : null}</span>
                  </button>
                </li>
              ))}
              {achados.length === 0 && <li className="muted vinculo-vazio" data-testid={`${testid}-sem-opcoes`}>{disponiveis.length === 0 ? 'Todos já foram adicionados.' : 'Nada encontrado para essa busca.'}</li>}
            </ul>
            <div className="acoes vinculo-acoes">
              <Btn tamanho="sm" disabled={achados.length === 0} onClick={() => adicionar(achados.map((x) => x.id))} data-testid={`${testid}-todos`}>{busca.trim() ? 'Adicionar os encontrados' : 'Adicionar todos'}</Btn>
            </div>
          </div>
          <div className="vinculo-coluna" data-testid={`${testid}-escolhidos`}>
            <div className="vinculo-cab"><b>Escolhidos</b><small className="muted" data-testid={`${testid}-contagem`}>{escolhidos.length}</small></div>
            <ul className="vinculo-lista vinculo-sel" data-testid={`${testid}-selecionados`}>
              {escolhidos.map((x) => (
                <li key={x.id} data-testid={`${testid}-sel-${x.id}`}>
                  <span>{x.rotulo}{x.nota ? <small className="muted"> · {x.nota}</small> : null}</span>
                  <button type="button" className="aus-x vinculo-x" onClick={() => remover(x.id)} aria-label={`Remover ${x.rotulo}`} data-testid={`${testid}-rem-${x.id}`}>×</button>
                </li>
              ))}
              {escolhidos.length === 0 && <li className="muted vinculo-vazio" data-testid={`${testid}-nenhum`}>Nenhum escolhido: {titulo.toLowerCase().includes('quem') ? 'ninguém' : 'nenhum serviço'} fica disponível.</li>}
            </ul>
            <div className="acoes vinculo-acoes">
              <Btn tamanho="sm" disabled={escolhidos.length === 0} onClick={() => aoMudar([])} data-testid={`${testid}-limpar`}>Limpar</Btn>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
