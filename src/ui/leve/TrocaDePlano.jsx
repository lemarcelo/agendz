/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// E3: troca de plano pagando só a diferença. Peças de tela compartilhadas pelo site real (src/ui/real) e pela demonstração (src/ui), sem dependência de api.js nem hooks.js:
//  - OpcoesDeTroca: o que o cliente vê no #agendar quando o plano dele esgotou ou restringe o serviço (planos com mais serviços, diferença já com o desconto da loja, botão de pedido);
//  - CartaoConfigTroca: o dono define o desconto % sobre a diferença e o WhatsApp da loja;
//  - TextoDoPedidoTroca / AceitarTroca: o pedido que chega para o dono, aceito com a forma em que a diferença foi paga.
// O botão de pedido é um link wa.me comum (target _blank): abre no clique, sem await antes; o pedido é gravado ao mesmo tempo. Nunca use whatsapp:// (v63).
import React, { useEffect, useState } from 'react';
import { fmtMoney } from '../../domain/time.js';
import { textoPedidoTroca } from '../../domain/whatsapp.js';
import { Aviso, Btn, Campo, Icone } from './mini.jsx';

const FORMAS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão']];
const pct = (n) => String(Number(n) || 0).replace('.', ',');

export function OpcoesDeTroca({ opcoes, descontoPct = 0, whatsapp = '', telefone = '', aoPedir }) {
  const lista = Array.isArray(opcoes) ? opcoes : [];
  const [escolhido, setEscolhido] = useState('');
  const [estado, setEstado] = useState('parado'); // parado | enviando | feito | erro
  const [erro, setErro] = useState('');
  const chave = lista.map((o) => o.planoId).join('|');
  useEffect(() => { setEscolhido(''); setEstado('parado'); setErro(''); }, [chave, telefone]);
  if (!lista.length) return null;
  const op = lista.find((o) => o.planoId === escolhido) || null;
  const zap = /^\d{12,13}$/.test(String(whatsapp || '')) ? String(whatsapp) : '';
  const msg = op ? encodeURIComponent(textoPedidoTroca({ nome: op.nome, preco: op.preco, diferenca: op.diferenca, descontoPct, telefone })) : '';
  const pedir = async () => {
    if (!op || estado === 'enviando' || estado === 'feito') return;
    setEstado('enviando'); setErro('');
    let r = null;
    try { r = await Promise.resolve(aoPedir(op)); } catch { r = null; }
    if (r && r.ok) setEstado('feito');
    else { setEstado('erro'); setErro((r && (r.erro || (r.erros && r.erros[0]))) || 'Não foi possível registrar o pedido agora. Tente de novo.'); }
  };
  const feito = estado === 'feito';
  return (
    <section className="troca-pub" data-testid="pub-troca">
      <h3 className="troca-titulo"><Icone n="ticket" size={16} /> Quer um plano com mais serviços?</h3>
      <p className="troca-aviso" data-testid="pub-troca-aviso">Na mudança de plano você paga <b>só a diferença</b> entre os planos, uma vez, neste mês. Não paga o plano completo.{Number(descontoPct) > 0 ? ` A loja dá ${pct(descontoPct)}% de desconto nessa diferença.` : ''}</p>
      <ul className="troca-lista" role="radiogroup" aria-label="Planos com mais serviços">
        {lista.map((o) => (
          <li key={o.planoId}>
            <label className={`troca-opcao${escolhido === o.planoId ? ' marcada' : ''}`}>
              <input type="radio" name="troca-plano" checked={escolhido === o.planoId} disabled={feito} onChange={() => { setEscolhido(o.planoId); setEstado('parado'); setErro(''); }} data-testid={`pub-troca-opcao-${o.planoId}`} />
              <span className="troca-corpo">
                <b>{o.nome}</b>
                <span className="muted">{fmtMoney(o.preco)}/mês · {o.cortes} atendimento{o.cortes === 1 ? '' : 's'} por mês</span>
                {o.servicos.length > 0 && <span className="troca-servicos muted">{o.servicos.join(', ')}</span>}
                <span className="troca-valor" data-testid={`pub-troca-valor-${o.planoId}`}>Você paga só {fmtMoney(o.diferenca)} neste mês</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {erro && <Aviso tipo="erro"><span data-testid="pub-troca-erro">{erro}</span></Aviso>}
      {feito
        ? <p className="pub-aviso-plano" role="status" data-testid="pub-troca-feito"><Icone n="check" size={14} /> Pedido enviado. A equipe vai confirmar a mudança e combinar o pagamento da diferença.</p>
        : zap
          ? <a className={`btn btn-primario troca-botao${op ? '' : ' desligado'}`} href={`https://wa.me/${zap}?text=${msg}`} target="_blank" rel="noopener noreferrer" aria-disabled={!op} onClick={(e) => { if (!op) e.preventDefault(); else pedir(); }} data-testid="pub-troca-pedir">Pedir mudança de plano pelo WhatsApp</a>
          : <Btn variante="primario" disabled={!op || estado === 'enviando'} onClick={pedir} data-testid="pub-troca-pedir">Pedir mudança de plano</Btn>}
      {!op && !feito && <small className="muted troca-dica">Escolha o plano para o qual quer ir.</small>}
    </section>
  );
}

// O dono: desconto sobre a diferença (0 a 100%) e o WhatsApp da loja (para onde o cliente manda o pedido). `aoSalvar({ descontoPct, whatsapp })` devolve { ok, erro }.
export function CartaoConfigTroca({ inicial, aoSalvar }) {
  const [desc, setDesc] = useState(pct(inicial && inicial.descontoPct));
  const [zap, setZap] = useState(String((inicial && inicial.whatsapp) || '').replace(/^55/, ''));
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setErro(''); setSalvo(false); setOcupado(true);
    let r = null;
    try { r = await Promise.resolve(aoSalvar({ descontoPct: desc.replace(',', '.').trim(), whatsapp: zap.trim() })); } catch { r = null; }
    setOcupado(false);
    if (r && r.ok) setSalvo(true); else setErro((r && (r.erro || (r.erros && r.erros[0]))) || 'Não foi possível salvar agora.');
  };
  return (
    <section className="troca-config" data-testid="troca-config">
      <h3 className="troca-titulo"><Icone n="ticket" size={16} /> Troca de plano</h3>
      <p className="muted">Quando o plano do cliente acaba ou não cobre o serviço, ele vê os planos com mais serviços e pede a mudança pagando só a diferença de valor, uma vez, no mês da troca.</p>
      <div className="troca-campos">
        <Campo rotulo="Desconto na diferença (%)" dica="0 = sem desconto. Vale só para a diferença da troca."><input inputMode="decimal" value={desc} maxLength={6} onChange={(e) => { setDesc(e.target.value); setSalvo(false); }} data-testid="troca-desconto" /></Campo>
        <Campo rotulo="WhatsApp da loja (opcional)" dica="Com ele, o botão do cliente abre a conversa com o pedido pronto."><input type="tel" inputMode="tel" value={zap} maxLength={16} placeholder="(51) 99999-9999" onChange={(e) => { setZap(e.target.value); setSalvo(false); }} data-testid="troca-whatsapp" /></Campo>
      </div>
      {erro && <Aviso tipo="erro"><span data-testid="troca-erro">{erro}</span></Aviso>}
      <div className="acoes">
        <Btn variante="primario" disabled={ocupado} onClick={salvar} data-testid="troca-salvar">Salvar</Btn>
        {salvo && <span className="muted" role="status" data-testid="troca-salvo">Salvo.</span>}
      </div>
    </section>
  );
}

// Pedido de troca na lista do dono: de qual plano para qual, a diferença (já com o desconto da hora do pedido) e o que acontece depois.
export function TextoDoPedidoTroca({ p }) {
  return (
    <span data-testid={`pedido-troca-${p.id}`}>
      <b>{p.nome}</b> quer trocar o plano <b>{p.planoAtualNome || 'atual'}</b> por <b>{p.planoNome}</b>
      <span className="muted troca-detalhe">Diferença a receber: <b data-testid={`pedido-diferenca-${p.id}`}>{fmtMoney(p.valorDiferenca || 0)}</b>{Number(p.descontoPct) > 0 ? ` (com ${pct(p.descontoPct)}% de desconto)` : ''} só neste mês; nos próximos vale o valor do plano novo. Os atendimentos já usados no mês passam para o plano novo.</span>
    </span>
  );
}

export function AceitarTroca({ p, aoAceitar }) {
  const [forma, setForma] = useState('pix');
  return (
    <>
      <select className="troca-forma" value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Como a diferença foi paga" data-testid={`pedido-forma-${p.id}`}>
        {FORMAS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
      </select>
      <Btn tamanho="sm" variante="primario" onClick={() => aoAceitar(forma)} data-testid={`pedido-aceitar-${p.id}`}>Aceitar troca</Btn>
    </>
  );
}
