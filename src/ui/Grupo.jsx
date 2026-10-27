/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:16f51a188f */
import React from 'react';
import { Campo } from './common.jsx';

// "Geral · Conta principal": o grupo e a conta que responde por ele.
export const rotuloGrupo = (st, g) => {
  const ct = st.financeiro.contas.find((c) => c.id === g.contaId);
  return `${g.nome} · ${ct ? ct.apelido : 'sem conta'}`;
};

// Seleção do grupo de movimentação. Sem `padrao`, o grupo é obrigatório; com `padrao` há a opção "usar o do estabelecimento".
export function SeletorGrupo({ st, valor, onChange, rotulo = 'Grupo de movimentação', dica, padrao, desabilitado, testid, somenteConta }) {
  const grupos = st.financeiro.grupos.filter((g) => !somenteConta || g.contaId === somenteConta);
  const dflt = st.financeiro.grupos.find((g) => g.id === st.estabelecimento.grupoMovimentacaoId);
  return (
    <Campo rotulo={rotulo} dica={dica}>
      <select value={valor || ''} disabled={desabilitado} onChange={(e) => onChange(e.target.value || null)} data-testid={testid}>
        {padrao && <option value="">Usar o do estabelecimento{dflt ? ` (${rotuloGrupo(st, dflt)})` : ''}</option>}
        {grupos.map((g) => <option key={g.id} value={g.id}>{rotuloGrupo(st, g)}</option>)}
      </select>
    </Campo>
  );
}
