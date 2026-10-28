/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Seletor de período das telas de comissão do site real: mês (com setas) ou De/Até. Devolve `{ mes }` ou `{ de, ate }`; só avisa a tela quando o período é válido.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useState } from 'react';
import { erroDoPeriodo, mesDe, rotuloMes, somarMes } from '../../domain/periodo-comissao.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

export default function Periodo({ valor, aoMudar }) {
  const livre = !valor.mes;
  const [de, setDe] = useState(valor.de || '');
  const [ate, setAte] = useState(valor.ate || '');
  const [erro, setErro] = useState('');
  const tentar = (d, a) => {
    setDe(d); setAte(a);
    if (!d || !a) { setErro(''); return; }
    const e = erroDoPeriodo(d, a);
    setErro(e);
    if (!e) aoMudar({ de: d, ate: a });
  };
  return (
    <div className="periodo-real" data-testid="periodo">
      <div className="acoes">
        <button type="button" className={`btn btn-sm${!livre ? ' btn-on' : ''}`} aria-pressed={!livre} onClick={() => { setErro(''); if (livre) aoMudar({ mes: mesDe(Date.now()) }); }} data-testid="periodo-mes">Mês</button>
        <button type="button" className={`btn btn-sm${livre ? ' btn-on' : ''}`} aria-pressed={livre} onClick={() => { if (!livre) { setDe(''); setAte(''); aoMudar({ de: '', ate: '' }); } }} data-testid="periodo-livre">De / Até</button>
      </div>
      {!livre && (
        <div className="acoes">
          <Btn tamanho="sm" onClick={() => aoMudar({ mes: somarMes(valor.mes, -1) })} aria-label="Mês anterior" data-testid="periodo-anterior"><Icone n="left" size={15} /></Btn>
          <strong className="periodo-rotulo-real" data-testid="periodo-rotulo">{rotuloMes(valor.mes)}</strong>
          <Btn tamanho="sm" onClick={() => aoMudar({ mes: somarMes(valor.mes, 1) })} aria-label="Próximo mês" data-testid="periodo-proximo"><Icone n="right" size={15} /></Btn>
        </div>
      )}
      {livre && (
        <div className="form-grade">
          <Campo rotulo="De"><input type="date" value={de} onChange={(e) => tentar(e.target.value, ate)} data-testid="periodo-de" /></Campo>
          <Campo rotulo="Até"><input type="date" value={ate} onChange={(e) => tentar(de, e.target.value)} data-testid="periodo-ate" /></Campo>
        </div>
      )}
      {erro && <Aviso tipo="erro" data-testid="periodo-erro">{erro}</Aviso>}
    </div>
  );
}
