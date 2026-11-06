/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F (V60): bloco do formulário de Serviço para a DURAÇÃO INDEFINIDA ("combinar agendamento"), o mesmo na tela real e na demonstração.
// Com a chave ligada, a duração fica só para leitura ("Indefinida"), somem preço/duração por porte e aparecem: a descrição da duração, a mensagem do botão "Combinar agendamento",
// o preço (um valor, uma lista de valores com descrição ou um intervalo) e quem combina o horário (o WhatsApp dele; sem ninguém, o do estabelecimento).
// Só apresentação: quem usa guarda o estado do formulário (`f`) e salva. Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React from 'react';
import SeletorVinculo from './SeletorVinculo.jsx';
import { Btn, Campo, Icone } from './mini.jsx';

export const FORM_INDEFINIDO_VAZIO = { duracaoTexto: '', combinarMsg: '', precoModo: 'fixo', precoMax: '', precoOpcoes: [{ descricao: '', valor: '' }, { descricao: '', valor: '' }], combina: [] };

/** Estado inicial do bloco a partir de um serviço já gravado (campos de texto) — `num` converte número em texto do campo. */
export function formDoServicoIndefinido(ficha, num) {
  const opcoes = (ficha.precoOpcoes || []).map((o) => ({ descricao: o.descricao || '', valor: num(o.valor) }));
  return {
    duracaoTexto: ficha.duracaoTexto || '', combinarMsg: ficha.combinarMsg || '', precoModo: ficha.precoModo || 'fixo', precoMax: num(ficha.precoMax),
    precoOpcoes: opcoes.length >= 2 ? opcoes : [...opcoes, ...FORM_INDEFINIDO_VAZIO.precoOpcoes].slice(0, Math.max(2, opcoes.length)), combina: ficha.combinaIds || [],
  };
}

/** Corpo do salvar para o serviço indefinido (o preço mínimo/único vem de `precoTexto`); `num` lê o campo como número (nulo se vazio). */
export function corpoDoServicoIndefinido(f, precoTexto, num) {
  const c = { duracaoIndefinida: true, duracaoTexto: f.duracaoTexto, combinarMsg: f.combinarMsg, precoModo: f.precoModo, combinaIds: f.combina };
  if (f.precoModo === 'lista') c.precoOpcoes = f.precoOpcoes.map((o) => ({ descricao: o.descricao, valor: num(o.valor) }));
  else {
    const p = num(precoTexto); if (p !== null) c.preco = p;
    if (f.precoModo === 'faixa') { const m = num(f.precoMax); if (m !== null) c.precoMax = m; }
  }
  return c;
}

export default function ServicoIndefinido({ f, aoMudar, preco, aoMudarPreco, equipe, desabilitado = false }) {
  const mudar = (k) => (e) => aoMudar({ ...f, [k]: e.target.value });
  const opcao = (i, k) => (e) => aoMudar({ ...f, precoOpcoes: f.precoOpcoes.map((o, j) => (j === i ? { ...o, [k]: e.target.value } : o)) });
  const adicionar = () => aoMudar({ ...f, precoOpcoes: [...f.precoOpcoes, { descricao: '', valor: '' }] });
  const remover = (i) => aoMudar({ ...f, precoOpcoes: f.precoOpcoes.filter((_, j) => j !== i) });
  return (
    <div className="srv-indef" data-testid="srv-indef">
      <Campo rotulo="Duração" dica="Somente leitura: o horário deste serviço é combinado com o cliente (WhatsApp) ou marcado pelo profissional no Atender."><input value="Indefinida" readOnly aria-readonly="true" data-testid="srv-duracao-indef" /></Campo>
      <Campo rotulo="Descrição da duração (opcional)" dica="O cliente lê isto na página de agendamento. Ex.: &quot;De 1 a 3 dias, conforme o carro&quot;."><input value={f.duracaoTexto} maxLength={120} onChange={mudar('duracaoTexto')} data-testid="srv-duracao-texto" /></Campo>
      <Campo rotulo="Mensagem do botão Combinar agendamento (opcional)" dica="Vai escrita no WhatsApp. Em branco, usa uma mensagem padrão com o nome do serviço."><textarea rows={2} value={f.combinarMsg} maxLength={300} onChange={mudar('combinarMsg')} data-testid="srv-combinar-msg" /></Campo>
      <Campo rotulo="Como o preço é mostrado">
        <select value={f.precoModo} onChange={mudar('precoModo')} data-testid="srv-preco-modo">
          <option value="fixo">Um valor</option>
          <option value="lista">Vários valores, cada um com a sua descrição</option>
          <option value="faixa">Um intervalo de valor (de … até …)</option>
        </select>
      </Campo>
      {f.precoModo === 'lista' ? (
        <fieldset className="conj" data-testid="srv-opcoes">
          <legend>Valores</legend>
          <p className="muted">O menor valor é o preço de base; o valor final é lançado no Atender.</p>
          {f.precoOpcoes.map((o, i) => (
            <div className="srv-opcao" key={i} data-testid={`srv-opcao-${i}`}>
              <Campo rotulo="Descrição"><input value={o.descricao} maxLength={60} onChange={opcao(i, 'descricao')} data-testid={`srv-opcao-desc-${i}`} /></Campo>
              <Campo rotulo="Valor (R$)"><input value={o.valor} inputMode="decimal" onChange={opcao(i, 'valor')} data-testid={`srv-opcao-valor-${i}`} /></Campo>
              {f.precoOpcoes.length > 2 && <Btn tamanho="sm" onClick={() => remover(i)} aria-label={`Remover o valor ${i + 1}`} data-testid={`srv-opcao-rem-${i}`}><Icone n="trash" size={15} /></Btn>}
            </div>
          ))}
          {f.precoOpcoes.length < 10 && <Btn tamanho="sm" onClick={adicionar} data-testid="srv-opcao-add"><Icone n="plus" size={15} /> Mais um valor</Btn>}
        </fieldset>
      ) : (
        <>
          <Campo rotulo={f.precoModo === 'faixa' ? 'Valor mínimo (R$)' : 'Preço (R$)'}><input value={preco} inputMode="decimal" onChange={(e) => aoMudarPreco(e.target.value)} data-testid="srv-preco" /></Campo>
          {f.precoModo === 'faixa' && <Campo rotulo="Valor máximo (R$)"><input value={f.precoMax} inputMode="decimal" onChange={mudar('precoMax')} data-testid="srv-preco-max" /></Campo>}
        </>
      )}
      {equipe && (
        <SeletorVinculo testid="srv-combina" titulo="Quem combina o horário" desabilitado={desabilitado}
          ajuda="O botão Combinar agendamento abre o WhatsApp da primeira pessoa marcada que tem telefone. Sem ninguém, usa o WhatsApp do estabelecimento (Estabelecimento > dados)."
          itens={equipe} marcados={f.combina} aoMudar={(ids) => aoMudar({ ...f, combina: ids })} />
      )}
    </div>
  );
}
