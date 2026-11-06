/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco D: troca da forma de pagamento de um agendamento pelo botão (lápis) da linha do valor nos Detalhes; o menu abre PARA BAIXO, com uma
// transição curta. Substitui o "segurar o cartão" (v119). Não conhece a API: `aoEscolher(forma)` devolve { ok, erro | erros }.
// Escape fecha só o menu (os Detalhes continuam abertos); clique fora, ou escolher, também fecha.
import { useEffect, useRef, useState } from 'react';
import { Icone } from './mini.jsx';

export const FORMAS = [{ k: 'pix', rotulo: 'Pix' }, { k: 'dinheiro', rotulo: 'Dinheiro' }, { k: 'cartao', rotulo: 'Cartão' }];
export const rotuloDaForma = (k) => (FORMAS.find((f) => f.k === k) || { rotulo: '' }).rotulo;

export default function FormaPagamentoMenu({ atual = '', aoEscolher, aoErro = null }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const raiz = useRef(null);
  const botao = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAberto(false); };
    // Escape fecha só o menu, mesmo com o foco fora dele (o botão some do foco enquanto envia): captura antes dos Detalhes
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); botao.current?.focus(); } };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla, true);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla, true); };
  }, [aberto]);
  const fechar = () => { setAberto(false); botao.current?.focus(); };
  const alternar = () => { setErro(''); setAberto((v) => !v); };
  const escolher = async (k) => {
    if (enviando) return;
    if (k === atual) { fechar(); return; }
    setEnviando(true); setErro('');
    const r = await aoEscolher(k);
    setEnviando(false);
    if (r && r.ok === false) { const m = r.erro || (r.erros && r.erros[0]) || 'Não foi possível trocar a forma de pagamento.'; setErro(m); if (aoErro) aoErro(m); return; }
    fechar();
  };
  return (
    <span className="forma-menu-pos" ref={raiz}>
      <button type="button" className="btn btn-sm forma-editar" ref={botao} onClick={alternar} aria-haspopup="menu" aria-expanded={aberto}
        aria-label="Alterar forma de pagamento" title="Alterar forma de pagamento" data-testid="forma-editar">
        <Icone n="edit" size={16} />
      </button>
      {aberto && (
        <div className="forma-menu" role="menu" aria-label="Forma de pagamento" data-testid="forma-menu">
          {FORMAS.map((f) => (
            <button key={f.k} type="button" role="menuitemradio" aria-checked={f.k === atual} disabled={enviando}
              className={`forma-item${f.k === atual ? ' on' : ''}`} onClick={() => escolher(f.k)} data-testid={`forma-${f.k}`}>
              <span className="forma-marca" aria-hidden="true">{f.k === atual ? '✓' : ''}</span>{f.rotulo}
            </button>
          ))}
          {!atual && <small className="muted forma-sem-atual" data-testid="forma-sem-atual">Ainda sem forma escolhida: vale a padrão da loja.</small>}
          {erro && <small className="forma-erro" role="alert" data-testid="forma-erro">{erro}</small>}
        </div>
      )}
    </span>
  );
}
