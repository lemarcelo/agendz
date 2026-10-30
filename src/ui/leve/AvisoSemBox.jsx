/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estética sem box ativo (v120): não se atende nem se usa o Link Agenda. Aviso na própria tela (nunca alert/confirm); só o proprietário recebe o botão que leva ao cadastro,
// os demais só leem o aviso. Componente puro (sem API): vale para o site real e para o Artifact.
import React from 'react';
import { Aviso, Btn } from './mini.jsx';

export const TEXTO_SEM_BOX = 'Cadastre ao menos um box antes de atender ou usar o Link Agenda: na estética o carro precisa de um box na agenda.';

export default function AvisoSemBox({ podeCadastrar = false, aoCadastrar, aoFechar }) {
  return (
    <Aviso tipo="erro" data-testid="aviso-sem-box">
      <p style={{ margin: 0 }}><b>Falta cadastrar o box.</b> {TEXTO_SEM_BOX}</p>
      {!podeCadastrar && <p style={{ margin: '6px 0 0' }} data-testid="aviso-sem-box-pedir">Peça ao proprietário para cadastrar em Estabelecimento &gt; Boxes.</p>}
      <div className="acoes" style={{ marginTop: 8 }}>
        {podeCadastrar && aoCadastrar && <Btn variante="primario" tamanho="sm" onClick={aoCadastrar} data-testid="aviso-sem-box-cadastrar">Cadastrar boxes</Btn>}
        {aoFechar && <Btn tamanho="sm" onClick={aoFechar} data-testid="aviso-sem-box-fechar">Fechar</Btn>}
      </div>
    </Aviso>
  );
}
