/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Escolha da forma de pagamento de um agendamento (v119), aberta ao segurar o cartão. Não conhece a API: `aoEscolher(forma)` devolve { ok, erro }.
import { useEffect, useRef, useState } from 'react';
import { Aviso, Btn } from './mini.jsx';

export const FORMAS = [{ k: 'pix', rotulo: 'Pix' }, { k: 'dinheiro', rotulo: 'Dinheiro' }, { k: 'cartao', rotulo: 'Cartão' }];

export default function FormaPagamento({ quem, atual = '', aoEscolher, aoFechar }) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const caixa = useRef(null);
  const abertoEm = useRef(typeof performance !== 'undefined' ? performance.now() : 0); // o clique que o toque longo gera ao soltar o dedo cai no fundo da janela recém-aberta: não fecha
  useEffect(() => {
    caixa.current?.focus();
    const tecla = (e) => { if (e.key === 'Escape') aoFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const escolher = async (k) => {
    if (enviando) return;
    if (k === atual) { aoFechar(); return; }
    setEnviando(true); setErro('');
    const r = await aoEscolher(k);
    setEnviando(false);
    if (r && r.ok === false) { setErro(r.erro || (r.erros && r.erros[0]) || 'Não foi possível trocar a forma de pagamento.'); return; }
    aoFechar();
  };
  return (
    <div className="modal-fundo" onClick={(e) => { if (e.target === e.currentTarget && performance.now() - abertoEm.current > 700) aoFechar(); }} data-testid="forma-fundo">
      <div className="modal" style={{ '--larg': '380px' }} role="dialog" aria-modal="true" aria-label="Forma de pagamento" tabIndex={-1} ref={caixa} data-testid="forma-pagamento">
        <div className="modal-topo"><b>Forma de pagamento</b></div>
        <div className="modal-corpo">
          {quem && <p className="muted" style={{ margin: 0, overflowWrap: 'anywhere' }}>{quem}</p>}
          <div className="forma-opcoes" role="group" aria-label="Escolha a forma">
            {FORMAS.map((f) => (
              <Btn key={f.k} variante={f.k === atual ? 'primario' : 'neutro'} disabled={enviando} aria-pressed={f.k === atual} onClick={() => escolher(f.k)} data-testid={`forma-${f.k}`}>{f.rotulo}</Btn>
            ))}
          </div>
          {!atual && <p className="muted" style={{ margin: 0 }} data-testid="forma-sem-atual">Ainda sem forma escolhida: vale a padrão da loja.</p>}
          {erro && <Aviso tipo="erro" data-testid="forma-erro">{erro}</Aviso>}
        </div>
        <div className="modal-rodape"><Btn onClick={aoFechar} data-testid="forma-fechar">Fechar</Btn></div>
      </div>
    </div>
  );
}
