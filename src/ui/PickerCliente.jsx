/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:8a7aaed7d9 */
import React, { useMemo, useState } from 'react';
import { somenteDigitos } from '../domain/rules.js';
import { Btn, Campo, Icon } from './common.jsx';

export const POR_PAGINA = 10;
const sem = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Filtro em tempo real por nome, apelido ou telefone (só dígitos); a lista mostra no máximo 10 por página.
export function filtrarClientes(clientes, busca) {
  const t = sem(busca).trim(), d = somenteDigitos(busca);
  if (!t) return clientes;
  return clientes.filter((c) => sem(c.nome).includes(t) || sem(c.apelido).includes(t) || (d.length >= 2 && somenteDigitos(c.telefone).includes(d)));
}

// Escolha de um cliente já cadastrado: busca + lista paginada (10 por vez). Escolhido, vira uma linha com "Trocar".
export default function PickerCliente({ clientes, valor, onEscolher, onLimpar }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pag, setPag] = useState(0);
  const achados = useMemo(() => filtrarClientes(clientes, busca), [clientes, busca]);
  const paginas = Math.max(1, Math.ceil(achados.length / POR_PAGINA));
  const p = Math.min(pag, paginas - 1);
  const visiveis = achados.slice(p * POR_PAGINA, p * POR_PAGINA + POR_PAGINA);
  const atual = valor ? clientes.find((c) => c.id === valor) : null;
  const rotulo = (c) => (c.apelido && c.apelido !== c.nome ? `${c.nome} (${c.apelido})` : c.nome);
  return (
    <Campo rotulo="Cliente cadastrado (opcional)" className="campo-largo">
      <div className="picker-cliente" data-testid="atender-cliente">
        <div className="linha-campos">
          {atual ? <span className="picker-atual" data-testid="atender-cliente-atual"><Icon n="check" size={15} /> {rotulo(atual)}</span> : <span className="muted">Nenhum escolhido: digite nome e telefone abaixo.</span>}
          <Btn tamanho="sm" icone="search" onClick={() => setAberto(!aberto)} aria-expanded={aberto} data-testid="atender-cliente-abrir">{aberto ? 'Fechar' : atual ? 'Trocar' : 'Buscar cliente'}</Btn>
          {atual && <Btn tamanho="sm" onClick={onLimpar} data-testid="atender-cliente-limpar">Limpar</Btn>}
        </div>
        {aberto && (
          <div className="picker-lista">
            <input type="search" className="busca" placeholder="Buscar por nome, apelido ou telefone" value={busca} onChange={(e) => { setBusca(e.target.value); setPag(0); }} aria-label="Buscar cliente cadastrado" data-testid="atender-cliente-busca" autoFocus />
            <ul className="picker-itens" role="listbox" aria-label="Clientes">
              {visiveis.map((c) => (
                <li key={c.id}><button type="button" role="option" aria-selected={c.id === valor} className={`picker-item${c.id === valor ? ' on' : ''}`} onClick={() => { onEscolher(c.id); setAberto(false); setBusca(''); setPag(0); }} data-testid={`atender-cliente-${c.id}`}><b>{rotulo(c)}</b><small className="muted">{c.telefone}</small></button></li>
              ))}
              {!visiveis.length && <li className="muted" data-testid="atender-cliente-vazio">Nenhum cliente encontrado.</li>}
            </ul>
            <div className="linha-campos picker-pag">
              <span className="muted" data-testid="atender-cliente-pag">{achados.length ? `${p * POR_PAGINA + 1}–${p * POR_PAGINA + visiveis.length} de ${achados.length}` : '0 de 0'}</span>
              <Btn tamanho="sm" icone="left" disabled={p === 0} onClick={() => setPag(p - 1)} aria-label="Página anterior" data-testid="atender-cliente-ant" />
              <Btn tamanho="sm" icone="right" disabled={p >= paginas - 1} onClick={() => setPag(p + 1)} aria-label="Próxima página" data-testid="atender-cliente-prox" />
            </div>
          </div>
        )}
      </div>
    </Campo>
  );
}
