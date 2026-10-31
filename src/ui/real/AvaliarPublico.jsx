/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Página pública de avaliação do site real (`#avaliar/<token>`, sem login): o cliente dá de 1 a 5 estrelas, escreve (ou não) e pode marcar anônimo.
// O token pessoal vem do FRAGMENTO do endereço (o servidor e os logs nunca o veem) e vai só no cabeçalho X-Acesso, sem o Authorization do painel.
// Token errado, vencido ou já usado = a mesma mensagem genérica (o servidor decide; a tela não diz qual). A página nunca mostra o nome do cliente.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS próprias terminam em `-real`.
import React, { useEffect, useRef, useState } from 'react';
import { publico } from '../../services/api-real.js';
import { NOTA_MAX, TEXTO_MAX } from '../../domain/avaliacoes.js';
import { fmtDate } from '../../domain/time.js';
import { logoValida } from '../../domain/tema.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const ROTULO_NOTA = ['', 'Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente'];

export default function AvaliarPublico({ loja, token, aoVoltar }) {
  const [dados, setDados] = useState(null); // null = carregando
  const [falha, setFalha] = useState('');
  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState('');
  const [anonimo, setAnonimo] = useState(false);
  const [isca, setIsca] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const trava = useRef(false);
  const carregar = () => {
    setFalha(''); setDados(null);
    publico.dadosAvaliacao(token).then((r) => { if (r.ok) setDados(r.dados); else setFalha(r.erro); });
  };
  useEffect(carregar, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviar = async () => {
    if (trava.current) return;
    if (!nota) { setErro(`Escolha uma nota de 1 a ${NOTA_MAX} estrelas.`); return; }
    trava.current = true; setEnviando(true); setErro('');
    const r = await publico.avaliar({ token, nota, texto, anonimo, site: isca });
    trava.current = false; setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setEnviado(true);
  };
  return (
    <div className="pub" data-testid="pagina-avaliar">
      <header className="pub-topo">
        <div className="pub-marca">
          {logoValida(loja.logo) ? <img className="marca-logo" src={loja.logo} alt="" width={72} height={72} /> : null}
          <h1 data-testid="pub-nome-loja">{loja.nome}</h1>
        </div>
      </header>
      {enviado ? (
        <section className="pub-cartao" data-testid="av-obrigado" aria-live="polite">
          <div className="pub-ok"><Icone n="check" size={26} /></div>
          <h2>Obrigado pela sua avaliação!</h2>
          <p className="muted">Ela ajuda a gente a cuidar cada vez melhor de você.</p>
        </section>
      ) : falha ? (
        <section className="pub-cartao" data-testid="av-erro-generico">
          <h2>Avaliação</h2>
          <Aviso tipo="erro">{falha}</Aviso>
          <Btn onClick={carregar} data-testid="av-tentar-de-novo">Tentar de novo</Btn>
        </section>
      ) : !dados ? (
        <p className="muted" role="status" data-testid="av-carregando">Carregando…</p>
      ) : (
        <section className="pub-cartao" data-testid="av-formulario">
          <h2>Como foi o seu atendimento?</h2>
          <p className="muted" data-testid="av-contexto-pub">{dados.servicos.join(' + ')}{dados.profissional ? ` com ${dados.profissional}` : ''}{dados.quando ? ` · ${fmtDate(dados.quando)}` : ''}</p>
          <div role="radiogroup" aria-label={`Sua nota de 1 a ${NOTA_MAX} estrelas`} className="av-escolha-real">
            {Array.from({ length: NOTA_MAX }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`} className={`av-estrela-real ${n <= nota ? 'cheia' : ''}`} onClick={() => setNota(n)} data-testid={`av-estrela-${n}`}><Icone n="star" size={34} /></button>
            ))}
          </div>
          <p className="av-nota-rotulo-real" aria-live="polite" data-testid="av-nota-rotulo">{nota ? ROTULO_NOTA[nota] : 'Toque nas estrelas'}</p>
          <Campo rotulo="Quer contar mais? (opcional)" dica={`${texto.length}/${TEXTO_MAX}`}>
            <textarea rows={4} maxLength={TEXTO_MAX} value={texto} onChange={(e) => setTexto(e.target.value)} data-testid="av-texto" />
          </Campo>
          <label className="av-anonimo-real">
            <input type="checkbox" checked={anonimo} onChange={(e) => setAnonimo(e.target.checked)} data-testid="av-anonimo" />
            <span><b>Avaliar como anônimo</b><small className="muted">Seu nome não aparece junto da avaliação, a menos que as regras do estabelecimento permitam.</small></span>
          </label>
          <input className="pub-isca" tabIndex={-1} aria-hidden="true" autoComplete="off" name="site" value={isca} onChange={(e) => setIsca(e.target.value)} data-testid="av-isca" />
          {erro && <Aviso tipo="erro"><span data-testid="av-erro-envio">{erro}</span></Aviso>}
          <Btn variante="primario" onClick={enviar} disabled={enviando} data-testid="av-enviar">{enviando ? 'Enviando…' : 'Enviar avaliação'}</Btn>
        </section>
      )}
      {aoVoltar && <p><button type="button" className="link" onClick={aoVoltar} data-testid="av-voltar">Voltar</button></p>}
    </div>
  );
}
