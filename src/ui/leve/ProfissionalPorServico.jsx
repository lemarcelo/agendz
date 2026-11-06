/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Quem faz cada serviço (bloco B1): aparece quando os serviços escolhidos são feitos por pessoas diferentes. Cada serviço tem o seu campo, que começa VAZIO e é
// obrigatório; só aparecem as pessoas que realizam aquele serviço (A1). Serve ao Atender (site real e demonstração) e ao #agendar. Só apresentação.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React from 'react';

export default function ProfissionalPorServico({ servicos, opcoes, valor, aoMudar, rotulo = 'Quem faz cada serviço', rotuloProfissional = 'Profissional', testid = 'pps' }) {
  return (
    <fieldset className="conj pps-conj" data-testid={testid}>
      <legend>{rotulo}</legend>
      <p className="muted">Estes serviços são feitos por pessoas diferentes. Escolha quem faz cada um; eles acontecem um depois do outro.</p>
      <ul className="pps-lista">
        {servicos.map((s) => {
          const lista = opcoes(s.id);
          const atual = valor[s.id] || '';
          return (
            <li key={s.id} className="pps-linha">
              <label htmlFor={`${testid}-sel-${s.id}`}><b>{s.nome}</b></label>
              <select id={`${testid}-sel-${s.id}`} value={atual} onChange={(e) => aoMudar({ ...valor, [s.id]: e.target.value })} aria-label={`${rotuloProfissional} de ${s.nome}`} data-testid={`${testid}-${s.id}`}>
                <option value="">Escolha…</option>
                {lista.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
