/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Página pública de avaliação (`#avaliar/<token>`): o cliente dá de 1 a 5 estrelas, escreve (ou não) e pode marcar anônimo. Fala só com `publico.*`.
// Token errado, vencido ou já usado = a mesma mensagem genérica. A página nunca mostra o nome do cliente nem dado de outra pessoa.
import React, { useMemo, useState } from 'react';
import { publico } from '../services/api.js';
import { NOTA_MAX, TEXTO_MAX } from '../domain/avaliacoes.js';
import { fmtDate } from '../domain/time.js';
import { Aviso, Btn, Campo, Icon } from './common.jsx';
import { LogoMarca, RodapePlataforma } from './Marca.jsx';

const ROTULO_NOTA = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'];

export default function AvaliarPublico({ token, aoVoltar }) {
  const dados = useMemo(() => publico.dadosAvaliacao(token), [token]);
  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState('');
  const [anonimo, setAnonimo] = useState(false);
  const [isca, setIsca] = useState('');
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  const enviar = () => {
    const r = publico.avaliar({ token, nota: nota || undefined, texto, anonimo, site: isca });
    if (!r.ok) { setErro(r.erros[0]); return; }
    setErro(''); setEnviado(true);
  };
  return (
    <div className="pub" data-testid="pagina-avaliar">
      <header className="pub-topo"><div className="pub-marca"><LogoMarca comNome tamanho={72} /></div></header>
      {enviado ? (
        <section className="pub-cartao" data-testid="av-obrigado">
          <h2>Obrigado pela sua avaliação!</h2>
          <p className="muted">Ela ajuda a gente a cuidar cada vez melhor de você.</p>
        </section>
      ) : !dados.ok ? (
        <section className="pub-cartao" data-testid="av-erro-generico"><h2>Avaliação</h2><Aviso tipo="erro">{dados.erros[0]}</Aviso></section>
      ) : (
        <section className="pub-cartao" data-testid="av-formulario">
          <h2>Como foi o seu atendimento?</h2>
          <p className="muted" data-testid="av-contexto-pub">{dados.servicos.join(' + ')}{dados.profissional ? ` com ${dados.profissional}` : ''} · {fmtDate(dados.quando)} · {dados.loja}</p>
          <div role="radiogroup" aria-label="Sua nota de 1 a 5 estrelas" className="av-escolha">
            {Array.from({ length: NOTA_MAX }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`} className={`av-estrela ${n <= nota ? 'cheia' : ''}`} onClick={() => setNota(n)} data-testid={`av-estrela-${n}`}><Icon n="star" size={34} /></button>
            ))}
          </div>
          <p className="av-nota-rotulo" aria-live="polite" data-testid="av-nota-rotulo">{nota ? ROTULO_NOTA[nota] : 'Toque nas estrelas'}</p>
          <Campo rotulo="Quer contar mais? (opcional)" dica={`${texto.length}/${TEXTO_MAX}`}>
            <textarea rows={4} maxLength={TEXTO_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="av-texto" />
          </Campo>
          <label className="av-anonimo">
            <input type="checkbox" checked={anonimo} onChange={(e) => setAnonimo(e.target.checked)} data-testid="av-anonimo" />
            <span><b>Avaliar como anônimo</b><small className="muted">Seu nome não aparece junto da avaliação, a menos que as regras do estabelecimento permitam.</small></span>
          </label>
          <input className="pub-isca" tabIndex={-1} aria-hidden="true" autoComplete="off" name="site" value={isca} onChange={(e) => setIsca(e.target.value)} data-testid="av-isca" />
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Btn variante="primario" onClick={enviar} data-testid="av-enviar">Enviar avaliação</Btn>
        </section>
      )}
      {aoVoltar && <p><button type="button" className="link" onClick={aoVoltar} data-testid="av-voltar">Voltar</button></p>}
      <RodapePlataforma />
    </div>
  );
}
