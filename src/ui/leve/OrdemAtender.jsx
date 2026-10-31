/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ordem da tela Atender (v133), só do proprietário: para cada tipo de atendimento (agendamento e atendimento feito) sobe/desce as etapas e os campos de Veículo e de
// Cliente. Componente compartilhado entre o Artifact (Estabelecimento > Regras) e o site real (cartão Regras do atendimento): não importa api.js, hooks.js nem common.jsx.
// A regra e o saneamento moram em domain/ordem-atender.js; quem usa grava o valor devolvido em `aoMudar` (o servidor confere de novo).
import React from 'react';
import { Btn, Icone } from './mini.jsx';
import { COMO_A_PAGINA_DO_CLIENTE, ROTULO_CAMPO, ROTULO_ETAPA, moverItem } from '../../domain/ordem-atender.js';

const TITULO = { futuro: 'Agendamento (data futura)', local: 'Atendimento feito (agora ou passado)' };

function Lista({ tipo, grupo, itens, rotulos, usaVeiculo, aoMover }) {
  const visiveis = itens.filter((x) => usaVeiculo || x !== 'veiculo');
  return (
    <ol className="ordem-atender-lista" data-testid={`ordem-${tipo}-${grupo}`}>
      {visiveis.map((id, i) => (
        <li key={id}>
          <span>{rotulos[id]}</span>
          <span className="ordem-atender-setas">
            <Btn tamanho="sm" disabled={i === 0} onClick={() => aoMover(id, -1)} aria-label={`Subir ${rotulos[id]}`} data-testid={`ordem-${tipo}-${grupo}-sobe-${id}`}><Icone n="up" size={15} /></Btn>
            <Btn tamanho="sm" disabled={i === visiveis.length - 1} onClick={() => aoMover(id, 1)} aria-label={`Descer ${rotulos[id]}`} data-testid={`ordem-${tipo}-${grupo}-desce-${id}`}><Icone n="down" size={15} /></Btn>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function OrdemAtender({ valor, padrao, aoMudar, usaVeiculo = false, desabilitado = false }) {
  const mexer = (tipo, grupo, id, delta) => {
    // a lista inteira (com a etapa Veículo escondida, quando o tipo não usa) é movida pela posição entre as visíveis
    const atual = valor[tipo][grupo].filter((x) => usaVeiculo || x !== 'veiculo');
    const movida = moverItem(atual, id, delta);
    const resto = valor[tipo][grupo].filter((x) => !movida.includes(x));
    aoMudar({ ...valor, [tipo]: { ...valor[tipo], [grupo]: [...movida, ...resto] } });
  };
  return (
    <section className="ordem-atender" data-testid="ordem-atender" aria-label="Ordem da tela Atender">
      <h3>Ordem da tela Atender</h3>
      <p className="muted">Escolha a ordem das etapas e dos campos, separada para o agendamento e para o atendimento já feito.</p>
      {['futuro', 'local'].map((tipo) => (
        <fieldset key={tipo} className="ordem-atender-grupo" data-testid={`ordem-${tipo}`} disabled={desabilitado}>
          <legend>{TITULO[tipo]}</legend>
          <b>Etapas</b>
          <Lista tipo={tipo} grupo="etapas" itens={valor[tipo].etapas} rotulos={ROTULO_ETAPA} usaVeiculo={usaVeiculo} aoMover={(id, d) => mexer(tipo, 'etapas', id, d)} />
          {usaVeiculo && <><b>Campos do veículo</b>
            <Lista tipo={tipo} grupo="veiculo" itens={valor[tipo].veiculo} rotulos={ROTULO_CAMPO} usaVeiculo aoMover={(id, d) => mexer(tipo, 'veiculo', id, d)} /></>}
          <b>Campos do cliente</b>
          <Lista tipo={tipo} grupo="cliente" itens={valor[tipo].cliente} rotulos={ROTULO_CAMPO} usaVeiculo={usaVeiculo} aoMover={(id, d) => mexer(tipo, 'cliente', id, d)} />
        </fieldset>
      ))}
      <div className="acoes">
        <Btn onClick={() => aoMudar(COMO_A_PAGINA_DO_CLIENTE)} disabled={desabilitado} data-testid="ordem-pagina-cliente">Usar a ordem da página do cliente</Btn>
        <Btn onClick={() => aoMudar(padrao)} disabled={desabilitado} data-testid="ordem-padrao">Voltar à ordem de fábrica</Btn>
      </div>
    </section>
  );
}
