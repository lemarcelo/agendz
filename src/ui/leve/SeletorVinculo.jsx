/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Lista de caixas "quem realiza o serviço" / "quais serviços a pessoa realiza" (bloco A1). É a MESMA tela nos dois lados: Serviços > Editar (marca profissionais)
// e Equipe > Editar (marca serviços); ambos gravam a mesma tabela no servidor (`profissional_servico`). Só apresentação: quem usa carrega e salva.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React from 'react';
import { Btn } from './mini.jsx';

export default function SeletorVinculo({ titulo, ajuda, itens, marcados, aoMudar, desabilitado = false, testid }) {
  const set = new Set(marcados || []);
  const alternar = (id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); aoMudar([...n]); };
  return (
    <fieldset className="conj vinculo-conj" disabled={desabilitado} data-testid={testid}>
      <legend>{titulo}</legend>
      {ajuda && <p className="muted">{ajuda}</p>}
      {itens.length === 0 ? <p className="muted" data-testid={`${testid}-vazio`}>Nada cadastrado ainda.</p> : (
        <>
          <div className="acoes vinculo-acoes">
            <Btn tamanho="sm" onClick={() => aoMudar(itens.map((x) => x.id))} data-testid={`${testid}-todos`}>Marcar todos</Btn>
            <Btn tamanho="sm" onClick={() => aoMudar([])} data-testid={`${testid}-nenhum`}>Limpar</Btn>
          </div>
          <ul className="vinculo-lista">
            {itens.map((x) => (
              <li key={x.id}>
                <label className="pa-check"><input type="checkbox" checked={set.has(x.id)} onChange={() => alternar(x.id)} data-testid={`${testid}-${x.id}`} /> {x.rotulo}{x.nota ? <small className="muted"> · {x.nota}</small> : null}</label>
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}
