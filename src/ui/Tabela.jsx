/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:2ab621db36 */
import React from 'react';
import { useOrdem } from './ordem.jsx';

/**
 * Tabela com colunas que o usuário reordena segurando o título e arrastando (ou Alt + setas no teclado).
 * A ordem fica salva por usuário (`ordem:col:<id>:<usuário>`). Colunas `fixa` (ex.: botões de ação) ficam sempre no fim.
 *
 * colunas: [{ id, titulo, cls?, clsCel?: (linha) => classe extra da célula, fixa?, cel: (linha, indice) => nó }]
 * detalhe: (linha) => nó que aparece numa linha extra abaixo (ocupa todas as colunas); null = sem detalhe
 * rodape:  { rotulo, celulas: { [idDaColuna]: nó } }; o rótulo aparece na primeira coluna que não tem célula própria.
 */
export default function Tabela({ id, colunas, linhas, chave, linhaProps, rodape, detalhe, rolagem = true, minimo = true, testid, className = '' }) {
  const fixos = colunas.filter((c) => c.fixa).map((c) => c.id);
  const porId = new Map(colunas.map((c) => [c.id, c]));
  const o = useOrdem(`col:${id}`, colunas.map((c) => c.id), { fixos, eixo: 'x', rotulo: (cid) => porId.get(cid)?.titulo || cid });
  const cols = o.ids.map((cid) => porId.get(cid)).filter(Boolean);
  const tabela = (
    <table className={`tabela ${className}`.trim()} style={minimo ? undefined : { minWidth: 0 }} data-testid={testid}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c.id} scope="col" className={`${c.cls || ''} ${o.classe(c.id)}`.trim() || undefined} {...o.props(c.id)}>{c.titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => {
          const d = detalhe ? detalhe(l) : null;
          return (
            <React.Fragment key={chave(l)}>
              <tr {...(linhaProps ? linhaProps(l) : {})}>
                {cols.map((c) => <td key={c.id} className={`${c.cls || ''} ${c.clsCel ? c.clsCel(l) : ''}`.trim() || undefined}>{c.cel(l, i)}</td>)}
              </tr>
              {d && <tr><td colSpan={cols.length}>{d}</td></tr>}
            </React.Fragment>
          );
        })}
      </tbody>
      {rodape && (
        <tfoot>
          <tr>
            {cols.map((c, i) => {
              const proprio = rodape.celulas?.[c.id];
              const primeira = i === cols.findIndex((x) => rodape.celulas?.[x.id] === undefined);
              return <td key={c.id} className={c.cls || undefined}>{proprio !== undefined ? proprio : primeira ? rodape.rotulo : null}</td>;
            })}
          </tr>
        </tfoot>
      )}
    </table>
  );
  return rolagem ? <div className="tabela-rolagem">{tabela}</div> : tabela;
}
