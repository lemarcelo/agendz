/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ordem da tela Atender (v133), só do proprietário: para cada tipo de atendimento (agendamento e atendimento feito) sobe/desce as etapas e os campos de Veículo e de
// Cliente. Componente compartilhado entre o Artifact (Estabelecimento > Regras) e o site real (cartão Regras do atendimento): não importa api.js, hooks.js nem common.jsx.
// A regra e o saneamento moram em domain/ordem-atender.js; quem usa grava o valor devolvido em `aoMudar` (o servidor confere de novo).
import React, { useRef, useState } from 'react';
import { Btn } from './mini.jsx';
import { COMO_A_PAGINA_DO_CLIENTE, ROTULO_CAMPO, ROTULO_ETAPA } from '../../domain/ordem-atender.js';

const TITULO = { futuro: 'Agendamento (data futura)', local: 'Atendimento feito (agora ou passado)' };

function Lista({ tipo, grupo, itens, rotulos, usaVeiculo, aoMover, aoBloquear }) {
  const visiveis = itens.filter((x) => usaVeiculo || x !== 'veiculo');
  const listaRef = useRef(null);
  const gesto = useRef(null);
  const [destino, setDestino] = useState(null);
  const iniciar = (e, id) => {
    if (e.button !== 0 && e.button !== undefined) return;
    const indice = visiveis.indexOf(id);
    gesto.current = { id, indice, destino: indice };
    setDestino({ id, indice });
    if (e.currentTarget.focus) e.currentTarget.focus();
    if (e.currentTarget.setPointerCapture && e.pointerId !== undefined) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    }
  };
  const mover = (e) => {
    if (!gesto.current) return;
    const linhas = [...listaRef.current.querySelectorAll('[data-ordem-id]')];
    const alvo = linhas.findIndex((el) => e.clientY < el.getBoundingClientRect().bottom);
    const indice = alvo < 0 ? linhas.length - 1 : alvo;
    if (grupo === 'etapas') {
      const teste = [...visiveis];
      const orig = teste.indexOf(gesto.current.id);
      if (orig >= 0) {
        teste.splice(orig, 1);
        teste.splice(indice, 0, gesto.current.id);
        const srv = teste.indexOf('servicos');
        const qdo = teste.indexOf('quando');
        if (srv >= 0 && qdo >= 0 && srv > qdo) {
          if (aoBloquear) aoBloquear('A escolha do serviço não pode ficar depois da escolha do horário.');
          return;
        }
      }
    }
    if (aoBloquear) aoBloquear('');
    gesto.current.destino = indice;
    setDestino({ id: gesto.current.id, indice });
  };
  const terminar = (cancelado = false) => {
    const g = gesto.current;
    gesto.current = null; setDestino(null);
    if (g && !cancelado && g.destino !== g.indice) {
      if (grupo === 'etapas') {
        const teste = [...visiveis];
        teste.splice(g.indice, 1);
        teste.splice(g.destino, 0, g.id);
        const srv = teste.indexOf('servicos');
        const qdo = teste.indexOf('quando');
        if (srv >= 0 && qdo >= 0 && srv > qdo) {
          if (aoBloquear) aoBloquear('A escolha do serviço não pode ficar depois da escolha do horário.');
          return;
        }
      }
      aoMover(g.id, g.destino - g.indice);
    }
  };
  const exibicao = [...visiveis];
  if (destino) {
    const origem = exibicao.indexOf(destino.id);
    if (origem >= 0) { exibicao.splice(origem, 1); exibicao.splice(destino.indice, 0, destino.id); }
  }
  return (
    <ol ref={listaRef} className="ordem-atender-lista" data-testid={`ordem-${tipo}-${grupo}`}>
      {exibicao.map((id) => (
        <li key={id} data-ordem-id={id} className={destino?.id === id ? 'ordem-atender-destino' : ''}>
          <button type="button" className="ordem-atender-alca" aria-label={`Mover ${rotulos[id]}: arraste ou use as setas para cima e para baixo`} data-testid={`ordem-${tipo}-${grupo}-mover-${id}`}
            onPointerDown={(e) => iniciar(e, id)} onPointerMove={mover} onPointerUp={() => terminar()} onPointerCancel={() => terminar(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && gesto.current) { e.preventDefault(); terminar(true); }
              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); aoMover(id, e.key === 'ArrowUp' ? -1 : 1); }
            }}>⠿</button>
          <span>{rotulos[id]}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OrdemAtender({ valor, padrao, aoMudar, usaVeiculo = false, desabilitado = false }) {
  const [bloqueio, setBloqueio] = useState('');
  const mexer = (tipo, grupo, id, delta) => {
    // a lista inteira (com a etapa Veículo escondida, quando o tipo não usa) é movida pela posição entre as visíveis
    const atual = valor[tipo][grupo].filter((x) => usaVeiculo || x !== 'veiculo');
    const origem = atual.indexOf(id), destino = origem + delta;
    if (origem < 0 || destino < 0 || destino >= atual.length) return;
    const movida = [...atual];
    movida.splice(origem, 1); movida.splice(destino, 0, id);
    if (grupo === 'etapas') {
      const srv = movida.indexOf('servicos');
      const qdo = movida.indexOf('quando');
      if (srv >= 0 && qdo >= 0 && srv > qdo) {
        setBloqueio('A escolha do serviço não pode ficar depois da escolha do horário.');
        return;
      }
    }
    setBloqueio('');
    const resto = valor[tipo][grupo].filter((x) => !movida.includes(x));
    aoMudar({ ...valor, [tipo]: { ...valor[tipo], [grupo]: [...movida, ...resto] } });
  };
  return (
    <section className="ordem-atender" data-testid="ordem-atender" aria-label="Ordem da tela Atender">
      <h3>Ordem da tela Atender</h3>
      <p className="muted">Escolha a ordem das etapas e dos campos, separada para o agendamento e para o atendimento já feito.</p>
      {bloqueio && <p className="erro-txt" role="alert" data-testid="ordem-atender-bloqueio">{bloqueio}</p>}
      {['futuro', 'local'].map((tipo) => (
        <fieldset key={tipo} className="ordem-atender-grupo" data-testid={`ordem-${tipo}`} disabled={desabilitado}>
          <legend>{TITULO[tipo]}</legend>
          <b>Etapas</b>
          <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px 0' }}>A escolha do serviço deve sempre vir antes da escolha do horário.</p>
          <Lista tipo={tipo} grupo="etapas" itens={valor[tipo].etapas} rotulos={ROTULO_ETAPA} usaVeiculo={usaVeiculo} aoMover={(id, d) => mexer(tipo, 'etapas', id, d)} aoBloquear={setBloqueio} />
          {usaVeiculo && <><b>Campos do veículo</b>
            <Lista tipo={tipo} grupo="veiculo" itens={valor[tipo].veiculo} rotulos={ROTULO_CAMPO} usaVeiculo aoMover={(id, d) => mexer(tipo, 'veiculo', id, d)} /></>}
          <b>Campos do cliente</b>
          <Lista tipo={tipo} grupo="cliente" itens={valor[tipo].cliente} rotulos={ROTULO_CAMPO} usaVeiculo={usaVeiculo} aoMover={(id, d) => mexer(tipo, 'cliente', id, d)} />
        </fieldset>
      ))}
      <div className="acoes">
        <Btn onClick={() => { setBloqueio(''); aoMudar(COMO_A_PAGINA_DO_CLIENTE); }} disabled={desabilitado} data-testid="ordem-pagina-cliente">Usar a ordem da página do cliente</Btn>
        <Btn onClick={() => { setBloqueio(''); aoMudar(padrao); }} disabled={desabilitado} data-testid="ordem-padrao">Voltar à ordem de fábrica</Btn>
      </div>
    </section>
  );
}
