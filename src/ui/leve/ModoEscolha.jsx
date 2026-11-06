/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B2: como o app escolhe quem atende quando a escolha automática está ligada (livre/mais livre, aleatório, menos atendeu, fila). Só apresentação: quem grava é a tela que a usa
// (site real: PUT /api/estabelecimento/regras-atendimento; demonstração: estabelecimento.salvar). Não importa api.js, hooks.js nem common.jsx (tests/estatico.test.mjs).
import React from 'react';
import { DICA_MODO, MODOS_DE_ESCOLHA, ROTULO_MODO, modoSaneado } from '../../domain/modo-escolha.js';
import { Campo } from './mini.jsx';

export default function ModoEscolha({ valor, aoMudar, testid = 'regras-modo-escolha' }) {
  const modo = modoSaneado(valor);
  return (
    <div className="modo-escolha" data-testid={testid}>
      <Campo rotulo="Como escolher quem atende" dica={DICA_MODO[modo]}>
        <select value={modo} onChange={(e) => aoMudar(e.target.value)} data-testid={`${testid}-select`}>
          {MODOS_DE_ESCOLHA.map((m) => <option key={m} value={m}>{ROTULO_MODO[m]}</option>)}
        </select>
      </Campo>
    </div>
  );
}
